import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ConnectException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The proxy that owns the public port.
 *
 * It binds the public port once and keeps it for the life of the process.
 * Every request is forwarded to whatever the target reference points at when
 * the request arrives. In this iteration the target is fixed at start-up;
 * iteration 4 makes it switchable, and nothing else in this file has to change
 * for that, because every request already reads the reference afresh.
 *
 * Standard library only: the JDK's HttpServer in front, the JDK's HttpClient
 * behind, virtual threads for both.
 *
 * Environment:
 *   LSA_PUBLIC_ADDRESS   address to bind          (default 0.0.0.0)
 *   LSA_PUBLIC_PORT      the public port          (default 8080)
 *   LSA_TARGET           where requests are sent  (default http://127.0.0.1:9001)
 *   LSA_REQUEST_TIMEOUT  seconds per request      (default 30)
 */
public final class Proxy {

    /** Headers that describe one connection and must not be copied to the next hop. */
    private static final Set<String> NOT_FORWARDED = Set.of(
            "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
            "te", "trailer", "transfer-encoding", "upgrade", "expect",
            "host", "content-length");

    private final AtomicReference<URI> target;
    private final AtomicLong inFlight = new AtomicLong();
    private final HttpClient client;
    private final Duration requestTimeout;

    private Proxy(URI initialTarget, Duration requestTimeout) {
        this.target = new AtomicReference<>(initialTarget);
        this.requestTimeout = requestTimeout;
        this.client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2))
                .executor(Executors.newVirtualThreadPerTaskExecutor())
                .build();
    }

    public static void main(String[] args) throws IOException {
        // Lets the proxy pass the caller's Host header through. Must be set
        // before the HTTP client classes are first used.
        System.setProperty("jdk.httpclient.allowRestrictedHeaders", "host");

        String address = env("LSA_PUBLIC_ADDRESS", "0.0.0.0");
        int port = Integer.parseInt(env("LSA_PUBLIC_PORT", "8080"));
        URI initialTarget = URI.create(env("LSA_TARGET", "http://127.0.0.1:9001"));
        Duration timeout = Duration.ofSeconds(Long.parseLong(env("LSA_REQUEST_TIMEOUT", "30")));

        Proxy proxy = new Proxy(initialTarget, timeout);

        HttpServer server = HttpServer.create(new InetSocketAddress(address, port), 4096);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.createContext("/", proxy::handle);
        server.start();

        System.out.println("proxy listening on " + address + ":" + port + " -> " + initialTarget);
    }

    private void handle(HttpExchange exchange) {
        inFlight.incrementAndGet();
        boolean responseStarted = false;
        try (exchange) {
            // Read the target once per request. Whatever it says at this
            // instant is where this request goes, start to finish.
            URI base = target.get();
            HttpRequest request = buildUpstreamRequest(exchange, base);

            HttpResponse<InputStream> upstream;
            try {
                upstream = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            } catch (HttpConnectTimeoutException | ConnectException e) {
                fail(exchange, 502, "upstream unreachable");
                return;
            } catch (HttpTimeoutException e) {
                fail(exchange, 504, "upstream timed out");
                return;
            } catch (IOException e) {
                fail(exchange, 502, "upstream error: " + e.getClass().getSimpleName());
                return;
            }

            try (InputStream body = upstream.body()) {
                Headers responseHeaders = exchange.getResponseHeaders();
                for (Map.Entry<String, List<String>> header : upstream.headers().map().entrySet()) {
                    String name = header.getKey();
                    if (name.startsWith(":") || NOT_FORWARDED.contains(name.toLowerCase())) {
                        continue;
                    }
                    responseHeaders.put(name, new ArrayList<>(header.getValue()));
                }

                int status = upstream.statusCode();
                long length = upstream.headers().firstValueAsLong("content-length").orElse(-1);
                boolean bodiless = "HEAD".equals(exchange.getRequestMethod())
                        || status == 204 || status == 304 || length == 0;

                // HttpServer convention: -1 means no body, 0 means chunked, >0 is an exact length.
                exchange.sendResponseHeaders(status, bodiless ? -1 : (length > 0 ? length : 0));
                responseStarted = true;
                if (!bodiless) {
                    try (OutputStream out = exchange.getResponseBody()) {
                        body.transferTo(out);
                    }
                }
            }
        } catch (IOException | RuntimeException e) {
            // Before the response has started we can still tell the caller.
            // After that, closing the exchange is all that is left to do.
            if (!responseStarted) {
                fail(exchange, 502, "proxy error: " + e.getClass().getSimpleName());
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            inFlight.decrementAndGet();
        }
    }

    private HttpRequest buildUpstreamRequest(HttpExchange exchange, URI base) {
        URI incoming = exchange.getRequestURI();
        String pathAndQuery = incoming.getRawPath()
                + (incoming.getRawQuery() == null ? "" : "?" + incoming.getRawQuery());
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(base + pathAndQuery))
                .timeout(requestTimeout);

        Headers incomingHeaders = exchange.getRequestHeaders();
        for (Map.Entry<String, List<String>> header : incomingHeaders.entrySet()) {
            if (NOT_FORWARDED.contains(header.getKey().toLowerCase())) {
                continue;
            }
            for (String value : header.getValue()) {
                try {
                    builder.header(header.getKey(), value);
                } catch (IllegalArgumentException ignored) {
                    // A header the client library refuses to send; skip it.
                }
            }
        }

        String host = incomingHeaders.getFirst("Host");
        if (host != null) {
            builder.setHeader("Host", host);
            builder.setHeader("X-Forwarded-Host", host);
        }
        String caller = exchange.getRemoteAddress().getAddress().getHostAddress();
        String chain = incomingHeaders.getFirst("X-Forwarded-For");
        builder.setHeader("X-Forwarded-For", chain == null ? caller : chain + ", " + caller);
        builder.setHeader("X-Forwarded-Proto", "http");

        String declaredLength = incomingHeaders.getFirst("Content-Length");
        boolean chunked = incomingHeaders.containsKey("Transfer-Encoding");
        HttpRequest.BodyPublisher body;
        if (declaredLength != null && !declaredLength.equals("0")) {
            // Stream the body through with its known length; never buffer it whole.
            body = HttpRequest.BodyPublishers.fromPublisher(
                    HttpRequest.BodyPublishers.ofInputStream(exchange::getRequestBody),
                    Long.parseLong(declaredLength));
        } else if (chunked) {
            body = HttpRequest.BodyPublishers.ofInputStream(exchange::getRequestBody);
        } else {
            body = HttpRequest.BodyPublishers.noBody();
        }
        return builder.method(exchange.getRequestMethod(), body).build();
    }

    private static void fail(HttpExchange exchange, int status, String message) {
        try {
            byte[] bytes = (message + "\n").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
            exchange.sendResponseHeaders(status, bytes.length);
            exchange.getResponseBody().write(bytes);
        } catch (IOException ignored) {
            // The caller has gone away; nothing more to do.
        }
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}

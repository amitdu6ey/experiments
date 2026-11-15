import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Stand-in for the real application until iteration 13 brings in Spring Boot.
 *
 * It has the three things the swap mechanics need to be tested against:
 *   /ping              a fast endpoint
 *   /slow?ms=N         a request that stays in flight for N milliseconds
 *   a background job   ticks once a second and records each tick in a file
 *
 * Configuration comes from the same environment variables Spring Boot reads,
 * so the supervisor can treat this server and a Spring Boot app alike.
 */
public final class SampleServer {

    public static void main(String[] args) throws IOException {
        String address = env("SERVER_ADDRESS", "127.0.0.1");
        int port = Integer.parseInt(env("SERVER_PORT", "9001"));
        String release = env("LSA_RELEASE_ID", "dev");
        Path tickLog = Path.of(env("LSA_TICK_LOG", "ticks.log"));

        AtomicLong ticks = new AtomicLong();

        HttpServer server = HttpServer.create(new InetSocketAddress(address, port), 1024);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());

        server.createContext("/ping", exchange -> respond(exchange, 200, "pong " + release));

        server.createContext("/slow", exchange -> {
            long millis = queryLong(exchange, "ms", 1000);
            try {
                Thread.sleep(millis);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            respond(exchange, 200, "slow " + millis + "ms " + release);
        });

        server.createContext("/ticks", exchange -> respond(exchange, 200, Long.toString(ticks.get())));

        server.createContext("/health/readiness", exchange -> respond(exchange, 200, "UP"));

        // The background job. One line per tick, tagged with the release that
        // produced it, so a later iteration can prove no second is ticked twice.
        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "ticker");
            t.setDaemon(true);
            return t;
        });
        scheduler.scheduleAtFixedRate(() -> {
            long n = ticks.incrementAndGet();
            String line = Instant.now().getEpochSecond() + " " + release + " " + n + "\n";
            try {
                Files.writeString(tickLog, line, StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            } catch (IOException e) {
                System.err.println("tick write failed: " + e.getMessage());
            }
        }, 1, 1, TimeUnit.SECONDS);

        // Graceful stop: on the terminate signal, stop accepting and give
        // requests in flight up to 10 seconds to finish.
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            scheduler.shutdownNow();
            server.stop(10);
        }, "shutdown"));

        server.start();
        System.out.println("sample server release=" + release + " listening on " + address + ":" + port);
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static long queryLong(HttpExchange exchange, String name, long fallback) {
        String query = exchange.getRequestURI().getQuery();
        if (query == null) {
            return fallback;
        }
        for (String pair : query.split("&")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2 && parts[0].equals(name)) {
                try {
                    return Long.parseLong(parts[1]);
                } catch (NumberFormatException e) {
                    return fallback;
                }
            }
        }
        return fallback;
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}

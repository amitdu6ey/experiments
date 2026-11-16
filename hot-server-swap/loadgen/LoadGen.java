import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * The measuring instrument for every later checkpoint.
 *
 * Sends requests at a steady rate and counts every one that does not come back
 * as HTTP 200. Requests are sent on a fixed schedule whether or not earlier
 * ones have returned, so a stalled server shows up as failures, not as a
 * quietly slower test.
 *
 * Usage: LoadGen <url> <requests-per-second> <seconds>
 * Exit code: 0 when nothing failed, 1 when at least one request failed.
 */
public final class LoadGen {

    public static void main(String[] args) throws Exception {
        if (args.length != 3) {
            System.err.println("usage: LoadGen <url> <requests-per-second> <seconds>");
            System.exit(2);
        }
        URI uri = URI.create(args[0]);
        int rate = Integer.parseInt(args[1]);
        int seconds = Integer.parseInt(args[2]);

        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2))
                .build();
        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(5))
                .GET()
                .build();

        AtomicLong sent = new AtomicLong();
        AtomicLong ok = new AtomicLong();
        AtomicLong failed = new AtomicLong();
        AtomicLong pending = new AtomicLong();
        Map<String, AtomicLong> failureKinds = new ConcurrentHashMap<>();
        List<Long> latenciesMicros = Collections.synchronizedList(new ArrayList<>());

        ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
        long periodMicros = 1_000_000L / rate;
        long total = (long) rate * seconds;

        scheduler.scheduleAtFixedRate(() -> {
            if (sent.get() >= total) {
                return;
            }
            sent.incrementAndGet();
            pending.incrementAndGet();
            long start = System.nanoTime();
            client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
                    .whenComplete((response, error) -> {
                        if (error != null) {
                            failed.incrementAndGet();
                            count(failureKinds, rootName(error));
                        } else if (response.statusCode() != 200) {
                            failed.incrementAndGet();
                            count(failureKinds, "HTTP " + response.statusCode());
                        } else {
                            ok.incrementAndGet();
                            latenciesMicros.add((System.nanoTime() - start) / 1_000);
                        }
                        pending.decrementAndGet();
                    });
        }, 0, periodMicros, TimeUnit.MICROSECONDS);

        // Wait until everything has been sent and every response or error is in.
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(seconds + 15L);
        while ((sent.get() < total || pending.get() > 0) && System.nanoTime() < deadline) {
            Thread.sleep(20);
        }
        scheduler.shutdownNow();

        long unanswered = pending.get();
        long failures = failed.get() + unanswered;

        List<Long> sorted = new ArrayList<>(latenciesMicros);
        Collections.sort(sorted);
        System.out.printf("sent=%d ok=%d failed=%d p50=%s p95=%s max=%s%n",
                sent.get(), ok.get(), failures,
                percentile(sorted, 0.50), percentile(sorted, 0.95), percentile(sorted, 1.0));
        if (!failureKinds.isEmpty()) {
            System.out.println("failure kinds: " + failureKinds);
        }
        if (unanswered > 0) {
            System.out.println("unanswered at deadline: " + unanswered);
        }
        System.exit(failures == 0 ? 0 : 1);
    }

    private static void count(Map<String, AtomicLong> kinds, String kind) {
        kinds.computeIfAbsent(kind, k -> new AtomicLong()).incrementAndGet();
    }

    private static String rootName(Throwable error) {
        Throwable cause = error;
        while (cause.getCause() != null) {
            cause = cause.getCause();
        }
        return cause.getClass().getSimpleName();
    }

    private static String percentile(List<Long> sortedMicros, double fraction) {
        if (sortedMicros.isEmpty()) {
            return "n/a";
        }
        int index = (int) Math.ceil(fraction * sortedMicros.size()) - 1;
        long micros = sortedMicros.get(Math.max(0, Math.min(index, sortedMicros.size() - 1)));
        return String.format("%.2fms", micros / 1000.0);
    }
}

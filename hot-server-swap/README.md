# Hot Server Swap

Working name: Live Server Agent (LSA).

An authenticated agent that changes a running server's code inside its container, builds it, and moves traffic to the new build without dropping a request. It never edits the live server in place: it builds a second copy beside it (green), checks that copy, and only then repoints a small proxy that owns the public port. The old copy (blue) stays warm for instant rollback.

The target stack is Java with a Spring Boot starter driven by configuration. The supervisor and proxy are plain Java.

## Status

Built in small iterations. Each one ends in a checkpoint script that prints PASS or FAIL, and every checkpoint keeps running in later iterations.

| # | Iteration | Result |
|---|-----------|--------|
| 0 | Stand-in server, load generator, checkpoint | Passed, 16 Nov 2026 |
| 1 | Proxy skeleton on the public port | Next |

The full design document and the 34-iteration roadmap are kept outside this repository.

## Layout

```
hot-server-swap/
├── sample/SampleServer.java      stand-in app: /ping, /slow?ms=N, /health/readiness, a 1 s background job
├── loadgen/LoadGen.java          fixed-rate load generator that counts every non-200 response
└── checkpoints/checkpoint-00.sh  builds and runs checkpoint 0
```

## Requirements

- JDK 21 or later (`javac` and `java` on the path)
- `bash` and `curl`

No Maven or Gradle is needed until the Spring Boot iterations.

## Run the checkpoint

```bash
cd hot-server-swap
bash checkpoints/checkpoint-00.sh
```

Expected last line: `CHECKPOINT 0: PASS`.

Checkpoint 0 proves two things: the load test reports 0 failures against a healthy server, and it reports failures when the server is killed mid-test. The second half shows the test can fail, which is what gives later zero-failure results their meaning.

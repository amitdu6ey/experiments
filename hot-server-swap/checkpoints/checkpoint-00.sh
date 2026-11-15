#!/usr/bin/env bash
# Checkpoint 0: the measuring instrument works.
#
#   Part 1: against a healthy server the load test reports 0 failures.
#   Part 2: when the server is killed mid-test, the load test reports failures.
#
# Part 2 matters as much as part 1. A test that cannot fail proves nothing
# about the zero-dropped-request claims in later iterations.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
WORK="$(mktemp -d)"
PORT=9001
URL="http://127.0.0.1:$PORT/ping"

# Localhost only: the workspace's proxy and trust-store flags are not needed.
unset JAVA_TOOL_OPTIONS

SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill -9 "$SERVER_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

start_server() {
  SERVER_ADDRESS=127.0.0.1 SERVER_PORT=$PORT LSA_RELEASE_ID=r0 LSA_TICK_LOG="$WORK/ticks.log" \
    java -cp "$BUILD" SampleServer > "$WORK/server.log" 2>&1 &
  SERVER_PID=$!
  for _ in $(seq 1 50); do
    if curl -fsS "$URL" > /dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "server did not start"; cat "$WORK/server.log"; return 1
}

echo "== build"
mkdir -p "$BUILD"
javac -d "$BUILD" "$ROOT/sample/SampleServer.java" "$ROOT/loadgen/LoadGen.java" || { echo "CHECKPOINT 0: FAIL (build)"; exit 1; }

echo "== part 1: healthy server, expect 0 failures"
start_server || { echo "CHECKPOINT 0: FAIL (start)"; exit 1; }
java -cp "$BUILD" LoadGen "$URL" 200 5
PART1=$?

echo "== background job: expect ticks recorded"
TICKS=$(wc -l < "$WORK/ticks.log" 2>/dev/null || echo 0)
echo "ticks recorded: $TICKS"

echo "== slow endpoint: expect a 1500 ms request to complete"
SLOW=$(curl -fsS -o /dev/null -w '%{http_code} %{time_total}s' "http://127.0.0.1:$PORT/slow?ms=1500")
echo "slow request: $SLOW"

echo "== part 2: server killed after 2 s, expect failures"
( sleep 2; kill -9 "$SERVER_PID" ) &
java -cp "$BUILD" LoadGen "$URL" 200 5
PART2=$?
SERVER_PID=""

echo
RESULT=PASS
[ "$PART1" -eq 0 ] || { echo "part 1 failed: the healthy run reported failures"; RESULT=FAIL; }
[ "$TICKS" -ge 3 ] || { echo "background job failed: fewer than 3 ticks"; RESULT=FAIL; }
case "$SLOW" in 200\ 1.[5-9]*) ;; *) echo "slow endpoint failed: $SLOW"; RESULT=FAIL;; esac
[ "$PART2" -eq 1 ] || { echo "part 2 failed: a killed server went unnoticed"; RESULT=FAIL; }
echo "CHECKPOINT 0: $RESULT"
[ "$RESULT" = PASS ]

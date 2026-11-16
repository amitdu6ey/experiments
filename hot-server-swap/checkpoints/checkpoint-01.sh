#!/usr/bin/env bash
# Checkpoint 1: the proxy owns the public port.
#
#   Part 1: load through the proxy shows 0 failures, and the added latency is printed.
#   Part 2: the proxy passes requests through faithfully: body, query string,
#           headers, a slow request, a 1 MB upload and a 404.
#   Part 3: the server behind the proxy is killed. The proxy keeps the port,
#           answers 502, and the load test reports failures. The server comes
#           back and traffic is clean again, with the proxy never restarted.
#
# Part 3 is the point of the whole design: the public port outlives the server.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"
WORK="$(mktemp -d)"
PUBLIC=8080
INTERNAL=9001
VIA="http://127.0.0.1:$PUBLIC"
DIRECT="http://127.0.0.1:$INTERNAL"

unset JAVA_TOOL_OPTIONS

SERVER_PID=""
PROXY_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill -9 "$SERVER_PID" 2>/dev/null
  [ -n "$PROXY_PID" ] && kill -9 "$PROXY_PID" 2>/dev/null
  rm -rf "$WORK"
}
trap cleanup EXIT

wait_for() {
  for _ in $(seq 1 50); do
    if curl -fsS "$1" > /dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  return 1
}

start_server() {
  SERVER_ADDRESS=127.0.0.1 SERVER_PORT=$INTERNAL LSA_RELEASE_ID=r1 LSA_TICK_LOG="$WORK/ticks.log" \
    java -cp "$BUILD" SampleServer >> "$WORK/server.log" 2>&1 &
  SERVER_PID=$!
  wait_for "$DIRECT/ping"
}

RESULT=PASS
check() { # check <description> <condition exit code>
  if [ "$2" -eq 0 ]; then echo "  ok    $1"; else echo "  FAIL  $1"; RESULT=FAIL; fi
}
p50() { sed -n 's/.*p50=\([0-9.]*\)ms.*/\1/p' <<< "$1"; }

echo "== build"
mkdir -p "$BUILD"
javac -d "$BUILD" "$ROOT/sample/SampleServer.java" "$ROOT/loadgen/LoadGen.java" "$ROOT/proxy/Proxy.java" \
  || { echo "CHECKPOINT 1: FAIL (build)"; exit 1; }

start_server || { echo "CHECKPOINT 1: FAIL (server start)"; exit 1; }
LSA_PUBLIC_ADDRESS=127.0.0.1 LSA_PUBLIC_PORT=$PUBLIC LSA_TARGET="$DIRECT" \
  java -cp "$BUILD" Proxy > "$WORK/proxy.log" 2>&1 &
PROXY_PID=$!
wait_for "$VIA/ping" || { echo "CHECKPOINT 1: FAIL (proxy start)"; cat "$WORK/proxy.log"; exit 1; }

echo "== part 1: load, direct and through the proxy"
OUT_DIRECT=$(java -cp "$BUILD" LoadGen "$DIRECT/ping" 200 5); RC_DIRECT=$?
echo "  direct : $OUT_DIRECT"
OUT_VIA=$(java -cp "$BUILD" LoadGen "$VIA/ping" 200 5); RC_VIA=$?
echo "  proxied: $OUT_VIA"
check "direct load has 0 failures" "$RC_DIRECT"
check "proxied load has 0 failures" "$RC_VIA"
echo "  added latency at p50: $(awk -v a="$(p50 "$OUT_VIA")" -v b="$(p50 "$OUT_DIRECT")" 'BEGIN { printf "%.2f ms", a - b }')"

echo "== part 2: faithful pass-through"
[ "$(curl -fsS "$VIA/ping")" = "pong r1" ]; check "response body arrives unchanged" $?

ECHO=$(curl -fsS -X POST -H 'Host: shop.example.com' -d 'hello=swap' "$VIA/echo?a=1&b=two")
grep -q '^method=POST$' <<< "$ECHO";           check "method is passed through" $?
grep -q '^query=a=1&b=two$' <<< "$ECHO";       check "query string is passed through" $?
grep -q '^body=hello=swap$' <<< "$ECHO";       check "request body is passed through" $?
grep -q '^host=shop.example.com$' <<< "$ECHO"; check "Host header is passed through" $?
grep -q '^forwarded-for=127.0.0.1$' <<< "$ECHO"; check "X-Forwarded-For is added" $?

head -c 1048576 /dev/zero | tr '\0' 'x' > "$WORK/big.txt"
BIG=$(curl -fsS -X POST -H 'Content-Type: text/plain' --data-binary @"$WORK/big.txt" "$VIA/echo")
grep -q '^bytes=1048576$' <<< "$BIG";          check "a 1 MB upload arrives whole" $?

SLOW=$(curl -fsS -o /dev/null -w '%{http_code} %{time_total}' "$VIA/slow?ms=1500")
case "$SLOW" in 200\ 1.[5-9]*) check "a 1500 ms request completes ($SLOW s)" 0;; *) check "a 1500 ms request completes ($SLOW)" 1;; esac

[ "$(curl -s -o /dev/null -w '%{http_code}' "$VIA/no-such-path")" = "404" ]; check "a 404 from the server stays a 404" $?

echo "== part 3: the server dies, the port does not"
kill -9 "$SERVER_PID"; wait "$SERVER_PID" 2>/dev/null; SERVER_PID=""
DOWN=$(curl -s -o /dev/null -m 3 -w '%{http_code}' "$VIA/ping")
[ "$DOWN" = "502" ]; check "proxy answers 502 while the server is down (got $DOWN)" $?
kill -0 "$PROXY_PID" 2>/dev/null; check "proxy process is still running" $?

OUT_DOWN=$(java -cp "$BUILD" LoadGen "$VIA/ping" 200 2); RC_DOWN=$?
echo "  server down: $(tr '\n' ' ' <<< "$OUT_DOWN")"
[ "$RC_DOWN" -eq 1 ]; check "load test reports the failures" $?

start_server; check "server restarts behind the same proxy" $?
OUT_BACK=$(java -cp "$BUILD" LoadGen "$VIA/ping" 200 3); RC_BACK=$?
echo "  server back: $OUT_BACK"
check "0 failures again, proxy never restarted" "$RC_BACK"

echo
echo "CHECKPOINT 1: $RESULT"
[ "$RESULT" = PASS ]

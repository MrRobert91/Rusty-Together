#!/bin/sh
# Restart the no-HMR dev server used by playtest.cjs / capture.cjs (port 5174).
cd "$(dirname "$0")/../.."
PIDF=/tmp/vite-frozen.pid
[ -f $PIDF ] && kill -- -"$(cat $PIDF)" 2>/dev/null
fuser -k 5174/tcp 2>/dev/null
sleep 1
setsid sh -c 'echo $$ > /tmp/vite-frozen.pid; exec npx vite --config scripts/trailer/vite.frozen.config.ts' > /tmp/vite-frozen.log 2>&1 < /dev/null &
for i in $(seq 1 40); do curl -s localhost:5174 > /dev/null && exit 0; sleep 0.5; done
echo "frozen server did not start"; exit 1

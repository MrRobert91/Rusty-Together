#!/bin/sh
# Records every trailer clip (tutorial, then level 1) into $1 (default /tmp/trailer-frames).
cd "$(dirname "$0")"
OUT=${1:-/tmp/trailer-frames}
./restart-frozen.sh
node capture.cjs tutorial plan-tutorial.js "$OUT" > "$OUT.tutorial.log" 2>&1
node capture.cjs level1 plan-level1.js "$OUT" > "$OUT.level1.log" 2>&1
echo finished

#!/bin/sh
# Cuts the captured clips into the 60 s trailer: segments.txt lists
#   <clip> <start s> <duration s> <card|-> [zoom]
# Each segment is cut on the music's bar lines (120 BPM → 2 s bars).
# usage: sh edit.sh FRAMES_DIR CARDS_DIR MUSIC.wav OUT.mp4
set -e
FR=$1; CARDS=$2; MUSIC=$3; OUT=$4
HERE=$(dirname "$0")
TMP=$(mktemp -d)
i=0
: > "$TMP/list.txt"
grep -v '^#' "$HERE/segments.txt" | while read -r clip start dur card zoom; do
  [ -z "$clip" ] && continue
  i=$((i + 1))
  n=$(printf '%02d' "$i")
  sframe=$(awk "BEGIN { printf \"%d\", $start * 30 + 1 }")
  frames=$(awk "BEGIN { printf \"%d\", $dur * 30 }")
  src="$FR/$clip/%05d.jpg"
  # Gentle push-in on every shot keeps it alive; cards fade in and out.
  z=${zoom:-1.06}
  vf="scale=1280:720,zoompan=z='1+($z-1)*on/$frames':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x720:fps=30"
  if [ "$card" != "-" ]; then
    fo=$(awk "BEGIN { print $dur - 0.45 }")
    ffmpeg -nostdin -hide_banner -loglevel error -y -framerate 30 -start_number "$sframe" -i "$src" -loop 1 -framerate 30 -i "$CARDS/$card.png" \
      -filter_complex "[0:v]$vf[v];[1:v]format=rgba,fade=t=in:st=0.15:d=0.3:alpha=1,fade=t=out:st=$fo:d=0.35:alpha=1[c];[v][c]overlay=shortest=1:format=auto" \
      -frames:v "$frames" -c:v libx264 -pix_fmt yuv420p -crf 16 -preset fast "$TMP/$n.mp4"
  else
    ffmpeg -nostdin -hide_banner -loglevel error -y -framerate 30 -start_number "$sframe" -i "$src" -vf "$vf" \
      -frames:v "$frames" -c:v libx264 -pix_fmt yuv420p -crf 16 -preset fast "$TMP/$n.mp4"
  fi
  echo "file '$TMP/$n.mp4'" >> "$TMP/list.txt"
  echo "segment $n: $clip @$start +$dur ($card)"
done
ffmpeg -nostdin -hide_banner -loglevel error -y -f concat -safe 0 -i "$TMP/list.txt" -c copy "$TMP/video.mp4"
# Music under everything; a short fade at both ends.
ffmpeg -nostdin -hide_banner -loglevel error -y -i "$TMP/video.mp4" -i "$MUSIC" -map 0:v -map 1:a -c:v libx264 -crf 25 -preset slow -pix_fmt yuv420p -movflags +faststart \
  -c:a aac -b:a 160k -af "afade=t=in:d=0.3,afade=t=out:st=58.8:d=1.2" -shortest "$OUT"
rm -rf "$TMP"
echo "wrote $OUT"

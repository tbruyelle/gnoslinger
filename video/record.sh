#!/usr/bin/env bash
# Records the footage of the marketing video (README.md): a gnodev of its own
# on 127.0.0.1:36657 with two premined keys (video/keys, made here with an
# empty password), the client built against it and served by vite preview on
# :5175, then record/record.ts drives it in Playwright. The clips land in
# footage/*.webm with footage/marks.json, and in public/clips/*.mp4 for
# Remotion, with the sounds and the icon the composition takes from the
# game's assets.
set -euo pipefail
cd "$(dirname "$0")"
VIDEO=$PWD
REPO=$(cd .. && pwd)
RPC_PORT=${RPC_PORT:-36657}
APP_PORT=${APP_PORT:-5175}
KEYS=$VIDEO/keys
mkdir -p "$KEYS" footage public/clips

gnokey() { go -C "$REPO" tool gnokey "$@"; }
for k in video-marshal video-kid; do
  gnokey list -home "$KEYS" 2>/dev/null | grep -q " $k " || echo "" | gnokey add -home "$KEYS" -insecure-password-stdin "$k" >/dev/null
done
addr() { gnokey list -home "$KEYS" 2>/dev/null | sed -n "s/.* $1 (local) - addr: \(g1[a-z0-9]*\) .*/\1/p"; }
MARSHAL=$(addr video-marshal)
KID=$(addr video-kid)

# The chain, from scratch: the recording starts with game 0000001.
go -C "$REPO" tool gnodev local -no-watch -no-web -empty-blocks -node-rpc-listener "127.0.0.1:$RPC_PORT" \
  -add-account "$MARSHAL=1000000000000ugnot" -add-account "$KID=1000000000000ugnot" > footage/gnodev.log 2>&1 &
GNODEV=$!
trap 'kill $GNODEV ${PREVIEW:-} 2>/dev/null; wait 2>/dev/null' EXIT

# The client, built against it (the production build, so the footage is the real thing).
DIST=$VIDEO/footage/dist
(cd "$REPO/client" && VITE_RPC_URL="http://127.0.0.1:$RPC_PORT" VITE_CHAIN_ID=dev VITE_CHAIN_NAME=video VITE_GNOTIF_SERVER=" " VITE_POLL_MS=1000 \
  "$REPO/node_modules/.bin/vite" build --outDir "$DIST" --emptyOutDir --logLevel error)
(cd "$REPO/client" && exec "$REPO/node_modules/.bin/vite" preview --outDir "$DIST" --port "$APP_PORT" --strictPort) > footage/preview.log 2>&1 &
PREVIEW=$!

for _ in $(seq 1 90); do
  curl -s -m 2 "127.0.0.1:$RPC_PORT/status" | grep -q latest_block_height && break
  sleep 2
done
curl -s -m 2 "127.0.0.1:$RPC_PORT/status" | grep -q latest_block_height || { echo "gnodev did not come up: see footage/gnodev.log" >&2; exit 1; }
sleep 3

RPC="http://127.0.0.1:$RPC_PORT" APP="http://localhost:$APP_PORT/" KEYS="$KEYS" npx tsx record/record.ts

for f in footage/*.webm; do
  ffmpeg -loglevel error -y -i "$f" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -r 25 -an "public/clips/$(basename "${f%.webm}").mp4"
done
cp "$REPO/assets/sounds/music-splash.mp3" public/music.mp3
cp "$REPO/assets/sounds/gunshot1.wav" public/gunshot.wav
cp "$REPO/assets-src/icon/icon-512.png" public/icon.png
echo "footage in public/clips, moments in footage/marks.json"

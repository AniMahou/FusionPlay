#!/bin/sh
# Turn any wallpaper video into what the kiosk expects:
#   <slot>.mp4  1080p H.264, no audio, fast start (plays in every browser)
#   <slot>.jpg  a still frame, used as the event card and as the poster while the video loads
# Usage: scripts/prep-wallpaper.sh <input video> public/media/<realm>/<slot>
set -e
in="$1"; out="$2"
[ -f "$in" ] && [ -n "$out" ] || { echo "usage: $0 <input> public/media/<realm>/<slot>"; exit 1; }
tmp="$out.tmp.mp4"
ffmpeg -loglevel error -y -i "$in" -an -vf "scale='min(1920,iw)':-2,fps=30" \
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart "$tmp"
mv "$tmp" "$out.mp4"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out.mp4")
ffmpeg -loglevel error -y -ss "$(echo "$dur * 0.35" | bc -l)" -i "$out.mp4" -frames:v 1 -vf "scale=1280:-2" -q:v 3 "$out.jpg"
echo "$out.mp4 $(du -h "$out.mp4" | cut -f1)  $out.jpg"

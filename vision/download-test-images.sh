#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR=${TEST_IMAGES_DIR:-$SCRIPT_DIR/test_images}
mkdir -p "$OUT_DIR"

# User-supplied benchmark sources. Their individual site licences apply; this
# manifest deliberately does not represent every image as public domain.
NAMES=(
  atomium.jpg copenhagen.jpg eifell_tower.jpg italian_bollard.jpg vilnius.jpg yerevan.jpg
)
URLS=(
  'https://images.pexels.com/photos/1595073/pexels-photo-1595073.jpeg?cs=srgb&dl=atomium-belgium-1595073.jpg&fm=jpg'
  'https://www.publicdomainpictures.net/pictures/230000/velka/copenhagen-cityscape.jpg'
  'https://c.pxhere.com/photos/ee/40/eiffel_tower_tower_monument_tall_building_paris-15190.jpg!s'
  'https://images.squarespace-cdn.com/content/v1/60f6054f4e76b03092956de8/bd48ddbd-02aa-4bc6-99b3-99a968c582cf/it_bollard.png?format=750w'
  'https://c.pxhere.com/photos/3e/d3/vilnius_lithuania_street_town_europe_baltic_city_building-1054123.jpg!s'
  'https://as2.ftcdn.net/v2/jpg/03/12/95/51/1000_F_312955157_zA1X93U8hfV7ngCgiqyEgqWlCj889m9z.jpg'
)

printf 'filename\tsource_url\tsha256\tbytes\n' > "$OUT_DIR/sources.tsv.tmp"
for i in "${!NAMES[@]}"; do
  name=${NAMES[$i]}
  url=${URLS[$i]}
  target="$OUT_DIR/$name"
  part="$target.part"
  printf '[%d/%d] %-24s ' "$((i + 1))" "${#NAMES[@]}" "$name"
  rm -f "$part"
  curl --fail --location --silent --show-error \
    --retry 4 --retry-all-errors --connect-timeout 20 --max-time 180 \
    --user-agent 'Mozilla/5.0 SpotTheShot-benchmark/1.0' \
    --header 'Accept: image/jpeg,image/png;q=0.9,*/*;q=0.1' \
    --output "$part" "$url"

  python3 - "$part" <<'PY'
import pathlib, sys
p = pathlib.Path(sys.argv[1])
data = p.read_bytes()
if len(data) < 10_000:
    raise SystemExit(f"download too small ({len(data)} bytes), likely an error page")
if not (data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG\r\n\x1a\n")):
    raise SystemExit("download is not a JPEG or PNG image")
PY
  mv "$part" "$target"
  digest=$(sha256sum "$target" | awk '{print $1}')
  bytes=$(stat -c %s "$target")
  printf 'ok (%s bytes)\n' "$bytes"
  printf '%s\t%s\t%s\t%s\n' "$name" "$url" "$digest" "$bytes" >> "$OUT_DIR/sources.tsv.tmp"
done
mv "$OUT_DIR/sources.tsv.tmp" "$OUT_DIR/sources.tsv"
echo "Downloaded and validated ${#NAMES[@]} fixtures in $OUT_DIR"
echo "Source/checksum manifest: $OUT_DIR/sources.tsv"

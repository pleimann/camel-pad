#!/usr/bin/env bash
set -euo pipefail

# lv_font_conv requires outline TrueType fonts. Color/variable fonts (like the
# current NotoEmoji) are not supported. DejaVu Sans covers arrows, dingbats,
# and misc symbols as standard outlines and works reliably with lv_font_conv.
# DejaVuSans.ttf is downloaded automatically on first run if not present.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/../src/fonts"
MONTSERRAT="$SCRIPT_DIR/../.pio/libdeps/camelpad/lvgl/scripts/built_in_font/Montserrat-Medium.ttf"
BPP=4

# DejaVu Sans: covers arrows (U+2190), symbols (U+2600), dingbats (U+2700), etc.
DEJAVU_SANS="$SCRIPT_DIR/DejaVuSans.ttf"
if [ ! -f "$DEJAVU_SANS" ]; then
  echo "DejaVuSans.ttf not found — downloading..."
  curl -fL \
    "https://github.com/dejavu-fonts/dejavu-fonts/releases/download/version_2_37/dejavu-fonts-ttf-2.37.tar.bz2" \
    | tar -xjO "dejavu-fonts-ttf-2.37/ttf/DejaVuSans.ttf" > "$DEJAVU_SANS"
  echo "Downloaded DejaVuSans.ttf"
fi

mkdir -p "$OUT_DIR"

if [ ! -f "$MONTSERRAT" ]; then
  echo "ERROR: Montserrat font not found at: $MONTSERRAT"
  echo "Run 'platformio run' once first to fetch LVGL library deps."
  exit 1
fi

echo "Using Montserrat: $MONTSERRAT"
echo "Using DejaVu Sans: $DEJAVU_SANS"

for SIZE in 24 28 32; do
  echo "Generating lv_font_custom_${SIZE}.c..."
  npx --yes lv_font_conv \
    --font "$MONTSERRAT" \
      -r 0x0020-0x007F \
      -r 0x00A0-0x017F \
      -r 0x2000-0x206F \
    --font "$DEJAVU_SANS" \
      -r 0x2190-0x21FF \
      -r 0x2600-0x26FF \
      -r 0x2700-0x27BF \
      -r 0x2B00-0x2BFF \
    --size $SIZE \
    --format lvgl \
    --bpp $BPP \
    -o "$OUT_DIR/lv_font_deja_${SIZE}.c"
done

echo "Done. Generated fonts in $OUT_DIR"

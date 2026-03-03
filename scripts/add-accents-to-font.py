"""
Add accented characters to NJNaruto font.
Creates new glyphs by copying base letter outlines and adding accent contours.
"""
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph
from fontTools.pens.pointPen import PointToSegmentPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from copy import deepcopy
import array

INPUT_PATH = "public/fonts/njnaruto.ttf"
OUTPUT_TTF = "public/fonts/njnaruto-accented.ttf"

# Map: accented char -> (base char, accent type)
ACCENT_MAP = {
    # Lowercase acute
    "\u00e9": ("e", "acute"),
    "\u00e1": ("a", "acute"),
    "\u00fa": ("u", "acute"),
    "\u00ed": ("i", "acute"),
    "\u00f3": ("o", "acute"),
    # Lowercase grave
    "\u00e8": ("e", "grave"),
    "\u00e0": ("a", "grave"),
    "\u00f9": ("u", "grave"),
    # Lowercase circumflex
    "\u00ea": ("e", "circumflex"),
    "\u00e2": ("a", "circumflex"),
    "\u00ee": ("i", "circumflex"),
    "\u00f4": ("o", "circumflex"),
    "\u00fb": ("u", "circumflex"),
    # Lowercase diaeresis
    "\u00eb": ("e", "diaeresis"),
    "\u00e4": ("a", "diaeresis"),
    "\u00ef": ("i", "diaeresis"),
    "\u00f6": ("o", "diaeresis"),
    "\u00fc": ("u", "diaeresis"),
    # Cedilla
    "\u00e7": ("c", "cedilla"),
    # Uppercase acute
    "\u00c9": ("E", "acute"),
    "\u00c1": ("A", "acute"),
    "\u00da": ("U", "acute"),
    "\u00cd": ("I", "acute"),
    "\u00d3": ("O", "acute"),
    # Uppercase grave
    "\u00c8": ("E", "grave"),
    "\u00c0": ("A", "grave"),
    "\u00d9": ("U", "grave"),
    # Uppercase circumflex
    "\u00ca": ("E", "circumflex"),
    "\u00c2": ("A", "circumflex"),
    "\u00ce": ("I", "circumflex"),
    "\u00d4": ("O", "circumflex"),
    "\u00db": ("U", "circumflex"),
    # Uppercase diaeresis
    "\u00cb": ("E", "diaeresis"),
    "\u00c4": ("A", "diaeresis"),
    "\u00cf": ("I", "diaeresis"),
    "\u00d6": ("O", "diaeresis"),
    "\u00dc": ("U", "diaeresis"),
    # Uppercase cedilla
    "\u00c7": ("C", "cedilla"),
}


def draw_accent(pen, accent_type, cx, top_y, glyph_width):
    """Draw accent contour(s) using a TTGlyphPen."""
    t = int(glyph_width * 0.10)   # stroke thickness
    h = int(glyph_width * 0.16)   # accent height
    gap = int(glyph_width * 0.06)  # gap above letter

    by = top_y + gap  # base y of accent

    if accent_type == "acute":
        # Slash going up-right
        dx = int(t * 1.8)
        pen.moveTo((cx - dx - t, by))
        pen.lineTo((cx - dx + t, by))
        pen.lineTo((cx + dx + t, by + h))
        pen.lineTo((cx + dx - t, by + h))
        pen.closePath()

    elif accent_type == "grave":
        # Slash going up-left
        dx = int(t * 1.8)
        pen.moveTo((cx + dx - t, by))
        pen.lineTo((cx + dx + t, by))
        pen.lineTo((cx - dx + t, by + h))
        pen.lineTo((cx - dx - t, by + h))
        pen.closePath()

    elif accent_type == "circumflex":
        # Chevron ^
        hw = int(glyph_width * 0.16)
        peak = by + h
        pen.moveTo((cx - hw - t, by))
        pen.lineTo((cx - hw + t, by))
        pen.lineTo((cx, peak - t))
        pen.lineTo((cx + hw - t, by))
        pen.lineTo((cx + hw + t, by))
        pen.lineTo((cx, peak + t))
        pen.closePath()

    elif accent_type == "diaeresis":
        # Two square dots
        r = int(t * 0.85)
        sp = int(glyph_width * 0.16)
        dy = by + r + t

        for dcx in [cx - sp, cx + sp]:
            pen.moveTo((dcx - r, dy - r))
            pen.lineTo((dcx + r, dy - r))
            pen.lineTo((dcx + r, dy + r))
            pen.lineTo((dcx - r, dy + r))
            pen.closePath()

    elif accent_type == "cedilla":
        # Hook below baseline
        hw = int(glyph_width * 0.08)
        hh = int(glyph_width * 0.18)
        yt = -int(glyph_width * 0.01)
        yb = yt - hh

        pen.moveTo((cx - hw, yt))
        pen.lineTo((cx + hw, yt))
        pen.lineTo((cx + hw, yb + hw * 2))
        pen.lineTo((cx + hw * 2, yb + hw * 2))
        pen.lineTo((cx + hw * 2, yb))
        pen.lineTo((cx - hw, yb))
        pen.closePath()


def main():
    print(f"Loading font: {INPUT_PATH}")
    font = TTFont(INPUT_PATH)

    glyf_table = font["glyf"]
    hmtx_table = font["hmtx"]
    cmap = font.getBestCmap()

    # Build list of new glyphs first, then add all at once
    new_glyphs = []

    for char, (base_char, accent_type) in ACCENT_MAP.items():
        codepoint = ord(char)

        if codepoint in cmap:
            continue

        base_cp = ord(base_char)
        if base_cp not in cmap:
            print(f"  Skipping {char}: base '{base_char}' not in font")
            continue

        base_name = cmap[base_cp]
        base_glyph = glyf_table[base_name]

        if not hasattr(base_glyph, 'numberOfContours') or base_glyph.numberOfContours <= 0:
            print(f"  Skipping {char}: base glyph empty/composite")
            continue

        glyph_name = f"uni{codepoint:04X}"
        new_glyphs.append((char, codepoint, glyph_name, base_name, base_glyph, accent_type))

    # Now add them all
    # Get current glyph order
    glyph_order = font.getGlyphOrder()
    new_order = list(glyph_order)

    for char, codepoint, glyph_name, base_name, base_glyph, accent_type in new_glyphs:
        width, lsb = hmtx_table[base_name]
        gw = base_glyph.xMax - base_glyph.xMin
        cx = (base_glyph.xMin + base_glyph.xMax) // 2
        top_y = base_glyph.yMax

        # Use TTGlyphPen to create new glyph
        pen = TTGlyphPen(font.getGlyphSet())

        # First: draw all contours from the base glyph
        base_glyph.draw(pen, glyf_table)

        # Then: draw the accent on top
        draw_accent(pen, accent_type, cx, top_y, gw)

        # Build the new glyph
        new_glyph = pen.glyph()

        # Add to tables
        glyf_table[glyph_name] = new_glyph
        hmtx_table[glyph_name] = (width, lsb)
        new_order.append(glyph_name)

        # Add to cmap
        for table in font["cmap"].tables:
            if hasattr(table, "cmap") and isinstance(table.cmap, dict):
                table.cmap[codepoint] = glyph_name

        print(f"  Added: {char} ({glyph_name}) = {base_char} + {accent_type}")

    # Update glyph order
    font.setGlyphOrder(new_order)

    print(f"\nAdded {len(new_glyphs)} accented glyphs.")

    # Save TTF
    print(f"Saving: {OUTPUT_TTF}")
    font.save(OUTPUT_TTF)
    print("TTF saved.")

    # Convert to WOFF2
    try:
        output_woff2 = OUTPUT_TTF.replace(".ttf", ".woff2")
        print(f"Converting to WOFF2: {output_woff2}")
        font2 = TTFont(OUTPUT_TTF)
        font2.flavor = "woff2"
        font2.save(output_woff2)
        print("WOFF2 saved.")
    except Exception as e:
        print(f"WOFF2 conversion failed: {e}")

    # Verify
    print("\nVerifying...")
    check = TTFont(OUTPUT_TTF)
    check_cmap = check.getBestCmap()
    for ch in "éèêëàâùûçîïôöÉÈÊÀÇÔÛ":
        ok = ord(ch) in check_cmap
        print(f"  {ch}: {'OK' if ok else 'MISSING'}")

    print("\nDone!")


if __name__ == "__main__":
    main()

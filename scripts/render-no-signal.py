#!/usr/bin/env python3
"""Render localized copies of the original gray no-signal card."""

import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZES = ((1920, 1080), (1280, 720), (640, 480))
CARD = (212, 215, 217, 255)
BORDER = (174, 180, 184, 255)
TITLE = (23, 26, 29, 255)
BODY = (82, 90, 97, 255)
BRAND = (105, 113, 120, 255)
WARN = (240, 180, 41, 255)
WARN_EDGE = (216, 149, 22, 255)
SCALE = 4


def clamp(value, low, high):
    return max(low, min(high, value))


BUNDLED_FONTS = Path(__file__).resolve().parent / "fonts"


def bundled_font(code, bold):
    family = "tc" if code == "zh_tw" else "sc"
    style = "Bold" if bold else "Regular"
    path = BUNDLED_FONTS / f"NotoSansCJK{family}-{style}.subset.otf"
    if path.is_file():
        return str(path), 0
    return None


def font_match(query, fallback, index):
    override = os.environ.get("ONEKVM_NO_SIGNAL_FONT")
    if override:
        chosen = int(os.environ.get("ONEKVM_NO_SIGNAL_FONT_INDEX", str(index)))
        return override, chosen
    try:
        out = subprocess.check_output(
            ["fc-match", "-f", "%{file}\n%{index}\n", query],
            text=True,
        )
        path, found = out.strip().splitlines()
        if Path(path).is_file():
            return path, int(found)
    except (OSError, subprocess.CalledProcessError, ValueError):
        pass
    if Path(fallback).is_file():
        return fallback, index
    raise SystemExit(f"font not found for {query}")


def fonts_for(code):
    regular = bundled_font(code, False)
    bold = bundled_font(code, True)
    if regular and bold:
        return regular, bold
    if code == "zh_tw":
        return (
            font_match("Noto Sans CJK TC", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 3),
            font_match("Noto Sans CJK TC:style=Bold", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 3),
        )
    return (
        font_match("Noto Sans CJK SC", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 2),
        font_match("Noto Sans CJK SC:style=Bold", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 2),
    )


def load_font(spec, size):
    path, index = spec
    return ImageFont.truetype(path, size=max(8, int(round(size * SCALE))), index=index)


def wrap(draw, text, font, width):
    text = str(text or "").strip()
    if not text:
        return [""]
    if " " in text:
        lines = []
        current = ""
        for word in text.split():
            trial = word if not current else f"{current} {word}"
            if draw.textlength(trial, font=font) <= width:
                current = trial
            else:
                if current:
                    lines.append(current)
                current = word
        if current:
            lines.append(current)
        return lines
    if draw.textlength(text, font=font) <= width:
        return [text]
    lines = []
    current = ""
    for char in text:
        trial = current + char
        if current and draw.textlength(trial, font=font) > width:
            lines.append(current)
            current = char
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def text_height(lines, line_height):
    return len(lines) * line_height


def draw_lines(draw, lines, font, xy, fill, line_height):
    x, y = xy
    for line in lines:
        box = draw.textbbox((0, 0), line or " ", font=font, anchor="lt")
        ink_height = box[3] - box[1]
        draw.text((x, y + (line_height - ink_height) / 2), line,
                  font=font, fill=fill, anchor="lt")
        y += line_height
    return y


def draw_icon(draw, x, y, size):
    # The approved SVG uses an 84x84 viewBox and a 3px mitered outline.
    unit = size / 84
    points = lambda values: [(x + px * unit, y + py * unit) for px, py in values]
    draw.polygon(points([(42, 1.79), (2.51, 76.5), (81.49, 76.5)]), fill=WARN_EDGE)
    draw.polygon(points([(42, 8.21), (7.49, 73.5), (76.51, 73.5)]), fill=WARN)
    for top, bottom in [(27, 48), (60, 61)]:
        draw.rounded_rectangle(
            [x + 38.5 * unit, y + (top - 3.5) * unit,
             x + 45.5 * unit, y + (bottom + 3.5) * unit],
            radius=3.5 * unit, fill=(255, 255, 255, 255),
        )


def render(copy, regular, bold, width, height):
    canvas = Image.new("RGBA", (width * SCALE, height * SCALE), (0, 0, 0, 255))
    draw = ImageDraw.Draw(canvas)
    # Match the original artwork's border-box dimensions and spacing. The
    # brand sits inside the top padding, rather than adding another header row.
    outer_pad = clamp(width * 0.05, 18, 64)
    card_w = min(720, (width - outer_pad * 2) * 0.92) * SCALE
    gap = clamp(width * 0.028, 24, 34) * SCALE
    pad_x = clamp(width * 0.034, 26, 40) * SCALE
    pad_y = clamp(width * 0.034, 28, 40) * SCALE
    icon = clamp(width * 0.13, 110, 180) * SCALE
    brand_top = clamp(width * 0.017, 14, 20) * SCALE
    brand_left = clamp(width * 0.023, 18, 28) * SCALE
    title_size = clamp(width * 0.025, 23, 28)
    body_size = clamp(width * 0.016, 13, 17)
    list_size = clamp(width * 0.0145, 12, 15)
    title_font = load_font(bold, title_size)
    body_font = load_font(regular, body_size)
    list_font = load_font(regular, list_size)
    text_w = card_w - pad_x * 2 - icon - gap - 2 * SCALE
    title_lines = wrap(draw, copy["title"], title_font, text_w)
    check_lines = wrap(draw, copy["check"], body_font, text_w)
    items = []
    for index, line in enumerate(copy["lines"], start=1):
        prefix = f"{index}. "
        wrapped = wrap(draw, line, list_font, text_w - list_size * 1.6 * SCALE)
        items.append((prefix, wrapped))
    title_line = title_size * 1.05 * SCALE
    body_line = body_size * 1.2 * SCALE
    list_line = list_size * 1.25 * SCALE
    title_gap = clamp(width * 0.012, 8, 13) * SCALE
    title_h = text_height(title_lines, title_line)
    check_h = text_height(check_lines, body_line)
    list_h = sum(text_height(lines, list_line) for _, lines in items)
    list_h += 4 * SCALE * max(0, len(items) - 1)
    text_h = title_h + title_gap + check_h + 7 * SCALE + list_h
    brand_font = load_font(bold, 14)
    content_h = max(icon, text_h)
    card_h = content_h + pad_y * 2 + 2 * SCALE
    card_x = (width * SCALE - card_w) / 2
    card_y = (height * SCALE - card_h) / 2
    draw.rounded_rectangle(
        [card_x, card_y, card_x + card_w - 1, card_y + card_h - 1],
        radius=10 * SCALE,
        fill=CARD,
        outline=BORDER,
        width=SCALE,
    )
    brand_x = card_x + brand_left
    brand_y = card_y + brand_top - draw.textbbox((0, 0), "OneKVM", font=brand_font, anchor="ls")[1]
    for letter in "OneKVM":
        draw.text((brand_x, brand_y), letter, font=brand_font, fill=BRAND, anchor="ls")
        brand_x += draw.textlength(letter, font=brand_font) + 1.12 * SCALE
    row_y = card_y + pad_y + SCALE
    icon_y = row_y + max(0, (content_h - icon) / 2)
    draw_icon(draw, card_x + pad_x, icon_y, icon)
    text_x = card_x + pad_x + icon + gap
    text_y = row_y + max(0, (content_h - text_h) / 2)
    text_y = draw_lines(draw, title_lines, title_font, (text_x, text_y), TITLE, title_line)
    text_y += title_gap
    text_y = draw_lines(draw, check_lines, body_font, (text_x, text_y), BODY, body_line)
    text_y += 7 * SCALE
    for prefix, wrapped in items:
        draw_lines(draw, [prefix], list_font, (text_x, text_y), BODY, list_line)
        text_y = draw_lines(draw, wrapped, list_font,
                            (text_x + list_size * 1.6 * SCALE, text_y), BODY, list_line)
        text_y += 4 * SCALE
    return canvas.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: render-no-signal.py <l10n-out>")
    root = Path(sys.argv[1])
    rendered = 0
    for copy_path in sorted(root.glob("*/no-signal/copy.json")):
        copy = json.loads(copy_path.read_text())
        lines = copy.get("lines") or []
        if not copy.get("title") or not copy.get("check") or len(lines) != 3:
            raise SystemExit(f"{copy_path} is missing no-signal copy")
        code = copy.get("code") or copy_path.parents[1].name
        regular, bold = fonts_for(code)
        for width, height in SIZES:
            image = render(copy, regular, bold, width, height)
            image.save(copy_path.parent / f"{width}x{height}.png", optimize=True)
        rendered += 1
    if rendered == 0:
        raise SystemExit(f"no no-signal copy under {root}")


if __name__ == "__main__":
    main()

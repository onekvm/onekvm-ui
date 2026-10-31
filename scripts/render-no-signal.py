#!/usr/bin/env python3
"""Render no-signal PNGs for each language pack under l10n-out."""

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
ONE = (6, 26, 58, 255)
KVM = (22, 119, 255, 255)
WARN = (240, 180, 41, 255)
WARN_EDGE = (216, 149, 22, 255)


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
    return ImageFont.truetype(path, size=max(8, int(round(size))), index=index)


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


def text_height(draw, lines, font, spacing):
    height = 0
    for line in lines:
        box = draw.textbbox((0, 0), line or " ", font=font)
        height += box[3] - box[1]
    if len(lines) > 1:
        height += spacing * (len(lines) - 1)
    return height


def draw_lines(draw, lines, font, xy, fill, spacing):
    x, y = xy
    for line in lines:
        draw.text((x, y), line, font=font, fill=fill)
        box = draw.textbbox((0, 0), line or " ", font=font)
        y += box[3] - box[1] + spacing
    return y


def draw_icon(draw, x, y, size):
    margin = size * 0.08
    top = (x + size / 2, y + margin)
    right = (x + size - margin, y + size - margin)
    left = (x + margin, y + size - margin)
    draw.polygon([top, right, left], fill=WARN)
    stroke = max(2, int(size * 0.035))
    draw.line([top, right, left, top], fill=WARN_EDGE, width=stroke)
    bar = max(4, int(size * 0.075))
    cx = x + size / 2
    draw.rounded_rectangle(
        [cx - bar / 2, y + size * 0.34, cx + bar / 2, y + size * 0.62],
        radius=bar / 2,
        fill=(255, 255, 255, 255),
    )
    dot = bar * 1.15
    draw.ellipse(
        [cx - dot / 2, y + size * 0.70, cx + dot / 2, y + size * 0.70 + dot],
        fill=(255, 255, 255, 255),
    )


def render(copy, regular, bold, width, height):
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 255))
    draw = ImageDraw.Draw(canvas)
    card_w = min(720, width * 0.92)
    gap = clamp(width * 0.028, 24, 34)
    pad_x = clamp(width * 0.034, 26, 40)
    pad_y = clamp(width * 0.034, 28, 40)
    icon = clamp(width * 0.13, 110, 180)
    brand_w = clamp(width * 0.10, 86, 120)
    brand_top = clamp(width * 0.017, 14, 20)
    brand_left = clamp(width * 0.023, 18, 28)
    title_size = clamp(width * 0.025, 23, 28)
    body_size = clamp(width * 0.016, 13, 17)
    list_size = clamp(width * 0.0145, 12, 15)
    title_font = load_font(bold, title_size)
    body_font = load_font(regular, body_size)
    list_font = load_font(regular, list_size)
    text_w = card_w - pad_x * 2 - icon - gap
    title_lines = wrap(draw, copy["title"], title_font, text_w)
    check_lines = wrap(draw, copy["check"], body_font, text_w)
    items = []
    for index, line in enumerate(copy["lines"], start=1):
        prefix = f"{index}. "
        prefix_w = draw.textlength(prefix, font=list_font)
        wrapped = wrap(draw, line, list_font, max(40, text_w - prefix_w))
        items.append((prefix, wrapped))
    title_h = text_height(draw, title_lines, title_font, 2)
    check_h = text_height(draw, check_lines, body_font, 1)
    list_h = 0
    for prefix, wrapped in items:
        list_h += text_height(draw, wrapped, list_font, 1)
    list_h += 4 * max(0, len(items) - 1)
    text_h = title_h + clamp(width * 0.012, 8, 13) + check_h + 7 + list_h
    brand_font = load_font(bold, 28)
    while brand_font.size > 12 and draw.textlength("OneKVM", font=brand_font) > brand_w:
        brand_font = load_font(bold, brand_font.size - 1)
    brand_box = draw.textbbox((0, 0), "OneKVM", font=brand_font)
    brand_h = brand_box[3] - brand_box[1]
    content_h = max(icon, text_h)
    card_h = brand_top + brand_h + 16 + content_h + pad_y
    card_x = (width - card_w) / 2
    card_y = (height - card_h) / 2
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle(
        [card_x, card_y + 14, card_x + card_w, card_y + card_h + 22],
        radius=10,
        fill=(0, 0, 0, 90),
    )
    canvas.alpha_composite(shadow)
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle(
        [card_x, card_y, card_x + card_w, card_y + card_h],
        radius=10,
        fill=CARD,
        outline=BORDER,
        width=1,
    )
    one_w = draw.textlength("One", font=brand_font)
    brand_y = card_y + brand_top
    brand_x = card_x + brand_left
    draw.text((brand_x, brand_y), "One", font=brand_font, fill=ONE)
    draw.text((brand_x + one_w, brand_y), "KVM", font=brand_font, fill=KVM)
    row_y = brand_y + brand_h + 16
    icon_y = row_y + max(0, (content_h - icon) / 2)
    draw_icon(draw, card_x + pad_x, icon_y, icon)
    text_x = card_x + pad_x + icon + gap
    text_y = row_y + max(0, (content_h - text_h) / 2)
    text_y = draw_lines(draw, title_lines, title_font, (text_x, text_y), TITLE, 2)
    text_y += clamp(width * 0.012, 8, 13) - 2
    text_y = draw_lines(draw, check_lines, body_font, (text_x, text_y), BODY, 1)
    text_y += 7
    for prefix, wrapped in items:
        prefix_w = draw.textlength(prefix, font=list_font)
        draw.text((text_x, text_y), prefix, font=list_font, fill=BODY)
        text_y = draw_lines(draw, wrapped, list_font, (text_x + prefix_w, text_y), BODY, 1)
        text_y += 4
    return canvas.convert("RGB")


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

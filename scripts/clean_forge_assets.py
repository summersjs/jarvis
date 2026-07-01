#!/usr/bin/env python3
"""Create transparent cleaned copies of Forge PNG assets.

This script is intentionally conservative. It removes light/white/checkerboard
backgrounds connected to image edges, while preserving dark rectangular artwork
such as boards, shelves, and textures.
"""

from __future__ import annotations

import argparse
from collections import Counter, deque
from pathlib import Path
from typing import Iterable

try:
    from PIL import Image, ImageFilter
except ImportError as exc:  # pragma: no cover - user-facing dependency guard
    raise SystemExit(
        "Pillow is required. Install it with: python -m pip install Pillow"
    ) from exc


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "frontend" / "public" / "images" / "Forge"
OUTPUT_DIR = SOURCE_DIR / "cleaned"

BG_LIGHT_THRESHOLD = 226
COLOR_DISTANCE_THRESHOLD = 38
EDGE_SAMPLE_SIZE = 14
FEATHER_RADIUS = 0.65
TRIM_PADDING = 14

ASSETS = [
    "forge-icon-business.png",
    "forge-icon-games.png",
    "forge-icon-hardware.png",
    "forge-icon-jarvis.png",
    "forge-icon-life.png",
    "forge-icon-writing.png",
    "forge-incubation-folder-small.png",
    "forge-incubation-shelf.png",
    "forge-plaque.png",
    "forge-spark-board.png",
    "forge-spark-lightbulb.png",
    "forge-sticky-finish.png",
    "forge-vignette-overlay.png",
    "forge-folder-shell.png",
    "forge-folder-shell-active.png",
]

# These are designed as rectangular panels/overlays. Only remove accidental
# light borders; do not try to cut out the dark artwork.
RECTANGULAR_ARTWORK = {
    "forge-incubation-shelf.png",
    "forge-spark-board.png",
    "forge-vignette-overlay.png",
}


def is_light_low_saturation(pixel: tuple[int, int, int, int], threshold: int = BG_LIGHT_THRESHOLD) -> bool:
    r, g, b, a = pixel
    if a < 18:
        return True
    high = max(r, g, b)
    low = min(r, g, b)
    return high >= threshold and (high - low) <= 30


def color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def edge_points(width: int, height: int, edge_size: int) -> Iterable[tuple[int, int]]:
    edge_size = max(1, min(edge_size, width // 2, height // 2))
    for x in range(width):
        for y in range(edge_size):
            yield x, y
            yield x, height - 1 - y
    for y in range(height):
        for x in range(edge_size):
            yield x, y
            yield width - 1 - x, y


def dominant_light_edge_colors(image: Image.Image) -> list[tuple[int, int, int]]:
    pixels = image.load()
    width, height = image.size
    colors: Counter[tuple[int, int, int]] = Counter()
    for x, y in edge_points(width, height, EDGE_SAMPLE_SIZE):
        r, g, b, a = pixels[x, y]
        if is_light_low_saturation((r, g, b, a), threshold=210):
            colors[(round(r / 8) * 8, round(g / 8) * 8, round(b / 8) * 8)] += 1
    return [color for color, _ in colors.most_common(8)]


def near_edge_background(pixel: tuple[int, int, int, int], bg_colors: list[tuple[int, int, int]]) -> bool:
    r, g, b, a = pixel
    if a < 18:
        return True
    if is_light_low_saturation(pixel):
        return True
    if not bg_colors:
        return False
    return any(color_distance((r, g, b), bg) <= COLOR_DISTANCE_THRESHOLD for bg in bg_colors)


def image_stats(image: Image.Image) -> dict[str, float | bool]:
    data = list(image.getdata())
    total = max(1, len(data))
    transparent = sum(1 for _, _, _, a in data if a < 10)
    white = sum(1 for r, g, b, a in data if a > 240 and r > 238 and g > 238 and b > 238)
    edge = [image.getpixel(pt) for pt in edge_points(*image.size, EDGE_SAMPLE_SIZE)]
    edge_light = sum(1 for pixel in edge if is_light_low_saturation(pixel, threshold=215))
    return {
        "has_alpha": transparent > total * 0.01,
        "transparent_ratio": transparent / total,
        "white_ratio": white / total,
        "edge_light_ratio": edge_light / max(1, len(edge)),
    }


def build_background_mask(image: Image.Image, bg_colors: list[tuple[int, int, int]], rectangular: bool) -> Image.Image:
    width, height = image.size
    pixels = image.load()
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def idx(x: int, y: int) -> int:
        return y * width + x

    for x, y in edge_points(width, height, EDGE_SAMPLE_SIZE):
        i = idx(x, y)
        if visited[i]:
            continue
        pixel = pixels[x, y]
        if near_edge_background(pixel, bg_colors):
            visited[i] = 1
            queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= width or ny >= height:
                continue
            i = idx(nx, ny)
            if visited[i]:
                continue
            pixel = pixels[nx, ny]
            if near_edge_background(pixel, bg_colors):
                visited[i] = 1
                queue.append((nx, ny))

    # Rectangular artwork should keep most of its canvas. Only cut obvious light
    # edge-connected backgrounds, never dark panel interiors.
    mask = Image.new("L", (width, height), 0)
    mask_data = mask.load()
    for y in range(height):
        for x in range(width):
            if visited[idx(x, y)]:
                r, g, b, a = pixels[x, y]
                if not rectangular or is_light_low_saturation((r, g, b, a), threshold=218):
                    mask_data[x, y] = 255
    return mask


def apply_mask(image: Image.Image, mask: Image.Image) -> tuple[Image.Image, bool]:
    blurred = mask.filter(ImageFilter.GaussianBlur(FEATHER_RADIUS))
    result = image.copy()
    r, g, b, alpha = result.split()
    next_alpha = Image.new("L", result.size, 255)
    alpha_data = alpha.load()
    blur_data = blurred.load()
    next_data = next_alpha.load()
    changed = False
    width, height = result.size
    for y in range(height):
        for x in range(width):
            reduction = blur_data[x, y]
            if reduction:
                changed = True
            next_data[x, y] = max(0, min(255, int(alpha_data[x, y] * (255 - reduction) / 255)))
    result.putalpha(next_alpha)
    return result, changed


def trim_image(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if not bbox:
        return image
    left, top, right, bottom = bbox
    left = max(0, left - TRIM_PADDING)
    top = max(0, top - TRIM_PADDING)
    right = min(image.width, right + TRIM_PADDING)
    bottom = min(image.height, bottom + TRIM_PADDING)
    return image.crop((left, top, right, bottom))


def clean_asset(path: Path, output: Path, trim: bool) -> None:
    with Image.open(path) as original:
        mode = original.mode
        image = original.convert("RGBA")

    stats = image_stats(image)
    rectangular = path.name in RECTANGULAR_ARTWORK
    bg_colors = dominant_light_edge_colors(image)
    should_attempt = bool(bg_colors) and (
        stats["edge_light_ratio"] > 0.12 or stats["white_ratio"] > 0.04
    )

    cleanup_applied = False
    note = ""
    cleaned = image
    if should_attempt:
        mask = build_background_mask(image, bg_colors, rectangular=rectangular)
        cleaned, cleanup_applied = apply_mask(image, mask)
        if cleanup_applied and trim and not rectangular:
            cleaned = trim_image(cleaned)
    else:
        note = "already clean/dark rectangular"

    output.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(output)
    print(
        f"{path.name}: mode={mode}, alpha={stats['has_alpha']}, "
        f"white={stats['white_ratio']:.1%}, edge_light={stats['edge_light_ratio']:.1%}, "
        f"cleanup={cleanup_applied}, output={output.relative_to(ROOT)}"
        + (f", note={note}" if note else "")
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean baked light backgrounds from Forge PNG assets.")
    parser.add_argument("--trim", action="store_true", help="Trim transparent padding on non-rectangular assets.")
    args = parser.parse_args()

    if not SOURCE_DIR.exists():
        raise SystemExit(f"Missing source directory: {SOURCE_DIR}")

    for filename in ASSETS:
        source = SOURCE_DIR / filename
        output = OUTPUT_DIR / filename
        if not source.exists():
            print(f"{filename}: missing, skipped")
            continue
        clean_asset(source, output, trim=args.trim)


if __name__ == "__main__":
    main()

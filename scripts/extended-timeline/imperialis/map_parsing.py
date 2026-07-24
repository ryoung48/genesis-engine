"""Brace-aware parsers for EU4-style map area and region files."""

from __future__ import annotations

import re
from pathlib import Path


def strip_comments(text: str) -> str:
    return re.sub(r"#.*", "", text)


def _matching_brace(text: str, open_index: int) -> int:
    depth = 0
    for index in range(open_index, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return index
    raise ValueError("unmatched brace in map file")


def _named_blocks(text: str) -> dict[str, str]:
    blocks: dict[str, str] = {}
    index = 0
    pattern = re.compile(r"\b([A-Za-z0-9_]+)\s*=\s*\{")
    while match := pattern.search(text, index):
        name = match.group(1)
        open_index = text.find("{", match.start())
        close_index = _matching_brace(text, open_index)
        blocks[name] = text[open_index + 1 : close_index]
        index = close_index + 1
    return blocks


def _top_level_text(block: str) -> str:
    chars: list[str] = []
    depth = 0
    for char in block:
        if char == "{":
            depth += 1
            chars.append(" ")
        elif char == "}":
            depth = max(0, depth - 1)
            chars.append(" ")
        elif depth == 0:
            chars.append(char)
        else:
            chars.append(" ")
    return "".join(chars)


def _nested_block(block: str, name: str) -> str | None:
    match = re.search(rf"\b{re.escape(name)}\s*=\s*\{{", block)
    if not match:
        return None
    open_index = block.find("{", match.start())
    close_index = _matching_brace(block, open_index)
    return block[open_index + 1 : close_index]


def parse_area_provinces(path: Path) -> dict[str, set[int]]:
    blocks = _named_blocks(strip_comments(path.read_text(encoding="latin-1")))
    out: dict[str, set[int]] = {}
    for area_name, block in blocks.items():
        ids = {int(token) for token in re.findall(r"\b\d+\b", _top_level_text(block))}
        if ids:
            out[area_name] = ids
    return out


def parse_region_areas(path: Path) -> dict[str, set[str]]:
    blocks = _named_blocks(strip_comments(path.read_text(encoding="latin-1")))
    out: dict[str, set[str]] = {}
    for region_name, block in blocks.items():
        areas_block = _nested_block(block, "areas")
        if areas_block is None:
            continue
        areas = set(re.findall(r"[A-Za-z0-9_]+", areas_block))
        if areas:
            out[region_name] = areas
    return out


def province_regions(area_path: Path, region_path: Path) -> dict[int, set[str]]:
    areas = parse_area_provinces(area_path)
    regions = parse_region_areas(region_path)
    out: dict[int, set[str]] = {}
    for region_name, area_names in regions.items():
        for area_name in area_names:
            for province_id in areas.get(area_name, set()):
                out.setdefault(province_id, set()).add(region_name)
    return out


def province_areas(area_path: Path) -> dict[int, set[str]]:
    areas = parse_area_provinces(area_path)
    out: dict[int, set[str]] = {}
    for area_name, province_ids in areas.items():
        for province_id in province_ids:
            out.setdefault(province_id, set()).add(area_name)
    return out

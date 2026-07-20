"""Minimal Clausewitz/PDXscript (EU4-format) parser: `key = value` blocks,
nested `{ }` blocks, and bare-token lists, e.g.:

    owner = CTV
    male_names = { Gunther Rolf }
    924.7.17 = { monarch = { name = "Aethelstan" adm = 2 } }

Produces an ordered list of (key, value) tuples (duplicates preserved, since
EU4 history files repeat date keys and `discovered_by = X` lines by design).
A block whose entries are all bare tokens (no `=`) collapses to a flat list
of strings instead of a list of pairs.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

Entries = list[tuple[str, Any]]

_TOKEN_RE = re.compile(r'"[^"]*"|[{}=]|[^\s{}=#"]+')

DATE_RE = re.compile(r"^-?\d+\.\d+\.\d+$")


def _strip_quotes(tok: str) -> str:
    if len(tok) >= 2 and tok[0] == '"' and tok[-1] == '"':
        return tok[1:-1]
    return tok


def tokenize(text: str) -> list[str]:
    # Strip # comments (to end of line) before tokenizing quoted strings so a
    # '#' inside a quoted string isn't mistaken for a comment start -- rare
    # in this dataset but cheap to avoid.
    out_lines = []
    for line in text.splitlines():
        in_quotes = False
        cut = len(line)
        for i, ch in enumerate(line):
            if ch == '"':
                in_quotes = not in_quotes
            elif ch == "#" and not in_quotes:
                cut = i
                break
        out_lines.append(line[:cut])
    cleaned = "\n".join(out_lines)
    return _TOKEN_RE.findall(cleaned)


def parse_block(tokens: list[str], i: int) -> tuple[Any, int]:
    entries: Entries = []
    n = len(tokens)
    while i < n and tokens[i] != "}":
        tok = tokens[i]
        if i + 1 < n and tokens[i + 1] == "=":
            key = _strip_quotes(tok)
            i += 2
            if i < n and tokens[i] == "{":
                value, i = parse_block(tokens, i + 1)
                if i < n and tokens[i] == "}":
                    i += 1
            else:
                value = _strip_quotes(tokens[i]) if i < n else ""
                i += 1
            entries.append((key, value))
        else:
            entries.append((None, _strip_quotes(tok)))
            i += 1
    if entries and all(k is None for k, _ in entries):
        return [v for _, v in entries], i
    return entries, i


def parse_text(text: str) -> Entries:
    tokens = tokenize(text)
    entries, _ = parse_block(tokens, 0)
    return entries if isinstance(entries, list) else []


def parse_file(path: Path) -> Entries:
    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        # EU4 and Extended Timeline text assets are not consistently UTF-8;
        # many historical names are Windows-1252 encoded. Do not use
        # errors="replace" here, because that permanently turns names like
        # Yúsuf into Y�suf in generated JSON.
        text = path.read_text(encoding="cp1252")
    return parse_text(text)


def get(entries: Entries, key: str, default: Any = None) -> Any:
    for k, v in entries:
        if k == key:
            return v
    return default


def get_all(entries: Entries, key: str) -> list[Any]:
    return [v for k, v in entries if k == key]


def is_date_key(key: str) -> bool:
    return bool(DATE_RE.match(key))

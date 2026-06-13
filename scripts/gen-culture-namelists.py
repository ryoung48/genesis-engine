"""
Generate fictional namelists for each culture using opencode agents.
One agent per list type per culture — 7 parallel agents per culture.

Usage:
    python3 scripts/gen-culture-namelists.py [--source eu4|eu5] [--workers N] [--model MODEL]

Options:
    --source    eu4 (307 cultures) or eu5 (1937 cultures). Default: eu4
    --workers   parallel agents across all tasks. Default: 16
    --model     opencode model string. Default: opencode-go/deepseek-v4-flash

Output:
    scripts/namelists/<culture>/<list>.json   one file per list per culture
    src/model/society/culture-data/earth-namelists.ts   combined output
"""

import argparse, json, re, subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from tqdm import tqdm

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
parser = argparse.ArgumentParser()
parser.add_argument('--source', choices=['eu4', 'eu5'], default='eu4')
parser.add_argument('--workers', type=int, default=16)
parser.add_argument('--model', default='opencode-go/deepseek-v4-flash')
args = parser.parse_args()

ROOT = Path(__file__).parent.parent
CACHE_DIR = Path(__file__).parent / 'namelists'
CACHE_DIR.mkdir(exist_ok=True)

src_file = ROOT / 'src/model/society/culture-data' / (
    'earth-cultures.ts' if args.source == 'eu4' else 'earth-cultures-eu5.ts'
)
OUT_FILE = ROOT / 'src/model/society/culture-data/earth-namelists.ts'

# ---------------------------------------------------------------------------
# Read cultures
# ---------------------------------------------------------------------------
text = src_file.read_text(encoding='utf-8')
culture_names = json.loads(re.search(r'EARTH_CULTURE_NAMES.*?= (\[.*?\])', text, re.DOTALL).group(1))
heritage_names = json.loads(re.search(r'EARTH_HERITAGE_NAMES.*?= (\[.*?\])', text, re.DOTALL).group(1))
heritage_idx = [int(x) for x in re.search(r'EARTH_CULTURE_HERITAGE = new Uint8Array\(\[(.*?)\]\)', text, re.DOTALL).group(1).split(',') if x.strip()]
cultures = [(c, heritage_names[heritage_idx[i]]) for i, c in enumerate(culture_names)]
print(f'Loaded {len(cultures)} cultures from {src_file.name}')

# ---------------------------------------------------------------------------
# Per-list prompts — each agent gets a focused task with specific guidance
# ---------------------------------------------------------------------------
LIST_PROMPTS = {
    'culture': (
        'ethnonym / demonym names for a people or ethnic group '
        '(e.g. "the Vrethkai", "the Somulai"). '
        'These should feel like collective nouns for a people. '
        'Use varied endings: some end in vowels, some in nasals, some in stops.'
    ),
    'nation': (
        'polity / nation names (kingdoms, republics, empires, confederacies). '
        'Should sound like place-names elevated to state names. '
        'Use compound-word structures and varied endings. '
        'Different rhythm from the culture list — longer, more stately.'
    ),
    'geography': (
        'natural geography names: mountains, rivers, seas, valleys, capes, straits, forests. '
        'Should evoke landforms without using any real geographic words. '
        'Use diverse endings — avoid repeating the same suffix across names. '
        'Different names should feel like different landform types.'
    ),
    'settlement': (
        'settlement names: cities, towns, villages, harbours, forts. '
        'Should feel like place names, distinct from geography names. '
        'Mix of short punchy names and longer compound names. '
        'Varied endings — not all the same suffix.'
    ),
    'male_first': (
        'male given names. '
        'Short to medium length (1–3 syllables mostly). '
        'Should feel personal and varied — mix of soft and hard sounds. '
        'Do not make them sound like place names or titles.'
    ),
    'female_first': (
        'female given names. '
        'Distinct in feel from the male names — different typical endings and rhythm. '
        'Short to medium length. Personal, not place-like.'
    ),
    'surname': (
        'family names / clan names / patronymics. '
        'Distinct structure from first names — often longer or compound. '
        'Should not use any real surname conventions (no von, mac, al-, bin-, etc.). '
        'Varied endings, different from the first name lists.'
    ),
}

PROMPT_TEMPLATE = '''\
You are generating a fictional namelist for a fantasy world-building game.

Culture: "{culture}" — inspired by the phonetics and aesthetics of the real-world "{heritage}" tradition.
List type: {list_type}
What to generate: {list_desc}

STRICT RULES:
1. Every name must be COMPLETELY INVENTED — not a real name, word, root, prefix, or suffix from any real language.
2. Do NOT use any recognisable element from real cultures — no "von", "mac", "al-", "-berg", "-burg", "-dun", "-loch", "-heim", "-wald", or equivalents in any language.
3. Do NOT use any name that exists or closely resembles a real name.
4. Every name in this list must be unique — no repeated roots or suffixes across more than 2 names.
5. Output EXACTLY 50 names — count carefully.
6. Output ONLY a raw JSON array, nothing else — no markdown, no explanation, no wrapping object.

["name1","name2","name3",...,"name50"]'''

# ---------------------------------------------------------------------------
# Run one list agent
# ---------------------------------------------------------------------------
def run_list(culture: str, heritage: str, list_key: str) -> list[str] | None:
    cache_file = CACHE_DIR / culture / f'{list_key}.json'
    cache_file.parent.mkdir(exist_ok=True)

    if cache_file.exists():
        try:
            data = json.loads(cache_file.read_text())
            if isinstance(data, list) and len(data) == 50:
                return data
        except Exception:
            pass

    prompt = PROMPT_TEMPLATE.format(
        culture=culture,
        heritage=heritage,
        list_type=list_key,
        list_desc=LIST_PROMPTS[list_key],
    )

    try:
        result = subprocess.run(
            ['opencode', 'run', '--model', args.model, prompt],
            capture_output=True, text=True, timeout=120,
        )
        output = result.stdout
    except subprocess.TimeoutExpired:
        return None
    except Exception:
        return None

    # Extract JSON array from output
    arr_match = re.search(r'(\[[\s\S]*?\])', output)
    if not arr_match:
        return None

    raw = re.sub(r'```(?:json)?\s*', '', arr_match.group(1)).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, list) or len(data) < 10:
        return None

    # Trim or pad to exactly 50
    data = (data * 2)[:50]

    cache_file.write_text(json.dumps(data, ensure_ascii=False))
    return data

# ---------------------------------------------------------------------------
# Build task list — one task per (culture, list_key)
# ---------------------------------------------------------------------------
LIST_KEYS = list(LIST_PROMPTS.keys())

tasks = []
for culture, heritage in cultures:
    for key in LIST_KEYS:
        cache_file = CACHE_DIR / culture / f'{key}.json'
        if cache_file.exists():
            try:
                data = json.loads(cache_file.read_text())
                if isinstance(data, list) and len(data) == 50:
                    continue
            except Exception:
                pass
        tasks.append((culture, heritage, key))

total_needed = len(cultures) * len(LIST_KEYS)
cached_count = total_needed - len(tasks)
print(f'{cached_count}/{total_needed} list files already cached, {len(tasks)} to generate')

# ---------------------------------------------------------------------------
# Run in parallel
# ---------------------------------------------------------------------------
failed = []
culture_done: dict[str, int] = {}  # culture -> completed list count

if tasks:
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(run_list, c, h, k): (c, k) for c, h, k in tasks}
        bar = tqdm(
            as_completed(futures),
            total=len(tasks),
            unit='list',
            bar_format='{l_bar}{bar}| {n_fmt}/{total_fmt} [{elapsed}<{remaining}, {rate_fmt}]',
            dynamic_ncols=True,
        )
        for future in bar:
            c, k = futures[future]
            result = future.result()
            if result:
                culture_done[c] = culture_done.get(c, 0) + 1
                bar.set_postfix_str(f'{c}/{k} ✓  cultures done: {sum(1 for v in culture_done.values() if v == len(LIST_KEYS))}', refresh=False)
            else:
                failed.append((c, k))
                bar.set_postfix_str(f'{c}/{k} ✗  fail: {len(failed)}', refresh=False)

    if failed:
        print(f'\n{len(failed)} failed — re-run to retry: {failed[:5]}...')

# ---------------------------------------------------------------------------
# Assemble and write TypeScript
# ---------------------------------------------------------------------------
print(f'\nAssembling {OUT_FILE}...')

ordered = []
for culture, heritage in cultures:
    lists = {}
    for key in LIST_KEYS:
        cache_file = CACHE_DIR / culture / f'{key}.json'
        try:
            data = json.loads(cache_file.read_text())
            if isinstance(data, list) and len(data) == 50:
                lists[key] = data
        except Exception:
            pass
    if len(lists) == len(LIST_KEYS):
        ordered.append({'culture': culture, 'heritage': heritage, 'lists': lists})

lines = [
    '// Auto-generated by scripts/gen-culture-namelists.py — do not edit manually.',
    '',
    'export type NamelistKey = ' + ' | '.join(f'"{k}"' for k in LIST_KEYS),
    '',
    'export interface CultureNamelist {',
    '  culture: string',
    '  heritage: string',
    '  lists: Record<NamelistKey, readonly string[]>',
    '}',
    '',
    f'export const EARTH_NAMELISTS: readonly CultureNamelist[] = {json.dumps(ordered, ensure_ascii=False, indent=2)}',
]

OUT_FILE.write_text('\n'.join(lines), encoding='utf-8')
print(f'Done. {len(ordered)}/{len(cultures)} cultures fully written.')

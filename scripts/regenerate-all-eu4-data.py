"""Canonical entry point for regenerating every EU4-derived asset in one
pass: reference data (nations/cultures/religions), history events
(provinces/nations/wars/diplomacy), the province raster + seeds used to map
EU4 provinces onto the procedural mesh, the vector province-border asset,
and total/urban population (including the population province-swap
postprocessing step). Run this instead of calling the individual scripts by
hand so nothing gets forgotten or run out of order.

    python scripts/regenerate-all-eu4-data.py

Remember to re-run "Load Earth" in the app afterward -- the province raster
and reference data are baked into world generation, not fetched live for an
already-generated world.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent

STEPS: list[tuple[str, str]] = [
    ("Reference data (nations/cultures/religions)", "build-eu4-reference-data.py"),
    ("History events (provinces/nations/wars/diplomacy)", "build-eu4-history-events.py"),
    ("Province raster + seeds (procedural mesh mapping)", "build-eu4-provinces.py"),
    ("Province border vectors", "build-eu4-province-borders.py"),
    ("Population (total + urban, with province swaps)", "regenerate-earth-population.py"),
]


def main() -> None:
    for label, script_name in STEPS:
        print(f"\n=== {label} ({script_name}) ===")
        result = subprocess.run([sys.executable, str(SCRIPTS_DIR / script_name)])
        if result.returncode != 0:
            print(f"\nFailed at: {label} ({script_name})", file=sys.stderr)
            sys.exit(result.returncode)

    print("\nAll EU4 data regenerated. Re-run \"Load Earth\" in the app to pick up the changes.")


if __name__ == "__main__":
    main()

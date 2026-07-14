"""Manual entry point for eu4_population_swaps.py's postprocessing swap --
normally you don't need to run this directly, use
scripts/regenerate-earth-population.py instead, which always runs it exactly
once against freshly (re)generated data. Only reach for this script if you
need to re-apply the swap list to already-generated files for some reason
(and are sure it hasn't already been applied)."""

from __future__ import annotations

import argparse
from pathlib import Path

from eu4_population_swaps import apply_population_swaps

DEFAULT_OUTPUT_DIR = Path("public/heightmap")
DEFAULT_TOTAL_PREFIX = "earth-real-population-eu4"
DEFAULT_URBAN_PREFIX = "earth-real-urban-population-eu4"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Apply eu4_population_swaps.POPULATION_PROVINCE_SWAPS to "
        "already-generated total/urban population assets."
    )
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--total-prefix", default=DEFAULT_TOTAL_PREFIX)
    parser.add_argument("--urban-prefix", default=DEFAULT_URBAN_PREFIX)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    apply_population_swaps(args.output_dir, args.total_prefix, args.urban_prefix)
    print("Applied population province swaps")


if __name__ == "__main__":
    main()

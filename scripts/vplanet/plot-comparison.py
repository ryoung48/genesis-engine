import csv
import argparse
import gzip
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--example", choices=["EarthClimate", "IceBelts"], default="EarthClimate")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = root / "logs/vplanet"
    slug = "earth-climate"
    if args.example == "IceBelts":
        output /= "ice-belts"
        slug = "ice-belts"
    with (output / "comparison.csv").open() as file:
        rows = list(csv.DictReader(file))
    lats = sorted({float(row["latitude"]) for row in rows})
    days = sorted({float(row["forcingDay"]) for row in rows})
    fig, axes = plt.subplots(3, 3, figsize=(15, 10), constrained_layout=True)
    fields = [
        ("InsolationWm2", "Insolation (W/m²)", 1),
        ("TemperatureC", "Surface temperature (°C)", 1),
        ("IceBalanceKgM2S", "Ice mass balance (kg/m²/day)", 86400),
    ]
    for index, (field, label, scale) in enumerate(fields):
        actual = np.array([float(row[f"ebm{field}"]) * scale for row in rows]).reshape(len(lats), len(days))
        reference = np.array([float(row[f"vplanet{field}"]) * scale for row in rows]).reshape(len(lats), len(days))
        low, high = min(actual.min(), reference.min()), max(actual.max(), reference.max())
        difference = actual - reference
        limit = max(abs(difference.min()), abs(difference.max()), 1e-12)
        for column, data in enumerate([reference, actual, difference]):
            ax = axes[index, column]
            plot = ax.pcolormesh(days, lats, data, shading="nearest",
                                 cmap="coolwarm" if column == 2 else "viridis",
                                 vmin=-limit if column == 2 else low,
                                 vmax=limit if column == 2 else high)
            ax.set(xlabel="Days since northern winter solstice", ylabel="Latitude (°)")
            ax.set_title(["VPLanet", "Raw EBM", "EBM − VPLanet"][column] + " · " + label)
            fig.colorbar(plot, ax=ax, shrink=0.85)
    fig.suptitle(f"{args.example}: matched physical inputs, {len(lats)} equal-area latitudes, {len(days)} seasonal steps\n"
                 "Insolation sampled at step start; temperature at step end; ice balance includes potential melt", fontsize=13)
    fig.savefig(output / "comparison.png", dpi=160)
    plt.close(fig)
    with gzip.open(root / f"src/test/earth/fixtures/vplanet-{slug}.json.gz", "rt") as file:
        native = json.load(file)
    fig, axes = plt.subplots(1, 3, figsize=(15, 4.2), constrained_layout=True)
    for index, key in enumerate(["insolation", "temperature", "iceMassBalance"]):
        values = np.array(native[key]).T * fields[index][2]
        time = np.arange(values.shape[1]) * len(native["insolation"]) / values.shape[1]
        plot = axes[index].pcolormesh(time, lats, values, shading="nearest", cmap="viridis")
        axes[index].set(title=fields[index][1], xlabel="Days since northern winter solstice", ylabel="Latitude (°)")
        fig.colorbar(plot, ax=axes[index], shrink=0.85)
    fig.suptitle(f"VPLanet {args.example} · local native run, time-zero seasonal climate\n"
                 "Temperature and ice balance from the final year of the four-orbit block", fontsize=12)
    fig.savefig(output / "vplanet-seasonal.png", dpi=160)
    plt.close(fig)
    print(output / "comparison.png")
    print(output / "vplanet-seasonal.png")


if __name__ == "__main__":
    main()

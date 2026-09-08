import argparse
import gzip
import hashlib
import json
import math
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile

REVISION = "dd55da7e1ff063f0ea7048f91c9d2d97d6ba9a5d"
REPOSITORY = "https://github.com/VirtualPlanetaryLaboratory/vplanet.git"
ROOT = Path(__file__).resolve().parents[2]


def run(command):
    return subprocess.check_output(command, text=True).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--example", choices=["EarthClimate", "IceBelts"], default="EarthClimate")
    parser.add_argument("--source", type=Path)
    parser.add_argument("--executable", type=Path)
    args = parser.parse_args()
    source = args.source
    if source is None:
        source = Path(tempfile.mkdtemp(prefix="chaos-vplanet-"))
        run(["git", "clone", "--no-checkout", REPOSITORY, str(source)])
        run(["git", "-C", str(source), "checkout", REVISION])
    source = source.resolve()
    if run(["git", "-C", str(source), "rev-parse", "HEAD"]) != REVISION:
        raise RuntimeError(f"Reference source must be at {REVISION}")
    if run(["git", "-C", str(source), "status", "--porcelain", "--", "src", f"examples/{args.example}"]):
        raise RuntimeError("Reference source/input files must be unmodified")
    executable = args.executable
    windows = os.name == "nt"
    if executable is None:
        executable = source / "bin/vplanet"
        if windows:
            linux_source = run(["wsl", "-e", "wslpath", "-a", str(source)])
            run(["wsl", "--cd", linux_source, "-e", "make", "opt"])
        else:
            run(["make", "-C", str(source), "opt"])
    executable = executable.resolve()
    destination = ROOT / "logs/vplanet/reference"
    destination.mkdir(parents=True, exist_ok=True)
    # Fresh directory prevents outputs from an earlier failed run being mistaken for new results.
    work = Path(tempfile.mkdtemp(prefix=args.example.lower()+"-", dir=destination))
    for path in (source / "examples" / args.example).glob("*.in"):
        shutil.copy2(path, work / path.name)
    vpl = work / "vpl.in"
    text = re.sub(r"(?m)^(iDigits\s+)\d+", r"\g<1>12", vpl.read_text())
    if args.example == "EarthClimate":
        text = re.sub(r"(?m)^(dStopTime\s+)\S+", r"\g<1>1", text)
        text = re.sub(r"(?m)^(dOutputTime\s+)\S+", r"\g<1>1", text)
    vpl.write_text(text)
    ice_belts = args.example == "IceBelts"
    system, body = ("icebelt", "earth") if ice_belts else ("solarsys", "Earth")
    latitudes, samples, days = (151, 80, 376) if ice_belts else (150, 60, 365)
    if windows:
        linux_work = run(["wsl", "-e", "wslpath", "-a", str(work)])
        linux_executable = run(["wsl", "-e", "wslpath", "-a", str(executable)])
        command = ["wsl", "--cd", linux_work, "-e", linux_executable, "vpl.in"]
    else:
        command = [str(executable), "vpl.in"]
    with (work / "run.log").open("w") as log:
        subprocess.run(command, cwd=work, stdout=log, stderr=subprocess.STDOUT, check=True)
    fields = {}
    for field in ["DailyInsol", "SeasonalTemp", "SeasonalIceBalance"]:
        path = work / f"SeasonalClimateFiles/{system}.{body}.{field}.0"
        fields[field] = [[float(value) for value in line.split()] for line in path.read_text().splitlines() if line.strip()]
    for field, rows in fields.items():
        expected_rows = {"DailyInsol": days, "SeasonalTemp": 4 * samples, "SeasonalIceBalance": samples}[field]
        if len(rows) != expected_rows or any(len(row) != latitudes for row in rows):
            raise RuntimeError(f"Unexpected {field} dimensions")
        if any(not math.isfinite(value) for row in rows for value in row):
            raise RuntimeError(f"Non-finite {field} reference")
    fixture = {
        "revision": REVISION,
        "example": args.example,
        "repository": REPOSITORY,
        "epoch": "Northern winter solstice; temperature is end-of-step, insolation is start-of-step",
        "units": {"insolation": "W/m2", "temperature": "degC", "iceMassBalance": "kg/m2/s"},
        "inputSha256": {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(work.glob("*.in"))},
        "inputs": {p.name: p.read_text() for p in sorted(work.glob("*.in"))},
        "latitudeDegrees": [math.degrees(math.asin(-1 + (2 * i + 1) / latitudes)) for i in range(latitudes)],
        "forcingDay": [math.floor(i * days / samples) for i in range(samples)],
        "insolation": fields["DailyInsol"],
        "temperature": fields["SeasonalTemp"][-samples:],
        "iceMassBalance": fields["SeasonalIceBalance"],
    }
    slug = "ice-belts" if ice_belts else "earth-climate"
    target = ROOT / f"src/test/earth/fixtures/vplanet-{slug}.json.gz"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(gzip.compress(json.dumps(fixture, separators=(",", ":")).encode(), mtime=0))
    print(f"Wrote {target}; native outputs and log: {work}")


if __name__ == "__main__":
    main()

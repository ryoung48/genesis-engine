# VPLanet / raw EBM seasonal comparison

Both EarthClimate and IceBelts are covered by `pnpm test:ebm:vplanet`.
For IceBelts, run the actual local executable and draw its three seasonal fields:

```sh
python scripts/vplanet/generate-reference.py --example IceBelts
pnpm test:ebm:vplanet
python scripts/vplanet/plot-comparison.py --example IceBelts
```

The same `--source` and `--executable` options below can reuse a local build.
IceBelts runs the full upstream 1,000-year evolution and 100-year output interval;
only output precision changes to 12 digits. The seasonal comparison uses its
time-zero output, matching `seasonal_maps(0)` in the upstream plotting script.
For a consistent comparison of temperature and ice balance, both use the last
year of the four-orbit seasonal block; upstream displays the first temperature
year and the final ice-balance year. The EBM does not reproduce the example's
long-term ice flow or bedrock evolution.

`CONFIG.iceBelts` shares EarthClimate's surface physics with 55° obliquity,
zero eccentricity, 1.02 AU, 151 equal-area latitudes, and 80 seasonal steps.
The orbital period is 376.2686314 terrestrial days; native daily forcing contains
376 samples. The regression checks RMS errors below 0.001°C and 1e-8 kg/m²/s.
Results and plots are in `logs/vplanet/ice-belts/`. `vplanet-seasonal.png` contains
the three native plots; `comparison.png` shows VPLanet, raw EBM, and differences.
The plotting command also produces native plots for EarthClimate when run without
`--example`. All comparisons use physical inputs without fitting output offsets.

Run the regression with the checked-in native fixture (no VPLanet installation needed):

```sh
pnpm test:ebm:vplanet
```

This writes `logs/vplanet/comparison.json` (area-weighted RMS error, signed bias,
maximum absolute error, and 12 seasonal bins) and `logs/vplanet/comparison.csv`
(all 9,000 latitude/time pairs, including both models' raw values).
Temperature thresholds are 0.05°C RMS and 0.3°C maximum; insolation RMS must
be below 0.001 W/m² and ice-balance RMS below 1.5e-6 kg/m²/s. These thresholds
cover the original reference's finite spin-up tolerance and threshold-sensitive
ice transitions; they are not an observational validation against real Earth.

Optional plot (requires Python, NumPy, and Matplotlib):

```sh
python scripts/vplanet/plot-comparison.py
```

To regenerate the actual VPLanet fixture:

```sh
python scripts/vplanet/generate-reference.py
```

Requires Git, GCC, and Make; Windows uses an installed WSL Linux distribution
with GCC and Make. It clones and builds pinned revision
`dd55da7e1ff063f0ea7048f91c9d2d97d6ba9a5d`. To reuse that exact clean checkout
and its compiled executable:

```sh
python scripts/vplanet/generate-reference.py --source /path/to/vplanet --executable /path/to/vplanet/bin/vplanet
```

An explicitly supplied executable must have been built from that checkout.
Input hashes, the complete inputs, units, epoch, grid, and source revision are
embedded in `src/test/earth/fixtures/vplanet-earth-climate.json.gz`. The generator
runs in a fresh directory under `logs/vplanet/reference` and retains native
output files and logs for inspection. Missing or malformed output fails generation.

The fixture uses the upstream EarthClimate inputs, shortening only the orbital
evolution from 1 Myr to 1 year, changing its output interval to 1 year, and
increasing output precision from 6 to 12 digits. It selects the **time-zero**
seasonal files after native spin-up, before long-term orbital or ice-sheet
evolution. The last of four stored temperature years is paired with the final
year's seasonal ice balance. Daily insolation has 365 samples; forcing for the
60 thermal steps uses `floor(step * 365 / 60)`.

Use `new EnergyBalanceModel(CONFIG.earthClimate)` for the matched physical
configuration, then `runModel({ years: 200, dtDays: 365 / 60 })`. This executes
the same raw EBM solver used by world generation, with explicit EarthClimate
radiation, surface, grid, and orbital inputs. The general greenhouse configuration
remains available for other atmospheres; existing world-generation calls do not
automatically select the EarthClimate preset. The timestep, grid-boundary,
precision, repeated-run, and convergence fixes apply to those calls too.

The configuration follows the executable's 34% land default, not the README's
25% description. Surface temperature is the land/water area-weighted mean in °C.
Insolation is W/m². Ice balance is land-surface kg/m²/s, with positive deposition
and negative **potential** ablation even on bare ground. It is evaluated before
latent heating/cooling; the temperature output is after that adjustment, as in
POISE. The ice module follows POISE's post-update mass-availability convention
for latent heat, including its behavior when the remaining ice is exhausted.
It resets seasonal ice to zero every four years to match the initial, ice-free
EarthClimate spin-up blocks. It does not simulate ice flow, bedrock, ocean-mass
depletion, evolving Milankovitch cycles, or the optional dynamic sea-ice model.

The EBM stops at complete annual/cycle boundaries when the maximum land/ocean
temperature change is below 0.001 K. `converged` and `yearsRun` expose the result.
`dtDays` is a maximum integration step in 1/365-orbit days, scaled to the physical
orbital period; output intervals are evenly subdivided so fractional steps do
not shorten a year. Temperature arrays contain end-of-interval values.

Sources: [EarthClimate inputs](https://github.com/VirtualPlanetaryLaboratory/vplanet/tree/dd55da7e1ff063f0ea7048f91c9d2d97d6ba9a5d/examples/EarthClimate),
[POISE implementation](https://github.com/VirtualPlanetaryLaboratory/vplanet/blob/dd55da7e1ff063f0ea7048f91c9d2d97d6ba9a5d/src/poise.c),
[installation guide](https://virtualplanetarylaboratory.github.io/vplanet/install.html).
The upstream MIT license is included in `LICENSE.vplanet`.

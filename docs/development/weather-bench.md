# Weather bench

Open `/weather/bench` on the local Vite development/preview server. Navigation links the existing `/history/bench` and world view. Static-only hosting does not provide local filesystem reports.

## Reports and API

The read-only `/api/bench/weather/runs` endpoint lists completed `stats/weather/<UTC timestamp>-province-local-weather/results.json` reports, newest first. `/api/bench/weather/runs/<encoded folder ID>` supplies normalized detail. The middleware supports GET/HEAD, confines real paths to `stats/weather`, and skips malformed/incomplete runs. It neither starts simulations nor modifies saved reports.

The default is the latest report and nearest older compatible baseline. Compatibility requires the same recorded configuration and ordered sites; model versions are shown separately so intentional behavior changes can be compared. Refresh follows a newly completed latest run when the latest was selected. Requests cancel on selection changes. Missing measurements display a dash; rare percentages retain precision. Shared bench navigation, formatting, requests, charts, tables and design tokens are reused.

## Main tables

Headline tiles include blizzard share over snow-season sites (any monthly mean <0°C) and sand/dust share over arid bare sites (bare ground, aridity <0.3), so rare phenomena are not diluted by sites that can never produce them.

The `original-tree-constrained-v6` generator uses one primary phenomenon and one regime per sample. Each group's occupancy totals 100%. The main tables include:

- Regime frequencies, runs, and dry versus precipitating samples.
- All 36 primary phenomena, including clear skies/cloudy and explicit zeros.
- The full phenomenon × eight cloud/sky category matrix. Each populated row totals 100%; zero-occurrence rows have undefined conditional shares, shown as dashes.
- Overall and selected-phenomenon cloud distributions, actual generated pairings rather than a fixed table imposed by the bench.
- Wind-speed bands and absolute temperature vocabulary, plus mean/extreme wind and temperature departures.
- Colder/warmer-than-usual snapshot shares using the retained ±8°F (±40/9°C) local seasonal/time-of-day-normal threshold. These do not impose a minimum spell duration. Temperature differences convert without an absolute-temperature offset.

## Detailed diagnostics

The expandable section provides condition/regime selection, climate/season/local-solar-time breakdowns, sampled run/gap histograms, transition measures, nearest-site Jaccard/conditional overlap and decision consistency checks. The checks validate emitted outcomes and numeric accounting; they are not atmospheric-physics eligibility probabilities. The report JSON retains wet-hour rate and cloud-cover histograms (`shape`), bare-ground site sources and aridity, water totals, sampled-day/site/year counts, area-weighted summaries and detailed numeric cloud data.

These are unweighted stratified-site occupancies, not global climatological rates. Seven-hour sampling misses brief events and quantizes runs; v1 reports used six-hour steps that fixed each site's local hours. Primary-phenomenon frequencies from the new tree differ in meaning from old simultaneous physical-condition reports. Saved reports are preserved, and absent fields remain visibly unrecorded.

See [local weather](../climate/local-weather.md#diagnostic) for the exact workload/baseline and [decision rules](../climate/local-weather-conditions.md) for the original tree, cloud table, numeric constraints and rainfall normalization.

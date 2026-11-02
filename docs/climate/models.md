# Climate models

Choose **Climate v2** or **Climate v1** in the generation panel, then select **Generate**. This applies to procedural planets and Earth heightmap imports. Changing the selector stages the next generation. V2 is the default.

V1 restores the active pipeline from immediately before commit `8977cda2`: the zonal energy-balance temperature model with continentality, simple pressure-gradient winds, heuristic coastal ocean currents and SST anomalies, and advected seasonal rainfall. Monthly winds are derived on demand for the overlay. Terrain, hydrology, classifications, ice, and observed Earth data use the shared current pipeline.

V2 uses the current climatev2 temperature, monthly wind, ocean, rain, cloud and diurnal-range outputs. Planets tidally locked to their star take their temperature and rain from climatev2's locked climate (`CLIMATE_V2.applyLocked`, see [pressure.md](pressure.md#tidally-locked-planets)) and their winds and sea surface from the legacy locked modules; under V1 they keep the legacy locked solvers throughout.

The selected model travels with the world in `params.climateModel`; model APIs that omit it use v2.

For non-locked v2 worlds, the Temperature, Rain, Humidity, Cloud Cover, DTR and MI maps include ocean cells. Temperature shows sea-surface temperature over the ocean; Rain shows ocean precipitation. Humidity uses the existing temperature/daily-range estimate, without land water-balance aridity over oceans; it is not v2's atmospheric column humidity. Cloud Cover uses the existing cached monthly cloud fractions. DTR shows the modeled near-surface air day/night temperature range. MI applies the existing apparent-temperature calculation using modeled temperature, estimated humidity and wind; ocean temperature is SST, so ocean MI is a proxy rather than an independently modeled marine air comfort index. These maps use the existing color scales and annual/monthly selectors. Observed and difference maps retain their existing coverage.

Ocean hover cards expose the corresponding modeled climate readouts and monthly series, including rainfall, cloud cover, humidity, DTR and MI in their respective modes. The temperature chart is labeled SST over oceans. Ocean humidity and MI omit the land water-balance aridity adjustment, matching their map calculations.


Modeled marine humidity uses 80% offshore, retaining the previous temperature/DTR
estimate wherever it is below 80%. For other ocean cells, a smooth coastal
transition blends the nearest coastal land's modeled humidity toward 80% over
300 km. Distance is the shortest mesh path through water, using great-circle
edge lengths. The 300 km width is a display-smoothing choice to spread the
transition across several cells at normal world resolution, not a fitted
atmospheric transport length. Annual and monthly values are calculated
separately. Coastal values may exceed 80% next to humid land. Land humidity,
observed humidity and the climate simulation are unchanged. Humidity maps,
modeled ocean MI and their hover values share the same corrected fields.

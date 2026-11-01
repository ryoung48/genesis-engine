# Climate models

Choose **Climate v2** or **Climate v1** in the generation panel, then select **Generate**. This applies to procedural planets and Earth heightmap imports. Changing the selector stages the next generation. V2 is the default.

V1 restores the active pipeline from immediately before commit `8977cda2`: the zonal energy-balance temperature model with continentality, simple pressure-gradient winds, heuristic coastal ocean currents and SST anomalies, and advected seasonal rainfall. Monthly winds are derived on demand for the overlay. Terrain, hydrology, classifications, ice, and observed Earth data use the shared current pipeline.

V2 uses the current climatev2 temperature, monthly wind, ocean, rain, cloud and diurnal-range outputs. Planets tidally locked to their star use the shared locked solvers for either selection.

The selected model travels with the world in `params.climateModel`; model APIs that omit it use v2.

For non-locked v2 worlds, the Temperature, Rain, Humidity, Cloud Cover, DTR and MI maps include ocean cells. Temperature shows sea-surface temperature over the ocean; Rain shows ocean precipitation. Humidity uses the existing temperature/daily-range estimate, without land water-balance aridity over oceans; it is not v2's atmospheric column humidity. Cloud Cover uses the existing cached monthly cloud fractions. DTR shows the modeled near-surface air day/night temperature range. MI applies the existing apparent-temperature calculation using modeled temperature, estimated humidity and wind; ocean temperature is SST, so ocean MI is a proxy rather than an independently modeled marine air comfort index. These maps use the existing color scales and annual/monthly selectors. Observed and difference maps retain their existing coverage.

Ocean hover cards expose the corresponding modeled climate readouts and monthly series, including rainfall, cloud cover, humidity, DTR and MI in their respective modes. The temperature chart is labeled SST over oceans. Ocean humidity and MI omit the land water-balance aridity adjustment, matching their map calculations.

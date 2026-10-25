# Climate models

Choose **Climate v2** or **Climate v1** in the generation panel, then select **Generate**. This applies to procedural planets and Earth heightmap imports. Changing the selector stages the next generation. V2 is the default.

V1 restores the active pipeline from immediately before commit `8977cda2`: the zonal energy-balance temperature model with continentality, simple pressure-gradient winds, heuristic coastal ocean currents and SST anomalies, and advected seasonal rainfall. Monthly winds are derived on demand for the overlay. Terrain, hydrology, classifications, ice, and observed Earth data use the shared current pipeline.

V2 uses the current climatev2 temperature, monthly wind, ocean, rain, cloud and diurnal-range outputs. Planets tidally locked to their star use the shared locked solvers for either selection.

The selected model travels with the world in `params.climateModel`; model APIs that omit it use v2.

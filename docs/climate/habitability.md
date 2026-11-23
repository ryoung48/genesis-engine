# Habitability gates

`HABITABILITY.classify` (`src/model/climate/habitability`) decides which land is totally uninhabitable. The province pass reads its two masks and marks a province **desolate** when its seed cell is `uninhabitable`, or is `hyperArid` and the province has no river. It runs once per generated world in the post-elevation pipeline, on every land cell, from the monthly climate the world already has. Earth imports skip it.

Only physical limits count. Climate zones, biomes, latitude and farming measures (growing degree days, minimum summer warmth, productivity) are never read, so the same rule applies to a planet much hotter or colder than Earth. Poor land stays habitable; carrying capacity, farming odds and migration suitability decide how few people live there.

## The gates

| Gate | A cell fails when | Constant |
| --- | --- | --- |
| Heat | The wet-bulb temperature of the monthly mean state reaches the limit in any month | `WET_BULB_LIMIT_C` = 31 °C |
| Liquid water | No month's mean temperature lies between 0 °C and the boiling point at the surface pressure | boiling point from the Antoine equation |
| Hyper-arid | Annual rainfall over annual PET is below the index, and the province has no river | `HYPER_ARID_INDEX` = 0.05 |

Heat and liquid water make a cell `uninhabitable`; hyper-arid is a separate mask because river access is known only to the province pass.

**Heat.** Wet-bulb temperature is solved from `e = es(Tw) − γ·P·(T − Tw)` by bisection on −60 °C to the air temperature, 20 halvings (about 2 × 10⁻⁴ K). `γ` is 0.000665 per kPa of pressure (FAO-56 eq. 8, Allen et al. 1998). The vapour pressure comes from the relative humidity of `HUMIDITY.monthlyRelativeHumidity`, the same model the local weather uses. Wet bulb never exceeds air temperature, so a cell whose hottest month is below 31 °C passes without the solve. The limit is 31 °C because the gate looks at the 24-hour mean, where there is no night recovery: Vecellio et al. (2022) measured a critical wet bulb of about 30–31 °C in warm-humid heat for young healthy adults, and Sherwood & Huber (2010) give 35 °C as the theoretical ceiling for a few hours. In hot dry air the measured critical wet bulb is lower (25–28 °C); that case is carried by the hyper-arid gate.

**Liquid water.** The test uses monthly means, not the afternoon peak: no known population has lived where every monthly mean is below freezing (the warmest month at the northernmost permanent settlements is about 0 to +5 °C), so a large day range does not rescue a frozen cell. Snow counts only through the months in which it melts, and permanent ice counts for nothing; cold needs no separate gate. The boiling point is the Antoine equation `log10(P) = A − B/(T + C)` in bar and kelvin (Stull 1947, via the NIST Chemistry WebBook): A = 4.6543, B = 1435.264, C = −64.848 up to 1.01325 bar, and A = 3.55959, B = 643.748, C = −198.043 above. The pressure is `GenesisParams.pressure` held to 0.1–10 bar (`CLIMATEV2_ORBIT.surfacePressureBar`), which gives about 46 to 176 °C. Freezing is fixed at 0 °C; its pressure shift is under 0.01 K in that range, and the triple-point pressure (0.006 bar) is below the floor.

**Hyper-arid.** The index is annual rainfall over the sum of `pet_monthly`, capped at 1 and taken as 1 when PET is zero (`HUMIDITY.annualAridity`). 0.05 is the UNEP hyper-arid class (Middleton & Thomas 1997). The 0.2 arid boundary is not used: herders and oasis farmers live between 0.05 and 0.2.

## Not modelled

- No altitude correction to pressure, so no mountain hypoxia and no lower boiling point on high ground.
- No atmosphere composition (oxygen), because the model carries only total pressure.
- No salinity or brine freezing-point shift.
- No cold-survival gate: land that never thaws fails the liquid-water gate, and nothing colder than that is tested.
- The seed cell stands for its province, as the old rule did.

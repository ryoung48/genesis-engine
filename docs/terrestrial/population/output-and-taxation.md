# Economic output, taxation and state maintenance

Scope: `:history`.

Population, development and knowledge determine gross output. Realm extraction and administrative costs determine civilian surplus, which supplies the [military budget](../politics/armies-and-wars.md). See [population and development](growth-cities-and-knowledge.md) for those inputs.

Code: `src/model/history/sim/engine/economy`.

## Economic output and treasury income

The current economy calculates each province's **annual gross output** from its total population, development, and local knowledge:

`province output = (rural population + urban population) × output per person at current development × productivity at local knowledge`

The development curve for output per person is interpolated between these points:

| Development | Silver equivalent per person per year | Ducats per person per year |
| ---: | ---: | ---: |
| 0 | 150 g | 0.003 |
| 0.25 | 250 g | 0.005 |
| 0.65 | 450 g | 0.009 |
| 0.95 | 700 g | 0.014 |

The silver figures are calibration inputs; the calculation uses the current fixed conversion of **1 ducat = 50,000 g of silver**. Values outside the development table use its nearest endpoint. Local knowledge then multiplies output per person by 1 at knowledge 2, 1.3 at 3, and 3 at 4, with interpolation; knowledge below 2 uses 1. Population scales output directly: twice as many residents at the same development and knowledge produce twice the output. Rural and urban residents have the same direct output weight. Urbanization raises output when it raises development, rather than through a separate urban-income term. Province area does not enter this formula directly.

The treasury does not collect all gross output. The model sums output across the provinces of a sovereign's internal realm, then applies the extraction rate for the **population-weighted realm knowledge**: 1.5% at knowledge 1, 3% at 2, 10% at 3, and 15% at 4. Every government collects the full extraction rate. The result is the realm's annual tax revenue. State maintenance sums 35% of each province’s revenue with a distance-from-capital multiplier. The remainder is civilian surplus before integrated levy and regular maintenance and other treasury changes.

For example, 100,000 residents at development 0.25 and local knowledge 2 produce `100,000 × 0.005 × 1 = 500` ducats of gross annual output. With realm knowledge 2, it collects `500 × 3% = 15` ducats in taxes; at the capital, state maintenance is 5.25 ducats, leaving 9.75 before army costs. Local knowledge controls that province's productivity, while realm knowledge controls the extraction rate.

## State maintenance

Every government collects provincial output times the realm's knowledge-based extraction rate. Administration costs 35% of each province's collected revenue multiplied by `1 + 0.15 × (travel days / 30)^0.7`. Travel days are great-circle distance from the capital divided by 30 km/day. Civilian surplus is revenue less state maintenance.

Army upkeep, fiscal exhaustion, one-off expenses and cash leakage are described in [army budgets](../politics/armies-and-wars.md#state-maintenance-and-treasury). Coronation prices belong to [government and succession](../politics/government-and-succession.md#coronation).

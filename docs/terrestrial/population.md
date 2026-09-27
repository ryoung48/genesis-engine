# Population, urbanization, knowledge, and development (`:history`)

This document describes the current historical simulation. Population is a headcount split into rural and urban residents. Knowledge is a continuous province value. Development is a local 0–1 style settlement and infrastructure value, not a population count or an EU4 development total. Urbanization is the assignment and gradual movement of residents into ranked towns and cities.

The main implementations are `src/model/society/population/`, `src/model/society/urbanization/`, `src/model/history/sim/engine/knowledge/`, `src/model/history/sim/engine/events/population/`, and `src/model/history/sim/engine/economy/`.

## How a new world starts

World generation first gives each province a habitability score from climate, vegetation, terrain, water access, and a seeded random variation. Physical region area enters the **worldwide population target**: the model weights habitability by region area and scales an era population target by the resulting world habitability score. The late medieval era target is 285 million people before that scaling. Provinces then receive shares of the total according to habitability and distance from migration cradles; an era's settlement frontier can leave otherwise habitable provinces unpopulated. Province area is not a direct multiplier on each province's assigned headcount.

The generated world also calculates an initial urban population and development map from its government types, settlements, and province adjacency. When a procedural history starts, its live population and development are initialized again: each non-desolate province starts at 95% rural and 5% urban of its generated population; the initial urbanization pass replaces the urban figure with its calculated city target, then calculates development. The rural figure is not adjusted in that initial pass, so the history state's starting total need not exactly equal the generated population total.

Starting knowledge follows a year baseline for the default late medieval history: 0.42 in 867, 1 in 1300, 1.44 in 1500, and 2.38 in 1800, with interpolation between those years. Other generated eras use their era baseline when no explicit start year is given. Each province starts at that baseline plus `0.5 × (its initial development − the population-weighted world mean development)`. The first knowledge-driven development floor applies at the following census, after knowledge has been initialized.

## Annual update order

The history engine schedules a census one year after initialization and schedules the next one each time a census runs. Each census performs these steps in order:

1. Advance knowledge from the previous knowledge and development values.
2. Grow rural and urban population by the same local, knowledge-dependent annual rate.
3. Recalculate each realm's city targets and move population between rural and urban pools toward them.
4. Recalculate each province's development target and move its current development partway toward that target.

The growth and knowledge steps multiply their rates by the elapsed fraction of a year. The city adjustment limit also uses that fraction. Development's 10% rise and 5% fall are applied per census. Battle losses can additionally reduce rural population between censuses.

## Population growth

The annual growth rate is interpolated from local knowledge:

| Knowledge | Annual population growth |
| ---: | ---: |
| 0 | 0.08% |
| 1 | 0.10% |
| 2 | 0.25% |
| 2.5 | 0.40% |
| 3 | 0.80% |
| 3.5 | 1.00% |
| 4 | 0.50% |

Values outside the table use the nearest endpoint rate. For a one-year census, each province's rural and urban populations are multiplied by `1 + growthRate(knowledge)`. Growth is calculated before people move between rural and urban pools. The census has no explicit food, land, or carrying-capacity term that reduces this rate as population rises. Military casualties subtract from rural population separately.

## Urbanization and city sizes

Each sovereign realm has a government profile with an urban share `U` and a city-rank exponent `q`. For example, `U` is 1.5% for a chiefdom, 5% for a feudal monarchy, 12% for an absolute monarchy, and 20% for an oligarchic republic. The realm's target urban share is `min(85%, U × urbanFactor(realm knowledge) / urbanFactor(era baseline))`. The urban factor is 0.7 at knowledge 0, 1 at 1, 1.1 at 2, 1.6 at 3, and 4 at 4. Realm knowledge is the population-weighted mean of its provinces' knowledge.

The model distributes the target urban population among ranked cities. Rank one is the sovereign seat; other titled seats follow, then provinces are ordered by habitability. `q` controls how strongly the population concentrates in the highest ranks. Candidate cities below 5,000 people are dropped, and the list cannot exceed the realm's province count. Each city's size is limited by knowledge, total realm population, and rank. The city-size base rises from 350,000 at knowledge 1 to 5 million at knowledge 4; small realms receive a lower cap. Population that exceeds these caps may be redistributed into towns below 25,000 people.

At initialization, provinces jump directly to their city targets. At later censuses, urban population moves by at most 10% of the gap to the target and at most 3% of the greater of its current urban population or 1,000 per year. The realm's rural population is scaled in the opposite direction to account for those migrants. Thus urbanization can rise or fall without treating every urban resident as a new person.

## Knowledge growth and diffusion

Knowledge grows through a province's own development and contact with more knowledgeable neighbors:

`new knowledge = old knowledge + (own advance + strongest neighbor pull) × years elapsed`

Own advance is a knowledge-dependent rate multiplied by current development. It slows or stops if the province is too far ahead of the population-weighted world knowledge level. Neighbor pull uses only neighbors with higher knowledge: 4% of the gap for a neighbor in the same sovereign realm, or 1.5% across a sovereign border. Only the strongest neighbor pull is used, and all provinces read the previous knowledge values before the new values are committed.

Knowledge also affects population growth, the urban share and city-size cap, and the minimum development target. It can therefore raise development indirectly even where no large city appears.

## Development

An urban population of 1,000 / 5,000 / 20,000 / 100,000 / 1 million corresponds to local development of 0.05 / 0.10 / 0.25 / 0.65 / 0.95. Intermediate values are interpolated, and values outside the table use its endpoints. This means even a non-desolate province with fewer than 1,000 urban residents gets the 0.05 local baseline.

Cities spread some development into neighboring provinces. A same-realm hop retains 75% of the incoming value; a hop across a sovereign border retains 65%. A destination marked with river access multiplies that retained value by 1.1. Spreading stops below 0.01 or after 20 hops. Only cities above the era's city threshold seed this spread: 8,000 urban residents in the late medieval era, 12,000 in early modern, and 20,000 in industrial. The province's own urban population contributes even if it is below that threshold.

Knowledge supplies a further floor: 0.05 at knowledge 1, 0.10 at 2, 0.25 at 3, and 0.45 at 4, with interpolation. The development target is the highest of local urban development, city-spread development, and this floor. At each census, current development closes 10% of a positive gap to the target or 5% of a negative gap. The initial calculation sets development directly from cities, before the knowledge floor is applied.

Development is therefore an **intensity** associated with settlement, nearby cities, and knowledge. The current live value is not multiplied by province area. A larger province does not automatically have more development points than a smaller province with the same local value. Any future conversion into area-total units, such as EU4-style province development, is a separate calculation.

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

The treasury does not collect all gross output. The model sums output across the provinces of a sovereign's internal realm, then applies the extraction rate for the **population-weighted realm knowledge**: 1.5% at knowledge 1, 3% at 2, 10% at 3, and 15% at 4. Tribal and steppe governments collect one third of that amount; other governments collect the full amount. The result is the realm's annual tax revenue. The current flat civil expense removes 70% of that revenue, leaving 30% before army costs and other treasury changes.

For example, 100,000 residents at development 0.25 and local knowledge 2 produce `100,000 × 0.005 × 1 = 500` ducats of gross annual output. If this is a paid-army realm with realm knowledge 2, it collects `500 × 3% = 15` ducats in taxes; civil expenses are 10.5 ducats, leaving 4.5 before army costs. Local knowledge controls that province's productivity, while realm knowledge controls the extraction rate.

## Main feedback loop

`knowledge → population growth and urban targets → urban residents and cities → development → knowledge's own advance and economic output`

This loop has delays: knowledge and population update at the census, urban populations move toward targets gradually, and development moves toward its target gradually. Knowledge can spread across borders even when city-driven development spreads more weakly there.

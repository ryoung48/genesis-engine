# Settlement Model: Competitive Attraction

Alternative to the old tree-based settlement hierarchy. Cities rise and fall organically through local competition rather than top-down tree assignment.

## Core Concept

Every province exerts **pull** on its neighbors proportional to its current urban population and wealth. The strongest local puller grows; weaker ones shrink or stagnate. This creates a positive feedback loop bounded by geographic potential (wealth/habitability).

The settlement hierarchy is **emergent** from the attraction landscape, not prescribed by an explicit tree structure.

## Data Structures

```typescript
// Static (computed once at world gen)
wealth: Float32Array         // habitability + noise, same as old model

// Dynamic (mutated each census tick)
urbanPop: Float32Array       // urban population per province
ruralPop: Float32Array       // rural population per province
development: Float32Array    // development score per province (0-1)
owner: Int32Array            // province -> nation (sovereign province idx)
capital: Int32Array          // nation -> capital province idx
```

No parent/children arrays. No tree. The hierarchy is implicit in the pull landscape.

## Pull Calculation

```
pull[p] = urbanPop[p] * wealth[p]
```

Capital status acts as a massive multiplier:

```
effectivePull[p] = pull[p] * (isCapital(p) ? CAPITAL_MULTIPLIER : 1.0)
```

Each province has a **dominant attractor**: the province within K hops (including itself) with the highest effective pull. The set of provinces attracted to the same dominant forms that city's **sphere of influence**.

## Urban Population Dynamics

Each census tick:

1. **Compute pull** for every province
2. **Identify dominants** — each province finds its strongest attractor within K hops
3. **Migration** — urban population flows toward dominants:
   - Dominant provinces gain: `urbanGrowth += growthRate * wealth`
   - Non-dominant provinces leak: `urbanPop -= leakRate * (1 - pull[self] / pull[dominant])`
   - Leak is redistributed to the dominant (people move to the nearest city)
   - Foreign borders increase migration friction (higher leak resistance)
4. **Rural growth** — standard growth rate modulated by development
5. **Development spread** — BFS from high-urban provinces, same as old model

### City Rank (derived, not stored)

```
rank(p) = urbanPop[p] < TOWN_THRESHOLD   ? Village
        : urbanPop[p] < CITY_THRESHOLD   ? Town
        : urbanPop[p] < METRO_THRESHOLD  ? City
        : Metropolis
```

Thresholds calibrated so steady-state distribution approximates MDME rank-size rule.

## Rise and Fall Mechanisms

### Cities Rise When
- **Become capital** — instant pull multiplier, growth accelerates over decades
- **Geographic advantage** — coast + river + crossroads = natural pull even without political status
- **Neighbors decline** — war/sacking weakens competitors, province becomes dominant by default
- **Peace** — steady growth compounds; no war destruction

### Cities Fall When
- **Capital moves elsewhere** — pull multiplier gone, slow decline as neighbors out-compete
- **War/sacking** — urban pop directly destroyed, pull drops, neighbors absorb its role
- **Border cuts off hinterland** — fewer provinces feeding it, stagnation
- **Better-positioned neighbor emerges** — out-competes for migration

### Inertia
A conquered 300-year-old trade city doesn't vanish overnight. Its accumulated urban population still gives it pull. Decline happens over decades as the new political reality redirects migration. A city with strong geographic potential recovers faster if it regains capital status.

## Wealth Extraction (replaces tree tribute)

Instead of 25% tribute compounding through tree depth:

```
extractionRate[p] = 1.0 / (1.0 + graphDistToCapital[p] * DECAY_K)
effectiveWealth[p] = wealth[p] * extractionRate[p]
nationWealth = sum(effectiveWealth[p] for p in nation)
```

Distance-based decay. Provinces far from the capital contribute less. Same economic gravity effect as the old tree, but continuous rather than stepped by tree depth.

## Overextension

The old model used `domainLimit` to penalize nations with too many direct vassals. The equivalent here:

```
diameter = max graph distance between any two provinces in nation
overextensionPenalty = max(1.0, diameter / (BASE_DIAMETER + log(nationSize)))
nationWealth /= overextensionPenalty
```

Large sprawling nations are penalized. Compact nations are efficient. This creates natural pressure for nations to be roughly circular around their capital.

## Rebellions

### Trigger
Succession crisis, prolonged war, overextension, or random unrest event.

### Rebel Selection
Any province with `rank >= City` and `province !== capital` can rebel:

```
rebellionStrength = urbanPop[p] / urbanPop[capital]
distance = graphDist(p, capital)
chance = rebellionStrength * distanceFactor(distance) * unrestModifier

if roll < chance:
  p declares independence
```

Distant, powerful cities rebel more often. Weak towns near the capital almost never do.

### Territory Partition (Voronoi by Pull)
When a city rebels, every province in the nation picks a side:

```
For each province q in nation:
  capitalPull = effectivePull[capital] / dist(q, capital)
  rebelPull   = effectivePull[rebel]  / dist(q, rebel)

  if rebelPull > capitalPull:
    owner[q] = rebel
```

This produces coherent geographic chunks sized proportionally to rebel strength. A major port city takes the whole coastline. A minor inland town takes a few neighbors.

Multiple simultaneous rebellions each carve their own sphere — three-way or four-way splits happen naturally when multiple cities are strong enough.

### Rebellion Pressure (Implicit)
A province's rebellion pressure is high when its nearest strong attractor is NOT its own capital. The fracture lines already exist in the attraction landscape before any rebellion event fires. Rebellions just formalize them.

```
fractureTension[p] = pull[nearestForeignOrRebelCity] / pull[ownCapital]
```

This can be visualized as a heatmap — high tension provinces are where the next rebellion will break.

## Comparison to Old Tree Model

| Concern | Old (tree hierarchy) | New (competitive attraction) |
|---|---|---|
| Urban distribution | MDME top-down assignment through tree | Emergent from competitive pull dynamics |
| City rank | Implicit from tree depth + urban pop | Derived from urban pop (same output) |
| Development spread | BFS from urban centers | BFS from urban centers (unchanged) |
| Wealth extraction | 25% tribute per tree level | Distance-decay from capital |
| Rebellion boundaries | Subtree detachment (k-means artifact) | Voronoi weighted by urban pop / distance |
| Rebellion leader | Subtree root (arbitrary from rebalance) | The rebel city itself (strongest attractor) |
| Border change cost | Full tree teardown + rebuild | Just flip owner[p], no restructuring |
| City inertia | None (tree rebuild resets everything) | Natural (urban pop persists, decays gradually) |
| Domain limits | Explicit cap on direct children | Overextension penalty from nation diameter |
| Storage | Objects with Set<number>, timeline arrays | Flat typed arrays, worker-transferable |

## Open Questions

- **Capital multiplier tuning**: how large should CAPITAL_MULTIPLIER be to produce realistic rank-size distributions?
- **Pull radius K**: how many hops should attraction extend? Too few = no hierarchy emerges. Too many = one city dominates everything.
- **Migration rate**: how fast should urban pop flow toward dominants? Faster = more responsive to political change. Slower = more inertia.
- **Multiple capitals**: some nations historically had seasonal or dual capitals. Could support via multiple capital multiplier targets.
- **Trade routes**: provinces adjacent to foreign high-urban provinces could get a trade pull bonus, creating border cities.

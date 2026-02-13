# World Generation

The world generation system creates the physical foundation upon which all other simulation systems operate. A well-designed world provides natural chokepoints, resource distributions, and geographic barriers that shape the flow of history.

## Geographic Foundation

The world is built on an S2 geometry grid of approximately 16,000 hexagonal cells. This choice reflects a balance between simulation fidelity and computational performance.

### Why Hexagonal Cells?

Hexagonal grids offer several advantages over square grids for geographic simulation:

1. **Uniform adjacency**: Every cell has exactly 6 neighbors at equal distances, eliminating the diagonal-distance problem of square grids
2. **Natural flow**: Movement and spread algorithms behave more organically
3. **Efficient packing**: Hexagons tile a sphere more naturally than squares

### Why S2 Geometry?

S2 is Google's hierarchical spherical geometry library. It provides:

- Consistent cell sizes across the globe (no polar distortion)
- Efficient spatial indexing for neighbor queries
- Hierarchical subdivision for multi-resolution support

### Voronoi Partitioning

Regions are carved out using Voronoi diagrams seeded from mountain-placement centers. This creates organic, natural-looking boundaries that follow the "watershed" principle—borders tend to fall along ridgelines and natural divides rather than cutting arbitrarily through terrain.

**Design justification**: Real-world political and cultural boundaries historically formed along geographic features. The Voronoi approach approximates this without expensive terrain analysis.

## Elevation & Terrain

Elevation determines not just visual appearance but habitability, travel difficulty, and strategic value.

### Elevation Computation

Height is computed from two factors:

```
elevation = f(ocean_distance, mountain_distance)
```

This creates realistic coastal plains that rise into interior highlands, with mountain ranges forming natural barriers.

**Thresholds:**
| Level | Value | Description |
|-------|-------|-------------|
| Sea level | 0.1 | Ocean/land boundary |
| Mountain | 0.5 | Impassable terrain begins |
| Maximum | 0.95 | Highest peaks |

### Topography Classification

Each cell receives a topography type that affects gameplay:

| Type | Criteria | Significance |
|------|----------|--------------|
| Mountains | >0.5 elevation | Impassable barriers, define borders |
| Plateau | Highland interior | Defensible, isolated regions |
| Hills | 0.2-0.5 elevation | Moderate defensive bonus |
| Marsh | Coastal lowlands (~50%) | Movement penalty, disease risk |
| Coastal | Adjacent to water | Trade bonus, naval access |
| Flat | Default lowlands | Highest productivity, easy conquest |

**Design justification**: Topography creates strategic differentiation. Flat provinces are wealthy but vulnerable; mountain passes become critical chokepoints; coastal regions enable trade but face naval threats.

## Climate System

Climate determines habitability and agricultural potential. The system uses simplified physical simulation rather than pure randomness.

### Temperature Model

Temperature is latitude-driven with seasonal variation:

- **Insolation**: Solar energy varies by latitude and season
- **Humidity modification**: Wet regions have more moderate temperatures
- **Per-cell calculation**: Min/max/mean temperatures stored for each cell

### Rainfall & Monsoons

Moisture comes from oceans and is carried by prevailing winds:

**Wind Patterns:**
| Latitude Range | Pattern | Effect |
|----------------|---------|--------|
| -25° to +25° | Trade winds | Monsoon-driven wet/dry seasons |
| >25° | Westerlies | Western coasts wetter |
| >20° | Eastern storms | Subtropical moisture |

**Moisture Decay**: -0.8 per cell over land. This creates:
- Lush coastal regions
- Interior deserts (rain shadow effect)
- River valley civilizations (historically accurate)

### Climate Zones

| Zone | Temperature | Historical Analog |
|------|-------------|-------------------|
| Arctic | < -14°C | Uninhabitable tundra |
| Subarctic | -14°C to -8°C | Sparse nomadic populations |
| Boreal | -8°C to 2°C | Fur trade, forestry |
| Temperate | 2°C to 18°C | Agricultural heartlands |
| Subtropical | 18°C to 24°C | Year-round farming |
| Tropical | > 24°C | High productivity, disease pressure |

**Design justification**: Climate zones create natural "civilization bands" similar to real history—most major civilizations arose in temperate to subtropical regions with reliable rainfall.

## Vegetation & Biomes

Vegetation emerges from the intersection of climate and moisture, determining both visual appearance and economic potential.

### Moisture Tiers

From driest to wettest:
```
Parched < Arid < Dry < Low < Moderate < Moist < Wet < Humid < Saturated
```

### Vegetation Types

| Type | Characteristics | Economic Value |
|------|-----------------|----------------|
| Desert | Barren, harsh | Minimal (trade routes only) |
| Sparse | Scrubland | Pastoral, low density |
| Grasslands | Steppes, prairies | Cavalry, pastoral wealth |
| Woods | Light forest | Mixed agriculture |
| Forest | Dense woodland | Timber, moderate farming |
| Jungle | Tropical rainforest | Rich but difficult to exploit |

### Biome Assignment Example (Tropical Zone)

| Moisture | Primary Vegetation | Secondary |
|----------|-------------------|-----------|
| Saturated | Jungle | - |
| Humid | Jungle (70%) | Forest (30%) |
| Wet | Forest | Jungle |
| Moist | Forest | Woods |
| Moderate | Woods | Grasslands |
| Low | Grasslands | Woods |
| Dry | Sparse | Grasslands |
| Arid | Sparse (80%) | Desert (20%) |
| Parched | Desert | - |

**Design justification**: Stochastic transitions at biome boundaries prevent hard lines and create more natural-looking maps. The probability distributions are tuned to match real-world biome distributions.

## Water Features

Water shapes civilization more than any other geographic feature.

### Oceans

Oceans are grouped into logical sea regions that track:
- Distance from nearest continent
- Bordering landmasses
- Neighbor sea regions

**Significance**: Sea regions determine naval travel distances and trade route viability. Inland seas (like the Mediterranean) become critical trade hubs.

### Lakes

Lakes are identified as isolated freshwater bodies. The generation applies filters:

1. **Desert removal**: Lakes in arid regions are removed (dried up)
2. **Mountain removal**: Lakes surrounded by peaks are removed (glacial, inaccessible)
3. **Shallow zones**: Transition cells generated around lake edges

**Design justification**: Lakes provide freshwater access but shouldn't appear in geographically implausible locations. The filtering rules prevent desert oases and alpine lakes that would complicate the simulation without adding value.

## Landmarks

Named geographic features provide identity and reference points for the simulated history.

### Landmark Types

| Type | Size Criteria | Naming Convention |
|------|---------------|-------------------|
| Ocean | Large water body | "[Name] Ocean" |
| Sea | Medium water body | "[Name] Sea" |
| Continent | Large landmass | "[Name]" |
| Island | Medium landmass | "[Name]" |
| Isle | Small landmass | "[Name] Isle" |
| Mountain Range | Clustered peaks | "[Name] Mountains" |
| Lake | Inland water | "Lake [Name]" |

**Generation**: Landmarks are identified through flood-fill clustering of adjacent cells sharing characteristics (all ocean, all mountain, etc.).

---

## TODO: Proposed Improvements

### High Priority

- [ ] **Rivers**: Add major river systems that flow from mountains to coasts. Rivers historically determined city placement, trade routes, and borders. Implementation: trace downhill paths from high elevation, merge tributaries.

- [ ] **Resource deposits**: Add localized resources (iron, gold, horses, etc.) that provide strategic value beyond base production. Creates contest points and trade dependencies.

- [ ] **Terrain movement costs**: Currently terrain is binary (passable/impassable). Add movement cost multipliers for hills, forests, marshes to affect military campaigns.

### Medium Priority

- [ ] **Seasonal variation**: Climate currently static. Add seasonal temperature/rainfall cycles that affect agriculture and military campaigns (no winter invasions of Russia).

- [ ] **Natural disasters**: Earthquakes, volcanic eruptions, floods as rare events that reshape geography and destroy provinces.

- [ ] **Sea ice**: Arctic oceans should freeze seasonally, blocking naval routes and enabling land crossings.

- [ ] **Straits and passages**: Identify narrow water crossings that can be controlled (Bosphorus, Gibraltar equivalents). Critical for naval chokepoint gameplay.

### Low Priority

- [ ] **Erosion over time**: Very long simulations could see coastlines shift, rivers change course, desertification spread.

- [ ] **Underground features**: Caves, mines, underground rivers for fantasy/dwarf civilization support.

- [ ] **Tectonic plates**: For very long timescales, continent drift and mountain formation.

### Technical Debt

- [ ] **Resolution scaling**: Current ~16,000 cells is fixed. Add dynamic resolution that can increase for detailed regional simulations.

- [ ] **Caching**: Pre-compute and cache expensive geographic queries (pathfinding, neighbor lookups) for performance.

- [ ] **Serialization**: Efficient save/load of world state for large maps.

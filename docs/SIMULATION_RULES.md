# Chaos Machine - Simulation Rules Documentation

Chaos Machine is a procedurally generated history simulator. This documentation covers the core simulation rules, mechanics, and systems that govern how the simulated world evolves over time.

## Documentation Index

### [World Generation](./world-generation.md)
The physical foundation of the simulation—terrain, climate, biomes, and landmarks. Covers how geography shapes the stage upon which history unfolds.

- Geographic Foundation (S2 geometry, hexagonal cells, Voronoi partitioning)
- Elevation & Terrain (topography classification, mountain ranges)
- Climate System (temperature, rainfall, monsoons)
- Vegetation & Biomes (moisture-based assignment)
- Water Features (oceans, lakes, coastlines)
- Landmarks (named geographic features)

### [Political Entities](./political-entities.md)
The actors that drive history—provinces, nations, and their rulers. Covers the hierarchical structure of political control and succession mechanics.

- Provinces (base territorial units, production)
- Nations & Subjects (hierarchy, subject limits, connectivity)
- Leaders & Succession (lifespan, rebellion cascades)

### [Cultural Systems](./cultural-systems.md)
Identity beyond politics—cultures, heritages, faiths, and religions. Covers how populations maintain distinct identities across political boundaries.

- Cultures & Heritages (regional identity, ethnic lineages)
- Faiths & Religions (belief systems, religious groupings)

### [Economy & Resources](./economy.md)
The wealth that fuels empires—production, tribute, and recovery. Covers the economic foundations that determine military strength.

- Production (base economic output)
- Wealth Calculation (current vs optimal wealth)
- Tribute & Subject Economics (hierarchical extraction)
- Recovery & Taxation (war exhaustion, peacetime recovery)

### [Conflict & Warfare](./warfare.md)
The engine of change—wars, battles, and rebellions. Covers how nations expand, contract, and fragment through military conflict.

- War Initiation (evaluation, prerequisites, target selection)
- Battle Resolution (odds, casualties, occupation)
- Territory Transfer (invasion, restoration phases)
- War Termination (victory conditions, exhaustion)
- Rebellion & Civil War (succession crises, cascading rebellions)

### [Time & Events](./time-and-events.md)
The simulation engine—calendar, event queue, and processing. Covers the event-driven architecture that advances the simulation.

- Calendar System (time units, epoch)
- Event Queue (priority queue, determinism)
- Event Types (war, battle, succession, tax)

---

## Quick Reference: Simulation Constants

| Constant | Value | Description |
|----------|-------|-------------|
| SUBJECT_LIMIT | 6 | Maximum direct subjects per nation |
| TRIBUTE | 0.25 | Subject wealth contribution rate (25%) |
| SIZE_ADVANTAGE | 2 | Exponent for wealth in battle odds |
| EXHAUSTION_THRESHOLD | 0.25 | War ends when both below 25% wealth |
| REBELLION_CHANCE | 0.25 | Succession rebellion probability (25%) |
| RECOVERY_RATE | 0.1 | Annual wealth recovery (10% of optimal) |
| Base Production | ~5 | Average province production |
| Sea Level | 0.1 | Ocean/land elevation threshold |
| Mountain Level | 0.5 | Mountain elevation threshold |

---

## Key Formulas

### Battle Odds
```
strength = current_wealth / (1 + active_wars)
odds = attacker^2 / (attacker^2 + defender^2)
```

### Wealth
```
current_wealth = production - consumption + tribute
tribute = sum(subject_wealth * 0.25)
```

### Recovery
```
recovery = optimal_wealth * 0.1 * peace_fraction
```

---

## Document Structure

Each article follows a consistent structure:
1. **Overview**: What the system does and why it matters
2. **Mechanics**: How the system works with formulas and examples
3. **Design Justification**: Why it works this way
4. **TODO Improvements**: Proposed enhancements organized by priority

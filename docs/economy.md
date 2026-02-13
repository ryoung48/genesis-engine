# Economy & Resources

The economic system provides the foundation for all conflict in the simulation. Wealth determines military strength, which determines territorial control, which determines wealth. This feedback loop drives the historical narrative.

## Core Economic Loop

```
Production → Wealth → Strength → Conquest → More Production
     ↑                                            |
     └────────────── Tribute ←───────────────────┘
```

The economy is deliberately simple—complex enough to create meaningful strategic decisions, simple enough to simulate efficiently over long time periods.

## Production

Production is the base economic input. Each province generates a fixed amount of production that represents agricultural output, natural resources, and population labor.

### Production Formula

```
base_production = 5 + gaussian(0, 1) * 2
production = max(0.5, base_production)
```

This creates a distribution centered on 5 with most provinces falling between 3-7:

| Production | Frequency | Description |
|------------|-----------|-------------|
| 0.5-2 | ~5% | Marginal territory (deserts, tundra) |
| 2-4 | ~20% | Below average |
| 4-6 | ~50% | Average provinces |
| 6-7+ | ~25% | Wealthy heartlands |

### Why Fixed Production?

Production is determined at world generation and never changes. This design choice reflects:

1. **Geographic determinism**: Some lands are inherently more productive
2. **Simulation efficiency**: No need to recalculate production each tick
3. **Strategic clarity**: Players/observers can identify valuable targets

**Design justification**: While real economies grow over time, modeling economic development would add complexity without proportional narrative value. The simulation focuses on political history, not economic history.

### Coastal Bonuses

Coastal provinces may receive production bonuses during nation formation, representing:
- Fishing resources
- Trade access
- Port revenue

This makes coastlines strategically valuable and creates natural competition for maritime access.

## Wealth Calculation

Wealth is the dynamic economic state—it fluctuates based on consumption (war costs) and recovery (taxation).

### Wealth Formula

```
current_wealth = raw_production - consumption + tribute
```

Where:
- **Raw production**: Sum of all directly controlled province production
- **Consumption**: Accumulated war costs (battle casualties, sieges)
- **Tribute**: 25% of each subject's current wealth

### Optimal vs Current Wealth

The system tracks two wealth values:

| Metric | Description | Use |
|--------|-------------|-----|
| Current Wealth | Actual available resources | Battle strength |
| Optimal Wealth | Maximum possible wealth | Recovery target, war exhaustion |

```
optimal_wealth = raw_production + (optimal_subject_wealth * 0.25 * overextension)
overextension = 0.9 if subjects > 6, else 1.0
```

**Design justification**: Separating current from optimal wealth enables war exhaustion mechanics. A nation can be temporarily weakened by war without permanently losing capacity.

## Tribute & Subject Economics

The tribute system creates the economic incentive for expansion while limiting runaway growth.

### Tribute Rate

```
tribute = subject_current_wealth * 0.25
```

Each subject contributes 25% of their current wealth to their overlord. This is recursive—if a subject has subjects, they collect tribute which becomes part of their wealth, 25% of which flows upward.

### Why 25%?

The tribute rate balances several concerns:

1. **Expansion incentive**: Subjects are economically valuable
2. **Diminishing returns**: Deep hierarchies extract less (0.25^n decay)
3. **Subject viability**: Subjects retain 75% of wealth, remaining functional
4. **Historical plausibility**: Roughly matches historical tribute/taxation rates

### Overextension Penalty

Nations with more than 6 direct subjects suffer 10% reduction to optimal wealth:

```
if subjects > 6:
    optimal_wealth *= 0.9
```

This represents administrative strain from over-expansion:
- Communication delays
- Coordination costs
- Corruption and inefficiency

**Design justification**: The penalty is mild (10%) but meaningful. It discourages infinite direct expansion while still allowing large empires through hierarchical subject chains.

### Economic Hierarchy Example

```
Empire (production: 10)
├── Subject A (production: 5) → pays 1.25 tribute
│   └── Sub-subject A1 (production: 3) → pays 0.75 to A
├── Subject B (production: 4) → pays 1.0 tribute
└── Subject C (production: 6) → pays 1.5 tribute

Empire receives: 10 (own) + 1.25 + 1.0 + 1.5 = 13.75 base
Subject A receives: 5 (own) + 0.75 - 1.25 = 4.5 effective
```

The empire benefits from the hierarchy, but most wealth stays at lower levels.

## Recovery & Taxation

Nations recover from war costs through annual tax events during peacetime.

### Recovery Formula

```
recovery = optimal_wealth * 0.1 * peace_fraction
peace_fraction = time_at_peace / total_year
```

A nation at peace all year recovers 10% of optimal wealth. A nation at war half the year recovers 5%.

### Why 10% Recovery Rate?

The recovery rate creates meaningful war exhaustion:

- **Full depletion recovery**: ~10 years of peace to fully recover from total war
- **Sustained warfare cost**: Nations cannot maintain continuous warfare
- **Strategic pacing**: Natural pauses between major conflicts

### Consumption Mechanics

Consumption accumulates through war costs:
- Battle casualties (both attacker and defender pay)
- Siege costs (TODO)
- Army maintenance (TODO)

Consumption cannot go negative—it represents "debt" against productive capacity.

### Economic States

Nations cycle through economic states based on current/optimal wealth ratio:

| Ratio | State | Implications |
|-------|-------|--------------|
| >75% | Healthy | Full military capacity |
| 50-75% | Strained | Reduced strength |
| 25-50% | Exhausted | Significant weakness |
| <25% | Depleted | War exhaustion triggers |

---

## TODO: Proposed Improvements

### High Priority

- [ ] **Trade system**: Provinces generate trade value that flows along routes to trade nodes. Control of trade nodes provides income. Creates economic geography distinct from production.

- [ ] **Development mechanic**: Allow spending wealth to permanently increase province production. Creates investment decisions and enables catching up.

- [ ] **Army maintenance**: Standing armies cost wealth per tick. Creates peacetime economic pressure and meaningful demobilization decisions.

- [ ] **Loans and debt**: Nations can borrow against future income. Enables aggressive expansion at cost of future instability.

### Medium Priority

- [ ] **Resource types**: Differentiate production into food, materials, gold. Different resources have different strategic value. Scarcity of specific resources drives trade and conflict.

- [ ] **Population**: Track population separately from production. Population grows/shrinks based on conditions. Production scales with population. Enables plagues, famines, migrations.

- [ ] **Infrastructure**: Roads, ports, markets that improve production or trade efficiency. Requires investment, can be destroyed in war.

- [ ] **Inflation**: Rapid wealth accumulation causes inflation, reducing purchasing power. Historical accuracy for gold influxes.

- [ ] **Bankruptcy**: Nations that cannot pay debts suffer severe penalties—army dissolution, subject rebellion, territorial loss.

### Low Priority

- [ ] **Economic policies**: Tax rates, trade policies, currency manipulation with tradeoffs.

- [ ] **Merchant class**: Non-state economic actors that influence trade and can be courted or suppressed.

- [ ] **Economic espionage**: Sabotage enemy trade, steal technology, counterfeit currency.

- [ ] **Great projects**: Major construction (wonders, canals, roads) with long-term economic benefits.

### Technical Debt

- [ ] **Wealth history tracking**: Store wealth over time for graphing economic rise/fall.

- [ ] **Economic event logging**: Record significant economic events (bankruptcy, trade deals) in history.

- [ ] **Efficient tribute calculation**: Cache tribute chains for deep hierarchies.

### Design Questions

- Should subjects be able to negotiate tribute rates? (Autonomy vs integration)
- Should there be wealth caps to prevent extreme accumulation?
- How should conquest affect production? (Devastation, pillaging, integration bonuses)
- Should technology affect production? (Agricultural, industrial revolutions)

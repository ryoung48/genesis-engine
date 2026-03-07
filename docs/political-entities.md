# Political Entities

Political entities are the primary actors in the simulation. The system models a hierarchical structure of provinces, nations, and leadership that drives the historical narrative through conflict, diplomacy, and succession.

## Provinces

Provinces are the atomic unit of political control—the smallest territory that can be owned, contested, or transferred.

### Why Provinces?

The province abstraction serves several purposes:

1. **Discrete ownership**: Territory has clear, unambiguous control
2. **Economic unit**: Production and wealth aggregate at province level
3. **Historical tracking**: Each province maintains its own history of rulers, occupations, and relations
4. **Visual clarity**: Maps render cleanly with province-based coloring

### Province Properties

| Property | Description | Range |
|----------|-------------|-------|
| Location | Geographic cell | Single cell reference |
| Production | Economic output | 1-7 units (base ~5) |
| Color | Visual identifier | Unique per province |
| Composition | Land/ocean breakdown | Percentage |
| History | Leadership, occupation, relations | Time-indexed records |

### Production Distribution

Production follows a gaussian distribution around 5. This creates a realistic spread of wealthy and poor provinces without extreme outliers. Most provinces cluster around average, with a few exceptionally rich or poor territories that become strategic targets or backwaters.

### Historical Records

Each province maintains time-indexed records of:

- **Leadership**: Who controlled this province and when
- **Occupation**: Foreign military presence during wars
- **Relations**: Diplomatic stance toward other provinces

This enables queries like "Who ruled Province X in Year 500?" or "How long was Province Y occupied during the Great War?"

## Nations

Nations are the active political entities—they make decisions, wage wars, and shape history. A nation is defined by a sovereign **capital province** that holds independent authority.

### Sovereignty

A province is considered a sovereign nation if it is not subject to any other political entity. Sovereign nations:

- Conduct diplomacy (alliances, rivalries)
- Declare and join wars
- Manage their own economy and development

See `docs/relations-and-diplomacy.md` for details on how nations interact.

## Leaders & Succession

Each nation has a leader who embodies its decision-making. Leaders have finite lifespans, and succession creates moments of instability.

### Leader Lifespan

Leaders act as the central agent for the nation during their reign. Lifespans are currently modeled with a uniform distribution (1-60 years) to create narrative variety:
- Short reigns: Rapid succession crises, unstable periods
- Long reigns: Empire-building stability

### Succession Events

When a leader dies, a succession event occurs. This represents a transfer of power and is a critical moment where the nation's stability is tested.

---

## TODO: Proposed Improvements

### High Priority

- [ ] **Dynasty system**: Track ruling families across generations. Enables marriage alliances, inheritance claims, and dynastic wars. Succession would pass within dynasty before triggering rebellion checks.

- [ ] **Legitimacy mechanic**: New rulers start with low legitimacy that builds over time. Low legitimacy increases rebellion probability.

- [ ] **Claims and cores**: Separate "claims" (legal right to territory) from "cores" (actual control). Nations can have claims on provinces they don't own, providing casus belli.

### Medium Priority

- [ ] **Government types**: Different political structures (monarchy, republic, theocracy) with varying succession rules and bonuses.

- [ ] **Regencies**: Child rulers trigger regency periods with increased instability and reduced effectiveness.

- [ ] **Civil wars**: Large-scale internal conflicts beyond simple rebellion—pretender claimants, religious schisms, regional separatism.

- [ ] **Diplomatic actions**: Peace treaties, tribute arrangements, royal marriages, non-aggression pacts.

### Low Priority

- [ ] **Character traits**: Leaders with personalities (aggressive, cautious, diplomatic) that influence decision-making.

- [ ] **Councils and advisors**: Internal political factions that constrain or enable ruler actions.

- [ ] **Assassination and intrigue**: Covert actions to destabilize enemy nations.

- [ ] **Federations and unions**: Voluntary political combinations beyond conquest.

### Technical Debt

- [ ] **Historical narrative generation**: Auto-generate readable summaries of province/nation history from the time-indexed records.

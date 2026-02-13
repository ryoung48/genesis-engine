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

Production follows a gaussian distribution around 5:

```
production = 5 + gaussian(0, 1) * 2
minimum = 0.5
maximum = ~7 (practical limit from distribution)
```

**Design justification**: The gaussian distribution creates a realistic spread of wealthy and poor provinces without extreme outliers. Most provinces cluster around average (5), with a few exceptionally rich or poor territories that become strategic targets or backwaters.

### Historical Records

Each province maintains time-indexed records of:

- **Leadership**: Who controlled this province and when
- **Occupation**: Foreign military presence during wars
- **Relations**: Diplomatic stance toward other provinces

This enables queries like "Who ruled Province X in Year 500?" or "How long was Province Y occupied during the Great War?"

## Nations & Subjects

Nations are the active political entities—they make decisions, wage wars, and shape history. A nation consists of a capital province plus zero or more subject provinces.

### The Subject System

Subjects are provinces under the control of an overlord nation. This is conceptually similar to "cores" in Europa Universalis IV—they represent direct territorial control rather than feudal vassalage.

**Key characteristics:**

- Subjects contribute tribute (25% of wealth) to their overlord
- Subjects can have their own subjects (hierarchical)
- Maximum 6 direct subjects before overextension penalties
- Subjects must maintain land connectivity to overlord

### Why a Subject Limit?

The 6-subject limit serves several gameplay purposes:

1. **Prevents runaway expansion**: Without limits, successful nations snowball indefinitely
2. **Creates internal pressure**: Large empires must manage overextension
3. **Historical accuracy**: Real empires faced administrative limits on direct control
4. **Encourages hierarchy**: Nations must work through subject-of-subject chains for large empires

**Overextension penalty**: Nations with >6 subjects suffer 10% reduction in optimal wealth, representing administrative inefficiency.

### Hierarchy Depth

There is no limit on hierarchy depth. A nation can have subjects who have subjects who have subjects. This enables:

- Empires with complex internal structure
- Buffer states and client kingdoms
- Gradual absorption through multiple succession events

### Connectivity Requirements

Subjects must maintain a land route to their overlord:

```
connected = BFS_pathfind(subject, overlord) through friendly territory
```

**Disconnection consequences**: If a subject becomes geographically isolated (enemy conquest cuts the connection), they automatically rebel and become independent.

**Design justification**: This prevents absurd situations like controlling distant provinces with no ability to project power. It also creates strategic gameplay around cutting enemy supply lines.

### Relation Types

Nations track diplomatic relations:

| Relation | Description | Gameplay Effect |
|----------|-------------|-----------------|
| Ally | Formal alliance | May join wars (TODO) |
| Friendly | Positive disposition | Less likely to attack |
| Neutral | Default state | Standard behavior |
| Suspicious | Negative disposition | More likely to attack |

Relations are bidirectional and time-indexed, enabling historical queries.

## Leaders & Succession

Each nation has a leader who embodies its decision-making. Leaders have finite lifespans, and succession creates moments of instability.

### Leader Lifespan

```
lifespan = random(1, 60) years
```

This wide range creates varied narrative outcomes:
- Short reigns (1-10 years): Rapid succession crises, unstable periods
- Medium reigns (10-30 years): Standard historical pattern
- Long reigns (30-60 years): Empire-building stability, followed by succession crisis

**Design justification**: The uniform distribution is simple but effective. More sophisticated models could use age-based mortality curves, but the uniform distribution creates sufficient narrative variety.

### Succession Events

When a leader dies:

1. **Succession event fires** for the nation
2. **Each subject evaluates rebellion** with 25% probability
3. **Rebellions cascade** as subjects of rebelling subjects also evaluate
4. **Disconnected subjects** automatically rebel

### Rebellion Probability

The 25% base rebellion chance represents:
- Legitimacy crisis during transition
- Ambitious local rulers seizing opportunity
- Breakdown of personal loyalty networks

**Why 25%?** This rate produces historically plausible succession outcomes:
- Most successions are peaceful (75% per subject)
- Large empires (many subjects) frequently see some rebellion
- Cascading rebellions can fragment empires dramatically

### Cascading Rebellions

When a subject rebels, their subjects must also evaluate:

```
for each rebelling_subject:
    for each sub_subject of rebelling_subject:
        if random() < 0.25:
            sub_subject rebels
```

This creates dramatic "empire collapse" moments where a single succession triggers chain reactions.

---

## TODO: Proposed Improvements

### High Priority

- [ ] **Dynasty system**: Track ruling families across generations. Enables marriage alliances, inheritance claims, and dynastic wars. Succession would pass within dynasty before triggering rebellion checks.

- [ ] **Legitimacy mechanic**: New rulers start with low legitimacy that builds over time. Low legitimacy increases rebellion probability and reduces subject loyalty.

- [ ] **Claims and cores**: Separate "claims" (legal right to territory) from "cores" (actual control). Nations can have claims on provinces they don't own, providing casus belli.

- [ ] **Alliance system**: Implement the ally relation type with actual gameplay effects—allies join defensive wars, can be called into offensive wars.

### Medium Priority

- [ ] **Government types**: Different political structures (monarchy, republic, theocracy) with varying succession rules, subject limits, and bonuses.

- [ ] **Regencies**: Child rulers trigger regency periods with increased instability and reduced effectiveness.

- [ ] **Civil wars**: Large-scale internal conflicts beyond simple rebellion—pretender claimants, religious schisms, regional separatism.

- [ ] **Diplomatic actions**: Peace treaties, tribute arrangements, royal marriages, non-aggression pacts.

- [ ] **Subject types**: Differentiate between integrated provinces, autonomous subjects, and tributary states with different tribute rates and rebellion probabilities.

### Low Priority

- [ ] **Character traits**: Leaders with personalities (aggressive, cautious, diplomatic) that influence decision-making.

- [ ] **Councils and advisors**: Internal political factions that constrain or enable ruler actions.

- [ ] **Assassination and intrigue**: Covert actions to destabilize enemy nations.

- [ ] **Federations and unions**: Voluntary political combinations beyond conquest.

### Technical Debt

- [ ] **Relation decay**: Relations should drift toward neutral over time without active maintenance.

- [ ] **Historical narrative generation**: Auto-generate readable summaries of province/nation history from the time-indexed records.

- [ ] **Efficient hierarchy queries**: Cache overlord chains for performance in deep hierarchies.

# Conflict & Warfare

Warfare is the primary driver of political change in the simulation. Nations grow through conquest, shrink through defeat, and fragment through rebellion. The warfare system aims to produce historically plausible patterns of conflict, expansion, and collapse.

## War Initiation

Wars don't happen randomly—they require opportunity, motivation, and capability.

### Evaluation Cycle

Each nation evaluates potential wars every 5-10 years:

```
next_war_evaluation = current_time + random(5, 10) years
```

This pacing reflects the time needed to:
- Recover from previous conflicts
- Identify opportunities
- Prepare armies and logistics

### Prerequisites for War

A nation can initiate war only if:

1. **Independence**: No overlord (subjects cannot start wars)
2. **Capability**: At least one subject (single-province nations don't expand)
3. **Strength**: Stronger than target (wealth comparison)
4. **Proximity**: Target is a neighbor
5. **Not already at war**: No existing conflict with target

**Design justification**: These prerequisites prevent nonsensical wars (tiny nations attacking empires, subjects starting independent wars) while allowing most plausible conflicts.

### Target Selection

When multiple valid targets exist:

```
targets = neighbors.filter(valid_target)
target = targets.min_by(wealth)  // Attack weakest
```

**Frontier preference**: The system favors distant neighbors over close ones, encouraging outward expansion rather than internal consolidation.

**Design justification**: Attacking the weakest neighbor is historically common behavior. Strong nations expand at the expense of weak ones, creating natural consolidation patterns.

### War Probability

Even when a valid target exists, war isn't certain:

```
threat = attacker_wealth^2 / (attacker_wealth^2 + defender_wealth^2)
war_starts = random() < threat
```

The squared wealth ratio means:
- Overwhelming advantage: ~90% war chance
- 2:1 advantage: ~80% war chance
- Equal strength: ~50% war chance
- Disadvantage: Unlikely but possible

**Design justification**: The probability function ensures wars correlate with power imbalances while maintaining uncertainty. Even weak nations occasionally resist or deter aggression.

### Rebellion Wars

Subjects can rebel against overlords:

```
if random() < (1 - threat):
    subject rebels
```

Rebellion is more likely when:
- Overlord is weakened by other wars
- Subject is relatively strong
- Succession creates opportunity

## Battle Resolution

Once war begins, battles occur periodically until resolution.

### Battle Timing

```
first_battle = war_start + random(1, 6) months
subsequent_battles = previous_battle + random(4, 24) months
```

The variable timing represents:
- Army mobilization
- Strategic maneuvering
- Seasonal constraints
- Logistical preparation

### Strength Calculation

Battle strength derives from wealth but is penalized by multiple wars:

```
strength = current_wealth / (1 + active_wars)
```

A nation fighting two wars has half strength in each. This prevents large nations from trivially winning multiple simultaneous conflicts.

### Battle Odds

```
attacker_odds = attacker_strength^2 / (attacker_strength^2 + defender_strength^2)
```

The SIZE_ADVANTAGE exponent (2) creates decisive advantages for stronger forces:

| Strength Ratio | Attacker Odds |
|----------------|---------------|
| 4:1 | 94% |
| 2:1 | 80% |
| 1:1 | 50% |
| 1:2 | 20% |
| 1:4 | 6% |

**Design justification**: The squared ratio prevents endless stalemates while still allowing upsets. Weaker defenders can occasionally win battles, prolonging wars and creating narrative drama.

### Victory Degree

Each battle is classified by how decisive the outcome was, based on the margin between the dice roll and the odds threshold:

**For the winner:**
| Degree | Margin | Description |
|--------|--------|-------------|
| Decisive Victory | > 0.25 | Won by a large margin |
| Victory | 0.1 - 0.25 | Solid win |
| Pyrrhic Victory | < 0.1 | Barely won, costly |

**For the loser:**
| Degree | Margin | Description |
|--------|--------|-------------|
| Close Defeat | < 0.1 | Almost won |
| Defeat | 0.1 - 0.25 | Clear loss |
| Crushing Defeat | > 0.25 | Got destroyed |

**Design justification**: Victory degree adds narrative variety. A pyrrhic victory against a weaker foe tells a different story than a decisive victory against the same opponent.

### Casualties

Both sides suffer casualties based on target wealth, phase, and victory degree:

```
base_cost = target_wealth * 0.5
attacker_cost = base_cost * phase_modifier * degree_modifier
defender_cost = base_cost * phase_modifier * degree_modifier
```

**Phase modifiers:**
| Phase | Attacker | Defender |
|-------|----------|----------|
| Invasion | 1.2x | 0.8x |
| Restoration | 0.8x | 1.2x |

**Victory degree cost multipliers:**
| Degree | Multiplier | Rationale |
|--------|------------|-----------|
| Decisive Victory | 0.5x | Clean victory, minimal losses |
| Victory | 0.75x | Solid win |
| Pyrrhic Victory | 1.25x | Won but at great cost |
| Close Defeat | 1.0x | Fought well, orderly retreat |
| Defeat | 1.25x | Clear loss |
| Crushing Defeat | 1.5x | Routed, heavy casualties |

Attackers pay more during invasion (offensive operations are costly). Defenders pay more during restoration (desperate counterattacks).

**Design justification**: Mutual casualties ensure all wars are costly. Decisive victories reward overwhelming force with lower losses, while pyrrhic victories punish close calls. Even victorious attackers suffer attrition, preventing infinite conquest chains.

## Occupation & Territory Transfer

Wars are won through territorial control, not just battles.

### Invasion Phase

During invasion, the attacker attempts to capture provinces:

```
for each battle won:
    capture one adjacent enemy province
    province becomes "occupied" (not owned)
```

**Adjacency requirement**: Attackers can only capture provinces bordering their territory or existing occupations. This creates realistic front-line progression.

### Restoration Phase

Once the defender has lost territory, they attempt to reclaim it:

```
for each defender battle won:
    reclaim one occupied province (newest first)
```

**LIFO order**: Defenders reclaim the most recently lost provinces first, representing the principle of counterattacking at the weakest point of enemy advance.

### Occupation vs Ownership

Occupied provinces remain under their original owner but are controlled by the occupier:
- Occupier extracts no economic benefit (TODO: could add pillaging)
- Original owner loses access
- Full transfer only occurs on war resolution

**Design justification**: This enables dynamic war progress where territory changes hands multiple times before final resolution.

## War Termination Conditions

Wars end through decisive victory or mutual exhaustion.

### 1. Total Victory (Attacker Wins)

```
if attacker occupies defender capital:
    all defender provinces transfer to attacker
    war ends
```

Capturing the capital represents total conquest—the defender ceases to exist as an independent nation.

### 2. Reconquest (Defender Wins)

```
if defender eliminates all occupation:
    war ends with status quo
    no territorial changes
```

Successfully pushing out all invaders represents successful defense.

### 3. Exhaustion (Stalemate)

```
if attacker_wealth < 0.25 * optimal AND defender_wealth < 0.25 * optimal:
    war ends
    attacker keeps occupied provinces
```

When both sides are too exhausted to continue, the war ends with current front lines becoming borders.

**Design justification**: The 25% exhaustion threshold prevents eternal wars while ensuring wars are costly enough to matter. The attacker keeping occupied territory in stalemates rewards successful offense.

### 4. Political Change

```
if either side loses sovereignty:
    war ends
```

If either belligerent is conquered by a third party or fragments through rebellion, the war becomes moot.

## Rebellion & Civil War

Internal conflict can be as devastating as external war.

### Rebellion Triggers

Subjects may rebel due to:

1. **Succession crisis**: 25% chance per subject when overlord's leader dies
2. **Overextension**: Large empires strain administrative capacity
3. **Disconnection**: Subjects cut off from overlord automatically rebel

### Succession Rebellion

```
on leader_death:
    for each subject:
        if random() < 0.25:
            subject becomes independent
            check subject's subjects recursively
```

The 25% rate ensures:
- Most successions are peaceful
- Large empires (many subjects) likely see some rebellion
- Cascading rebellions can rapidly fragment empires

### Cascading Rebellions

When a subject rebels, their subjects face the same calculation:

```
Empire
├── Subject A (rebels)
│   ├── Sub-subject A1 (25% to rebel from A)
│   └── Sub-subject A2 (25% to rebel from A)
└── Subject B (stays loyal)
```

If A rebels, A1 and A2 might also declare independence, potentially creating three new nations from one rebellion.

**Design justification**: Cascading rebellions create dramatic empire collapse moments that mirror historical events (fall of empires upon strong ruler's death).

### Disconnection Rebellion

```
function check_connectivity(subject, overlord):
    path = BFS through friendly territory
    if no path exists:
        subject rebels
        check_connectivity for subject's subjects
```

Geographic isolation forces independence. This:
- Prevents absurd distant possessions
- Creates strategic chokepoints
- Rewards cutting enemy supply lines

---

## TODO: Proposed Improvements

### High Priority

- [ ] **Army units**: Model discrete armies that move, fight, and can be destroyed. Currently battles are abstract wealth comparisons.

- [ ] **Siege mechanics**: Provinces should require time to capture, not instant occupation. Fortifications extend siege time.

- [ ] **War goals**: Define objectives at war start (conquest, humiliation, liberation). Achieving goals ends war. Enables limited wars.

- [ ] **Peace treaties**: Negotiated settlements with terms (tribute, territorial cession, vassalization). Not all wars end in total victory.

- [ ] **Casus belli**: Require justification for war (claims, insults, religious differences). Unjustified wars have penalties.

### Medium Priority

- [ ] **Military technology**: Advances that improve battle odds or enable new tactics.

- [ ] **Terrain effects**: Mountains, rivers, forests affect battle odds. Defensive terrain matters.

- [ ] **Generals**: Leader characters with military skill affecting battle outcomes.

- [ ] **Naval warfare**: Sea battles, blockades, amphibious invasions.

- [ ] **Attrition**: Armies suffer losses from supply problems, disease, weather.

- [x] **Allies and coalitions**: Multiple nations joining wars on each side. See [relations-and-diplomacy.md](relations-and-diplomacy.md).

- [ ] **Mercenaries**: Hire temporary military strength at economic cost.

### Low Priority

- [ ] **Military traditions**: National bonuses from military history.

- [ ] **War weariness**: Population discontent from prolonged wars.

- [ ] **Prisoners and ransoms**: Captured leaders, prisoner exchanges.

- [ ] **Scorched earth**: Defenders can devastate provinces to deny them to attackers.

- [ ] **Guerrilla warfare**: Occupied provinces resist, tying down occupier forces.

### Technical Debt

- [ ] **War history detail**: Record all battles, casualties, territorial changes for historical replay.

- [ ] **Combat logging**: Detailed battle resolution for debugging and narrative generation.

- [ ] **Performance optimization**: Battle resolution should be O(1) not O(provinces).

### Design Questions

- Should there be a maximum war duration? (Forced peace after X years)
- How should multi-front wars be handled? (Two enemies attack same defender)
- Should defenders ever be able to counter-invade? (Currently only restoration)
- How should naval power affect land wars? (Blockades, invasions)

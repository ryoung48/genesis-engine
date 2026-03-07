# Relations & Diplomacy

Relations govern how nations perceive each other and shape decisions about war, alliances, and cooperation. The system produces emergent diplomatic dynamics—alliances form against common threats, old enemies gradually reconcile, and powerful nations intimidate their neighbors.

## Relation Categories

Relations use a categorical system. Each pair of nations (sovereign or vassal) has a specific relationship state:

| Relation | Color | Description |
|----------|-------|-------------|
| Ally | Green | Mutual defense pact. Will not attack, joins defensive wars |
| Friendly | Blue | Positive disposition. Will not attack |
| Neutral | Gray | No strong opinion. Default starting state for most nations |
| Suspicious | Amber | Distrust. More willing to attack than neutral |
| Rival | Red | Active enmity. Eager to attack, set automatically during/after wars |
| Vassal | Purple | Subordinate. Joins all overlord's wars, cannot wage independent wars |
| Overlord | Indigo | Dominant partner in the vassalage bond |

**Note:** "Vassal" and "Overlord" are relation states that override the standard opinion ladder. A vassal does not store a persistent separate "neutral" or "friendly" opinion of its overlord; instead, it re-evaluates its loyalty dynamically during diplomacy events.

## Initialization

When nations are first created during `NATION.build`, neighboring sovereign nations receive probabilistically assigned relations:

| Roll | Result | Constraint |
|------|--------|------------|
| 15% | Rival | Must be within ±20% of each other's `wealth.optimal` — otherwise falls back to suspicious |
| 30% | Suspicious | — |
| 30% | Neutral | — |
| 15% | Friendly | — |
| 10% | Ally / Vassal | If stronger nation has 2x wealth of weaker (`ratio < 0.5`), becomes Vassal/Overlord. Otherwise becomes Ally. |

Non-neighbors start with no relation entry (implicitly neutral).

## Diplomacy Event

Each sovereign nation evaluates its diplomatic landscape every 8-15 years via a `DiplomacyEvent`. The event processes three phases:

### Phase 1: Cleanup

- **Non-neighbor decay**: Relations with nations that are no longer immediate neighbors → neutral
- **Non-sovereign decay**: Relations with nations that are no longer sovereign → neutral
- **Rival size-gate decay**: Rivals who are no longer within ±20% of each other's `wealth.optimal` → suspicious

*Note: Vassal/Overlord bonds are exempt from non-neighbor decay.*

### Phase 2: Transition Matrix

For each sovereign neighbor, the current relation probabilistically transitions to a new state based on a transition matrix.

**Transition Probabilities:**

| Current ↓ / Next → | Rival | Suspicious | Neutral | Friendly | Ally |
|--------------------|-------|------------|---------|----------|------|
| **Rival** | 65% | 25% | 8% | 2% | 0% |
| **Suspicious** | 18% | 50% | 22% | 5% | 5% |
| **Neutral** | 5% | 18% | 50% | 15% | 12% |
| **Friendly** | 2% | 10% | 20% | 45% | 23% |
| **Ally** | 1% | 4% | 10% | 20% | 65% |

**Special Rules:**
- **Ally → Vassal**: If a transition results in "Ally", but one nation is much weaker (< 50% wealth of the other), it becomes a **Vassal** instead (unless the weaker nation already has an overlord).
- **Rival Size-Gate**: If a transition results in "Rival" but the nations are not similar size (±20%), it is clamped to "Suspicious".

### Phase 3: Vassal Processing

Vassals do not drift along the standard ladder. Instead, during each diplomacy event, a vassal **re-rolls** its transient opinion of the overlord to determine if it should rebel.

**Vassal Opinion Distribution:**
- 5% Rival
- 15% Suspicious
- 40% Neutral
- 25% Friendly
- 15% Ally

**Behavior:**
1. **Sync Relations**: Vassals inherit their overlord's "Rival", "Suspicious", or "War" relations with shared neighbors.
2. **Rebellion Check**: If the re-rolled opinion is **Suspicious** or **Rival**:
   - Check threat level: `WAR.stats.threat(overlord vs vassal)`.
   - If `threat > 0.5` (Overlord is not overwhelmingly stronger), the vassal rebels.
   - **Effect**: Relation becomes "Rival". Log "rebellion" event.
   - **Counter-War**: Overlord has a probabilistic chance (`0.7 * (1 - threat)`) to immediately declare war to reclaim the subject.

## War-Triggered Changes

Wars cause immediate, dramatic relation shifts:

| Event | Effect |
|-------|--------|
| War declared | Attacker <-> Defender becomes `"rival"` |
| Ally/vassal joins war | Joining nation <-> opposing leader becomes `"rival"` |
| War ends (coalition) | Allies who fought together upgrade one step (e.g. Friendly -> Ally) |
| Total victory | Attacker's neutral neighbors may become `"suspicious"` (40% chance, fear of expansion) |

## Impact on Warfare

### Attack Willingness

Relations directly gate war decisions. Each relation has a threat threshold—the maximum threat level at which a nation will still consider attacking:

| Relation | Threshold | Behavior |
|----------|-----------|----------|
| Rival | 0.8 | Eager to attack, accepts higher risk |
| Suspicious | 0.6 | Default aggression level |
| Neutral | 0.45 | Reluctant, needs clear advantage |
| Friendly | 0.1 | Effectively never attacks |
| Ally | 0 | Never attacks |

Vassals **cannot initiate wars independently**. They can only participate in wars through their overlord's call-to-arms.

### Power Projection (Effective Strength)

When evaluating whether to attack, nations consider their target's alliances and vassals:

```
effective_strength = own_strength + sum(ally_and_vassal_strengths * 0.4)
```

A small nation with a powerful ally appears stronger. This deters aggression against well-connected nations.

## Coalition Warfare

When war breaks out, allies and vassals may join as coalition members.

### Call to Arms

After a war is declared, both sides attempt to rally support:

**Defender's side** (defensive coalitions):
- Each **vassal** of defender: always joins.
- Each **ally** of defender: 75% chance to join.

**Attacker's side** (offensive coalitions):
- Each **vassal** of attacker: always joins.
- Allies do **not** join offensive wars.

Joining a coalition requires:
- Being sovereign (for allies; vassals always join)
- Not already in an active war
- Not already on the opposing side

Nations that join set their relation with the opposing war leader to `"rival"`.

### Coalition Battle Mechanics

During battles, coalitions pool their strength:

```
coalition_strength = leader_strength + sum(ally_strengths * 0.6)
```

Allies contribute 60% of their individual strength. The discount represents coordination costs.

### Cost Distribution

Battle costs are shared within coalitions:
- War leader pays **60%** of the coalition's cost
- Allies split the remaining **40%** proportionally to their individual strength

### War Resolution

Only the **war leader** gains or loses territory when the war ends. Allies benefit from:
- Upgraded relations with fellow coalition members (one step toward ally)
- Weakened mutual enemy

## DIP Map Mode

The `DIP` map mode colors the world by each nation's relation to the currently selected nation:

| Color | Meaning |
|-------|---------|
| White | Selected nation's own territory |
| Green (#22c55e) | Ally |
| Blue (#3b82f6) | Friendly |
| Gray (#9ca3af) | Neutral |
| Amber (#f59e0b) | Suspicious |
| Red (#ef4444) | Rival |
| Indigo (#6366f1) | Overlord |
| Opinion color + purple stripes | Vassal (stripes show vassalage, base color shows opinion) |
| Light gray (#e5e7eb) | No relation / non-sovereign |

*Note: Since vassals uses the "vassal" relation state, the opinion color for vassals in the map may effectively be their transient roll or implied relation.*

## History Notes

Only major diplomatic events are logged to the event timeline:

| Event | Logged? | Dot Color |
|-------|---------|-----------|
| Alliance formed | Yes | Green |
| Alliance broken | Yes | Red |
| Vassal rebellion | Yes | — |
| Relation upgraded (non-ally) | No | — |
| Relation downgraded (non-ally) | No | — |

## Emergent Behaviors

The system is designed to produce these patterns without scripting them:

- **Neutral equilibrium**: Most relations stay neutral most of the time
- **Balance of power**: Small nations ally against large ones (common enemy bonus + proximity friction)
- **Persistent rivalries**: Only between similarly-sized nations (±20% wealth), preventing permanent bullying
- **Temporary alliances**: Form during crises but decay without ongoing cooperation
- **Empire fear**: Conquering nations make their neighbors suspicious
- **Vassal loyalty spectrum**: Vassals range from loyal allies to disloyal subjects plotting rebellion
- **Vassal rebellion**: Suspicious/rival vassals break free when they judge they can survive retaliation
- **Geographic relevance**: Non-neighbor relations decay to neutral, keeping diplomacy focused on borders

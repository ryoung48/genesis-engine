# Diplomatic attitudes, alliances and vassalage

Scope: `:history`.

A realm pair’s attitude is separate from formal alliances, subject ties and personal unions, and from a person’s residence or title ownership. This reference covers general diplomatic drift and subject obligations.

Code: `src/model/history/sim/engine/events/diplomacy`.

## Diplomatic dispositions

Every pair of realms has a shared attitude: Rival, Suspicious, Neutral, Friendly or Trusted. Formal alliances, vassalage, unions, colonies and wars are separate ties. Neighboring pairs start with one weighted attitude draw; an old Ally draw makes the pair Trusted and creates an alliance if allowed. Other pairs start Neutral.

On each realm's diplomacy event, neighboring pairs and its direct formal-tie partners roll through the five-state transition matrix. An active war does not drift. A marriage-bound alliance cannot drift downward. Only a free neighboring pair already Trusted at the start of the event rolls a 3% chance to form a pact. A smaller realm can become a vassal when its revenue is under half the other's; otherwise an allowed pact is an alliance. An unbound alliance dissolves with chance 0% at Trusted, 10% at Friendly, 35% at Neutral, 70% at Suspicious and 100% at Rival.

### Personal bias

Each drift roll is tilted by the people governing the two realms. With the realms' governors resolved at the event time (the regent under a regency), `q = (opinion(a→b) + opinion(b→a)) / 200`, in [−1, 1], from their full [directed opinions](../people/opinion-and-relationships.md#opinion-in-diplomacy). For the current ladder index `i` and each candidate index `j` (Rival 0 to Trusted 4), the transition weight `M[i,j]` becomes `M[i,j] × (1 + 0.5 × q × (j − i) / 4)`; the five weights are normalized and the single existing draw chooses among them.

- Strength 0.5 and the ladder span 4 are design choices: every multiplier stays within 0.5–1.5 and a transition the matrix forbids stays forbidden.
- `q = 0` skips the tilt and the normalization, so the roll is bit-identical to the untilted one. That is the case for a regency council, a realm without a governor, one person governing both realms and an unavailable opinion.
- The mean is an adaptation to the symmetric realm attitude: one side's liking and the other's dislike moderate each other.
- The war skip, the marriage bound, the Rival size gate, the pact and dissolution chances and every formal tie apply exactly as before. The initial attitude draw is untouched: it stands for the realms' past.
- Opinion never replaces the attitude. A new governor changes the next roll's bias; the attitude the realms had built stays.

A Rival vassal refuses its overlord's war call and withholds tribute. A Suspicious vassal refuses an offensive call. An overlord that fights beside its vassal in the vassal's war raises the pair's disposition one step at peace; one that sits out lowers it one step. The same occurrence is also remembered personally: the vassal's governor holds a +15 aid or −20 abandonment [memory](../people/opinion-and-relationships.md#interaction-memories) of the overlord's governor, even when the attitude was already at the end of the ladder. It is one institutional and one personal consequence, not two attitude steps. A Rival or Suspicious ally refuses a defensive call until its alliance dissolves.

Subject secession thresholds are in [rebellions](rebellions-and-throne-wars.md#subject-secession-thresholds). Marriage-bound alliances follow [family alliance rules](../people/marriage-and-alliances.md#alliances-from-marriage).

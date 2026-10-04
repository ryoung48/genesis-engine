# Diplomatic attitudes, alliances and vassalage

Scope: `:history`.

A realm pair’s attitude is separate from formal alliances, subject ties and personal unions, and from a person’s residence or title ownership. This reference covers general diplomatic drift and subject obligations.

Code: `src/model/history/sim/engine/events/diplomacy`.

## Diplomatic dispositions

Every pair of realms has a shared attitude: Rival, Suspicious, Neutral, Friendly or Trusted. Formal alliances, vassalage, unions, colonies and wars are separate ties. Neighboring pairs start with one weighted attitude draw; an old Ally draw makes the pair Trusted and creates an alliance if allowed. Other pairs start Neutral.

On each realm's diplomacy event, neighboring pairs and its direct formal-tie partners roll through the five-state transition matrix. An active war does not drift. A marriage-bound alliance cannot drift downward. Only a free neighboring pair already Trusted at the start of the event rolls a 3% chance to form a pact. A smaller realm can become a vassal when its revenue is under half the other's; otherwise an allowed pact is an alliance. An unbound alliance dissolves with chance 0% at Trusted, 10% at Friendly, 35% at Neutral, 70% at Suspicious and 100% at Rival.

A Rival vassal refuses its overlord's war call and withholds tribute. A Suspicious vassal refuses an offensive call. An overlord that fights beside its vassal in the vassal's war raises the pair's disposition one step at peace; one that sits out lowers it one step. A Rival or Suspicious ally refuses a defensive call until its alliance dissolves.

Subject secession thresholds are in [rebellions](rebellions-and-throne-wars.md#subject-secession-thresholds). Marriage-bound alliances follow [family alliance rules](../people/marriage-and-alliances.md#alliances-from-marriage).

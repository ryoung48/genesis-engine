# Historical simulation

Scope: `:history`.

Start here for the historical simulation’s rules and implementation references. Climate and celestial simulation are separate documentation scopes.

## Concepts

- **Rulers** are the only individuals the simulation tracks: each sovereign realm has exactly one, a row of columns with a name, sex, dynasty, birth and death date and claim. See [rulers and dynasties](politics/rulers-and-dynasties.md).
- **Population** is the aggregate rural and urban headcount.
- **De jure hierarchy** is the normative title structure, which may differ from actual territorial ownership.
- **Religion** belongs to a family; both partitions and the one gender preference each religion carries are fixed at world generation.

## Politics

- [Government changes over time](politics/government-change.md)
- [Rulers and dynasties](politics/rulers-and-dynasties.md)
- [Government, rulers and succession](politics/government-and-succession.md) ([interregnum](politics/government-and-succession.md#interregnum))
- [Royal marriages](politics/royal-marriages.md)
- [Personal unions and foreign claims](politics/personal-unions.md)
- [Title ranks and de jure hierarchy](politics/title-hierarchy.md)
- [Armies, battles and war settlement](politics/armies-and-wars.md)
- [Diplomatic attitudes, alliances and vassalage](politics/diplomacy-and-subjects.md)
- [Rebellions, independence and throne wars](politics/rebellions-and-throne-wars.md)

## Population and economy

- [Population growth, cities, knowledge and development](population/growth-cities-and-knowledge.md)
- [Economic output, taxation and state maintenance](population/output-and-taxation.md)
- [Religions](population/religions.md)

## Mechanics

- [History smoke tests and related-test commands](mechanics/smoke-tests.md)
- [History pipeline performance and benchmark results](mechanics/pipeline-performance.md)
- [Incremental road network, historical routes and endpoint markers](mechanics/road-network.md)
- [Procedural planet route search performance](mechanics/route-search-performance.md)
- [History record ownership and memory usage](mechanics/record-memory.md)

The topic references describe the implemented rules. Mechanics covers pipeline performance and memory; each historical measurement retains its own workload and limits. Proposed features remain in `plans/`, not in these references.

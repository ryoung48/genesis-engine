# Historical simulation

Scope: `:history`.

Start here for the historical simulation’s rules and implementation references. Climate and celestial simulation are separate documentation scopes.

The three history producers are [stored Earth, detailed simulation and default fast history](mechanics/history-pipelines.md). The people, title, military, population and economy rules below describe Pipe 2. [Distribution history](politics/distribution-history.md) describes Pipe 3 and its validated large-world calibration.

## Concepts

- **People** are individually simulated rulers, seat holders and their families. Every created person is recorded, whether landed or not.
- **Attributes and traits** are properties of those same people. “Character” names the code API `CHARACTER`; it does not identify another kind of person.
- **Population** is the aggregate rural and urban headcount, not the individually simulated people table.
- **Residence** is a person’s province. Their territorial realm is derived from that province’s ownership.
- **Held seats** are titles belonging to a person. The highest-ranked seat is primary (lowest seat ID breaks ties); title ownership and residence are separate.
- **De jure hierarchy** is the normative title structure, which may differ from actual territorial ownership.

- **Religion** belongs to a family; both partitions and their descriptive doctrines are fixed at world generation.

## People

- [Religions and doctrines](people/religions-and-doctrines.md)
- [Simulated people and ruling families](people/overview.md)
- [Families, births and lifespans](people/families-and-lifecycle.md)
- [Marriage, betrothal and family alliances](people/marriage-and-alliances.md)
- [Person attributes and traits](people/attributes-and-traits.md)
- [Household residence and territorial realm](people/residence-and-realm.md)
- [Health, ageing and mortality](people/health-and-mortality.md)

## Politics

- [Government, title holders and succession](politics/government-and-succession.md)
- [Personal unions and foreign claims](politics/personal-unions.md)
- [Title ranks and de jure hierarchy](politics/title-hierarchy.md)
- [Armies, battles and war settlement](politics/armies-and-wars.md)
- [Diplomatic attitudes, alliances and vassalage](politics/diplomacy-and-subjects.md)
- [Rebellions, independence and throne wars](politics/rebellions-and-throne-wars.md)

## Population and economy

- [Population growth, cities, knowledge and development](population/growth-cities-and-knowledge.md)
- [Economic output, taxation and state maintenance](population/output-and-taxation.md)

## Mechanics

- [History smoke tests and related-test commands](mechanics/smoke-tests.md)
- [Person event logging, transfer and historical queries](mechanics/person-records.md)
- [History pipeline performance and benchmark results](mechanics/pipeline-performance.md)
- [History record ownership and memory usage](mechanics/record-memory.md)

The topic references describe the implemented rules. Mechanics covers logging, transfer, queries, pipeline performance and memory; each historical measurement retains its own workload and limits. Proposed features remain in `plans/`, not in these references.

Religion sets marriage customs and constrains culture gender systems; sexual orientation is recorded without mechanical effects. See [marriage](people/marriage-and-alliances.md) and [attributes](people/attributes-and-traits.md).

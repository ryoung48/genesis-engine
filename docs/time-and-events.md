# Time & Events

The time and event system is the engine that drives the simulation forward. Rather than continuous simulation, Chaos Machine uses discrete events processed in chronological order. This event-driven architecture enables efficient simulation of long time periods while maintaining causal consistency.

## Calendar System

The simulation uses a simplified calendar for tracking time.

### Time Units

```
1 year  = 365 days    = 31,536,000 ms
1 month = 30 days     = 2,592,000 ms
1 week  = 7 days      = 604,800 ms
1 day   = 24 hours    = 86,400 ms
```

**Simplifications:**
- All months have 30 days (no variable month lengths)
- No leap years
- 12 months per year

### Epoch

All times are stored as milliseconds from epoch:
```
Epoch = Year 0, January 1st, 00:00:00
```

This enables:
- Simple arithmetic for time calculations
- Efficient comparison of dates
- Consistent serialization

**Design justification**: The simplified calendar avoids complexity while providing sufficient granularity for historical simulation. Nobody cares that February has 30 days in the simulation.

### Date Formatting

Dates are formatted for display as:
```
"Month Day, Year" (e.g., "March 15, 247")
```

The calendar is purely for human readability—internally everything uses millisecond timestamps.

## Event Queue

The simulation processes discrete events in chronological order using a priority queue.

### Queue Structure

```
world.future = PriorityQueue<Event>
    sorted by: event.time (ascending)
```

Events are dequeued in time order. When an event fires:
1. World time advances to event time
2. Event logic executes
3. Event may schedule new events
4. Next event dequeued

### Event Processing

```
function tick(target_count):
    processed = 0
    while processed < target_count and future.not_empty():
        event = future.dequeue()
        world.time = event.time
        event.execute()
        world.past.push(event)  // historical record
        processed++
```

The `tick` function processes a specified number of events, allowing controlled simulation speed.

### Determinism

The simulation is fully deterministic given:
- Initial seed
- Number of events processed

The seeded random number generator ensures identical seeds produce identical histories. This enables:
- Reproducible simulations
- Debugging specific scenarios
- Sharing interesting seeds

**Design justification**: Determinism is essential for testing and debugging. Non-deterministic simulations are nightmares to debug.

## Event Types

Four core event types drive the simulation:

### War Events

**Frequency**: Every 5-10 years per nation
**Purpose**: Evaluate and initiate new conflicts

```
on war_event(nation):
    if can_start_war(nation):
        target = select_target(nation)
        if random() < war_probability(nation, target):
            start_war(nation, target)
    schedule_next_war_event(nation, 5-10 years)
```

War events are the entry point to the conflict system. They evaluate whether a nation should attack and initiate wars when conditions are met.

### Battle Events

**Frequency**: Every 4-24 months during active wars
**Purpose**: Resolve combat and territorial changes

```
on battle_event(war):
    if war.still_active():
        resolve_battle(war)
        check_war_termination(war)
        if war.still_active():
            schedule_next_battle(war, 4-24 months)
```

Battle events are chained—each battle schedules the next until the war ends.

### Succession Events

**Frequency**: Annual per nation
**Purpose**: Process leader deaths and succession crises

```
on succession_event(nation):
    if leader.death_time <= current_time:
        process_leader_death(nation)
        check_rebellions(nation.subjects)
    schedule_next_succession(nation, 1 year)
```

Succession events fire annually but only trigger effects when the leader's predetermined death time arrives.

### Tax Events

**Frequency**: Annual per nation
**Purpose**: Economic recovery during peace

```
on tax_event(nation):
    peace_fraction = calculate_peace_time(nation, past_year)
    recovery = nation.optimal_wealth * 0.1 * peace_fraction
    nation.consumption = max(0, nation.consumption - recovery)
    schedule_next_tax(nation, 1 year)
```

Tax events implement the economic recovery system, allowing nations to rebuild after wars.

## Event Chain Example

A typical war unfolds through chained events:

```
Year 100: War Event (Nation A)
    → Evaluates: A is stronger than neighbor B
    → Random check passes
    → WAR STARTED: A vs B
    → Schedules: Battle Event (3 months)

Year 100.25: Battle Event (A vs B)
    → A wins battle
    → A occupies Province X
    → War continues
    → Schedules: Battle Event (8 months)

Year 101: Battle Event (A vs B)
    → A wins battle
    → A occupies B's capital
    → WAR ENDED: Total Victory for A
    → All B's provinces transfer to A

Year 105: War Event (Nation A)
    → Evaluates new neighbors...
```

### Event Scheduling

Events schedule themselves and related events:

| Event | Schedules |
|-------|-----------|
| War | Next war evaluation (self), First battle |
| Battle | Next battle (if war continues) |
| Succession | Next succession check (self) |
| Tax | Next tax event (self) |

This creates a self-sustaining simulation loop.

## History Tracking

All processed events are stored for historical queries.

### Past Events

```
world.past = Array<Event>
    chronologically ordered
```

Each event records:
- Time of occurrence
- Participants
- Outcome
- Territorial changes

### Query Examples

```
// Wars in a century
wars_in_century = past.filter(e =>
    e.type == "war_started" &&
    e.time >= year_100 &&
    e.time < year_200
)

// Who ruled province X in year 500?
ruler = province.leadership.find(l =>
    l.start <= year_500 && l.end > year_500
)
```

**Design justification**: Complete history tracking enables narrative generation, statistics, and "what-if" analysis.

---

## TODO: Proposed Improvements

### High Priority

- [ ] **Event batching**: Process multiple simultaneous events together. Currently events at the same timestamp process in arbitrary order.

- [ ] **Event priorities**: When events have the same time, process in defined order (e.g., battles before succession).

- [ ] **Conditional events**: Events that only fire if conditions are met, rather than checking conditions when event fires.

- [ ] **Event cancellation**: Ability to cancel scheduled events when conditions change (e.g., cancel battle if war ends early).

### Medium Priority

- [ ] **Custom events**: Framework for adding new event types (plagues, discoveries, natural disasters).

- [ ] **Event modifiers**: Temporary effects that modify event outcomes (war exhaustion affects battle odds).

- [ ] **Compound events**: Events that trigger multiple sub-events atomically.

- [ ] **Event listeners**: Hook system for external code to react to events.

- [ ] **Seasonal events**: Events tied to specific times of year (harvest festivals, winter campaigns).

### Low Priority

- [ ] **Event visualization**: Timeline view of past and scheduled events.

- [ ] **Event replay**: Step backward through history by reversing events.

- [ ] **Event probability tracking**: Record what random values led to outcomes for analysis.

- [ ] **Parallel event processing**: Process independent events in parallel for performance.

### Technical Debt

- [ ] **Event type safety**: Strongly typed event payloads instead of generic objects.

- [ ] **Event compression**: Compress old events to reduce memory usage.

- [ ] **Event streaming**: Process events without loading entire history into memory.

### Design Questions

- Should there be "instant" events that don't advance time?
- How to handle events that should logically be simultaneous? (Two nations attacking each other)
- Should events be reversible for save/load? (Event sourcing)
- What's the appropriate granularity? (Currently milliseconds, maybe overkill)

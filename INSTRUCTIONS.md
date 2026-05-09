# THE CHAOS MACHINE — Grand Simulation Iteration Protocol
### A Complete Operating Manual for the Simulation Architect

---

## PREAMBLE

You are a renowned author and systems architect, tasked with building a living historical simulation — the Chaos Machine. This is not a game. This is a world that breathes, remembers, and breaks. Nations fracture. Kings are unmade. Alliances born of desperation outlast the empires that forged them.

Your job is to make that world **interesting** — measurably, repeatably, and increasingly so with every iteration.

This document is your complete operating protocol. Follow it precisely. Deviate only when documenting why.

### Reload This Document at the Start of Every Iteration

The protocol is a living document. It may be updated between iterations to reflect new understanding of the simulation and the process. A stale copy of the protocol in context is as dangerous as a stale wiki — it causes you to operate on outdated rules without knowing it.

**The first act of every iteration, before reading the wiki and before reading the library, is to reload this document from disk:**

```
/docs/PROTOCOL.md
```

Read it in full. Only then proceed to Phase 1. This ensures you always operate on the current version of the rules, and that any refinements made since the last iteration are in scope for the new one.

### The Era Constraint

The simulation is set in the **late medieval and early modern period** — roughly equivalent to 1300–1650 CE on Earth, though the world is entirely fictional. Every event, mechanic, system, and idea must be plausible within this context.

This is not a fantasy simulation. There is no magic. There are no supernatural events. The drama comes from the collision of human ambitions, institutional fragility, and the slow grind of geography and economics.

**What belongs in this era:**
- Dynastic succession, contested thrones, regencies, and legitimacy crises
- Feudal obligations, noble houses, and the tension between lords and crowns
- Mercenary armies, sieges, and the limits of medieval logistics
- The Church (or equivalent religious institution) as a political actor with real power
- Trade routes, guilds, city-states, and the early stirrings of merchant capital
- Plague, famine, and the demographic catastrophes that reshape political maps
- Exploration and contact between previously isolated civilizations
- Ideas spreading faster than institutions can contain them
- Gunpowder as a destabilizing technology that erodes the military monopoly of the mounted knight

**What does not belong:**
- Industrial production, factories, or mass manufacturing
- Nation-states with modern bureaucratic administration at scale
- Instantaneous long-distance communication
- Secular democratic governance

When evaluating ideas in Phase 2, critics must apply the era constraint as a **hard gate**. An idea that would only make sense in a modern state or a fantasy world is disqualified regardless of its CHASM score on other dimensions. Historical plausibility within the late medieval / early modern frame is not a soft preference — it is the foundation the simulation stands on.

---

## THE TWO PILLARS OF KNOWLEDGE

The simulation is documented across two complementary systems. They serve different purposes and must both be maintained. Neglecting either one degrades the quality of every future iteration.

---

### Pillar 1 — The Library

All iteration work is documented in a **Library** — a directory of markdown files, one per iteration, stored in the project at:

```
/docs/library/
```

Each file is named:
```
{iteration#}_{theme}_{timestamp}.md
```

Example: `003_succession_crisis_20240315.md`

The Library is the **changelog** of the simulation — a time-ordered record of what was tried, what was kept, what was tossed, and why. It answers the question: *what happened in iteration N?* It is not optimized for fast lookup. It is optimized for completeness.

The Library is **sacred**. Before any iteration begins, you must read every prior library document to understand what has been tried, what worked, what failed, and what was abandoned. Ideas that have been tried and failed are **penalized heavily** in scoring. Ideas that partially worked may be revisited with a new approach, but must be clearly flagged as revisits.

---

### Pillar 2 — The Wiki

Distilled, living knowledge about the simulation is maintained in a **Wiki** — a structured directory of reference documents at:

```
/docs/wiki/
```

The Wiki is the **knowledge base** of the simulation — a current, curated picture of what is true about the world right now. It answers the question: *how does the simulation work today?* It is optimized for fast lookup by subagents and critics who need context without reading 40 iteration files.

The Wiki is **always current**. It is updated at the close of every iteration to reflect what changed. Stale wiki content is worse than no wiki content — it misleads subagents into building on false assumptions.

The full Wiki structure, file templates, and maintenance rules are defined in **Appendix E**.

---

## THE CHASM SCORE — Measuring Interesting Content

Every event log is evaluated against five axes. Together they form the **CHASM Score** (0–25 points). This is the primary instrument for measuring whether the simulation is becoming more interesting.

| Axis | Name | Question It Answers | Max Points |
|---|---|---|---|
| **C** | Causality | Do events reference and cause other events? Are there visible chains? | 5 |
| **H** | Heroics | Do named individuals matter? Do kings, generals, and rebels change outcomes? | 5 |
| **A** | Asymmetry | Do underdogs win? Do empires collapse? Are power reversals visible? | 5 |
| **S** | Scale | Do events cascade across multiple nations? Does a war in the south reshape the north? | 5 |
| **M** | Memory | Does the world remember? Are past treaties, betrayals, and wars cited in future events? | 5 |

### Scoring Guide

For each axis, assign 0–5:
- **0** — Completely absent from the log
- **1** — Appears once or twice, feels accidental
- **2** — Present but shallow; events happen but don't connect
- **3** — Clearly visible; some chains, some memory, some named actors mattering
- **4** — Strong and consistent; a reader would notice it
- **5** — Exceptional; this axis could be the theme of a history book

### The Quotable Test

After scoring, find **3 sentences** from the event log that could appear in a published history book. Write them verbatim in the library document under a section called `## Quotable Moments`.

If you cannot find 3 quotable sentences, the iteration has **failed the smell test**, regardless of CHASM score. Note this explicitly.

Examples of quotable vs. non-quotable:

| Non-Quotable | Quotable |
|---|---|
| `Nation A declared war on Nation B.` | `Seventeen years after signing the Peace of Amrath, Valdoria broke its oath and marched south — the old king's son, they said, remembered everything.` |
| `King died. Succession occurred.` | `Three claimants rose before the funeral pyre had cooled; only one would survive the winter.` |
| `Trade route disrupted.` | `The fall of Kessara's eastern gate closed the Amber Road for a generation, and with it, the wealth that had kept the northern lords loyal.` |

### CHASM Delta

The goal of every iteration is a **positive CHASM delta** — the score after changes must exceed the score before changes. Track both:

```
CHASM Before: 11/25
CHASM After:  16/25
Delta:        +5
```

A delta of 0 means the change was cosmetic. A negative delta means the change actively made the simulation less interesting. Both are grounds for reverting.

---

## THE FULL ITERATION LOOP

### PHASE 1 — RESEARCH

**Before writing a single line of code or generating a single idea, do all of the following in order:**

1. Read the **Wiki index** at `/docs/wiki/README.md` to orient yourself. Then read the specific wiki sections relevant to this iteration's likely focus areas:
   - Always read: `systems.md`, `chasm-history.md`, `failure-taxonomy.md`
   - Read if touching events or chains: `event-catalog.md`
   - Read if touching actors or rulers: `actor-registry.md`
   - Read if touching mechanics or formulas: `mechanic-glossary.md`
   - Read if touching world geography or nations: `world-state.md`

   The wiki is your fast path to current knowledge. It tells you what exists, what works, and what has already failed. Do not skip it to save time — reading stale assumptions into your ideas costs more time than the read takes.

2. Read the **full source** of the history simulation, including:
   - `src/model/history/index.ts` — the core event engine
   - All files in `src/model/history/`
   - All world/nation/entity models referenced by the history system
   - The `package.json` to understand available scripts and dependencies

   Cross-reference what you read against `systems.md` in the wiki. If the code and the wiki disagree, the code is the ground truth — note the discrepancy and flag it for wiki correction at the end of the iteration.

3. Read **every prior library document** in `/docs/library/`. Note:
   - Ideas that were tried and succeeded (do not repeat; build on them)
   - Ideas that were tried and failed (penalize heavily in this iteration's scoring)
   - Ideas that were proposed but never implemented (fair game)
   - Recurring themes that suggest systemic gaps

   Cross-reference failed ideas against `failure-taxonomy.md`. If a failure pattern from the library is not yet captured in the taxonomy, add it during Phase 6 wiki maintenance.

4. Capture a **baseline CHASM score** by running the simulation:
   ```bash
   pnpm gen:history
   ```
   Use **full world defaults** — no shortcuts, no reduced nation counts, no abbreviated time spans. The full output spans a vast world and cannot be read in its entirety. Apply the **Standard Sample Protocol** (see Appendix D) to extract a consistent, comparable slice for scoring. Record the sample composition and CHASM score as the **pre-iteration baseline** in the library document.

   Compare the baseline to the CHASM history in `chasm-history.md`. If the score has regressed since the last iteration without an obvious cause, investigate before proceeding — a regression may indicate a silent bug introduced in the previous iteration.

5. Identify **critical bugs** — events or systems that actively suppress interesting content. Examples:
   - Events that fire but produce no narrative text
   - Events that reference entities that don't exist
   - Chains that break silently
   - Nations that never interact despite being neighbors
   - Kings that rule for 400 years without succession
   - Wars that start and end in the same event tick with no consequences

   Check the identified bugs against `failure-taxonomy.md`. Known failure patterns already have context on why they occur and what approaches have been attempted.

---

### PHASE 2 — CRITIQUE

Spawn **two critics** as internal reasoning agents. Each critic operates independently and must not be aware of the other's scores until after both have completed.

#### Critic A — The Historian
Evaluates ideas through the lens of historical plausibility and narrative richness. Asks:
- Would this happen in a real pre-modern civilization?
- Does this create stories that a historian would find meaningful?
- Does this reward long timescales and patient observation?

#### Critic B — The Game Designer
Evaluates ideas through the lens of emergent systems and player engagement. Asks:
- Does this create surprising outcomes from simple rules?
- Does this interact with existing systems in non-obvious ways?
- Does this have high variance — sometimes mundane, sometimes world-altering?

#### Scoring Rubric for Each Critic

Each critic independently scores every proposed idea on:

| Dimension | Points | Description |
|---|---|---|
| CHASM Impact | 0–10 | How much will this improve the CHASM score? Which axes? |
| Bug Severity Fixed | 0–5 | Does this fix a critical bug suppressing content? |
| Novelty | 0–5 | Is this genuinely new, or a variation on something tried? |
| System Interaction | 0–5 | Does this interact with multiple existing systems? |
| Implementation Risk | -5–0 | Penalty for ideas likely to break existing systems |
| Repetition Penalty | -10–0 | Penalty if this was tried before (partial: -5, exact: -10) |

Maximum score per critic: **25 points**
Combined maximum: **50 points**

**Era Plausibility — Hard Gate:** Before scoring any dimension, each critic must first ask: *is this idea plausible in the late medieval / early modern period?* If the answer is no, the idea is disqualified entirely and does not receive a score. It is struck from the candidates list with a one-line explanation citing the era constraint. A disqualified idea cannot be appealed — it may only return in a future iteration if reframed in a way that passes the era gate.

#### Critic Output Format

Each critic must produce, for each idea:
```
IDEA: [Name]
CHASM Impact: X/10 — [which axes improve and why]
Bug Fixed: X/5 — [what bug, how severe]
Novelty: X/5 — [is this new?]
System Interaction: X/5 — [what does it touch?]
Implementation Risk: X/0 — [what could break?]
Repetition Penalty: X/0 — [has this been tried?]
TOTAL: XX/25
VERDICT: [One paragraph on why this idea does or does not belong in the top 3]
```

---

### PHASE 3 — DOCUMENT

Create the iteration's library document **before any code is written**.

File: `/docs/library/{iteration#}_{theme}_{timestamp}.md`

The theme should be a 1–3 word description of the dominant idea cluster (e.g., `succession_pressure`, `economic_collapse`, `memory_systems`).

#### Required Sections

```markdown
# Iteration {N}: {Theme}
**Date:** {timestamp}
**CHASM Baseline:** {score}/25
**Quotable Baseline:** {0–3 quotable sentences from pre-iteration log}

## Research Summary
[2–4 paragraphs summarizing what the current system does, what it does well,
what it does poorly, and what critical bugs exist. Reference specific code
locations. Do not repeat the code verbatim — summarize its behavior.]

## Ideas Considered
[Full list of ideas generated, before critic scoring]

## Critic Scores
### Critic A (The Historian)
[Full scoring table]

### Critic B (The Game Designer)
[Full scoring table]

## Combined Rankings
[Ideas sorted by combined score, highest first]

| Rank | Idea | Historian | Designer | Combined | Priority |
|------|------|-----------|----------|----------|----------|
| 1    | ...  | XX        | XX       | XX       | P1       |
| 2    | ...  | XX        | XX       | XX       | P1       |
| 3    | ...  | XX        | XX       | XX       | P1       |
| ...  | ...  | XX        | XX       | XX       | P2       |

## Top 3 Selected
[For each of the top 3, a 1-paragraph implementation brief:
what to build, where in the codebase, what behavior to add,
what existing systems it touches, what success looks like]

## Implementation Log
[Filled in during Phase 4]

## Results
[Filled in after Phase 4]

## CHASM After
[Filled in after Phase 4]

## Quotable Moments (Post-Iteration)
[Filled in after Phase 4]

## Verdict
[Filled in after Phase 4]
```

---

### PHASE 4 — IMPLEMENT

Implement the **top 3 ideas in sequence** — one at a time. Do not implement all three simultaneously.

#### For Each Idea:

**Step 1 — Spawn a Subagent**

The subagent receives:
- The full implementation brief from the library document
- The relevant source files
- The constraint: *"Do not break existing systems. Add, extend, or refine. Do not replace unless replacing a broken system."*
- The test command: `pnpm gen:history` with full world defaults

**Step 2 — Implement**

The subagent implements the idea. Changes must be:
- Self-contained where possible
- Clearly commented with the iteration number and idea name
- Tested for compilation before testing for output

```bash
# Always compile first
pnpm build

# Then generate
pnpm gen:history
```

**Step 3 — Evaluate the Output**

Run `pnpm gen:history` and evaluate the event log using the **Standard Sample Protocol** (Appendix D). Do not score the full log — it is too large for consistent evaluation. The sample must be drawn the same way every time so CHASM scores are comparable across iterations.

**Step 4 — Make the Call**

| Outcome | Condition | Action |
|---|---|---|
| **KEEP** | CHASM delta > 0 AND at least 1 new quotable moment | Commit the change, update library doc |
| **RESPAWN** | CHASM delta = 0 OR change is incomplete/buggy | Respawn subagent with more specific instructions; max 2 respawns per idea |
| **TOSS** | CHASM delta < 0 OR 2 respawns failed OR change breaks existing systems | Revert, note failure in library doc with explanation |

**Respawn Brief Format:**

When respawning, provide the subagent with:
```
PREVIOUS ATTEMPT: [What was tried]
FAILURE MODE: [Why it didn't work — specific, not vague]
REFINED OBJECTIVE: [More specific version of the same goal]
CONSTRAINTS: [What must not be changed]
SUCCESS CRITERIA: [Exactly what the log should show if this works]
```

**Step 5 — Update the Library Document Inline**

After each idea (keep, toss, or respawn), update the `## Implementation Log` section:

```markdown
### Idea 1: {Name}
**Status:** KEPT / TOSSED / RESPAWNED (attempt 2)
**Implementation:** [What was actually built]
**CHASM Delta:** +X
**Quotable Gained:** [New quotable sentence if any]
**Notes:** [Anything unexpected, any downstream effects noticed]
```

---

### PHASE 5 — CLOSE THE ITERATION

After all three ideas have been evaluated:

1. Run `pnpm gen:history` one final time with full world defaults
2. Score the full post-iteration CHASM
3. Find your 3 quotable moments
4. Fill in the `## Results`, `## CHASM After`, `## Quotable Moments`, and `## Verdict` sections
5. Write the Verdict as a single paragraph: what changed, by how much, what the simulation can now do that it couldn't before, and what the next iteration should focus on

**The Verdict becomes the opening brief for the next iteration's Research phase.**

---

### PHASE 6 — WIKI MAINTENANCE

The wiki must be updated **before the next iteration begins**. This is not optional and is not the last thing you do before closing — it is the bridge between iterations. A wiki that lags one iteration behind is a wiki that will mislead the next researcher.

Wiki maintenance is not creative work. It is precise, factual, and surgical. You are recording what is true now, not what you wish were true or what you plan to make true.

#### What to Update

Work through each wiki file and ask: *does this still accurately describe the simulation?*

| Wiki File | Update Trigger |
|---|---|
| `README.md` | Always — update the iteration log at the bottom |
| `systems.md` | Any time a system was added, modified, or removed |
| `event-catalog.md` | Any time new event types were added or existing ones changed |
| `actor-registry.md` | Any time actor traits, types, or behaviors changed |
| `mechanic-glossary.md` | Any time a new mechanic was named or an existing one changed |
| `failure-taxonomy.md` | Any time an idea failed — add or update its failure pattern |
| `chasm-history.md` | Every iteration — add the new row to the score table |
| `world-state.md` | Any time world geography, nation count, or region structure changed |

#### How to Update

- **Do not rewrite sections that did not change.** Precision over completeness. Touch only what iteration N actually affected.
- **Date every change.** Each updated section should have a `*Last updated: Iteration N — {theme}*` line at the top.
- **Remove what is no longer true.** Dead mechanics, retired event types, and renamed systems must be deleted or struck from the wiki. Leaving them in creates false signal for future critics.
- **If you added something to `failure-taxonomy.md`**, check whether any currently planned ideas (from this iteration's Combined Rankings backlog) are variations of the new failure. Flag them.
- **If the code and wiki disagreed** (noted during Phase 1), correct the wiki now. Note the correction in `README.md`'s iteration log.

#### The Wiki Maintenance Checklist

Before closing the iteration, confirm each of the following:

```
[ ] README.md iteration log updated with this iteration's number, theme, CHASM delta, and date
[ ] chasm-history.md has a new row for this iteration
[ ] systems.md reflects any structural changes to the event engine
[ ] failure-taxonomy.md has entries for any ideas that were TOSSED
[ ] Any code/wiki discrepancies found in Phase 1 have been corrected
[ ] No wiki section references a mechanic, system, or event type that no longer exists
[ ] mechanic-glossary.md has definitions for any new terms introduced this iteration
```

Only after this checklist is complete may the iteration be considered closed.

---

### PHASE 7 — LOOP

Return to Phase 1. The next iteration begins with:
- A new library document
- A new CHASM baseline (which should be higher than the last)
- A wiki that accurately reflects the current state of the simulation
- A fresh reading of the wiki index before touching the library or the code
- The previous iteration's Verdict as a guiding light — but not a constraint

The loop has no end. The simulation grows more interesting with every iteration, or it does not, and you find out why.

---

## IDEA GENERATION GUIDE

When generating ideas in Phase 2, draw from these categories. Not all categories need to be represented in every iteration — focus on what the current system lacks.

### Category 1 — Event Chain Systems
Ideas that cause events to spawn, modify, or reference other events. The foundation of the Causality axis.

Examples:
- A war event that generates a refugee crisis event in neighboring nations
- A succession event that spawns a legitimacy crisis if the heir is contested
- A famine event that weakens an army, which then loses a war it would have won
- A treaty event that generates a betrayal event probability over time

### Category 2 — Memory Systems
Ideas that give the simulation a persistent history that future events can reference. The foundation of the Memory axis.

Examples:
- Nations remembering who they were at war with in the last 50 years
- Named figures accumulating a reputation that affects future event outcomes
- Treaties stored as active objects that can be invoked, honored, or broken
- Grudges — events that increase the probability of future conflicts between specific pairs

### Category 3 — Named Actor Systems
Ideas that make individuals matter — not just nations. The foundation of the Heroics axis.

Examples:
- Kings with traits (ambitious, paranoid, pious) that modify which events can fire
- Generals whose track record affects battle outcomes
- Rebel leaders who emerge from specific conditions and can either be crushed or crowned
- Advisors who survive regime changes and carry institutional memory

### Category 4 — Fracture Systems
Ideas that cause nations to break apart, lose territory, or suffer internal instability. The foundation of the Asymmetry axis.

Examples:
- Civil war probability based on succession crises + economic strain + religious tension
- Secessionist regions that gain strength when the center is weak
- Noble houses with their own loyalty scores that can flip
- Colonial overextension — empires that grow too fast collapse faster

### Category 5 — Cross-Nation Cascade Systems
Ideas that make events in one nation affect others. The foundation of the Scale axis.

Examples:
- Economic collapse spreading along trade routes
- Refugee flows that destabilize receiving nations
- Religious schisms that cross borders and realign alliances
- A great power's weakness triggering proxy conflicts among its neighbors

### Category 6 — Bug Fixes with Narrative Payoff
Critical fixes that don't just stop errors but actively improve output quality.

Examples:
- Fixing events that fire with null entity references (and generating the *right* narrative when they fire)
- Fixing succession logic that produces immortal kings
- Fixing war events that resolve instantly with no consequences
- Fixing diplomatic events that fire between nations that have never interacted

---

## RULES OF THE SIMULATION ARCHITECT

These are inviolable. They apply to every iteration, every subagent, every decision.

1. **Full world defaults, always.** Never test with reduced configurations. The simulation must work at scale or it does not work. Scoring is always done via the Standard Sample Protocol — never the full log, never a single nation.

2. **Read before you write.** Every subagent must read the files it will modify before modifying them. No blind rewrites.

3. **Never replace what works.** If a system produces any interesting output, extend it — do not replace it. Replacement is only justified for completely broken systems, and must be documented as such.

4. **Name things.** Anonymous events are weak events. If the system can generate named kings, named battles, named treaties — it must. Names are the difference between `war occurred` and `the Battle of Ashenmoor`.

5. **One idea at a time.** Never implement multiple ideas simultaneously. The CHASM delta must be attributable to a single change.

6. **The log is the ground truth.** Not the code. Not your intuition. The event log is what the simulation produces, and it is the only thing that matters for CHASM scoring.

7. **Document failure.** Failed ideas are as valuable as successful ones. A well-documented failure prevents the same mistake from being made twice. The repetition penalty exists for this reason.

8. **The Quotable Test is never optional.** If you cannot find 3 quotable sentences in the log after an iteration, the iteration failed. Acknowledge it. Learn from it.

9. **Critics are adversarial.** The critics must actually criticize. An idea that scores 22/25 from both critics is probably being evaluated too generously. If every idea in a batch scores high, the critics are not doing their job.

10. **The simulation must surprise you.** If you can predict exactly what the log will say before running it, the simulation is not interesting enough yet.

11. **The wiki is always current.** A stale wiki is an active liability. If you read something in the wiki that is no longer true, correcting it takes priority over everything else in Phase 6. Never carry forward a known inaccuracy.

12. **Subagents read the wiki, not the library.** When briefing a subagent, point it to the relevant wiki sections for system context. Do not ask it to read all prior library documents — that is the researcher's job in Phase 1, not the implementer's job in Phase 4. Give subagents targeted, current knowledge.

13. **The era is a hard constraint, not an aesthetic.** Every idea, event, and mechanic must be plausible in the late medieval / early modern period. This is not about flavor or atmosphere — it is a structural rule that prevents the simulation from drifting into anachronism and losing internal coherence. When in doubt, ask: could this have happened in 1400? If not, it does not belong.

14. **Reload the protocol before every iteration.** The protocol lives at `/docs/PROTOCOL.md`. Read it in full before anything else. The protocol evolves, and operating on a stale version means operating on stale rules.

---

## APPENDIX A — Running the Simulation

```bash
# Standard test (always use this)
pnpm gen:history

# If build errors occur before testing
pnpm build

# Never use reduced configurations for final evaluation
# Development debugging with reduced configs is acceptable,
# but all CHASM scoring must use full world defaults + Standard Sample Protocol
```

Scoring is always performed on a structured sample drawn per **Appendix D**, not the raw full log.

---

## APPENDIX B — Library Document Template

```markdown
# Iteration {N}: {Theme}
**Date:** {YYYY-MM-DD HH:MM}
**Iteration Number:** {N}
**Previous Iteration:** {N-1}_{previous_theme}_{previous_timestamp}
**CHASM Baseline:** {score}/25
  - C (Causality): {x}/5
  - H (Heroics): {x}/5
  - A (Asymmetry): {x}/5
  - S (Scale): {x}/5
  - M (Memory): {x}/5

## Quotable Baseline
> "{sentence from log}"

> "{sentence from log}"

> "{sentence from log}"

*[If fewer than 3 found, note: "Baseline fails quotable test — only X quotable sentences found"]*

## Sample Composition
- Slice 1 (Anchor):    {Nation Name} — most frequent in first 10% of log
- Slice 2 (Neighbor):  {Nation Name} — most interactions with Anchor
- Slice 3 (Distant):   {Nation Name} — farthest/fewest shared events with Anchor
- Slice 4 (Turbulent): {Century/Period} — highest event density ({N} events)
- Slice 5 (Random):    {Nation Name} — index {X} of {N} nations (seed: {last 2 digits of timestamp})

## Research Summary

### Current System Behavior
[What does the history system do right now? Summarize key behaviors, not code.]

### Strengths
[What works well? What is producing interesting output?]

### Weaknesses
[What is producing weak, repetitive, or absent output?]

### Critical Bugs
[List any bugs that are actively suppressing interesting content, with file:line references]

### Prior Iteration Verdict
[Copy the Verdict from the previous iteration's library document here]

## Ideas Considered
1. {Idea Name} — {One sentence description}
2. ...
[Generate at minimum 8 ideas before critic scoring. More is better.]

## Critic Scores

### Critic A — The Historian

| Idea | CHASM | Bug | Novelty | Interaction | Risk | Repeat | Total |
|------|-------|-----|---------|-------------|------|--------|-------|
| ...  | /10   | /5  | /5      | /5          | /0   | /0     | /25   |

**Historian Verdicts:**
[One paragraph per idea on why it does or does not belong in the top 3]

### Critic B — The Game Designer

| Idea | CHASM | Bug | Novelty | Interaction | Risk | Repeat | Total |
|------|-------|-----|---------|-------------|------|--------|-------|
| ...  | /10   | /5  | /5      | /5          | /0   | /0     | /25   |

**Designer Verdicts:**
[One paragraph per idea on why it does or does not belong in the top 3]

## Combined Rankings

| Rank | Idea | Historian | Designer | Combined | Priority |
|------|------|-----------|----------|----------|----------|
| 1    | ...  |           |          |          | P1       |
| 2    | ...  |           |          |          | P1       |
| 3    | ...  |           |          |          | P1       |

## Top 3 Selected

### Idea 1: {Name}
**Combined Score:** {X}/50
**Target Axes:** C / H / A / S / M (circle relevant)
**Files to Modify:** [list]
**Behavior to Add:** [specific description]
**Success Criteria:** [what should appear in the log that doesn't now]

### Idea 2: {Name}
[same format]

### Idea 3: {Name}
[same format]

---

## Implementation Log

### Idea 1: {Name}
**Status:** KEPT / TOSSED / RESPAWNED (attempt {N})
**What Was Built:** [specific description of implementation]
**CHASM Delta:** +{X} or -{X} or 0
**Axes Improved:** C / H / A / S / M
**Quotable Gained:**
> "{new quotable sentence if any}"
**Notes:** [unexpected effects, downstream changes noticed]

### Idea 2: {Name}
[same format]

### Idea 3: {Name}
[same format]

---

## Results

**Ideas Kept:** {N} of 3
**Ideas Tossed:** {N} of 3
**Ideas Respawned:** {N} of 3

## CHASM After

### Per-Slice Scores
| Axis | Slice 1 | Slice 2 | Slice 3 | Slice 4 | Slice 5 | Avg |
|------|---------|---------|---------|---------|---------|-----|
| C — Causality  | /5 | /5 | /5 | /5 | /5 | /5 |
| H — Heroics    | /5 | /5 | /5 | /5 | /5 | /5 |
| A — Asymmetry  | /5 | /5 | /5 | /5 | /5 | /5 |
| S — Scale      | /5 | /5 | /5 | /5 | /5 | /5 |
| M — Memory     | /5 | /5 | /5 | /5 | /5 | /5 |

### Summary
| Axis | Before | After | Delta |
|------|--------|-------|-------|
| C — Causality  | /5 | /5 | +/- |
| H — Heroics    | /5 | /5 | +/- |
| A — Asymmetry  | /5 | /5 | +/- |
| S — Scale      | /5 | /5 | +/- |
| M — Memory     | /5 | /5 | +/- |
| **TOTAL**      | **/25** | **/25** | **+/-** |

## Quotable Moments (Post-Iteration)

> "{sentence 1}"

> "{sentence 2}"

> "{sentence 3}"

*[Pass / Fail quotable test]*

## Verdict

[One paragraph: what changed, by how much, what the simulation can now do that it couldn't before, and what the next iteration should focus on. This paragraph becomes the opening brief for Iteration {N+1}.]
```

---

## APPENDIX C — The Critics' Charter

The critics exist to prevent you from implementing bad ideas. They are not cheerleaders. They are adversarial reviewers whose job is to find reasons why an idea will not work.

A critic who scores every idea highly is a bad critic. A critic who gives the same score to different ideas is a bad critic. A critic who does not engage with the specific code and systems of the simulation is a bad critic.

Good critics ask:
- *Where exactly in the codebase would this fire? Is that path actually reachable?*
- *What happens when this idea interacts with the succession system? The war system? The diplomacy system?*
- *Has this specific behavior been tried before under a different name?*
- *What is the failure mode? What does a bad implementation of this idea look like?*
- *Is this idea solving the right problem, or is it a solution looking for a problem?*

The critics disagree. If Critic A scores an idea 20/25 and Critic B scores it 8/25, that is a signal — the idea is polarizing, and the implementation brief should explicitly address the designer's concerns.

---

## APPENDIX D — Standard Sample Protocol

The full world simulation spans a vast planet. The complete event log cannot be read, scored, or compared consistently across iterations. The Standard Sample Protocol defines **exactly how to extract a scoring sample** — the same way, every time, so that CHASM scores mean something when compared iteration to iteration.

### Why Sampling Must Be Structured

Random sampling introduces scorer bias — you will unconsciously gravitate toward interesting events, inflating scores. Cherry-picking nations you already care about creates false signal. The protocol below removes discretion from the sampling step entirely. You do not choose what to read. The protocol chooses for you.

### The Sample Composition

Every CHASM scoring sample consists of **exactly these five slices**:

---

#### Slice 1 — The Anchor Nation
**How to select:** Take the nation that appears most frequently in the first 10% of the log. If there is a tie, take the one whose name comes first alphabetically. This is your Anchor Nation for this iteration. It will likely be a major power.

**What to read:** All events involving the Anchor Nation across the **full time span** of the log.

**Purpose:** Gives you depth on one nation — enough to see causality chains, memory, and named actors playing out over time. The Anchor Nation is your control — it should be the same tier of power every iteration.

---

#### Slice 2 — The Neighbor
**How to select:** From the Anchor Nation's event log, find the nation it interacts with most (wars, treaties, trade, diplomacy). That is the Neighbor.

**What to read:** All events involving the Neighbor across the **full time span**.

**Purpose:** Tests the Scale axis — do events between the Anchor and the Neighbor ripple, or do they resolve in isolation? Also tests Memory — does the Neighbor remember what the Anchor did to it?

---

#### Slice 3 — The Distant Nation
**How to select:** Find the nation geographically farthest from the Anchor Nation (opposite region, opposite hemisphere if possible). If the log does not include geography markers, take the nation that shares zero events with the Anchor Nation in Slice 1.

**What to read:** All events involving the Distant Nation across the **full time span**.

**Purpose:** Tests whether the simulation has interesting events in quiet corners of the world, not just at the center of power. A world where only great powers have stories is not a world — it is a court.

---

#### Slice 4 — The Turbulent Century
**How to select:** Divide the full time span into equal centuries (or equivalent major time units). Count the total number of events per century across all nations. Take the century with the **highest event density**. Read all events in that century across **all nations**.

**Purpose:** Tests Asymmetry and causality at peak pressure. The most eventful period should be the most interesting — if it isn't, something is wrong with how event density is generated.

---

#### Slice 5 — The Random Draw
**How to select:** Take the total number of nations in the simulation. Generate a random index (use the last two digits of the iteration timestamp as a seed — e.g. timestamp `20240315` → index `15 mod N`). That nation is your Random Draw nation.

**What to read:** All events involving the Random Draw nation across the **full time span**.

**Purpose:** Prevents systematic bias toward major powers. Small, peripheral, and quiet nations must also be interesting. The Random Draw forces you to look at the world's edges.

---

### Scoring the Sample

Score CHASM **once per slice**, then average:

| Axis | Slice 1 | Slice 2 | Slice 3 | Slice 4 | Slice 5 | Average (×5 = axis score) |
|------|---------|---------|---------|---------|---------|--------------------------|
| C — Causality | /5 | /5 | /5 | /5 | /5 | /5 |
| H — Heroics | /5 | /5 | /5 | /5 | /5 | /5 |
| A — Asymmetry | /5 | /5 | /5 | /5 | /5 | /5 |
| S — Scale | /5 | /5 | /5 | /5 | /5 | /5 |
| M — Memory | /5 | /5 | /5 | /5 | /5 | /5 |

Average each axis across the five slices, round to nearest integer, then sum for total CHASM (0–25).

**Note on Slice 4:** Because Slice 4 covers all nations in one century, it naturally has more data than other slices. Apply a conservative hand when scoring it — richness from volume is not the same as richness from design.

### Documenting the Sample

In the library document, record which nations and time period were selected for each slice before scoring. This is mandatory. Future iterations may want to re-score old baselines with a corrected eye, and the sample must be reproducible.

```
## Sample Composition
- Slice 1 (Anchor):    {Nation Name} — most frequent in first 10% of log
- Slice 2 (Neighbor):  {Nation Name} — most interactions with Anchor
- Slice 3 (Distant):   {Nation Name} — farthest from Anchor / zero shared events
- Slice 4 (Turbulent): {Century/Period} — highest event density ({N} events)
- Slice 5 (Random):    {Nation Name} — index {X} of {N} nations (seed: {timestamp digits})
```

### The Quotable Test and Sampling

The Quotable Test is drawn from the **full sample** — all five slices together. You are looking for 3 quotable sentences from anywhere across the sample. If you can only find quotable sentences in Slice 4 (the turbulent century), that is itself a finding worth noting — it suggests interesting events are temporally clustered rather than distributed across the simulation's life.

---

## APPENDIX E — The Wiki

The Wiki lives at `/docs/wiki/`. It is a growing directory of reference documents that together form a complete, current picture of the simulation. The `README.md` index is the only required constant — every other file is defined by what the simulation needs, not by a fixed schema.

### The Wiki is Open-Ended

The files described below are the **recommended starting point**, not the permanent structure. As the simulation grows in complexity, the wiki must grow with it. New systems, new mechanics, new era-specific dynamics — all of these may warrant new wiki pages. Do not hesitate to create them.

**The only rule for new wiki pages:**
1. The file must be registered in `README.md` before it is used
2. The file must have a clear, single-purpose title and a `*Last updated: Iteration {N}*` header
3. The file must be maintained with the same discipline as any other wiki page — it is updated when its content changes, and pruned when it becomes obsolete

A wiki that grows is healthy. A wiki where files exist but are never updated is a liability. If a file has not been touched in five iterations, ask whether it should be merged into another file, archived, or deleted.

### Core Files — The Starting Point

These eight files should exist from Iteration 1. They cover the foundational knowledge any researcher, critic, or subagent needs. They are a floor, not a ceiling.

```
/docs/wiki/
├── README.md              ← Index and iteration log. Always read first.
├── systems.md             ← How the event engine works. Architecture and data flow.
├── event-catalog.md       ← Every event type: what triggers it, what it produces.
├── actor-registry.md      ← Named actor types, traits, and how individuals affect events.
├── mechanic-glossary.md   ← Definitions of every named mechanic in the simulation.
├── failure-taxonomy.md    ← Categorized record of what has failed and why.
├── chasm-history.md       ← Running score table across all iterations.
└── world-state.md         ← World geography, nation count, regions, and time scale.
```

**Examples of wiki pages that might emerge over time** (not prescribed — only create them when the need is real):
- `era-reference.md` — a curated reference on late medieval / early modern history to ground idea generation
- `nation-profiles.md` — depth profiles on nations that recur as Anchor or Neighbor in sampling
- `event-chains.md` — a map of known event chain sequences that produce interesting output
- `probability-tuning.md` — a record of numeric constants that were adjusted and their observed effects
- `quotable-hall-of-fame.md` — the best quotable sentences from all iterations, as a quality benchmark

---

### `README.md` — The Index

The entry point for every researcher, subagent, and critic. Tells you what each file contains and when it was last updated. Also maintains the master iteration log.

**Update trigger:** Every iteration, unconditionally.

```markdown
# Chaos Machine Wiki
*The living knowledge base of the simulation. Always read this file first.*

## What's In Here

| File | Contains | Last Updated |
|------|----------|--------------|
| systems.md | Event engine architecture and data flow | Iteration {N} |
| event-catalog.md | All event types and their behaviors | Iteration {N} |
| actor-registry.md | Actor types, traits, and individual influence | Iteration {N} |
| mechanic-glossary.md | Definitions of named mechanics | Iteration {N} |
| failure-taxonomy.md | Categorized failures and their patterns | Iteration {N} |
| chasm-history.md | CHASM scores across all iterations | Iteration {N} |
| world-state.md | World geography, nations, time scale | Iteration {N} |

## How to Use This Wiki

**If you are a researcher (Phase 1):** Read README.md, then systems.md, then chasm-history.md,
then failure-taxonomy.md. Then read only the files relevant to your focus area.

**If you are a critic (Phase 2):** Read failure-taxonomy.md to apply repetition penalties.
Read systems.md to evaluate implementation feasibility. Read event-catalog.md
to check if a proposed idea already exists under a different name.

**If you are a subagent implementer (Phase 4):** Read only the wiki sections your
implementation brief explicitly points you to. Do not browse — read to task.

## Iteration Log

| # | Theme | Date | CHASM Before | CHASM After | Delta | Notes |
|---|-------|------|--------------|-------------|-------|-------|
| 1 | {theme} | {date} | {X}/25 | {X}/25 | {+/-X} | {one-line summary} |

*Rows are added at the close of each iteration during Phase 6 wiki maintenance.*
```

---

### `systems.md` — System Architecture

A current map of how the simulation's history engine actually works. Written for someone who needs to understand the system well enough to extend it without breaking it.

**Update trigger:** Any iteration that adds, modifies, or removes a system, pipeline stage, or data structure.

```markdown
# System Architecture
*Last updated: Iteration {N} — {theme}*

## Overview

[2–3 sentences describing what the history engine does at the highest level.
What goes in, what comes out, what is the main loop.]

## Core Pipeline

[A step-by-step description of how a simulation run executes.
Not pseudocode — prose. What happens first, what happens next, what produces the log.]

## Data Structures

### Nation
[What fields does a nation have? What matters for event firing?]

### Event
[What does an event object look like? What fields are always present? What are optional?]

### Actor / Ruler
[What does a named individual look like in the data model?]

### [Other key structures]

## Event Firing System

[How does the engine decide which events fire in a given tick?
What are the inputs to that decision? What is the probability model?]

## Systems Inventory

| System | File | What It Does | Status |
|--------|------|--------------|--------|
| War Resolution | src/model/history/war.ts | Resolves armed conflict between nations | Active |
| Succession | src/model/history/succession.ts | Handles ruler death and heir selection | Active |
| Diplomacy | src/model/history/diplomacy.ts | Treaties, alliances, and betrayals | Active |
| [System Name] | [path] | [description] | Active / Buggy / Deprecated |

## Known Architectural Constraints

[Things that cannot be changed without major refactor. Limits subagents should know before designing solutions.]
```

---

### `event-catalog.md` — Event Types

A complete inventory of every event type the simulation can produce. Critics use this to spot duplicates. Subagents use this to understand what already exists before adding new events.

**Update trigger:** Any iteration that adds new event types or changes how existing event types behave.

```markdown
# Event Catalog
*Last updated: Iteration {N} — {theme}*

## How to Read This Catalog

Each entry describes one event type. Fields:
- **Trigger:** What conditions cause this event to fire
- **Produces:** What the event outputs (narrative text, state changes, child events)
- **Chains to:** What other events this event can spawn
- **CHASM axes:** Which CHASM axes this event contributes to
- **Status:** Active / Buggy / Weak (produces output but rarely interesting) / Deprecated

---

## Military Events

### War Declaration
**Trigger:** Hostility score between two nations exceeds threshold X, or a grievance event fires
**Produces:** War state between the two nations; narrative line naming the casus belli
**Chains to:** Battle events, siege events, treaty events, refugee events
**CHASM axes:** C (if triggered by prior event), A (if underdog wins), S (if allies dragged in)
**Status:** Active

### [Event Name]
[same format]

---

## Succession Events

### [Event Name]
[same format]

---

## Diplomatic Events

### [Event Name]
[same format]

---

## Economic Events

### [Event Name]
[same format]

---

## Internal Events

### [Event Name]
[same format]

---

## Deprecated Events

[Events that were removed from the simulation. Keep these here so future iterations
don't accidentally re-implement them, and so critics can apply repetition penalties.]

### [Event Name]
**Deprecated in:** Iteration {N}
**Reason:** [Why it was removed]
```

---

### `actor-registry.md` — Actors and Individuals

Documents how named individuals work in the simulation. The Heroics axis depends entirely on this system being well-designed.

**Update trigger:** Any iteration that changes how rulers, generals, rebels, or other named individuals are generated, stored, or influence events.

```markdown
# Actor Registry
*Last updated: Iteration {N} — {theme}*

## Actor Types

| Type | Description | Can Influence | Generated By |
|------|-------------|---------------|--------------|
| Ruler | The head of state of a nation | War decisions, diplomacy, succession | Succession events |
| General | Military commander | Battle outcomes | War declaration events |
| Rebel Leader | Head of an internal uprising | Civil war probability, event chains | Internal instability events |
| [Type] | [description] | [influence] | [source] |

## Trait System

[Does the simulation have actor traits? If yes, what traits exist and how do they work?
If no, note that traits are not yet implemented — this is a known gap.]

| Trait | Effect | Applies To |
|-------|--------|------------|
| Ambitious | +X% war declaration probability | Rulers |
| Paranoid | +X% purge event probability | Rulers |
| [Trait] | [effect] | [actor type] |

## Individual Persistence

[Do named individuals persist across events? Can a king who signed a treaty
be referenced when that treaty is broken 50 years later? Document the current state.]

## Known Gaps

[What actor-related behaviors are missing that future iterations should address?]
```

---

### `mechanic-glossary.md` — Named Mechanics

Definitions for every named mechanic in the simulation. Prevents subagents from inventing new names for existing concepts, and prevents critics from missing that a proposed idea already exists under a different term.

**Update trigger:** Any iteration that introduces a new mechanic name or changes how an existing mechanic works.

```markdown
# Mechanic Glossary
*Last updated: Iteration {N} — {theme}*

## How to Use This Glossary

When a mechanic is named — in code, in a library document, or in this wiki — its canonical
definition lives here. If you are writing code that uses a mechanic not in this glossary,
add it here during Phase 6. If you are proposing an idea that uses a term from this glossary,
use the canonical definition, not your own interpretation.

---

## A

**Anchor Nation** *(Sampling)* — The nation selected as the primary focus of CHASM scoring
for a given iteration. Selected by frequency in the first 10% of the event log. See Appendix D.

## C

**Causality Chain** *(Event System)* — A sequence of events where each event is triggered
by a preceding event, visible in the log as explicit references between events.
A chain of length 1 is a single caused event. A chain of length 3+ is considered deep causality.

**CHASM Score** *(Evaluation)* — The five-axis scoring rubric for simulation quality.
Axes: Causality, Heroics, Asymmetry, Scale, Memory. Maximum 25 points. See main protocol.

## G

**Grudge State** *(Diplomacy)* — [Define if implemented, or note: "Not yet implemented — proposed in Iteration X"]

## H

**Hostility Score** *(Diplomacy)* — [Define the numeric measure of tension between two nations]

## [Letter]

[Continue alphabetically as mechanics are named]
```

---

### `failure-taxonomy.md` — What Has Failed and Why

The most important file for critics. A structured record of failure patterns — not individual failed ideas, but the *categories* of failure that recur. When a critic sees a proposed idea, they check it against this taxonomy first.

**Update trigger:** Any iteration that TOSSes an idea. The failure pattern is extracted and added or updated here.

```markdown
# Failure Taxonomy
*Last updated: Iteration {N} — {theme}*

## How to Use This File

This file categorizes failure patterns, not individual failed ideas. Individual failures
are recorded in their library documents. This file asks: *why* do ideas fail, in patterns?

When reviewing a proposed idea, check it against every category below. If the idea
matches a failure pattern, apply the repetition penalty in critic scoring and note
the specific pattern it matches.

---

## Category 1 — The Orphan Event

**Pattern:** An event fires and produces output, but nothing references it afterward.
It has no children, no consequences, and no memory. It is a historical fact with no history.

**Why it fails:** Events without downstream effects contribute to Causality at 0.
They may be individually interesting but add no systemic richness.

**What has triggered this pattern:**
- Iteration {N}: [{Idea name}] — [one sentence on how it matched this pattern]

**Approaches that have not worked:**
- [Approach] — [why it didn't fix the pattern]

**Potential fixes not yet tried:**
- [Approach]

---

## Category 2 — The Paper King

**Pattern:** A named ruler exists in the data but has no mechanical influence on events.
Wars start and end regardless of whether the king is aggressive or timid. The name is
decoration, not function.

**Why it fails:** Named actors with no influence contribute to Heroics at 0. The presence
of names without agency is worse than no names at all — it creates the appearance of
richness without the substance.

**What has triggered this pattern:**
- [entries added per iteration]

---

## Category 3 — The Isolated World

**Pattern:** Events in one region have no effect on other regions. Nations exist in
bubbles. A war that devastates one continent leaves its neighbors untouched.

**Why it fails:** Scale scores near 0. The simulation produces many stories but
they are all local and self-contained.

**What has triggered this pattern:**
- [entries added per iteration]

---

## Category 4 — The Amnesiac Civilization

**Pattern:** The simulation generates no references to past events in current events.
No treaty is ever cited when broken. No battle is ever referenced by its name.
No grudge is ever mentioned as the cause of a war.

**Why it fails:** Memory scores near 0. The world feels procedurally generated
rather than historically accumulated.

**What has triggered this pattern:**
- [entries added per iteration]

---

## Category 5 — The Clockwork Succession

**Pattern:** Rulers are generated and replaced on a mechanical schedule with no
dramatic variation. No succession crisis, no contested throne, no regent seizing
power. The calendar turns, kings change, nothing interesting happens.

**Why it fails:** Heroics and Asymmetry both suffer. Succession is one of the highest-
leverage moments in pre-modern history — if it is uninteresting, something structural is wrong.

**What has triggered this pattern:**
- [entries added per iteration]

---

## Category 6 — The Invisible Economy

**Pattern:** Economic events fire (trade, famine, boom) but produce no political
consequences. Nations starve without rebelling. Trade collapses without wars.
Wealth accumulates without it being spent on conquest.

**Why it fails:** Causality suffers — economic events are orphans. The economy
is a closed loop that never interacts with the political or military systems.

**What has triggered this pattern:**
- [entries added per iteration]

---

## [Category N — New patterns added as discovered]
```

---

### `chasm-history.md` — Score History

The single source of truth for CHASM scores across all iterations. One row per iteration. Never modified retroactively — if a score was wrong, add a correction note in a new row rather than editing the old one.

**Update trigger:** Every iteration, unconditionally.

```markdown
# CHASM Score History
*Updated every iteration. One row per iteration. Do not edit past rows.*

| Iter | Theme | Date | C | H | A | S | M | Total | Delta | Sample Anchor |
|------|-------|------|---|---|---|---|---|-------|-------|---------------|
| 0 | baseline | {date} | - | - | - | - | - | -/25 | — | — |
| 1 | {theme} | {date} | {x} | {x} | {x} | {x} | {x} | {x}/25 | {+/-x} | {Anchor nation} |

## Score Trend

[After iteration 5, add a prose paragraph describing the trend.
Which axes have improved most? Which are plateauing? Where is the ceiling?]

## Regression Alerts

[If any iteration shows a negative delta, record it here with a note on the suspected cause.]

| Iteration | Delta | Suspected Cause | Resolved? |
|-----------|-------|-----------------|-----------|
```

---

### `world-state.md` — The World

Current facts about the world the simulation runs in. Nation count, regions, time scale, and any world-level constants that affect event generation.

**Update trigger:** Any iteration that changes world configuration, adds regions, changes the time scale, or modifies world-level constants.

```markdown
# World State
*Last updated: Iteration {N} — {theme}*

## World Configuration

| Parameter | Value | Notes |
|-----------|-------|-------|
| Nation count | {N} | As of full world defaults |
| Regions | {list} | Geographic groupings |
| Time span | {N} years | Full simulation run |
| Tick unit | {year / decade / other} | One tick = one {unit} |
| Starting year | {N} | Arbitrary; used for log display only |

## Regions

[For each region: name, rough description, nations currently assigned to it]

### {Region Name}
**Description:** [Geographic/cultural character]
**Nations:** [{list}]
**Notable dynamics:** [Any region-specific event patterns or quirks]

## World-Level Constants

[Any numeric constants that affect global event probability — stability floors,
war weariness caps, etc. These are the levers that subagents must not touch
without explicit justification.]

| Constant | Value | File | Effect |
|----------|-------|------|--------|
| [name] | [value] | [path:line] | [what it controls] |

## Known World Gaps

[Things about the world model that are incomplete or missing, flagged for future iterations.]
```

---

### Wiki Bootstrap Instructions

The wiki does not exist yet. **Iteration 1's Phase 6 wiki maintenance includes bootstrapping all wiki files from scratch** based on what was learned during Phase 1 research. This is the one exception to the rule that wiki maintenance only touches what changed — in Iteration 1, everything is new.

Bootstrap order:
1. Create `/docs/wiki/` directory
2. Write `world-state.md` first — it grounds everything else
3. Write `systems.md` — maps what currently exists
4. Write `event-catalog.md` — inventories all current event types
5. Write `actor-registry.md` — documents the current actor model
6. Write `mechanic-glossary.md` — define terms encountered during research
7. Write `failure-taxonomy.md` — seed with the 6 pre-defined categories; add entries from Iteration 1 failures
8. Write `chasm-history.md` — add the Iteration 1 row
9. Write `README.md` last — it references all other files

The bootstrap is complete when every file exists and every table in `README.md` shows "Iteration 1" in the Last Updated column.

---

*End of Protocol. The simulation awaits.*
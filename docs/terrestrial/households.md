# Households and held seats (:history)

Every person owns an independent sorted array of held seat IDs. `rulerOf` remains the authority for each seat; `PEOPLE.setRuler` and `PEOPLE.vacate` maintain both directions through `HOLDINGS`. Losing one seat preserves the others. The primary seat has the highest current title rank, with the lowest seat ID breaking ties. No primary seat is stored separately.

## Succession

The engine schedules one death event per holder, including district-only holders. A sparse pending entry stores person revision, due time and pending/processing state. Revisions survive last-seat loss, so reacquisition cannot revive an obsolete heap event. Additional seats reuse the holder's event; a shortened life replaces it. Regent deaths remain separate events.

Dispatch consumes its token before effects and freezes held seats by descending current rank and ascending ID. Each step rechecks ownership and hierarchy: sovereign crowns use their own law, valid districts inherit immediately, and other seats are vacated. A prior merger or transfer can remove a later seat from the walk. Annual district settlement validates and grants seats, and ensures holder events; it does not inherit independently.

## Personal unions

A living heir must be compatible with every held sovereign crown. Districts do not veto unions. Existing group membership follows junior-to-senior union edges only; diplomatic overlords and territorial parents are excluded. Sibling juniors can continue their existing group without a sibling link, even while their dead senior awaits its turn. An incompatible external crown still rejects the heir.

Installation rechecks surviving crowns after each external link. Existing groups retain their senior and edges. Each actual senior–junior edge advances once when both endpoints share the living successor, using a dispatch-local accounted-edge set. New edges start at generation 1; spouse-only shared unions do not advance generations. Merger eligibility is checked immediately after continuation, and removed seats are skipped.

## District elections

Each valid direct local district supplies a population-weighted elector, even when its holder has other districts or a foreign primary. Nomination takes the top three district slots by descending population and ascending seat ID, then deduplicates eligible house seniors without refilling slots. Candidate strength uses the first nomination's weight. Republic patricians vote once per distinct eligible person.

Claimants use their strongest local qualifying district, with seat ID breaking population ties. Hereditary contests without a claimant district use the strongest backing district. Supporting seats are actual local elector seats, excluding the synthetic late-house vote. Ownership and district status are checked before release.

## Historical presentation and reports

The selected-date wiki shows active held titles, primary first, separately from regencies. Lost titles remain in the timeline. Reports sample living people at initialization and integer-year boundaries, assigning each observation to one half-open window and including the final endpoint only in the last window. `heldSeatsHistogram` contains counts for zero, one and at least two seats. `seatsPerHolder` divides total held seats by observations with a seat and is null without holders. `unionHolders` counts observations with at least two sovereign crowns; districts and regencies do not count as crowns.

## Residence and affiliation

Residence is a province, independent of home culture and names. The primary held seat sets a holder’s location; rank changes can change that primary. Losing the last seat leaves residence unchanged. A wedding joins the unlanded spouse to the landed spouse, otherwise to the male spouse. Separately landed spouses stay at their own seats. Relocation carries an unlanded living spouse and living unlanded children under 16 sharing the old location; adults and separately landed relatives stay.

Newborns use the mother’s retained location at birth, including backdated births and dead mothers. A maternal move corrects already-created unborn children. Before their first seal this amends initial residence; afterwards it appends a birth-effective correction without rewriting the emitted snapshot. Initial residence and sparse growable history survive every journal flush and death. The pending log is separate and transferable packet buffers never detach retained history.

Current realm is resolved on demand through the engine’s territorial sovereign callback. Historical realm follows province parent history and maps the sovereign root into its record nation ID. Territorial conquest, annexation and union merger can change realm without a residence row or a resident sweep. District owners, occupation/controllers, diplomatic overlords and personal-union seniority do not replace the territorial sovereign. Unowned land has no realm even when occupied.

Residence lookup selects the greatest effective time at or before selection, with last append winning equal-time ties across packets. Older-effective rows arriving later do not override newer moves. Initial residence applies from birth; before birth and before territorial coverage queries are unavailable. The wiki exposes selected-date residence and realm separately; religion is a realm proxy, not a stored individual faith.

## Residence report metrics

`residenceRows` counts effective rows, including birth corrections, in each window. `sameResidenceRealmChanges` counts living people whose unmoved province changes territorial sovereign, coalescing same-time territorial changes and excluding birth, death and relocation boundaries. Pure occupation or diplomacy contributes zero. Reporting builds occupancy intervals once from the retained record, then joins sorted endpoints with per-province sovereign timelines. No all-person scan occurs per territorial transition. `diagnostics.householdsReportMs` isolates the final offline residence phase from simulation people time.

Marriage-alliance review checks links again after residence changes release a sustaining betrothal, preventing a stale cached alliance from lasting until the next annual review.

## Completed benchmark

DP9.2’s completed report is `stats/history/2026-10-04T12-36-36-387Z-people-3-dp92/933.json`; final DP9.1 is `stats/history/2026-10-04T13-39-53-052Z-people-3-dp91/933.json`, with explicit-baseline HTML comparison and README. Both use seed 14963991, lateMedieval, 204000 points, 867–1800, personality and late knowledge 2.366478320318625, standard diagnostics without profiling.

People created changed 326784→291832; crown successions 13350→13960; multiple-crown observations 18599→19128. Final coverage contains 196059 residence rows and 329763 unmoved realm changes. Household behavior alters marriage composition, births and the shared random stream; no small-shift expectation was supported. Holdings corrections during the residence stage also affect attribution, as described in the report README.

Mean of ten window people times changed 24.677→35.356 ms/year; wall 399.859→513.462 seconds; peak RSS 2814.758→3091.883 MiB. Offline residence reporting took 24.797 seconds separately. These single runs on a shared machine show a substantial overhead and cannot precisely separate algorithm cost, different workload and contention. The expected directions were increased retention and execution time, with no supported magnitude. See [memory measurements](history-record-memory.md#household-retention-measurement) for structure costs.

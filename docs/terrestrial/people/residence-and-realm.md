# Household residence and territorial realm

Scope: `:history`.

Residence is a province where a person lives. Their current territorial realm is derived from that province; it is separate from held titles, birth culture and diplomatic allegiance. [Government and succession](../politics/government-and-succession.md#held-seats-and-primary-title) owns title holdings and primary-seat selection; [person records](../mechanics/person-records.md) owns transport and record validation.

Code: `src/model/history/sim/people/household` and `src/model/history/record/people/query`.

## Residence and affiliation

Residence is a province, independent of home culture and names. The primary held seat sets a holder’s location; rank changes can change that primary. Losing the last seat leaves residence unchanged. A wedding joins the unlanded spouse to the landed spouse, otherwise to the male spouse. Separately landed spouses stay at their own seats. Relocation carries an unlanded living spouse and living unlanded children under 16 sharing the old location; adults and separately landed relatives stay.

Newborns use the mother’s retained location at birth, including backdated births and dead mothers. A maternal move corrects already-created unborn children. Before their first seal this amends initial residence; afterwards it appends a birth-effective correction without rewriting the emitted snapshot. Initial residence and sparse growable history survive every journal flush and death. The pending log is separate and transferable packet buffers never detach retained history.

Current realm is resolved on demand through the engine’s territorial sovereign callback. Historical realm follows province parent history and maps the sovereign root into its record nation ID. Territorial conquest, annexation and union merger can change realm without a residence row or a resident sweep. District owners, occupation/controllers, diplomatic overlords and personal-union seniority do not replace the territorial sovereign. Unowned land has no realm even when occupied.

Residence lookup selects the greatest effective time at or before selection, with last append winning equal-time ties across packets. Older-effective rows arriving later do not override newer moves. Initial residence applies from birth; before birth and before territorial coverage queries are unavailable. The wiki exposes selected-date residence and realm separately; religion is a realm proxy, not a stored individual faith.

## Residence report metrics

`residenceRows` counts effective rows, including birth corrections, in each window. `sameResidenceRealmChanges` counts living people whose unmoved province changes territorial sovereign, coalescing same-time territorial changes and excluding birth, death and relocation boundaries. Pure occupation or diplomacy contributes zero. Reporting builds occupancy intervals once from the retained record, then joins sorted endpoints with per-province sovereign timelines. No all-person scan occurs per territorial transition. `diagnostics.householdsReportMs` isolates the final offline residence phase from simulation people time.

Marriage-alliance review checks links again after residence changes release a sustaining betrothal, preventing a stale cached alliance from lasting until the next annual review.

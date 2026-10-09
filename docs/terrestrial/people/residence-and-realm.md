# Household residence and territorial realm

Scope: `:history`.

Residence is a province where a person lives. Their current territorial realm is derived from that province; it is separate from held titles, birth culture and diplomatic allegiance. [Government and succession](../politics/government-and-succession.md#held-seats-and-primary-title) owns title holdings and primary-seat selection; [person records](../mechanics/person-records.md) owns transport and record validation.

Code: `src/model/history/sim/people/household` and `src/model/history/record/people/query`.

## Residence and affiliation

Residence is a province, independent of home culture and names. The primary held seat sets a holder’s location; rank changes can change that primary. Losing the last seat leaves residence unchanged. A wedding joins the unlanded spouse to the landed spouse, otherwise to the male spouse. Separately landed spouses stay at their own seats. Relocation carries an unlanded living spouse and living unlanded children under 16 sharing the old location; adults and separately landed relatives stay.

Newborns use the mother’s location at birth. A child delivered in the simulation is created at the delivery, so that is where she lives then; no child exists before its birth and nothing needs correcting. Backdated births of founders' families look the mother's location up in her retained history, including for dead mothers. Initial residence and sparse growable history survive every journal flush and death. The pending log is separate and transferable packet buffers never detach retained history.

Current realm is resolved on demand through the engine’s territorial sovereign callback. Historical realm follows province parent history and maps the sovereign root into its record nation ID. Territorial conquest, annexation and union merger can change realm without a residence row or a resident sweep. District owners, occupation/controllers, diplomatic overlords and personal-union seniority do not replace the territorial sovereign. Unowned land has no realm even when occupied.

Residence lookup selects the greatest effective time at or before selection, with last append winning equal-time ties across packets. Older-effective rows arriving later do not override newer moves. Initial residence applies from birth; before birth and before territorial coverage queries are unavailable. The wiki shows a title and the life span in the page subtitle, and the realm and residence province as a Residence row in the stat block, each with a colour swatch and a link. The title is the highest tier of any non-regent seat held (Count/Countess, Duke/Duchess, King/Queen, Emperor/Empress, also for a hegemony). A child of a king, emperor or hegemon is Prince or Princess even when holding a lesser seat, and Crown Prince or Crown Princess when the eldest living son (or, with no living son, the eldest living daughter) of that parent, an assumption because the succession law is not in the record. A person governing as regent for a child ruler is a Lord Protector (man) or, for a woman, a Queen Dowager, Empress Dowager, Dowager Duchess or Dowager Countess by the regency realm's tier when the ward is her child, otherwise Lady Protector; an own king or emperor title takes precedence. The Regencies group is no longer listed on the page. With no seat the title is Noble for a person with a house and Low born without one; religion is a realm proxy, not a stored individual faith.

## Starting households

Both [starting-family stages](families-and-lifecycle.md#starting-families) reconcile every affected survivor, including grandchildren, nephews/nieces and reused district recipients. Historical wedding relocation uses the actual wedding date. Complete held-seat arrays select a holder's primary residence; terminal kin keep their generated closure when granted a seat. Starting families are appended directly, so all residence, marriage and pregnancy references already use permanent live IDs.

## Residence report metrics

`residenceRows` counts effective rows, including birth corrections, in each window. `sameResidenceRealmChanges` counts living people whose unmoved province changes territorial sovereign, coalescing same-time territorial changes and excluding birth, death and relocation boundaries. Pure occupation or diplomacy contributes zero. Reporting builds occupancy intervals once from the retained record, then joins sorted endpoints with per-province sovereign timelines. No all-person scan occurs per territorial transition. `diagnostics.householdsReportMs` isolates the final offline residence phase from simulation people time.

Marriage-alliance review checks links again after residence changes release a sustaining betrothal, preventing a stale cached alliance from lasting until the next annual review.

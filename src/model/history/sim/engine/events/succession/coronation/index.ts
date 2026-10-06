import { ECONOMY } from "@/model/history/sim/engine/economy"
import { TREASURY_BUDGET } from "@/model/history/sim/engine/economy/treasury-budget"
import { CORONATION_COUNTERS } from "@/model/history/sim/engine/events/succession/coronation/counters"
import type { CoronationQuality } from "@/model/history/sim/engine/events/succession/coronation/counters/types"
import type {
	CrownParams,
	ElevateParams,
	FlagCompositeParams,
	HoldCoronationParams,
	HoldDeferredParams,
	QualityParams,
	ResolveParams,
} from "@/model/history/sim/engine/events/succession/coronation/types"
import { SUCCESSION_SYSTEMS } from "@/model/history/sim/engine/events/succession/systems"
import { FIELDS } from "@/model/history/sim/engine/fields"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { STATE } from "@/model/history/sim/engine/state"
import { STATE_TITLES } from "@/model/history/sim/engine/state/titles"
import type { Founding } from "@/model/history/sim/engine/state/titles/types"
import { OPINION } from "@/model/history/sim/people/opinion"
import type { OpinionMemoryReason } from "@/model/history/sim/people/opinion/memory/types"
import { TITLES } from "@/model/society/titles"

// The former kingdom founding fee of 625/36 ducats over the kingdom's minimum
// of 8 provinces.
const REFERENCE_FEE_PER_PROVINCE = 625 / 288
const MULTIPLIER: Record<CoronationQuality, number> = {
	uncrowned: 0,
	humble: 0.5,
	customary: 1,
	lavish: 2,
	magnificent: 4,
}
const REASON: Record<CoronationQuality, OpinionMemoryReason | null> = {
	uncrowned: "coronation_uncrowned",
	humble: "coronation_humble",
	customary: null,
	lavish: "coronation_lavish",
	magnificent: "coronation_magnificent",
}
const CUSTOMARY = CORONATION_COUNTERS.qualities.indexOf("customary")

function referenceFee(rank: number): number {
	return (
		REFERENCE_FEE_PER_PROVINCE *
		TITLES.minSizeForTier({ tier: TITLES.tierOrder[rank] })
	)
}

// The customary ceremony is owed from whatever cash exists; splendour is paid
// only from cash above the safe reserve.
function quality({
	reference,
	treasury,
	safe,
}: QualityParams): CoronationQuality {
	const spare = treasury - safe
	if (MULTIPLIER.magnificent * reference <= spare) return "magnificent"
	if (MULTIPLIER.lavish * reference <= spare) return "lavish"
	if (reference <= treasury) return "customary"
	if (MULTIPLIER.humble * reference <= treasury) return "humble"
	return "uncrowned"
}

function resolve({ state, realm, rank }: ResolveParams): CoronationQuality {
	return quality({
		reference: referenceFee(rank),
		treasury: FIELDS.prov.treasury.get({ state, p: realm }),
		safe: ECONOMY.treasurySafe({ state, p: realm }),
	})
}

// Whether the realm can hold a coronation that is at least customary at the
// rank.
function affords({ state, realm, rank }: ResolveParams): boolean {
	return (
		CORONATION_COUNTERS.qualities.indexOf(resolve({ state, realm, rank })) >=
		CUSTOMARY
	)
}

// The one place a title is founded. The admins are noted before a founding
// redraws the districts, and the ceremony is priced at the rank it leaves the
// realm with. An elevation exists to found its title, so one that creates
// none is no coronation at all; an accession is held either way.
// Returns whether a title was created.
function crown({ state, realm, kind, founding }: CrownParams): boolean {
	const people = state.people
	const before = STATE_TITLES.topTier({ state, realm })
	const holders = new Set(
		SUCCESSION_SYSTEMS.districts({ state, realm }).map(
			(district) => district.person,
		),
	)
	const created =
		founding !== null && STATE_TITLES.found({ state, nation: realm, founding })
	if (kind === "elevation" && !created) return false
	const rank = STATE_TITLES.topTier({ state, realm })
	const grade = resolve({ state, realm, rank })
	const price = MULTIPLIER[grade] * referenceFee(rank)
	if (price > 0) {
		FIELDS.prov.treasury.set({
			state,
			p: realm,
			value: FIELDS.prov.treasury.get({ state, p: realm }) - price,
		})
		const budget = TREASURY_BUDGET.get({ state, p: realm })
		budget.coronationExpenses -= price
		budget.otherChangesTotal -= price
	}
	const reason = REASON[grade]
	let memories = 0
	if (reason)
		for (const holder of holders)
			if (
				OPINION.remember({
					people,
					observer: holder,
					target: people.rulerOf[realm],
					reason,
					time: state.time / STATE.yearMs,
				})
			)
				memories++
	const counters = state.coronations
	const cell = CORONATION_COUNTERS.cell({ kind, rank, quality: grade })
	counters.held[cell]++
	counters.ducats[cell] += price
	counters.memories[cell] += memories
	if (founding === null || !created) return false
	const founded = CORONATION_COUNTERS.cell({
		kind,
		rank: founding.tier,
		quality: grade,
	})
	counters.founded[founded]++
	if (rank > before) counters.raised[founded]++
	return true
}

// A new ruler's coronation. Lapsed titles dissolve, and the realm may found
// one title at or below its own rank; a title above it waits for the yearly
// elevation.
function accede({ state, realm, rng }: HoldCoronationParams): void {
	STATE_TITLES.lapse({ state, nation: realm })
	const top = STATE_TITLES.topTier({ state, realm })
	const founding = STATE_TITLES.electFounding({
		state,
		nation: realm,
		rng,
		qualified: STATE_TITLES.qualified({ state, nation: realm }).filter(
			({ tier }) => tier <= top,
		),
		permits: () => affords({ state, realm, rank: top }),
	})
	crown({ state, realm, kind: "accession", founding })
}

// Held once a new ruler's throne is settled. A regent governs uncrowned: a
// child who acceded is owed the ceremony at sixteen, an incapable ruler never
// has one.
function hold({ state, realm, rng }: HoldCoronationParams): void {
	state.coronationOwed[realm] = -1
	if (state.people.rulerOf[realm] < 0) return
	const regency = GOVERNOR.regency({ state, realm })
	if (!regency) {
		accede({ state, realm, rng })
		return
	}
	if (regency.cause === "minority") {
		state.coronationOwed[realm] = state.leaderRuntime.idx[realm]
		state.coronations.deferred++
	} else state.coronations.incapable++
}

function holdDeferred({ state, realm, leader, rng }: HoldDeferredParams): void {
	const owed = state.coronationOwed[realm]
	state.coronationOwed[realm] = -1
	if (owed !== leader || !STATE.isSovereign({ state, p: realm })) return
	if (GOVERNOR.regency({ state, realm })) {
		state.coronations.incapable++
		return
	}
	state.coronations.majority++
	accede({ state, realm, rng })
}

// A realm is composite while it qualifies for a title above its own rank.
// Returns how many realms are flagged.
function flagComposite({ state, qualifying }: FlagCompositeParams): number {
	state.compositeRealm.fill(0)
	let flagged = 0
	for (const { holder, tier } of qualifying) {
		if (
			state.compositeRealm[holder] ||
			tier <= STATE_TITLES.topTier({ state, realm: holder })
		)
			continue
		state.compositeRealm[holder] = 1
		flagged++
	}
	return flagged
}

// The yearly founding pass. A sitting ruler founds only a title above the
// realm's rank; titles at or below it are left to the next accession. Realms are taken in ascending id and each is crowned before
// the next is considered: a founding can pass titles to another realm, so
// later realms are requalified against the registry as it then stands.
function elevate({ state, rng }: ElevateParams): void {
	const started = performance.now()
	const qualifying = STATE_TITLES.qualifying({ state })
	let flagged = flagComposite({ state, qualifying })
	const fresh = new Map<number, Founding[]>()
	for (const { holder, tier, children } of qualifying) {
		const tiers = fresh.get(holder)
		if (tiers) tiers.push({ tier, children })
		else fresh.set(holder, [{ tier, children }])
	}
	let founded = false
	for (const [realm, tiers] of fresh) {
		if (state.people.rulerOf[realm] < 0 || GOVERNOR.regency({ state, realm }))
			continue
		const top = STATE_TITLES.topTier({ state, realm })
		const founding = STATE_TITLES.electFounding({
			state,
			nation: realm,
			rng,
			qualified: (founded
				? STATE_TITLES.qualified({ state, nation: realm })
				: tiers
			).filter(({ tier }) => tier > top),
			permits: (tier) => affords({ state, realm, rank: tier }),
		})
		if (founding && crown({ state, realm, kind: "elevation", founding }))
			founded = true
	}
	if (founded)
		flagged = flagComposite({
			state,
			qualifying: STATE_TITLES.qualifying({ state }),
		})
	state.coronations.compositeRealmYears += flagged
	state.coronations.elevateMs += performance.now() - started
}

export const CORONATION = { quality, hold, holdDeferred, elevate }

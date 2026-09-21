import { HISTORY } from "@/model/history/record"
import { TITLE_RECORD } from "@/model/history/record/titles"
import { STATE } from "@/model/history/sim/engine/state"
import type { HistoryState as EngineState } from "@/model/history/sim/engine/state/types"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { TITLES } from "@/model/society/titles"
import type {
	EngineYearParams,
	HighestTitleParams,
	TitleRealmParams,
} from "@/test/history-run/title-invariants/types"
import type { YearHookParams } from "@/test/history-run/types"

const SINGLE_HEIR = 3
const SINGLE_HEIR_UNLOCK_YEAR = 1200

function majorityRealm({ engine, title }: TitleRealmParams): number {
	const counts = new Map<number, number>()
	const first = engine.titleMembers.offset[title]
	const last = engine.titleMembers.offset[title + 1]
	for (let i = first; i < last; i++) {
		const owner = engine.sovereignCurrent[engine.titleMembers.list[i]]
		if (owner >= 0) counts.set(owner, (counts.get(owner) ?? 0) + 1)
	}
	const total = last - first
	const tierMinimum = TITLES.minSizeForTier({
		tier: TITLES.tierOrder[engine.titles.tier[title]],
	})
	const need = Math.max(Math.min(total, tierMinimum), Math.floor(total / 2) + 1)
	for (const [owner, count] of counts) if (count >= need) return owner
	return -1
}

function highestTitleOf({ engine, ruler }: HighestTitleParams): number {
	let best = -1
	for (let title = 0; title < engine.titles.count; title++) {
		if (engine.titles.holder[title] !== ruler) continue
		if (best < 0 || engine.titles.tier[title] > engine.titles.tier[best])
			best = title
	}
	return best
}

function checkTitles({ engine, year }: EngineYearParams): void {
	for (let title = 0; title < engine.titles.count; title++) {
		const holder = engine.titles.holder[title]
		if (holder < 0) continue
		const where = `title ${title} in ${year}`
		if (engine.leaderNameSeedCurrent[holder] < 0)
			throw new Error(`${where} held by ${holder} with no ruler`)
		const realm = engine.sovereignCurrent[holder]
		if (realm < 0 || realm !== majorityRealm({ engine, title }))
			throw new Error(`${where} holder ${holder} is not in the majority realm`)
	}
}

function checkVassalSeats({ engine, year }: EngineYearParams): void {
	for (let ruler = 0; ruler < engine.P; ruler++) {
		if (engine.leaderNameSeedCurrent[ruler] < 0) continue
		const highest = highestTitleOf({ engine, ruler })
		if (highest < 0) continue
		const realm = engine.sovereignCurrent[ruler]
		if (realm === ruler) continue
		if (engine.titles.seat[highest] === ruler) continue
		let tied = false
		for (let title = 0; title < engine.titles.count; title++)
			if (
				engine.titles.holder[title] === ruler &&
				engine.titles.tier[title] === engine.titles.tier[highest] &&
				engine.titles.seat[title] === ruler
			)
				tied = true
		if (!tied)
			throw new Error(
				`vassal ${ruler} in ${year} does not sit at a seat of its highest title`,
			)
	}
}

function holderTiers({ engine }: { engine: EngineState }): Uint8Array {
	const tiers = new Uint8Array(engine.P)
	for (let title = 0; title < engine.titles.count; title++) {
		const holder = engine.titles.holder[title]
		if (holder >= 0 && engine.titles.tier[title] > tiers[holder])
			tiers[holder] = engine.titles.tier[title]
	}
	return tiers
}

function checkTree({ engine, year }: EngineYearParams): void {
	const tiers = holderTiers({ engine })
	for (let p = 0; p < engine.P; p++) {
		if (engine.desolate[p]) continue
		const parent = engine.parentCurrent[p]
		if (parent < 0) continue
		const where = `parent ${parent} of ${p} in ${year}`
		if (engine.sovereignCurrent[parent] !== engine.sovereignCurrent[p])
			throw new Error(`${where} is in another realm`)
		if (engine.leaderNameSeedCurrent[parent] < 0)
			throw new Error(`${where} has no ruler`)
		if (
			engine.leaderNameSeedCurrent[p] >= 0 &&
			engine.parentCurrent[parent] >= 0 &&
			tiers[parent] <= tiers[p]
		)
			throw new Error(`${where} does not hold a higher title`)
		let hops = 0
		for (let up = parent; engine.parentCurrent[up] >= 0; )
			if (++hops > engine.P || (up = engine.parentCurrent[up]) === p)
				throw new Error(`liege cycle at ${p} in ${year}`)
	}
}

function checkPeople({ engine, year }: EngineYearParams): void {
	const people = engine.people
	if (!people) throw new Error("History has no people")
	for (let seat = 0; seat < engine.P; seat++) {
		const holder = people.holderOfSeat[seat]
		const nameSeed = engine.leaderNameSeedCurrent[seat]
		if (holder < 0 !== nameSeed < 0)
			throw new Error(`seat ${seat} in ${year}: person and leader disagree`)
		if (holder < 0) continue
		if (nameSeed !== holder)
			throw new Error(`seat ${seat} in ${year}: leader is not the holder`)
		if (people.persons.death[holder] <= year)
			throw new Error(`seat ${seat} in ${year}: dead holder ${holder}`)
	}
}

function checkLaws({ engine, year }: EngineYearParams): void {
	for (let nation = 0; nation < engine.P; nation++) {
		if (
			engine.desolate[nation] ||
			engine.stateless[nation] ||
			engine.parentCurrent[nation] >= 0 ||
			engine.sovereignCurrent[nation] !== nation
		)
			continue
		const tribal =
			GOVERNMENT.govFamilyOfIndex(engine.governmentType[nation]) === "tribal"
		if (tribal && engine.successionLaw[nation] !== 0)
			throw new Error(`tribal nation ${nation} has a ladder law in ${year}`)
		if (
			!tribal &&
			year < SINGLE_HEIR_UNLOCK_YEAR &&
			engine.successionLaw[nation] === SINGLE_HEIR
		)
			throw new Error(`nation ${nation} is single heir in ${year}`)
	}
}

function checkRecord({ engine, record, frame, year }: YearHookParams): void {
	const titles = frame.titles
	if (!titles) throw new Error("Frame has no titles")
	for (let title = 0; title < engine.titles.count; title++) {
		const holder = engine.titles.holder[title]
		if (titles.holder[title] !== holder)
			throw new Error(`record holder of title ${title} differs in ${year}`)
		if (holder < 0) continue
		const realm = TITLE_RECORD.realmOf({ frame, holder })
		if (realm !== frame.provinceNation[engine.sovereignCurrent[holder]])
			throw new Error(
				`record realm of title ${title} differs in ${year}: holder ${holder} record ${realm} engine ${engine.sovereignCurrent[holder]}`,
			)
	}
	if (year % 10 !== 0) return
	const past = frame.timeMs - 5 * STATE.yearMs
	const earlier = HISTORY.frameAt({ state: record, timeMs: past })
	for (let title = 0; title < engine.titles.count; title++) {
		const holder = titles.holder[title]
		if (holder < 0) continue
		const realm = TITLE_RECORD.realmAt({
			record: record.record,
			holder,
			timeMs: past,
		})
		if (realm !== earlier.provinceNation[holder])
			throw new Error(`record realmAt of ${holder} differs at ${year - 5}`)
	}
}

function check(params: YearHookParams): void {
	checkTitles(params)
	checkVassalSeats(params)
	checkTree(params)
	checkPeople(params)
	checkLaws(params)
	checkRecord(params)
}

export const TITLE_INVARIANTS = { check }

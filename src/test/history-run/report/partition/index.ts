import { DERIVE } from "@/model/history/sim/engine/derive"
import type {
	PartitionNoteData,
	PartitionSkipReason,
	UnseatedReason,
} from "@/model/history/sim/engine/events/succession/partition/types"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { ERAS } from "@/model/society/eras"
import { TITLES } from "@/model/society/titles"
import type {
	EndTagParams,
	HeirRealmFate,
	ObserveParams,
	PartitionReport,
	PartitionStateParams,
	PartitionStateReport,
	PartitionTagKind,
	PartitionTracker,
	PendingAbsorption,
	SiblingParams,
	SummarizeParams,
	TribalRealms,
} from "@/test/history-run/report/partition/types"
import { REPORT_STATISTICS } from "@/test/history-run/report/statistics/index"

function median(values: number[]): number {
	return REPORT_STATISTICS.summarize(values).p50
}

function state({ engine }: PartitionStateParams): PartitionStateReport {
	DERIVE.ensureHierarchyClean(engine)
	const tiers = TITLES.tierOrder.length
	const all = new Array<number>(tiers).fill(0)
	const held = new Array<number>(tiers).fill(0)
	const allPartitioning = new Array<number>(tiers).fill(0)
	const heldPartitioning = new Array<number>(tiers).fill(0)
	const { titles } = engine
	for (let title = 0; title < titles.count; title++) {
		const seat = titles.seat[title]
		if (seat < 0) continue
		const tier = titles.tier[title]
		const isHeld = titles.holder[title] >= 0
		all[tier]++
		if (isHeld) held[tier]++
		const realm = engine.sovereignCurrent[seat]
		if (
			realm < 0 ||
			engine.stateless[seat] ||
			!GOVERNMENT.partitionsOfIndex(engine.governmentType[realm])
		)
			continue
		allPartitioning[tier]++
		if (isHeld) heldPartitioning[tier]++
	}
	const share = (count: number[], total: number[]) =>
		Object.fromEntries(
			TITLES.tierOrder
				.map((name, tier) => [name, count[tier] / Math.max(1, total[tier])])
				.slice(1),
		)
	const provinces: Record<string, number[]> = {
		tribal_monarchy: [],
		chiefdom: [],
	}
	const population: Record<string, number[]> = {
		tribal_monarchy: [],
		chiefdom: [],
	}
	for (let p = 0; p < engine.P; p++) {
		if (
			engine.desolate[p] ||
			engine.stateless[p] ||
			engine.parentCurrent[p] >= 0
		)
			continue
		const type = ERAS.governmentTypes[engine.governmentType[p]]
		if (!(type in provinces)) continue
		provinces[type].push(
			STATE.getNationProvinces({ state: engine, root: p }).length,
		)
		population[type].push(STATE.getNationPopulation({ state: engine, root: p }))
	}
	const realms = (type: string): TribalRealms => ({
		count: provinces[type].length,
		medianProvinces: median(provinces[type]),
		medianPopulation: median(population[type]),
	})
	return {
		heldTitleShare: share(held, all),
		heldTitleSharePartitioning: share(heldPartitioning, allPartitioning),
		tribalMonarchies: realms("tribal_monarchy"),
		chiefdoms: realms("chiefdom"),
	}
}

// Each resulting realm's share of the divided realm's population.
function shares(note: PartitionNoteData): number[] {
	return note.realmPopulation.map(
		(population) => population / Math.max(1, note.populationBefore),
	)
}

// 1 / sum of squared shares: 1 when nothing left the realm, 3 for three
// equal parts.
function effectiveRealms(note: PartitionNoteData): number {
	return 1 / shares(note).reduce((sum, share) => sum + share * share, 0)
}

function tracker(): PartitionTracker {
	return {
		cursor: 0,
		tags: new Map(),
		partitions: [],
		skips: [],
		fates: [],
		siblingWarYears: [],
		siblingUnionYears: [],
	}
}

function siblings({ tracker: tracked, a, b }: SiblingParams): boolean {
	const first = tracked.tags.get(a)
	const second = tracked.tags.get(b)
	return (
		first !== undefined &&
		second !== undefined &&
		first.partition === second.partition
	)
}

function endTag({
	tracker: tracked,
	tag,
	year,
	fate,
	samePartition,
}: EndTagParams): void {
	if (tracked.tags.get(tag.root) === tag) tracked.tags.delete(tag.root)
	if (tag.kind !== "heir") return
	tracked.fates.push({
		year,
		fate,
		samePartition,
		lifetimeYears: year - tag.startYear,
	})
}

// Reads the engine notes written since the last call, then ends the lifetime
// of every tracked realm that stopped being sovereign. Call once a year.
function observe({ engine, tracker: tracked }: ObserveParams): void {
	const absorbed: PendingAbsorption[] = []
	for (; tracked.cursor < engine.events.length; tracked.cursor++) {
		const note = engine.events[tracked.cursor]
		const year = note.time / STATE.yearMs
		if (note.tag === "partition skipped")
			tracked.skips.push({
				year,
				reason: note.data.reason as PartitionSkipReason,
			})
		else if (note.tag === "partition") {
			const data = note.data as PartitionNoteData
			const previous = tracked.tags.get(data.nation)
			if (previous)
				endTag({
					tracker: tracked,
					tag: previous,
					year,
					fate: "partitionedAgain",
					samePartition: false,
				})
			const generation = (previous?.generation ?? 0) + 1
			const partition = tracked.partitions.length
			let regencies = 0
			for (let index = tracked.cursor - 1; index >= 0; index--) {
				const earlier = engine.events[index]
				if (earlier.time !== note.time) break
				if (
					earlier.tag === "regency started" &&
					data.seats.includes(earlier.data.nation as number)
				)
					regencies++
			}
			tracked.partitions.push({ year, generation, regencies, data })
			const tag = (root: number, kind: PartitionTagKind) =>
				tracked.tags.set(root, {
					root,
					partition,
					kind,
					generation,
					startYear: year,
				})
			tag(data.nation, "primary")
			for (const seat of data.seats) tag(seat, "heir")
		} else if (note.tag === "war started") {
			if (
				siblings({
					tracker: tracked,
					a: note.data.attacker as number,
					b: note.data.defender as number,
				})
			)
				tracked.siblingWarYears.push(year)
		} else if (note.tag === "personal union formed") {
			if (
				siblings({
					tracker: tracked,
					a: note.data.junior as number,
					b: note.data.senior as number,
				})
			)
				tracked.siblingUnionYears.push(year)
		} else if (note.tag === "personal union merged") {
			const tag = tracked.tags.get(note.data.junior as number)
			if (tag)
				endTag({
					tracker: tracked,
					tag,
					year,
					fate: "mergedByUnion",
					samePartition: siblings({
						tracker: tracked,
						a: note.data.junior as number,
						b: note.data.senior as number,
					}),
				})
		} else if (note.tag === "ruler deposed") {
			const tag = tracked.tags.get(note.data.nation as number)
			if (!tag) continue
			tracked.tags.delete(tag.root)
			absorbed.push({ tag, year })
		}
	}
	const year = engine.time / STATE.yearMs
	DERIVE.ensureHierarchyClean(engine)
	for (const tag of [...tracked.tags.values()])
		if (!STATE.isSovereign({ state: engine, p: tag.root })) {
			tracked.tags.delete(tag.root)
			absorbed.push({ tag, year })
		}
	for (const { tag, year: endYear } of absorbed) {
		const absorber = engine.sovereignCurrent[tag.root]
		const sibling =
			absorber !== tag.root &&
			tracked.tags.get(absorber)?.partition === tag.partition
		endTag({
			tracker: tracked,
			tag,
			year: endYear,
			fate: sibling ? "absorbedBySibling" : "absorbedByOther",
			samePartition: sibling,
		})
	}
}

function summarize({
	engine,
	tracker: tracked,
	from,
	to,
	divideMs,
}: SummarizeParams): PartitionReport {
	const within = (year: number) => year >= from && year < to
	const partitions = tracked.partitions.filter((entry) => within(entry.year))
	const notes = partitions.map((entry) => entry.data)
	const skipped: Record<PartitionSkipReason, number> = {
		"not child line": 0,
		"no junior heir": 0,
		"no free seat": 0,
	}
	for (const skip of tracked.skips)
		if (within(skip.year)) skipped[skip.reason]++
	const skips = Object.values(skipped).reduce((sum, count) => sum + count, 0)
	const heirsUnseated: Record<UnseatedReason, number> = {
		"no seat": 0,
		"reserved seat unavailable": 0,
		"share dropped": 0,
	}
	const titlesLost: Record<string, number> = Object.fromEntries(
		TITLES.tierOrder.slice(1).map((name) => [name, 0]),
	)
	let heirRealms = 0
	let sameTier = 0
	let primaryRankDrops = 0
	let adminsSeatedVacant = 0
	let adminsBumped = 0
	let adminsLandless = 0
	let joinedDistricts = 0
	let releasedRealms = 0
	const releasedShares: number[] = []
	const largestJunior: number[] = []
	for (const note of notes) {
		for (const reason of note.unseatedReasons) heirsUnseated[reason]++
		for (const tier of note.titlesLostTier) titlesLost[TITLES.tierOrder[tier]]++
		const population = shares(note)
		const primaryRank = note.realmRank[0]
		if (primaryRank < note.primaryRankBefore) primaryRankDrops++
		let largest = 0
		for (const [index, kind] of note.realmKind.entries()) {
			if (kind === "heir") {
				heirRealms++
				if (note.realmRank[index] === primaryRank) sameTier++
				largest = Math.max(largest, population[index])
			} else if (kind === "released") {
				releasedRealms++
				releasedShares.push(population[index])
			}
		}
		largestJunior.push(largest)
		for (const [index, seat] of note.adminTo.entries()) {
			if (seat < 0) adminsLandless++
			else if (note.adminBumped[index]) adminsBumped++
			else adminsSeatedVacant++
		}
		joinedDistricts += note.joinedDistricts.length
	}
	const fates = tracked.fates.filter((entry) => within(entry.year))
	const count = (fate: HeirRealmFate) =>
		fates.filter((entry) => entry.fate === fate).length
	let standingInUnion = 0
	let standingInUnionSamePartition = 0
	let standingAlone = 0
	for (const tag of tracked.tags.values()) {
		if (tag.kind !== "heir") continue
		const partners = [...engine.relationColumns[tag.root]].filter((other) => {
			const relation = STATE.getRelation({
				state: engine,
				a: tag.root,
				b: other,
			})
			return (
				relation === STATE.rel.PU_SENIOR || relation === STATE.rel.PU_JUNIOR
			)
		})
		if (partners.length === 0) standingAlone++
		else {
			standingInUnion++
			if (
				partners.some((other) =>
					siblings({ tracker: tracked, a: tag.root, b: other }),
				)
			)
				standingInUnionSamePartition++
		}
	}
	return {
		partitions: partitions.length,
		titleShares: notes.reduce(
			(sum, note) =>
				sum + note.shareKind.filter((kind) => kind === "title").length,
			0,
		),
		districtShares: notes.reduce(
			(sum, note) =>
				sum + note.shareKind.filter((kind) => kind === "district").length,
			0,
		),
		skipped,
		rate: partitions.length / Math.max(1, partitions.length + skips),
		heirsSeated: notes.reduce((sum, note) => sum + note.heirs.length, 0),
		heirsUnseated,
		newRealms: REPORT_STATISTICS.summarize(
			notes.map((note) => note.heirs.length),
		),
		primaryPopulationShare: REPORT_STATISTICS.summarize(
			notes.map((note) => shares(note)[0]),
		),
		primaryProvinceShare: REPORT_STATISTICS.summarize(
			notes.map(
				(note) => note.realmProvinces[0] / Math.max(1, note.provincesBefore),
			),
		),
		largestJuniorShare: REPORT_STATISTICS.summarize(largestJunior),
		effectiveRealms: REPORT_STATISTICS.summarize(notes.map(effectiveRealms)),
		sameTierShare: sameTier / Math.max(1, heirRealms),
		titlesLost,
		primaryRankDrops,
		fates: {
			mergedByUnion: count("mergedByUnion"),
			mergedByUnionSamePartition: fates.filter(
				(entry) => entry.fate === "mergedByUnion" && entry.samePartition,
			).length,
			absorbedBySibling: count("absorbedBySibling"),
			absorbedByOther: count("absorbedByOther"),
			partitionedAgain: count("partitionedAgain"),
			standingInUnion,
			standingInUnionSamePartition,
			standingAlone,
			medianLifetimeYears: median(
				fates
					.filter((entry) => entry.fate !== "partitionedAgain")
					.map((entry) => entry.lifetimeYears),
			),
		},
		siblingWars: tracked.siblingWarYears.filter(within).length,
		siblingUnions: tracked.siblingUnionYears.filter(within).length,
		generation: REPORT_STATISTICS.summarize(
			partitions.map((entry) => entry.generation),
		),
		maxGeneration: Math.max(0, ...partitions.map((entry) => entry.generation)),
		regencies: partitions.reduce((sum, entry) => sum + entry.regencies, 0),
		adminsSeatedVacant,
		adminsBumped,
		adminsLandless,
		joinedDistricts,
		releasedRealms,
		releasedPopulationShare: REPORT_STATISTICS.summarize(releasedShares),
		divideMs,
	}
}

export const PARTITION_REPORT = {
	state,
	shares,
	effectiveRealms,
	tracker,
	observe,
	summarize,
}

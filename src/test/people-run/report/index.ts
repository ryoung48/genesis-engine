import type { WorldFrame } from "@/model/history/world-frame/types"
import { ALLIANCE } from "@/model/people/anchors/alliance"
import { CAST } from "@/model/people/cast"
import { INGEST } from "@/model/people/cast/ingest"
import type { Cast } from "@/model/people/cast/types"
import { HEALTH } from "@/model/people/health"
import { NOBILITY } from "@/model/people/nobility"
import { PERSON_QUERY } from "@/model/people/query"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"
import type {
	MsQuantiles,
	PeopleReport,
	PeopleReportParams,
	QuantileParams,
	Quantiles,
	SampleParams,
} from "@/test/people-run/report/types"

const YEAR = TIME.constants.yearMS
const CHANNEL = 7700
const ADULT_SUCCESSION_AGE = 16

function quantile({ values, share }: QuantileParams): number {
	if (values.length === 0) return 0
	const sorted = values.toSorted((a, b) => a - b)
	return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]
}

function mean(values: number[]): number {
	return values.length === 0
		? 0
		: values.reduce((sum, value) => sum + value, 0) / values.length
}

function spread(values: number[]): Quantiles {
	return {
		mean: mean(values),
		p10: quantile({ values, share: 0.1 }),
		p50: quantile({ values, share: 0.5 }),
		p90: quantile({ values, share: 0.9 }),
	}
}

function ms(values: number[]): MsQuantiles {
	return {
		p50: quantile({ values, share: 0.5 }),
		p95: quantile({ values, share: 0.95 }),
	}
}

function sample({ facts, size, seed, timeMs }: SampleParams): number[] {
	const groups = new Map<string, number[]>()
	const ordered = facts
		.map((fact, at) => ({
			fact,
			roll: HASH.unit({ seed, channel: CHANNEL, salt: at }),
		}))
		.sort((a, b) => a.roll - b.roll)
	for (const { fact } of ordered) {
		const cohort = `${fact.ref.sex}:${timeMs - fact.birthMs < 16 * YEAR ? "minor" : "adult"}`
		const group = groups.get(cohort) ?? []
		group.push(fact.rulerId)
		groups.set(cohort, group)
	}
	const picked: number[] = []
	while (picked.length < Math.min(size, facts.length)) {
		for (const group of groups.values()) {
			const rulerId = group.shift()
			if (rulerId !== undefined) picked.push(rulerId)
			if (picked.length === size) break
		}
	}
	return picked
}

function succession(
	cast: Cast,
	timeMs: number,
): { considered: number; rows: number } {
	let considered = 0
	let rows = 0
	for (const person of cast.persons) {
		const couple = CAST.parentsOf({ cast, person })
		if (!couple) continue
		const deathMs = CAST.lifeOf({ cast, person }).deathMs
		for (const parent of couple) {
			const fact = CAST.factOf({ cast, person: parent })
			if (!fact) continue
			for (const reign of fact.reigns) {
				if (reign.open || reign.endMs > timeMs) continue
				const reigns = cast.anchors.nationReigns.get(reign.nationId) ?? []
				const next = reigns[reigns.indexOf(reign) + 1]
				if (!next || next.rulerId === fact.rulerId) continue
				if (
					person.ruler.kind === "ruler" &&
					person.ruler.ref.rulerId === next.rulerId
				)
					continue
				if (
					person.birthMs > reign.endMs ||
					deathMs <= reign.endMs ||
					(reign.endMs - person.birthMs) / YEAR < ADULT_SUCCESSION_AGE
				)
					continue
				considered++
			}
		}
		rows += PERSON_QUERY.passedOver({ cast, person, timeMs }).length
	}
	return { considered, rows }
}

function of({ state, context, sampleSize }: PeopleReportParams): PeopleReport {
	const record = state.record
	const time = record.maxTimeMs
	const ingestStart = performance.now()
	const cast = INGEST.open({ record, context })
	const ingestFirst = performance.now() - ingestStart
	const facts = [...cast.anchors.facts.values()].filter(
		(fact) => fact.reigns.length > 0,
	)
	const picked = sample({
		facts,
		size: sampleSize,
		seed: cast.worldSeed,
		timeMs: time,
	})
	const pageMs: number[] = []
	const frameMs: number[] = []
	const warmMs: number[] = []
	const adultDeaths: number[] = []
	const firstMarriage = { female: [] as number[], male: [] as number[] }
	const completed: number[] = []
	let aliveAt60 = 0
	let conditionsAt60 = 0
	let aliveAt70 = 0
	let incapableAt70 = 0
	let wives = 0
	let childbirthWives = 0
	const generationStart = performance.now()
	for (const rulerId of picked) {
		let frameSpent = 0
		const timedContext = {
			...context,
			frameAt: (at: number): WorldFrame => {
				const started = performance.now()
				const frame = context.frameAt(at)
				frameSpent += performance.now() - started
				return frame
			},
		}
		const key = PERSON_QUERY.rulerKey(rulerId)
		const started = performance.now()
		PERSON_QUERY.page({ record, context: timedContext, key, timeMs: time })
		pageMs.push(performance.now() - started - frameSpent)
		frameMs.push(frameSpent)
		const warm = performance.now()
		PERSON_QUERY.page({ record, context: timedContext, key, timeMs: time })
		warmMs.push(performance.now() - warm)
	}
	const generationMs = performance.now() - generationStart
	for (const person of cast.persons) {
		const life = CAST.lifeOf({ cast, person })
		if (person.ruler.kind !== "ruler" && life.deathMs <= time) {
			const age = (life.deathMs - person.birthMs) / YEAR
			if (age >= 16) adultDeaths.push(age)
		}
		const reached = (years: number) =>
			life.deathMs >= person.birthMs + years * YEAR &&
			person.birthMs + years * YEAR <= time
		if (reached(60)) {
			aliveAt60++
			if (
				HEALTH.at({ life, timeMs: person.birthMs + 60 * YEAR }).levels.some(
					(level) => level >= 0,
				)
			)
				conditionsAt60++
		}
		if (reached(70)) {
			aliveAt70++
			if (HEALTH.incapable({ life, timeMs: person.birthMs + 70 * YEAR }))
				incapableAt70++
		}
		const first = person.marriages
			.map((id) => cast.marriages[id])
			.find((marriage) => marriage.kind !== "origin" && marriage.kind !== "gap")
		if (first && person.house)
			(person.sex === 1 ? firstMarriage.female : firstMarriage.male).push(
				(first.startMs - person.birthMs) / YEAR,
			)
	}
	for (const marriage of cast.marriages) {
		const wife = cast.persons[marriage.wife]
		const endMs = CAST.endOf({ cast, marriage })
		if (
			marriage.startMs <= wife.birthMs + 30 * YEAR &&
			endMs >= wife.birthMs + 45 * YEAR &&
			marriage.cursor.closed
		)
			completed.push(marriage.children.length)
		if (marriage.startMs <= wife.birthMs + 30 * YEAR) {
			wives++
			if (
				marriage.pregnancies.some(
					(pregnancy) => pregnancy.outcome === "childbirth death",
				)
			)
				childbirthWives++
		}
	}
	const tiers: Record<string, number> = {}
	let free = 0
	let kin = 0
	for (const marriage of cast.marriages) {
		if (marriage.kind !== "free") continue
		free++
		if (marriage.kinship) kin++
		for (const id of [marriage.husband, marriage.wife]) {
			const person = cast.persons[id]
			if (person.parents.kind !== "none") continue
			const tier = NOBILITY.tierOf({ cast, person, timeMs: marriage.startMs })
			tiers[tier] = (tiers[tier] ?? 0) + 1
		}
	}
	const spouses = Object.values(tiers).reduce((sum, count) => sum + count, 0)
	const snapshot = {
		persons: cast.persons.length,
		marriages: cast.marriages.length,
		stats: { ...cast.stats },
	}
	const passed = succession(cast, time)
	const placementStart = performance.now()
	for (const fact of facts)
		if (fact.kin) INGEST.ruler({ cast, rulerId: fact.rulerId })
	for (const tie of cast.anchors.ties) {
		ALLIANCE.start({ cast, tie })
		INGEST.drain(cast)
	}
	const placementMs = performance.now() - placementStart
	const placed: Record<string, number> = {}
	const first: Record<string, number> = {}
	for (const placement of cast.placements) {
		placed[placement.requested] = (placed[placement.requested] ?? 0) + 1
		if (placement.first)
			first[placement.requested] = (first[placement.requested] ?? 0) + 1
	}
	const resolved = cast.anchors.ties.filter((tie) => tie.status !== "pending")
	let allianceRows = 0
	for (const union of cast.unions) {
		const id = cast.rulerPerson.get(union.successor)
		if (id === undefined) continue
		if (!PERSON_QUERY.unionLinked({ cast, person: cast.persons[id], union }))
			allianceRows++
	}
	return {
		rulers: facts.length,
		persons: snapshot.persons,
		castSize: cast.persons.length,
		marriages: snapshot.marriages,
		relabelShare: Object.fromEntries(
			Object.entries(placed).map(([relation, count]) => [
				relation,
				1 - (first[relation] ?? 0) / count,
			]),
		),
		placed,
		unfilledTieShare:
			resolved.filter((tie) => tie.status === "unfilled").length /
			Math.max(1, resolved.length),
		ties: cast.anchors.ties.length,
		childrenPerCompletedCouple: mean(completed),
		completedCouples: completed.length,
		adultDeathAge: spread(adultDeaths),
		firstMarriageAge: {
			female: mean(firstMarriage.female),
			male: mean(firstMarriage.male),
		},
		conditionShareAt60: conditionsAt60 / Math.max(1, aliveAt60),
		incapableShare: incapableAt70 / Math.max(1, aliveAt70),
		childbirthDeathShare: childbirthWives / Math.max(1, wives),
		frameMs: ms(frameMs),
		warmMs: ms(warmMs),
		pageMs: ms(pageMs),
		ingestMs: { first: ingestFirst },
		placementMs,
		generationMs,
		generatedPages: picked.length,
		castSpouseShare:
			snapshot.stats.castSpouses /
			Math.max(1, snapshot.stats.castSpouses + snapshot.stats.createdSpouses),
		passedOverShare: passed.rows / Math.max(1, passed.considered),
		passedOverRows: passed.rows,
		revealedLaterCount: cast.stats.revealedLater,
		reservedUnfit: cast.stats.reservedUnfit,
		unrecordedParentCount: cast.stats.unrecordedParents,
		allianceRows,
		nobility: {
			freeMarriages: free,
			lowbornShare: (tiers[-1] ?? 0) / Math.max(1, spouses),
			tierShare: Object.fromEntries(
				Object.entries(tiers).map(([tier, count]) => [
					tier,
					count / Math.max(1, spouses),
				]),
			),
			kinMarriageShare: kin / Math.max(1, free),
		},
	}
}

export const PEOPLE_REPORT = { of }

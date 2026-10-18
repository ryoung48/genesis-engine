import { HISTORY } from "@/model/history/record"
import type { WorldFrame } from "@/model/history/world-frame/types"
import { HEALTH } from "@/model/people/health"
import { NOBILITY } from "@/model/people/nobility"
import { PERSON_QUERY } from "@/model/people/query"
import { PEOPLE_STORE } from "@/model/people/store"
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

function sample({ facts, size, seed, timeMs }: SampleParams): string[] {
	const groups = new Map<string, string[]>()
	const ordered = facts
		.map((fact, at) => ({
			fact,
			roll: HASH.unit({ seed, channel: CHANNEL, salt: at }),
		}))
		.sort((a, b) => a.roll - b.roll)
	for (const { fact } of ordered) {
		const cohort = `${fact.ref.sex}:${timeMs - fact.birthMs < 16 * YEAR ? "minor" : "adult"}`
		const group = groups.get(cohort) ?? []
		group.push(fact.key)
		groups.set(cohort, group)
	}
	const picked: string[] = []
	while (picked.length < Math.min(size, facts.length)) {
		for (const group of groups.values()) {
			const key = group.shift()
			if (key) picked.push(key)
			if (picked.length === size) break
		}
	}
	return picked
}

function of({
	state,
	doctrine,
	geography,
	sampleSize,
}: PeopleReportParams): PeopleReport {
	const record = state.record
	const frameAt = (timeMs: number): WorldFrame =>
		HISTORY.frameAt({ state, timeMs })
	const shared = PEOPLE_STORE.reset({ record })
	const indexStart = performance.now()
	const index = PEOPLE_STORE.index(shared)
	const indexMs = performance.now() - indexStart
	const facts = [...index.facts.values()].filter(
		(fact) => fact.reigns.length > 0,
	)
	const time = record.maxTimeMs
	const picked = sample({
		facts,
		size: sampleSize,
		seed: shared.worldSeed,
		timeMs: time,
	})
	const pageMs: number[] = []
	const frameMs: number[] = []
	const warmMs: number[] = []
	const builds = { l1: 0, l2: 0, l3: 0 }
	const adultDeaths: number[] = []
	const firstMarriage = { female: [] as number[], male: [] as number[] }
	const completed: number[] = []
	let aliveAt60 = 0
	let conditionsAt60 = 0
	let aliveAt70 = 0
	let incapableAt70 = 0
	let wives = 0
	let childbirthWives = 0
	const store = shared
	const generationStart = performance.now()
	for (const key of picked) {
		let frameSpent = 0
		const timed = (at: number): WorldFrame => {
			const started = performance.now()
			const frame = frameAt(at)
			frameSpent += performance.now() - started
			return frame
		}
		const started = performance.now()
		PERSON_QUERY.page({
			store,
			key,
			timeMs: time,
			frameAt: timed,
			doctrine,
			geography,
		})
		pageMs.push(performance.now() - started - frameSpent)
		frameMs.push(frameSpent)
		const warm = performance.now()
		PERSON_QUERY.page({
			store,
			key,
			timeMs: time,
			frameAt: timed,
			doctrine,
			geography,
		})
		warmMs.push(performance.now() - warm)
	}
	const generationMs = performance.now() - generationStart
	builds.l1 = store.builds.l1.size
	builds.l2 = store.builds.l2.size
	builds.l3 = store.builds.l3.size
	for (const stub of store.stubs.values()) {
		if (!stub.life) continue
		const life = stub.life
		if (stub.kind !== "ruler" && life.deathMs <= time) {
			const age = (life.deathMs - stub.birthMs) / YEAR
			if (age >= 16) adultDeaths.push(age)
		}
		const reached = (years: number) =>
			life.deathMs >= stub.birthMs + years * YEAR &&
			stub.birthMs + years * YEAR <= time
		if (reached(60)) {
			aliveAt60++
			if (
				HEALTH.at({ life, timeMs: stub.birthMs + 60 * YEAR }).levels.some(
					(level) => level >= 0,
				)
			)
				conditionsAt60++
		}
		if (reached(70)) {
			aliveAt70++
			if (HEALTH.incapable({ life, timeMs: stub.birthMs + 70 * YEAR }))
				incapableAt70++
		}
	}
	for (const chain of store.chains.values()) {
		const first = chain.marriages[0]
		if (first) {
			const husband = store.stubs.get(first.husband)
			const wife = store.stubs.get(first.wife)
			if (husband && wife) {
				firstMarriage.male.push((first.startMs - husband.birthMs) / YEAR)
				firstMarriage.female.push((first.startMs - wife.birthMs) / YEAR)
			}
		}
		for (const marriage of chain.marriages) {
			const wife = store.stubs.get(marriage.wife)
			if (!wife) continue
			const wifeLife = wife.life
			if (
				marriage.startMs <= wife.birthMs + 30 * YEAR &&
				marriage.endMs >= wife.birthMs + 45 * YEAR
			)
				completed.push(marriage.children.length)
			if (marriage.startMs <= wife.birthMs + 30 * YEAR) {
				wives++
				if (
					wifeLife &&
					marriage.pregnancies.some(
						(pregnancy) => pregnancy.outcome === "childbirth death",
					)
				)
					childbirthWives++
			}
		}
	}
	const pages = Math.max(1, picked.length)
	const tiers: Record<string, number> = {}
	let free = 0
	let kin = 0
	for (const marriage of new Set(store.marriages.values())) {
		if (marriage.kind !== "free") continue
		free++
		if (marriage.kinship) kin++
		for (const spouseKey of [marriage.husband, marriage.wife]) {
			const stub = store.stubs.get(spouseKey)
			if (stub?.kind !== "spouse") continue
			const tier = NOBILITY.tierOf({
				store,
				stub,
				timeMs: marriage.startMs,
			})
			tiers[tier] = (tiers[tier] ?? 0) + 1
		}
	}
	let claimed = 0
	for (const list of store.claims.values()) claimed += list.length
	const spouses = Object.values(tiers).reduce((sum, count) => sum + count, 0)
	const placed: Record<string, number> = {}
	const first: Record<string, number> = {}
	for (const placement of index.placements) {
		placed[placement.requested] = (placed[placement.requested] ?? 0) + 1
		if (placement.first)
			first[placement.requested] = (first[placement.requested] ?? 0) + 1
	}
	return {
		rulers: facts.length,
		persons: store.stubs.size,
		relabelShare: Object.fromEntries(
			Object.entries(placed).map(([relation, count]) => [
				relation,
				1 - (first[relation] ?? 0) / count,
			]),
		),
		placed,
		unfilledTieShare:
			index.ties.filter((tie) => !tie.filled).length /
			Math.max(1, index.ties.length),
		ties: index.ties.length,
		indexMs,
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
		layerBuilds: {
			l1: builds.l1 / pages,
			l2: builds.l2 / pages,
			l3: builds.l3 / pages,
		},
		frameMs: ms(frameMs),
		warmMs: ms(warmMs),
		pageMs: ms(pageMs),
		generationMs,
		generatedPages: picked.length,
		nobility: {
			freeMarriages: free,
			claimedShare: claimed / Math.max(1, free),
			lowbornShare: (tiers[-1] ?? 0) / Math.max(1, spouses + claimed),
			tierShare: Object.fromEntries(
				Object.entries(tiers).map(([tier, count]) => [
					tier,
					count / Math.max(1, spouses),
				]),
			),
			seededRealms: store.seeded.size,
			holdersCreated: store.holders.size,
			kinMarriageShare: kin / Math.max(1, free),
		},
	}
}

export const PEOPLE_REPORT = { of }

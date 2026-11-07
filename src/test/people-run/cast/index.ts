import { ALLIANCE } from "@/model/people/anchors/alliance"
import { CAST } from "@/model/people/cast"
import { INGEST } from "@/model/people/cast/ingest"
import type { Cast } from "@/model/people/cast/types"
import { KINSHIP } from "@/model/people/marriage/kinship"
import { SPOUSE } from "@/model/people/marriage/spouse"
import { NOBILITY } from "@/model/people/nobility"
import { PERSON_QUERY } from "@/model/people/query"
import type { PersonPage } from "@/model/people/query/types"
import { HASH } from "@/model/shared/random/hash"
import { TIME } from "@/model/shared/time"
import { PEOPLE_FIXTURE } from "@/test/history-run/fixtures/people"
import type {
	CompareMarriagesParams,
	CompareShownParams,
	FiguresParams,
	GrownFigures,
	MarriageShot,
	PassedOverCount,
	PassedOverCountParams,
	PickParams,
	QualifiesParams,
	Scenario,
} from "@/test/people-run/cast/types"

const YEAR = TIME.constants.yearMS
const POINTS = 204000
const FIRST = 50
const SECOND = 50
const GROW_YEARS = 150
const MARGIN = 2 * YEAR
const SPOUSE_AGE = {
	male: { min: 18, max: 69 },
	female: { min: 16, max: 44 },
}

function shownKey(page: PersonPage): Map<string, unknown> {
	const out = new Map<string, unknown>()
	const { groups, timeline, ...rest } = page
	out.set("page", rest)
	for (const group of groups)
		for (const member of group.members)
			out.set(`${group.label}/${member.key}`, member)
	for (const row of timeline)
		out.set(`row/${row.timeMs}/${row.type}/${row.text}`, row)
	return out
}

function pick({ cast, count, skip }: PickParams): number[] {
	return [...cast.anchors.facts.values()]
		.filter((fact) => fact.reigns.length > 0 && !skip.has(fact.rulerId))
		.map((fact) => ({
			id: fact.rulerId,
			roll: HASH.unit({
				seed: cast.worldSeed,
				channel: 9100,
				salt: fact.rulerId,
			}),
		}))
		.sort((a, b) => a.roll - b.roll)
		.slice(0, count)
		.map((entry) => entry.id)
}

function snapshotMarriages(cast: Cast): Map<number, MarriageShot> {
	return new Map(
		cast.marriages.map((marriage) => [
			marriage.id,
			{
				shownUntil: Math.max(
					cast.persons[marriage.husband].generatedUntil,
					cast.persons[marriage.wife].generatedUntil,
				),
				startMs: marriage.startMs,
				kind: marriage.kind,
				children: marriage.children.map((child) => [child.id, child.birthMs]),
				pregnancies: marriage.pregnancies.map((pregnancy) => [
					pregnancy.conceptionMs,
					pregnancy.dueMs,
					pregnancy.outcome,
				]),
			},
		]),
	)
}

function compareMarriages({ before, cast }: CompareMarriagesParams): number {
	let violations = 0
	for (const [id, shot] of before) {
		const marriage = cast.marriages[id]
		if (marriage.startMs !== shot.startMs || marriage.kind !== shot.kind) {
			violations++
			continue
		}
		for (const [childId, birthMs] of shot.children)
			if (
				!marriage.children.some(
					(child) => child.id === childId && child.birthMs === birthMs,
				)
			)
				violations++
		for (const [conceptionMs, dueMs, outcome] of shot.pregnancies)
			if (
				!marriage.pregnancies.some(
					(pregnancy) =>
						pregnancy.conceptionMs === conceptionMs &&
						pregnancy.dueMs === dueMs &&
						pregnancy.outcome === outcome,
				)
			)
				violations++
		for (const child of marriage.children)
			if (
				child.birthMs <= shot.shownUntil &&
				!shot.children.some(([childId]) => childId === child.id) &&
				!cast.persons[child.id].revealedLater &&
				!child.planned
			)
				violations++
	}
	return violations
}

function compareShown({ before, after }: CompareShownParams): string[] {
	const old = shownKey(before)
	const next = shownKey(after)
	const problems: string[] = []
	for (const [key, value] of old) {
		if (!next.has(key)) {
			problems.push(`missing ${key}`)
			continue
		}
		const a = value as Record<string, unknown>
		const b = next.get(key) as Record<string, unknown>
		const fields = Object.keys(a).filter(
			(field) =>
				field !== "revealed" &&
				!(field === "deathMs" && a[field] === Infinity) &&
				JSON.stringify(a[field]) !== JSON.stringify(b[field]),
		)
		if (fields.length > 0) problems.push(`changed ${key} [${fields.join(",")}]`)
	}
	return problems
}

function qualifies({
	cast,
	owner,
	other,
	startMs,
	fromMs,
	tier,
	realms,
}: QualifiesParams): boolean {
	const bounds = other.sex === 1 ? SPOUSE_AGE.female : SPOUSE_AGE.male
	const window = other.sex === 1 ? [-10, 2] : [-2, 10]
	const age = (startMs - other.birthMs) / YEAR
	const ownerAge = (startMs - owner.birthMs) / YEAR
	if (other.sex === owner.sex || other.id === owner.id) return false
	if (age < bounds.min || age > bounds.max) return false
	if (age - ownerAge < window[0] || age - ownerAge > window[1]) return false
	if (other.generatedUntil > startMs) return false
	const deathMs = CAST.lifeOf({ cast, person: other }).deathMs
	if (deathMs <= startMs) return false
	for (const id of other.marriages) {
		const marriage = cast.marriages[id]
		const exclusive =
			marriage.wife === other.id ||
			(marriage.kind !== "plural" && marriage.kind !== "concubine")
		if (
			exclusive &&
			CAST.endOf({ cast, marriage }) > fromMs &&
			(marriage.betrothedMs ?? marriage.startMs) < deathMs
		)
			return false
	}
	if (NOBILITY.tierOf({ cast, person: other, timeMs: startMs }) !== tier)
		return false
	if (!realms.has(NOBILITY.realmOf({ cast, person: other, timeMs: startMs })))
		return false
	return KINSHIP.allowed({ cast, first: owner, second: other })
}

function passedOverCount({
	cast,
	timeMs,
}: PassedOverCountParams): PassedOverCount {
	let expected = 0
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
				const successor = next
					? cast.anchors.facts.get(next.rulerId)
					: undefined
				if (!successor || successor.rulerId === fact.rulerId) continue
				if (
					person.ruler.kind === "ruler" &&
					person.ruler.ref.rulerId === successor.rulerId
				)
					continue
				if (person.birthMs > reign.endMs || deathMs <= reign.endMs) continue
				const sonOfLate =
					successor.kin?.relation === "son" &&
					successor.kin.late.rulerId === fact.rulerId
				const outranks = sonOfLate
					? person.birthMs < successor.birthMs &&
						(person.sex === 0 || person.sex === successor.ref.sex)
					: (reign.endMs - person.birthMs) / YEAR >= 16
				if (outranks) expected++
			}
		}
		rows += PERSON_QUERY.passedOver({ cast, person, timeMs }).length
	}
	return { expected, rows }
}

function succession(cast: Cast, timeMs: number): number {
	let considered = 0
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
					(reign.endMs - person.birthMs) / YEAR < 16
				)
					continue
				considered++
			}
		}
	}
	return considered
}

function run(): Scenario {
	const fixture = PEOPLE_FIXTURE.create({ years: 150, points: POINTS })
	const record = fixture.state.record
	const cast = INGEST.open({ record, context: fixture.context })
	let spouseViolations = 0
	let spouseSearches = 0
	const original = SPOUSE.choose
	SPOUSE.choose = (params) => {
		const before = cast.persons.length
		const result = original(params)
		if (!result || result.id < before) return result
		const { owner, startMs, betrothedMs } = params
		const seat = NOBILITY.seatOf({ cast, person: owner, timeMs: startMs })
		const frame = CAST.snappedFrame({ cast, timeMs: startMs })
		const nation = frame?.provinceNation[seat] ?? -1
		if (!frame || nation < 0) return result
		const rank = NOBILITY.draw({ cast, owner, startMs })
		if (rank.lowborn) return result
		spouseSearches++
		const realms = new Set([
			nation,
			...NOBILITY.ringOf({ cast, nationId: nation, timeMs: startMs }),
		])
		for (let id = 0; id < before; id++)
			if (
				qualifies({
					cast,
					owner,
					other: cast.persons[id],
					startMs,
					fromMs: betrothedMs ?? startMs,
					tier: rank.tier,
					realms,
				})
			) {
				spouseViolations++
				break
			}
		return result
	}
	const firstTimeMs = record.maxTimeMs - MARGIN
	const ids = pick({ cast, count: FIRST, skip: new Set() })
	const pageMs: number[] = []
	const show = (rulerId: number, timeMs: number): PersonPage => {
		const key = PERSON_QUERY.rulerKey(rulerId)
		const started = performance.now()
		const outcome = PERSON_QUERY.page({
			record,
			context: fixture.context,
			key,
			timeMs,
		})
		pageMs.push(performance.now() - started)
		if (outcome?.kind !== "page") throw new Error(`No page for ${key}`)
		return outcome.page
	}
	const born = ids.filter((rulerId) => {
		const fact = cast.anchors.facts.get(rulerId)
		return fact !== undefined && fact.birthMs <= firstTimeMs
	})
	const firstShown = new Map(
		born.map((rulerId) => [rulerId, show(rulerId, firstTimeMs)]),
	)
	const marriagesBefore = snapshotMarriages(cast)
	const lives = new Map(
		cast.persons.map((person) => [
			person.id,
			{
				deathMs: person.life.deathMs,
				rows: JSON.stringify(
					person.life.rows.filter((row) => row.timeMs <= firstTimeMs),
				),
			},
		]),
	)
	const ingestMs: number[] = []
	for (let year = 0; year < GROW_YEARS; year++) {
		fixture.advance(1)
		const started = performance.now()
		INGEST.open({ record, context: fixture.context })
		ingestMs.push(performance.now() - started)
	}
	const secondTimeMs = record.maxTimeMs - MARGIN
	const regions = new Set(
		born.flatMap((rulerId) =>
			(cast.anchors.facts.get(rulerId)?.reigns ?? []).map(
				(reign) => reign.nationId,
			),
		),
	)
	const second = pick({ cast, count: 1000, skip: new Set(ids) })
		.filter((rulerId) => {
			const fact = cast.anchors.facts.get(rulerId)
			return (
				fact !== undefined &&
				fact.birthMs <= secondTimeMs &&
				fact.reigns.some((reign) => regions.has(reign.nationId))
			)
		})
		.slice(0, SECOND)
	for (const rulerId of second) show(rulerId, secondTimeMs)
	for (const rulerId of born) {
		const person = PERSON_QUERY.resolve(cast, PERSON_QUERY.rulerKey(rulerId))
		for (const parent of CAST.parentsOf({ cast, person }) ?? [])
			PERSON_QUERY.page({
				record,
				context: fixture.context,
				key: PERSON_QUERY.keyOf(parent),
				timeMs: firstTimeMs,
			})
	}
	const changed: string[] = []
	for (const [rulerId, before] of firstShown)
		changed.push(...compareShown({ before, after: show(rulerId, firstTimeMs) }))
	let lifeDrift = 0
	for (const [id, snap] of lives) {
		const life = CAST.lifeOf({ cast, person: cast.persons[id] })
		const rows = JSON.stringify(
			life.rows.filter((row) => row.timeMs <= firstTimeMs),
		)
		if (rows !== snap.rows) lifeDrift++
		if (snap.deathMs !== Infinity && life.deathMs !== snap.deathMs) lifeDrift++
	}
	SPOUSE.choose = original
	return {
		fixture,
		cast,
		firstTimeMs,
		secondTimeMs,
		changed,
		structural: compareMarriages({ before: marriagesBefore, cast }),
		lifeDrift,
		spouseViolations,
		spouseSearches,
		ingestMs,
		pageMs,
	}
}

function quantile(values: number[], share: number): number {
	const sorted = values.toSorted((a, b) => a - b)
	return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]
}

function figures({ scenario }: FiguresParams): GrownFigures {
	const { cast } = scenario
	const pages = scenario.pageMs.length
	const considered = succession(cast, scenario.secondTimeMs)
	const counted = passedOverCount({ cast, timeMs: scenario.secondTimeMs })
	for (const fact of cast.anchors.facts.values())
		if (fact.kin) INGEST.ruler({ cast, rulerId: fact.rulerId })
	for (const tie of cast.anchors.ties) {
		ALLIANCE.start({ cast, tie })
		INGEST.drain(cast)
	}
	const placed: Record<string, number> = {}
	const first: Record<string, number> = {}
	for (const placement of cast.placements) {
		placed[placement.requested] = (placed[placement.requested] ?? 0) + 1
		if (placement.first)
			first[placement.requested] = (first[placement.requested] ?? 0) + 1
	}
	const resolved = cast.anchors.ties.filter((tie) => tie.status !== "pending")
	const { castSpouses, createdSpouses } = cast.stats
	return {
		points: POINTS,
		pages,
		changed: scenario.changed.length,
		structural: scenario.structural,
		lifeDrift: scenario.lifeDrift,
		castSize: cast.persons.length,
		castSpouseShare: castSpouses / Math.max(1, castSpouses + createdSpouses),
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
		passedOverShare: counted.rows / Math.max(1, considered),
		revealedLaterCount: cast.stats.revealedLater,
		reservedUnfit: cast.stats.reservedUnfit,
		unrecordedParentCount: cast.stats.unrecordedParents,
		deathContradictions: cast.stats.deathContradictions,
		ingestMs: {
			p50: quantile(scenario.ingestMs, 0.5),
			p95: quantile(scenario.ingestMs, 0.95),
			max: quantile(scenario.ingestMs, 1),
		},
		pageMs: {
			p50: quantile(scenario.pageMs, 0.5),
			p95: quantile(scenario.pageMs, 0.95),
		},
	}
}

export const CAST_SCENARIO = { run, passedOverCount, figures }

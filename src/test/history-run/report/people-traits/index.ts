import { ECONOMY } from "@/model/history/sim/engine/economy"
import { GOVERNOR } from "@/model/history/sim/engine/governor"
import { KNOWLEDGE } from "@/model/history/sim/engine/knowledge"
import { STATE } from "@/model/history/sim/engine/state"
import { ATTRIBUTES } from "@/model/history/sim/people/attributes"
import type { Attribute } from "@/model/history/sim/people/attributes/types"
import { CHARACTER } from "@/model/history/sim/people/character"
import { HEALTH } from "@/model/history/sim/people/health"
import { STRESS } from "@/model/history/sim/people/stress"
import { TRAITS } from "@/model/history/sim/people/traits"
import type {
	AccumulateParams,
	AppliedEffectSampleParams,
	CharacterGroup,
	CharacterGroupStatistics,
	CharacterPopulation,
	CharacterReport,
	CharacterReportParams,
	CharacterSampleParams,
	CharacterTracker,
	GroupAccumulator,
	PopulationAccumulator,
	TercileParams,
	ValidateCharacterParams,
} from "@/test/history-run/report/people-traits/types"

const NAMES = [
	"diplomacy",
	"martial",
	"stewardship",
	"intrigue",
	"learning",
	"prowess",
] as const
function group(): GroupAccumulator {
	return {
		observations: 0,
		attributes: Object.fromEntries(
			NAMES.map((name) => [
				name,
				{
					sum: 0,
					squares: 0,
					tiers: { Terrible: 0, Poor: 0, Average: 0, Good: 0, Excellent: 0 },
					histogram: Array(38).fill(0),
				},
			]),
		) as unknown as GroupAccumulator["attributes"],
		personality: {},
		grades: {},
		congenital: {},
		carried: {},
		stress: [0, 0, 0, 0],
		stressedNonRulers: 0,
	}
}
function population(): PopulationAccumulator {
	return { all: group(), adults: group(), minors: group() }
}
function tracker(): CharacterTracker {
	return {
		samples: [],
		rulers: population(),
		people: population(),
		enrichment: { rulers: group(), others: group() },
		appliedEffects: {},
	}
}
function accumulate({
	population,
	group,
	engine,
	person,
	sovereigns,
}: AccumulateParams): void {
	const character = CHARACTER.of({ people: engine.people, person })
	const age = engine.time / STATE.yearMs - engine.people.persons.birth[person]
	const targets = [
		population.all,
		age >= 16 ? population.adults : population.minors,
		...(group ? [group] : []),
	]
	for (const name of NAMES) {
		const value = ATTRIBUTES.effective({
			conditions: [],
			character,
			age,
			attribute: name,
		})
		for (const target of targets) {
			const attribute = target.attributes[name]
			attribute.sum += value
			attribute.squares += value * value
			attribute.tiers[ATTRIBUTES.tier(value)]++
			attribute.histogram[value]++
		}
	}
	const carried: string[] = []
	for (const ladder of ["intellect", "physique", "beauty"] as const) {
		const values = TRAITS.grade({ character, ladder })
		if (values.good) carried.push(`${ladder}.good.${values.good}`)
		if (values.bad) carried.push(`${ladder}.bad.${values.bad}`)
	}
	carried.push(
		...TRAITS.congenital({
			character: { ...character, congenital: character.carried },
			age,
		}),
	)
	const lists = {
		personality: TRAITS.active({ character, age }),
		grades: TRAITS.labels({ character, age }),
		congenital: TRAITS.congenital({ character, age }),
		carried,
	}
	for (const target of targets) {
		target.observations++
		target.stress[STRESS.level(engine.people.persons.stress[person])]++
		if (engine.people.persons.stress[person] > 0 && !sovereigns.has(person))
			target.stressedNonRulers++
		for (const key of [
			"personality",
			"grades",
			"congenital",
			"carried",
		] as const)
			for (const name of lists[key])
				target[key][name] = (target[key][name] ?? 0) + 1
	}
}
function summarizeGroup(accumulator: GroupAccumulator): CharacterGroup {
	const n = accumulator.observations
	if (!n) return { observations: 0 }
	const shares = (counts: Record<string, number>) =>
		Object.fromEntries(
			Object.entries(counts).map(([name, count]) => [name, count / n]),
		)
	return {
		observations: n,
		attributes: Object.fromEntries(
			NAMES.map((name) => {
				const a = accumulator.attributes[name]
				const mean = a.sum / n
				return [
					name,
					{
						mean,
						deviation: Math.sqrt(Math.max(0, a.squares / n - mean * mean)),
						tierShares: shares(a.tiers),
						histogram: a.histogram,
					},
				]
			}),
		) as CharacterGroupStatistics["attributes"],
		personalityShares: shares(accumulator.personality),
		gradeShares: shares(accumulator.grades),
		congenitalShares: shares(accumulator.congenital),
		carriedShares: shares(accumulator.carried),
		stressLevelShares: accumulator.stress.map((count) => count / n),
	}
}
function summarizePopulation(
	accumulator: PopulationAccumulator,
): CharacterPopulation {
	return {
		all: summarizeGroup(accumulator.all),
		adults: summarizeGroup(accumulator.adults),
		minors: summarizeGroup(accumulator.minors),
	}
}
function sampleAppliedEffect({
	tracker,
	name,
	attribute,
	value,
	lower,
	upper,
	proxy,
}: AppliedEffectSampleParams): void {
	const a = (tracker.appliedEffects[name] ??= {
		observations: 0,
		delta: 0,
		sum: 0,
		squares: 0,
		lower: 0,
		upper: 0,
	})
	const delta = value - ATTRIBUTES.neutral(attribute)
	const applied = proxy
		? GOVERNOR.candidateStrength(value)
		: GOVERNOR.factor({ attribute, value })
	a.observations++
	a.delta += delta
	a.sum += applied
	a.squares += applied * applied
	if (!proxy) {
		a.lower += Number(applied === lower)
		a.upper += Number(applied === upper)
	}
}
function sample({ engine, tracker, start }: CharacterSampleParams): void {
	const table = engine.people.persons
	const time = engine.time / STATE.yearMs
	const sovereigns = new Set<number>()
	for (let realm = 0; realm < engine.P; realm++) {
		const person = engine.people.rulerOf[realm]
		if (person >= 0 && STATE.isSovereign({ state: engine, p: realm }))
			sovereigns.add(person)
	}
	if ((Math.round(time) - start) % 10 === 0)
		for (const person of engine.people.alive) {
			const adult = time - table.birth[person] >= 16
			accumulate({
				population: tracker.people,
				group: adult
					? sovereigns.has(person)
						? tracker.enrichment.rulers
						: tracker.enrichment.others
					: null,
				engine,
				person,
				sovereigns,
			})
		}
	for (let seat = 0; seat < engine.P; seat++) {
		const person = engine.people.rulerOf[seat]
		if (
			person >= 0 &&
			!STATE.isSovereign({ state: engine, p: seat }) &&
			table.heldSeats[person].includes(seat)
		)
			sampleAppliedEffect({
				tracker,
				name: "candidateProxy",
				attribute: "diplomacy",
				value: GOVERNOR.personAttribute({
					state: engine,
					person,
					attribute: "diplomacy",
				}),
				lower: 0,
				upper: 0,
				proxy: true,
			})
	}
	const growth = new Float64Array(engine.P)
	const counts = new Uint32Array(engine.P)
	const worldKnowledge = KNOWLEDGE.realmKnowledge({
		state: engine,
		provinces: Array.from(engine.knowledgeCurrent.keys()),
	})
	for (let p = 0; p < engine.P; p++)
		if (!engine.desolate[p]) {
			const realm = STATE.getSovereign({ state: engine, p })
			if (realm < 0) continue
			growth[realm] += KNOWLEDGE.ownAdvance({
				knowledge: engine.knowledgeCurrent[p],
				worldKnowledge,
				development: engine.developmentCurrent[p],
			})
			counts[realm]++
		}
	for (let realm = 0; realm < engine.P; realm++) {
		const person = engine.people.rulerOf[realm]
		if (person < 0 || !STATE.isSovereign({ state: engine, p: realm })) continue
		accumulate({
			population: tracker.rulers,
			group: null,
			engine,
			person,
			sovereigns,
		})
		const character = CHARACTER.of({ people: engine.people, person })
		const age = time - table.birth[person]
		const attributes = Object.fromEntries(
			NAMES.map((attribute) => [
				attribute,
				ATTRIBUTES.effective({
					conditions: HEALTH.attributeConditions({
						people: engine.people,
						person,
					}),
					character,
					age,
					attribute,
				}),
			]),
		) as Record<Attribute, number>
		const regency = GOVERNOR.regency({ state: engine, realm })
		const regent = regency?.regent ?? -1
		const health = HEALTH.effective({ people: engine.people, person, time })
		const governorAttributes =
			GOVERNOR.of({ state: engine, realm }) === person
				? attributes
				: (Object.fromEntries(
						NAMES.map((attribute) => [
							attribute,
							GOVERNOR.attribute({ state: engine, realm, attribute }),
						]),
					) as Record<Attribute, number>)
		for (const [name, attribute, lower, upper] of [
			["laxity", "diplomacy", -0.1, 0.1],
			["battle", "martial", 0.87, 1.21],
			["revenue", "stewardship", 0.87, 1.21],
			["knowledge", "learning", 0.93, 1.1],
		] as const)
			sampleAppliedEffect({
				tracker,
				name,
				attribute,
				value: governorAttributes[attribute],
				lower,
				upper,
				proxy: false,
			})
		if (
			regent >= 0 &&
			(regency?.kind === "relative" || regency?.kind === "protector")
		)
			sampleAppliedEffect({
				tracker,
				name: "usurpation",
				attribute: "intrigue",
				value: governorAttributes.intrigue,
				lower: 0.5,
				upper: 2,
				proxy: false,
			})
		tracker.samples.push({
			attributes,
			governorAttributes,
			personality: TRAITS.active({ character, age }),
			grades: TRAITS.labels({ character, age }),
			congenital: TRAITS.congenital({ character, age }),
			stress: STRESS.level(table.stress[person]),
			regency: regency !== null,
			ailing: health < 2.5,
			revenue:
				ECONOMY.revenue({ state: engine, p: realm }) /
				Math.max(1, ECONOMY.realmPopulation({ state: engine, p: realm })),
			learningGrowth:
				(growth[realm] / Math.max(1, counts[realm])) *
				GOVERNOR.factor({
					attribute: "learning",
					value: governorAttributes.learning,
				}),
			warChance: GOVERNOR.warChance({ state: engine, realm }),
			regentIntrigue: regent < 0 ? null : governorAttributes.intrigue,
			regentTraits:
				regent < 0
					? []
					: TRAITS.active({
							character: CHARACTER.of({
								people: engine.people,
								person: regent,
							}),
							age: time - table.birth[regent],
						}),
		})
	}
}
function tercile({ values, value }: TercileParams): number {
	return value <= values[Math.floor(values.length / 3)]
		? 0
		: value <= values[Math.floor((2 * values.length) / 3)]
			? 1
			: 2
}
function summarize({
	engine,
	tracker,
	from,
	to,
}: CharacterReportParams): CharacterReport {
	const rows = tracker.samples
	const effects: Record<string, number> = {}
	const cutoffs = Object.fromEntries(
		NAMES.map((name) => [
			name,
			rows.map((row) => row.governorAttributes[name]).sort((a, b) => a - b),
		]),
	) as Record<Attribute, number[]>
	const regentCutoffs = rows
		.flatMap((row) => (row.regentIntrigue === null ? [] : [row.regentIntrigue]))
		.sort((a, b) => a - b)
	for (const [index, label] of ["low", "middle", "high"].entries()) {
		const diplomacy = rows.filter(
			(row) =>
				tercile({
					values: cutoffs.diplomacy,
					value: row.governorAttributes.diplomacy,
				}) === index,
		)
		const stewardship = rows.filter(
			(row) =>
				tercile({
					values: cutoffs.stewardship,
					value: row.governorAttributes.stewardship,
				}) === index,
		)
		const learning = rows.filter(
			(row) =>
				tercile({
					values: cutoffs.learning,
					value: row.governorAttributes.learning,
				}) === index,
		)
		effects[`rebellions.${label}.sovereignYears`] = diplomacy.length
		effects[`revenuePerHead.${label}`] =
			stewardship.reduce((sum, row) => sum + row.revenue, 0) /
			Math.max(1, stewardship.length)
		effects[`ownKnowledgeGrowthPerProvinceYear.${label}`] =
			learning.reduce((sum, row) => sum + row.learningGrowth, 0) /
			Math.max(1, learning.length)
		const regents = rows.filter(
			(row) =>
				row.regentIntrigue !== null &&
				tercile({ values: regentCutoffs, value: row.regentIntrigue }) === index,
		)
		effects[`usurpations.${label}.regentYears`] = regents.length
		effects[`usurpations.${label}.count`] = 0
		effects[`rebellions.${label}.count`] = 0
	}
	for (const label of ["ambitious", "content", "other"]) {
		effects[`usurpations.${label}.regentYears`] = rows.filter(
			(row) =>
				row.regentIntrigue !== null &&
				(label === "other"
					? !row.regentTraits.includes("ambitious") &&
						!row.regentTraits.includes("content")
					: row.regentTraits.includes(label)),
		).length
		effects[`usurpations.${label}.count`] = 0
	}
	for (const label of ["above", "below"]) {
		effects[`warStarts.${label}.sovereignYears`] = rows.filter((row) =>
			label === "above" ? row.warChance > 1 : row.warChance <= 1,
		).length
		effects[`warStarts.${label}.count`] = 0
	}
	for (const label of ["positive", "zero", "negative"]) {
		effects[`battleWins.${label}.battles`] = 0
		effects[`battleWins.${label}.wins`] = 0
	}
	for (const note of engine.events) {
		if (note.time < from * STATE.yearMs || note.time >= to * STATE.yearMs)
			continue
		if (note.tag === "rebellion") {
			const index = tercile({
				values: cutoffs.diplomacy,
				value: Number(note.data.governorDiplomacy),
			})
			effects[`rebellions.${["low", "middle", "high"][index]}.count`]++
		}
		if (note.tag === "battle") {
			const d = Number(note.data.martialDifference)
			const label = d > 0 ? "positive" : d < 0 ? "negative" : "zero"
			effects[`battleWins.${label}.battles`]++
			if (note.data.winner === note.data.attacker)
				effects[`battleWins.${label}.wins`]++
		}
		if (note.tag === "usurpation") {
			const index = tercile({
				values: regentCutoffs,
				value: Number(note.data.regentIntrigue),
			})
			effects[`usurpations.${["low", "middle", "high"][index]}.count`]++
			const traits = note.data.regentTraits as string[]
			const label = traits?.includes("ambitious")
				? "ambitious"
				: traits?.includes("content")
					? "content"
					: "other"
			effects[`usurpations.${label}.count`]++
		}
		if (note.tag === "war started")
			effects[
				`warStarts.${Number(note.data.rulerWarChance) > 1 ? "above" : "below"}.count`
			]++
	}
	for (const label of ["low", "middle", "high"]) {
		effects[`rebellions.${label}.perSovereignYear`] =
			effects[`rebellions.${label}.count`] /
			Math.max(1, effects[`rebellions.${label}.sovereignYears`])
		effects[`usurpations.${label}.perRegentYear`] =
			effects[`usurpations.${label}.count`] /
			Math.max(1, effects[`usurpations.${label}.regentYears`])
	}
	for (const label of ["ambitious", "content", "other"])
		effects[`usurpations.${label}.perRegentYear`] =
			effects[`usurpations.${label}.count`] /
			Math.max(1, effects[`usurpations.${label}.regentYears`])
	for (const label of ["above", "below"])
		effects[`warStarts.${label}.perSovereignYear`] =
			effects[`warStarts.${label}.count`] /
			Math.max(1, effects[`warStarts.${label}.sovereignYears`])
	for (const label of ["positive", "zero", "negative"])
		effects[`battleWins.${label}.winShare`] =
			effects[`battleWins.${label}.wins`] /
			Math.max(1, effects[`battleWins.${label}.battles`])
	const rulers = summarizePopulation(tracker.rulers)
	const people = summarizePopulation(tracker.people)
	const enriched = summarizeGroup(tracker.enrichment.rulers)
	const others = summarizeGroup(tracker.enrichment.others)
	const differences = (
		key: "personalityShares" | "gradeShares" | "congenitalShares",
	) => {
		if (!("attributes" in enriched) || !("attributes" in others)) return {}
		return Object.fromEntries(
			[
				...new Set([
					...Object.keys(enriched[key]),
					...Object.keys(others[key]),
				]),
			].map((name) => [
				name,
				(enriched[key][name] ?? 0) - (others[key][name] ?? 0),
			]),
		)
	}
	const result: CharacterReport = {
		rulers,
		people: {
			...people,
			all:
				"attributes" in people.all
					? {
							...people.all,
							stressedNonRulers: tracker.people.all.stressedNonRulers,
						}
					: people.all,
		},
		enrichment: {
			rulers: enriched,
			others,
			attributeDifferences:
				"attributes" in enriched && "attributes" in others
					? Object.fromEntries(
							NAMES.map((name) => [
								name,
								enriched.attributes[name].mean - others.attributes[name].mean,
							]),
						)
					: {},
			personalityDifferences: differences("personalityShares"),
			gradeDifferences: differences("gradeShares"),
			congenitalDifferences: differences("congenitalShares"),
		},
		appliedEffects: Object.fromEntries(
			Object.entries(tracker.appliedEffects).map(([name, a]) => {
				const mean = a.sum / a.observations
				return [
					name,
					{
						observations: a.observations,
						meanDelta: a.delta / a.observations,
						mean,
						deviation: Math.sqrt(
							Math.max(0, a.squares / a.observations - mean * mean),
						),
						lowerCapShare: a.lower / a.observations,
						upperCapShare: a.upper / a.observations,
					},
				]
			}),
		),
		weakCrownYears: {
			regency: rows.filter((row) => row.regency).length,
			ailing: rows.filter((row) => row.ailing).length,
			stress: rows.filter((row) => row.stress === 3).length,
		},
		effects,
	}
	Object.assign(tracker, PEOPLE_TRAITS_REPORT.tracker())
	return result
}
function validate({ engine }: ValidateCharacterParams): number {
	const table = engine.people.persons
	for (let person = 0; person < table.birth.length; person++) {
		const character = CHARACTER.of({ people: engine.people, person })
		const traits = TRAITS.draw({ table, person })
		const attributes = ATTRIBUTES.draw({ table, person })
		for (const name of ["bases"] as const)
			if (character[name] !== attributes[name])
				throw new Error(
					`Person ${person}: ${name} does not match final parents`,
				)
		for (const name of [
			"personality",
			"grades",
			"congenital",
			"carried",
		] as const)
			if (character[name] !== traits[name])
				throw new Error(
					`Person ${person}: ${name} does not match final parents`,
				)
		if (
			character.congenital & character.carried ||
			(character.congenital & 3) === 3
		)
			throw new Error(`Person ${person}: incompatible congenital state`)
		for (const ladder of ["intellect", "physique", "beauty"] as const) {
			const grade = TRAITS.grade({ character, ladder })
			if (
				(grade.good > 0 && grade.good <= Math.max(0, grade.active)) ||
				(grade.bad > 0 && grade.bad <= Math.max(0, -grade.active))
			)
				throw new Error(`Person ${person}: invalid carried ${ladder}`)
		}
	}
	return table.birth.length
}
export const PEOPLE_TRAITS_REPORT = {
	validate,
	tracker,
	sample,
	summarize,
}

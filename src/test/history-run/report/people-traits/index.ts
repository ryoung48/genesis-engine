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
	CharacterDistribution,
	CharacterReport,
	CharacterReportParams,
	CharacterSampleParams,
	CharacterTracker,
	DistributionParams,
	ShareParams,
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
function tracker(): CharacterTracker {
	return { samples: [] }
}
function sample({ engine, tracker }: CharacterSampleParams): void {
	const table = engine.people.persons
	const time = engine.time / STATE.yearMs
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
		const character = CHARACTER.of({ people: engine.people, person })
		const age = time - table.birth[person]
		const attributes = Object.fromEntries(
			NAMES.map((attribute) => [
				attribute,
				ATTRIBUTES.effective({ conditions: [], character, age, attribute }),
			]),
		) as Record<Attribute, number>
		const regency = GOVERNOR.regency({ state: engine, realm })
		const regent = regency?.regent ?? -1
		const band = HEALTH.band({
			birth: table.birth[person],
			death: table.death[person],
			time,
		})
		const governorAttributes =
			GOVERNOR.of({ state: engine, realm }) === person
				? attributes
				: (Object.fromEntries(
						NAMES.map((attribute) => [
							attribute,
							GOVERNOR.attribute({ state: engine, realm, attribute }),
						]),
					) as Record<Attribute, number>)
		tracker.samples.push({
			attributes,
			governorAttributes,
			personality: TRAITS.active({ character, age }),
			grades: TRAITS.labels({ character, age }),
			congenital: TRAITS.congenital({ character, age }),
			stress: STRESS.level(table.stress[person]),
			regency: regency !== null,
			ailing: band === "Poor" || band === "Grave",
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
function distribution({ values }: DistributionParams): CharacterDistribution {
	const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
	const tierShares: Record<string, number> = {
		Terrible: 0,
		Poor: 0,
		Average: 0,
		Good: 0,
		Excellent: 0,
	}
	for (const value of values)
		tierShares[ATTRIBUTES.tier(value)] += 1 / Math.max(1, values.length)
	return {
		mean,
		deviation: Math.sqrt(
			values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
				Math.max(1, values.length),
		),
		tierShares,
	}
}
function shares({ values, denominator }: ShareParams): Record<string, number> {
	const result: Record<string, number> = {}
	for (const rows of values)
		for (const name of rows)
			result[name] = (result[name] ?? 0) + 1 / Math.max(1, denominator)
	return result
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
	const n = rows.length
	const attributes = Object.fromEntries(
		NAMES.map((name) => [
			name,
			distribution({ values: rows.map((row) => row.attributes[name]) }),
		]),
	) as Record<Attribute, CharacterDistribution>
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
	const table = engine.people.persons
	const carried: string[][] = []
	let births = 0
	for (let person = 0; person < table.birth.length; person++)
		if (
			table.recorded[person] &&
			table.birth[person] >= from &&
			table.birth[person] < to
		) {
			births++
			const character = CHARACTER.of({ people: engine.people, person })
			const unseen: string[] = []
			for (const ladder of ["intellect", "physique", "beauty"] as const) {
				const values = TRAITS.grade({ character, ladder })
				if (values.good) unseen.push(`${ladder}.good.${values.good}`)
				if (values.bad) unseen.push(`${ladder}.bad.${values.bad}`)
			}
			unseen.push(
				...TRAITS.congenital({
					character: { ...character, congenital: character.carried },
					age: 16,
				}),
			)
			carried.push(unseen)
		}
	const result: CharacterReport = {
		rulerYears: n,
		attributes,
		personalityShares: shares({
			values: rows.map((row) => row.personality),
			denominator: n,
		}),
		gradeShares: shares({
			values: rows.map((row) => row.grades),
			denominator: n,
		}),
		congenitalShares: shares({
			values: rows.map((row) => row.congenital),
			denominator: n,
		}),
		carriedShares: shares({ values: carried, denominator: births }),
		recordedBirths: births,
		stressLevelShares: [0, 1, 2, 3].map(
			(level) =>
				rows.filter((row) => row.stress === level).length / Math.max(1, n),
		),
		weakCrownYears: {
			regency: rows.filter((row) => row.regency).length,
			ailing: rows.filter((row) => row.ailing).length,
			stress: rows.filter((row) => row.stress === 3).length,
		},
		effects,
	}
	tracker.samples = []
	return result
}
function validate({ engine }: ValidateCharacterParams): number {
	const table = engine.people.persons
	for (let person = 0; person < table.birth.length; person++) {
		const character = CHARACTER.of({ people: engine.people, person })
		const traits = TRAITS.draw({ table, person })
		const attributes = ATTRIBUTES.draw({ table, person, character })
		for (const name of ["bases", "education"] as const)
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

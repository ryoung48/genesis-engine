import { TRAITS } from "@/model/history/sim/people/traits"
import { RELIGION } from "@/model/history/sim/religion"
import { RELIGION_DOCTRINE } from "@/model/history/sim/religion/doctrine"
import type {
	CorrelationParams,
	GenderReligionReportParams,
	ReligionReportParams,
} from "@/test/history-run/report/religion/types"

function ranks(values: number[]): number[] {
	const sorted = [...values].sort((a, b) => a - b)
	return values.map(
		(value) => (sorted.indexOf(value) + sorted.lastIndexOf(value)) / 2,
	)
}
function correlation({ first, second }: CorrelationParams): number | null {
	if (first.length < 2) return null
	const a = ranks(first),
		b = ranks(second)
	const meanA = a.reduce((a, b) => a + b, 0) / a.length,
		meanB = b.reduce((a, b) => a + b, 0) / b.length
	let covariance = 0,
		varianceA = 0,
		varianceB = 0
	for (let index = 0; index < a.length; index++) {
		const x = a[index] - meanA,
			y = b[index] - meanB
		covariance += x * y
		varianceA += x * x
		varianceB += y * y
	}
	return varianceA && varianceB
		? covariance / Math.sqrt(varianceA * varianceB)
		: null
}
function summarize({
	religionTypes,
	religionFamilies,
	religionDoctrine: doctrine,
}: ReligionReportParams) {
	if (!religionTypes || !religionFamilies || !doctrine) return null
	const width = RELIGION_DOCTRINE.groups.length,
		familyCount = doctrine.familyOptions.length / width
	const familyTypes = new Uint8Array(familyCount)
	const representatives = new Int32Array(familyCount).fill(-1)
	let finalDifferences = 0,
		unchanged = 0,
		clericalRuleCases = 0
	const head = RELIGION_DOCTRINE.groups.findIndex(
			(group) => group.name === "head_of_faith",
		),
		clergy = RELIGION_DOCTRINE.groups.findIndex(
			(group) => group.name === "theocracy",
		)
	for (let religion = 0; religion < religionTypes.length; religion++) {
		const family = religionFamilies[religion]
		familyTypes[family] = religionTypes[religion]
		representatives[family] = religion
		let differences = 0
		for (let group = 0; group < width; group++)
			if (
				doctrine.options[religion * width + group] !==
				doctrine.familyOptions[family * width + group]
			)
				differences++
		finalDifferences += differences
		if (!differences) unchanged++
		if (
			doctrine.options[religion * width + head] === 2 &&
			doctrine.options[religion * width + clergy] === 1 &&
			doctrine.familyOptions[family * width + clergy] === 0
		)
			clericalRuleCases++
	}
	let oppositeSins = 0,
		totalSins = 0,
		duplicateSinFamilies = 0
	for (const religion of representatives)
		if (religion >= 0) {
			const virtues = doctrine.virtues[religion],
				sins = doctrine.sins[religion]
			if (new Set(sins).size !== sins.length) duplicateSinFamilies++
			for (const sin of sins) {
				totalSins++
				if (virtues.some((trait) => TRAITS.opposites({ trait }).includes(sin)))
					oppositeSins++
			}
		}
	const conduct = ["adultery", "homosexuality", "witchcraft"].map((name) =>
		RELIGION_DOCTRINE.groups.findIndex((group) => group.name === name),
	)
	const conductCorrelations = (families: number[]) => {
		const pairs = [
			[0, 1],
			[0, 2],
			[1, 2],
		]
			.map(([a, b]) =>
				correlation({
					first: families.map(
						(family) => doctrine.familyOptions[family * width + conduct[a]],
					),
					second: families.map(
						(family) => doctrine.familyOptions[family * width + conduct[b]],
					),
				}),
			)
			.filter((value) => value !== null)
		return pairs.length ? pairs.reduce((a, b) => a + b, 0) / pairs.length : null
	}
	const families = Array.from({ length: familyCount }, (_, index) => index)
	return {
		familyCount,
		religionCount: religionTypes.length,
		types: RELIGION.religionTypeNames.map((name, type) => {
			const selected = families.filter((family) => familyTypes[family] === type)
			return {
				name,
				families: selected.length,
				share: selected.length / Math.max(1, familyCount),
				conductCorrelation: conductCorrelations(selected),
				groups: RELIGION_DOCTRINE.groups.map((group, index) => {
					const probabilities = RELIGION_DOCTRINE.probabilities({
						group: index,
						type,
					})
					return {
						name: group.name,
						families: selected.length,
						options: group.options.map((option, code) => ({
							name: option,
							share: selected.length
								? selected.filter(
										(family) =>
											doctrine.familyOptions[family * width + index] === code,
									).length / selected.length
								: null,
							probability: probabilities[code],
						})),
					}
				}),
			}
		}),
		meanFinalDifferences: finalDifferences / Math.max(1, religionTypes.length),
		noFinalDifferenceShare: unchanged / Math.max(1, religionTypes.length),
		clericalRuleCases,
		conductCorrelation: conductCorrelations(families),
		oppositeSinShare: oppositeSins / Math.max(1, totalSins),
		duplicateSinFamilies,
	}
}
function genderSystems({
	systems,
	cultureToReligion,
	doctrine,
	era,
}: GenderReligionReportParams) {
	const counts: Record<string, number[]> = {
		male_dominated: [0, 0, 0],
		equal: [0, 0, 0],
		no_doctrine: [0, 0, 0],
	}
	const index = RELIGION_DOCTRINE.groups.findIndex(
		(group) => group.name === "gender",
	)
	for (let culture = 0; culture < systems.length; culture++) {
		const religion = cultureToReligion[culture]
		const option =
			!doctrine || religion < 0
				? "no_doctrine"
				: doctrine.options[
							religion * RELIGION_DOCTRINE.groups.length + index
						] === 0
					? "male_dominated"
					: "equal"
		counts[option][systems[culture]]++
	}
	return {
		era,
		counts,
		shares: Object.fromEntries(
			Object.entries(counts).map(([name, row]) => [
				name,
				row.map(
					(count) =>
						count /
						Math.max(
							1,
							row.reduce((a, b) => a + b, 0),
						),
				),
			]),
		),
	}
}
export const RELIGION_REPORT = { summarize, genderSystems }

import { RELIGION_GENDER } from "@/model/history/sim/religion/gender"
import type {
	GenderReligionReportParams,
	GenderShareParams,
} from "@/test/history-run/report/religion/types"

// Religions of each type by their gender preference.
function genderShare({ religionTypes, religionGender }: GenderShareParams) {
	if (!religionTypes || !religionGender) return null
	const counts = Array.from({ length: 5 }, () => [0, 0])
	for (let religion = 0; religion < religionTypes.length; religion++)
		counts[religionTypes[religion]][religionGender[religion]]++
	return {
		counts,
		maleDominatedShare: counts.map(
			([male, equal]) => male / Math.max(1, male + equal),
		),
	}
}

// Cultures by their religion's gender preference and their own gender system.
function genderSystems({
	systems,
	cultureToReligion,
	religionGender,
	era,
}: GenderReligionReportParams) {
	const counts: Record<string, number[]> = {
		male_dominated: [0, 0, 0],
		equal: [0, 0, 0],
		no_preference: [0, 0, 0],
	}
	for (let culture = 0; culture < systems.length; culture++) {
		const religion = cultureToReligion[culture]
		const option =
			!religionGender || religion < 0
				? "no_preference"
				: religionGender[religion] === RELIGION_GENDER.preference.MALE_DOMINATED
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

export const RELIGION_REPORT = { genderShare, genderSystems }

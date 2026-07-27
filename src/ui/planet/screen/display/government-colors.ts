import { GovernmentType } from "@/model/society/types"
import { ERAS } from "@/model/society/eras"

export const GOVERNMENT_COLORS_BY_TYPE: Record<
	GovernmentType,
	[number, number, number]
> = {
	// tribal — orange / brown family
	chiefdom: [0.8, 0.56, 0.28],
	tribal_monarchy: [0.55, 0.35, 0.14],
	tribal_federation: [0.93, 0.76, 0.5],
	native_council: [0.44, 0.24, 0.11],
	steppe_horde: [0.68, 0.42, 0.16],
	// monarchy — blue family
	feudal_monarchy: [0.42, 0.54, 0.72],
	elective_monarchy: [0.55, 0.78, 0.95],
	absolute_monarchy: [0.06, 0.16, 0.44],
	constitutional_monarchy: [0.13, 0.4, 0.85],
	dynastic_signoria: [0.36, 0.28, 0.6],
	warlord_state: [0.4, 0.44, 0.48],
	shogunate: [0.14, 0.46, 0.52],
	bureaucratic_monarchy: [0.22, 0.58, 0.66],
	// republic — green family
	merchant_republic: [0.1, 0.56, 0.46],
	oligarchic_republic: [0.11, 0.36, 0.18],
	free_city: [0.64, 0.8, 0.24],
	peasant_republic: [0.55, 0.62, 0.32],
	presidential_republic: [0.24, 0.64, 0.34],
	parliamentary_republic: [0.48, 0.84, 0.46],
	pirate_republic: [0.3, 0.42, 0.2],
	// theocracy — purple / magenta family
	theocracy: [0.52, 0.24, 0.7],
	monastic_state: [0.28, 0.11, 0.46],
	imperial_cult: [0.82, 0.18, 0.58],
	// republic extensions
	socialist_state: [0.74, 0.14, 0.14],
	military_junta: [0.44, 0.46, 0.24],
	fascist_state: [0.5, 0.08, 0.08],
	dictatorial_rule: [0.58, 0.32, 0.16],
	// colonial
	trading_company: [0.902, 0.329, 0.239],
	settler_colony: [0.961, 0.549, 0.502],
}

export const GOVERNMENT_COLORS_CSS: Record<number, string> = Object.fromEntries(
	ERAS.governmentTypes.map((type, index) => {
		const [r, g, b] = GOVERNMENT_COLORS_BY_TYPE[type]
		return [
			index,
			`rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`,
		]
	}),
) as Record<number, string>

export function governmentColorForIndex(
	index: number,
): [number, number, number] {
	const type = ERAS.governmentTypes[index] ?? "feudal_monarchy"
	return GOVERNMENT_COLORS_BY_TYPE[type]
}

import type { SocietyEra } from "./eras"

interface SettlementEraTuning {
	townMin: number
	cityMin: number
	urbanRateRange: [number, number, number, number, number, number]
}

const LATE_MEDIEVAL_TUNING: SettlementEraTuning = {
	townMin: 1_000,
	cityMin: 8_000,
	urbanRateRange: [0.04, 0.05, 0.06, 0.07, 0.08, 0.09],
}

const ERA_TUNING: Record<SocietyEra, SettlementEraTuning> = {
	paleolithic: LATE_MEDIEVAL_TUNING,
	neolithic: LATE_MEDIEVAL_TUNING,
	bronze: LATE_MEDIEVAL_TUNING,
	iron: LATE_MEDIEVAL_TUNING,
	lateMedieval: LATE_MEDIEVAL_TUNING,
	earlyModern: {
		townMin: 2_000,
		cityMin: 12_000,
		urbanRateRange: [0.05, 0.065, 0.08, 0.1, 0.12, 0.14],
	},
	industrial: {
		townMin: 5_000,
		cityMin: 20_000,
		urbanRateRange: [0.08, 0.11, 0.15, 0.2, 0.24, 0.28],
	},
	information: {
		townMin: 10_000,
		cityMin: 50_000,
		urbanRateRange: [0.08, 0.12, 0.18, 0.25, 0.31, 0.36],
	},
}

export function getSettlementEraTuning(
	era: SocietyEra | undefined,
): SettlementEraTuning {
	return era ? (ERA_TUNING[era] ?? LATE_MEDIEVAL_TUNING) : LATE_MEDIEVAL_TUNING
}

export function getSettlementRenderThresholds(
	_era?: SocietyEra,
): readonly [number, number, number, number, number, number] {
	return [1_000, 10_000, 20_000, 50_000, 200_000, 1_000_000] as const
}

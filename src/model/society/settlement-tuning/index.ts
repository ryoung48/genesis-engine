import type { SettlementEraTuning } from "@/model/society/settlement-tuning/types"
import type { SocietyEra } from "@/model/society/types"

const LATE_MEDIEVAL_TUNING: SettlementEraTuning = {
	townMin: 1_000,
	cityMin: 8_000,
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
	},
	industrial: {
		townMin: 5_000,
		cityMin: 20_000,
	},
	information: {
		townMin: 10_000,
		cityMin: 50_000,
	},
}

function getSettlementEraTuning(
	era: SocietyEra | undefined,
): SettlementEraTuning {
	return era ? (ERA_TUNING[era] ?? LATE_MEDIEVAL_TUNING) : LATE_MEDIEVAL_TUNING
}

function getSettlementRenderThresholds(
	era?: SocietyEra,
): readonly [number, number, number, number, number, number] {
	// tier[0] must match getSettlementEraTuning(era).townMin -- that's the
	// same threshold buildSettlementLabelNames uses to decide whether a
	// settlement gets a label, so a mismatch here means markers render for
	// settlements whose label was filtered out (circle with no name).
	const { townMin } = getSettlementEraTuning(era)
	return [townMin, 10_000, 20_000, 50_000, 200_000, 1_000_000] as const
}

export const SETTLEMENT_TUNING = {
	getSettlementEraTuning,
	getSettlementRenderThresholds,
}

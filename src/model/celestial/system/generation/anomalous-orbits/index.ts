import type {
	AnomalousOrbitReservation,
	AnomalousOrbitRollInput,
	AnomalousOrbitType,
} from "@/model/celestial/system/generation/anomalous-orbits/types"
import { DICE } from "@/model/shared/random/dice"

function rollCount(roll: number): number {
	if (roll <= 9) return 0
	return roll - 9
}

function rollType(roll: number): AnomalousOrbitType {
	if (roll <= 7) return "random"
	if (roll === 8) return "eccentric"
	if (roll === 9) return "inclined"
	if (roll <= 11) return "retrograde"
	return "trojan"
}

function roll({
	rng,
	terrestrialCount,
	eligibleStarIndices,
}: AnomalousOrbitRollInput): AnomalousOrbitReservation[] {
	if (eligibleStarIndices.length === 0) return []
	const reservations: AnomalousOrbitReservation[] = []
	let remainingTerrestrialCount = terrestrialCount
	const count = rollCount(DICE.roll2d6(rng))
	for (let index = 0; index < count; index++) {
		const worldType = remainingTerrestrialCount < 13 ? "terrestrial" : "belt"
		if (worldType === "terrestrial") remainingTerrestrialCount++
		reservations.push({
			type: rollType(DICE.roll2d6(rng)),
			worldType,
			starIndex: rng.choice(eligibleStarIndices),
		})
	}
	return reservations
}

export const ANOMALOUS_ORBITS = {
	roll,
}

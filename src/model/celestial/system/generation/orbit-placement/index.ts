import type {
	OrbitExclusionZone,
	OrbitPlacementInput,
	OrbitSlot,
	OrbitTypeAssignmentInput,
	RandomOrbitInput,
	RegularSlotInput,
	WalkFromAnchorInput,
} from "@/model/celestial/system/generation/orbit-placement/types"
import { DICE } from "@/model/shared/random/dice"

// Book's Step 6 (p. 49): "Next Slot Orbit# = (Previous Slot Orbit#+Spread)
// + (2D-7) x 0.1 x Spread" -- every step gets its own variance, not a
// smooth deterministic ramp.
const SPREAD_VARIANCE_DIVISOR = 10

// Book (p. 49): "if multi-star system considerations cause an Orbit#
// result to be unavailable, then add the width of that exclusion zone to
// the spread value to place the next slot." If the walk still can't fit
// every slot before the boundary after that, the book calls for adjusting
// spread and regenerating, not tossing a world -- retried at a shrinking
// spread before falling back to an even, un-varied split.
const MAX_SPREAD_REDUCTION_ATTEMPTS = 6
const SPREAD_REDUCTION_FACTOR = 0.7

function rollSpreadVariance({
	rng,
	spread,
}: {
	rng: WalkFromAnchorInput["rng"]
	spread: number
}): number {
	return ((DICE.roll2d6(rng) - 7) / SPREAD_VARIANCE_DIVISOR) * spread
}

function pushPastExclusionZones({
	orbitNumber,
	direction,
	exclusionZones,
	spread,
}: {
	orbitNumber: number
	direction: 1 | -1
	exclusionZones: OrbitExclusionZone[]
	spread: number
}): { orbitNumber: number; spread: number } {
	let resolvedOrbitNumber = orbitNumber
	let resolvedSpread = spread
	for (const zone of exclusionZones) {
		if (
			resolvedOrbitNumber > zone.minOrbitNumber &&
			resolvedOrbitNumber < zone.maxOrbitNumber
		) {
			resolvedOrbitNumber =
				direction > 0 ? zone.maxOrbitNumber : zone.minOrbitNumber
			resolvedSpread += zone.maxOrbitNumber - zone.minOrbitNumber
		}
	}
	return { orbitNumber: resolvedOrbitNumber, spread: resolvedSpread }
}

interface WalkedPosition {
	orbitNumber: number
	spreadOrbitNumber: number
}

function walkFromAnchor({
	rng,
	anchorOrbitNumber,
	stepCount,
	nominalSpread,
	direction,
	boundaryOrbitNumber,
	exclusionZones,
}: WalkFromAnchorInput): WalkedPosition[] {
	if (stepCount <= 0) return []
	for (let attempt = 0; attempt < MAX_SPREAD_REDUCTION_ATTEMPTS; attempt++) {
		let spread = nominalSpread * SPREAD_REDUCTION_FACTOR ** attempt
		const positions: WalkedPosition[] = []
		let cursor = anchorOrbitNumber
		let overflowed = false
		for (let step = 0; step < stepCount; step++) {
			const candidate =
				cursor + direction * (spread + rollSpreadVariance({ rng, spread }))
			const resolved = pushPastExclusionZones({
				orbitNumber: candidate,
				direction,
				exclusionZones,
				spread,
			})
			spread = resolved.spread
			const exceedsBoundary =
				direction > 0
					? resolved.orbitNumber > boundaryOrbitNumber
					: resolved.orbitNumber < boundaryOrbitNumber
			if (exceedsBoundary) {
				overflowed = true
				break
			}
			positions.push({
				orbitNumber: resolved.orbitNumber,
				spreadOrbitNumber: spread,
			})
			cursor = resolved.orbitNumber
		}
		if (!overflowed) return positions
	}
	const span = Math.abs(boundaryOrbitNumber - anchorOrbitNumber)
	const fallbackSpread = span / (stepCount + 1)
	return Array.from({ length: stepCount }, (_, index) => ({
		orbitNumber: anchorOrbitNumber + direction * (fallbackSpread * (index + 1)),
		spreadOrbitNumber: fallbackSpread,
	}))
}

// An anomalous/trojan slot is placed off the regular grid (book: "the
// location of the orbit does not correspond to the spread pattern"), so it
// has no spread of its own -- borrows the nearest regular slot's, the best
// available stand-in for "the spread distance" at that Orbit#.
function nearestSpreadOrbitNumber({
	orbitNumber,
	referenceSlots,
}: {
	orbitNumber: number
	referenceSlots: OrbitSlot[]
}): number {
	if (referenceSlots.length === 0) return 0
	return referenceSlots.reduce((nearest, slot) =>
		Math.abs(slot.orbitNumber - orbitNumber) <
		Math.abs(nearest.orbitNumber - orbitNumber)
			? slot
			: nearest,
	).spreadOrbitNumber
}

function rollRandomOrbitNumber({
	rng,
	minimumOrbitNumber,
	maximumOrbitNumber,
}: RandomOrbitInput): number {
	for (let attempt = 0; attempt < 12; attempt++) {
		const orbitNumber = DICE.roll2d6(rng) - 2 + rng.randint(0, 10) / 10
		if (
			orbitNumber >= minimumOrbitNumber &&
			orbitNumber <= maximumOrbitNumber
		) {
			return orbitNumber
		}
	}
	return Math.min(maximumOrbitNumber, Math.max(minimumOrbitNumber, 10))
}

function makeSlot({
	orbitNumber,
	spreadOrbitNumber,
}: Pick<OrbitSlot, "orbitNumber" | "spreadOrbitNumber">): OrbitSlot {
	return {
		orbitNumber,
		type: "terrestrial",
		anomalousOrbitType: null,
		trojanCount: 0,
		isBaseline: false,
		orbitalDistanceAU: null,
		deviation: null,
		zone: null,
		spreadOrbitNumber,
	}
}

function buildRegularSlots({
	rng,
	baselineNumber,
	baselineOrbitNumber,
	totalWorlds,
	minimumOrbitNumber,
	maximumOrbitNumber,
	exclusionZones,
}: RegularSlotInput): OrbitSlot[] {
	if (
		baselineNumber === null ||
		baselineOrbitNumber === null ||
		totalWorlds <= 0 ||
		maximumOrbitNumber <= minimumOrbitNumber
	) {
		return []
	}
	if (baselineNumber < 1) {
		const nominalSpread =
			(maximumOrbitNumber - baselineOrbitNumber) / (totalWorlds + 1)
		return walkFromAnchor({
			rng,
			anchorOrbitNumber: baselineOrbitNumber,
			stepCount: totalWorlds,
			nominalSpread,
			direction: 1,
			boundaryOrbitNumber: maximumOrbitNumber,
			exclusionZones,
		}).map((position) => makeSlot(position))
	}
	if (baselineNumber > totalWorlds) {
		const nominalSpread =
			(baselineOrbitNumber - minimumOrbitNumber) / (totalWorlds + 1)
		return walkFromAnchor({
			rng,
			anchorOrbitNumber: minimumOrbitNumber,
			stepCount: totalWorlds,
			nominalSpread,
			direction: 1,
			boundaryOrbitNumber: baselineOrbitNumber,
			exclusionZones,
		}).map((position) => makeSlot(position))
	}
	const baselineIndex = baselineNumber - 1
	const innerSpread =
		(baselineOrbitNumber - minimumOrbitNumber) / baselineNumber
	const outerSpread = Math.min(
		innerSpread,
		(maximumOrbitNumber - baselineOrbitNumber) /
			Math.max(1, totalWorlds - baselineNumber),
	)
	const innerPositions = walkFromAnchor({
		rng,
		anchorOrbitNumber: baselineOrbitNumber,
		stepCount: baselineIndex,
		nominalSpread: innerSpread,
		direction: -1,
		boundaryOrbitNumber: minimumOrbitNumber,
		exclusionZones,
	})
	const outerPositions = walkFromAnchor({
		rng,
		anchorOrbitNumber: baselineOrbitNumber,
		stepCount: totalWorlds - baselineNumber,
		nominalSpread: outerSpread,
		direction: 1,
		boundaryOrbitNumber: maximumOrbitNumber,
		exclusionZones,
	})
	return [
		...innerPositions.map((position) => makeSlot(position)),
		{
			...makeSlot({
				orbitNumber: baselineOrbitNumber,
				spreadOrbitNumber: innerSpread,
			}),
			isBaseline: true,
		},
		...outerPositions.map((position) => makeSlot(position)),
	]
}

function assignType({
	slots,
	type,
	count,
	rng,
}: OrbitTypeAssignmentInput): void {
	const availableSlots = slots.filter(
		(slot) =>
			slot.anomalousOrbitType === null &&
			slot.type === "terrestrial" &&
			(type !== "empty" || (!slot.isBaseline && slot.trojanCount === 0)),
	)
	for (let index = 0; index < Math.min(count, availableSlots.length); index++) {
		rng.choice(availableSlots).type = type
		availableSlots.splice(
			availableSlots.findIndex((slot) => slot.type === type),
			1,
		)
	}
}

function place({
	rng,
	baselineNumber,
	baselineOrbitNumber,
	totalWorlds,
	gasGiantCount,
	beltCount,
	terrestrialCount,
	emptyOrbitCount,
	anomalousOrbitReservations,
	minimumOrbitNumber,
	maximumOrbitNumber,
	exclusionZones,
}: OrbitPlacementInput): OrbitSlot[] {
	const slots = buildRegularSlots({
		rng,
		baselineNumber,
		baselineOrbitNumber,
		totalWorlds,
		minimumOrbitNumber,
		maximumOrbitNumber,
		exclusionZones,
	})
	const ordinarySlots = [...slots]
	for (const reservation of anomalousOrbitReservations) {
		if (reservation.type === "trojan") continue
		const orbitNumber = rollRandomOrbitNumber({
			rng,
			minimumOrbitNumber,
			maximumOrbitNumber,
		})
		slots.push({
			...makeSlot({
				orbitNumber,
				spreadOrbitNumber: nearestSpreadOrbitNumber({
					orbitNumber,
					referenceSlots: ordinarySlots,
				}),
			}),
			type: reservation.worldType,
			anomalousOrbitType: reservation.type,
		})
	}
	for (const reservation of anomalousOrbitReservations) {
		if (reservation.type !== "trojan" || ordinarySlots.length === 0) continue
		rng.choice(ordinarySlots).trojanCount++
	}
	assignType({
		slots: ordinarySlots,
		type: "empty",
		count: emptyOrbitCount,
		rng,
	})
	assignType({
		slots: ordinarySlots,
		type: "gas-giant",
		count: gasGiantCount,
		rng,
	})
	assignType({ slots: ordinarySlots, type: "belt", count: beltCount, rng })
	assignType({
		slots: ordinarySlots,
		type: "terrestrial",
		count: terrestrialCount,
		rng,
	})
	return slots.sort((a, b) => a.orbitNumber - b.orbitNumber)
}

export const ORBIT_PLACEMENT = {
	place,
}

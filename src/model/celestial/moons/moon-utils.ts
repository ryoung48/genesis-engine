import { type createRng, rollD } from "../../shared/rng"
import type { MoonParams } from "./moon-types"

export const MOON_SIZE_DIAMETER_BANDS_KM = [
	[400, 800],
	[1000, 2000],
	[2800, 3600],
	[4000, 5600],
	[5600, 7200],
	[7200, 8800],
	[8800, 10400],
	[10400, 12000],
	[12000, 13600],
	[13600, 15200],
	[15200, 16800],
	[16800, 18400],
	[18400, 20000],
	[20000, 21600],
	[21600, 23199],
	[23200, 24800],
] as const

/**
 * Centralized orbital-inclination roll, shared by every planet, moon, and
 * sibling body in the system so they all use the same table:
 *
 *   2D roll   Severity     Degrees
 *   2–6       Very Low     1D ÷ 2
 *   7         Low          1D
 *   8         Moderate     2D
 *   9         High         (2D × 3) + 1D
 *   10        Very High    (1D + 1) × 5 + 1D
 *   11        Extreme      (3D × 5) − 1D
 *   12        Retrograde   roll again, result subtracted from 180
 */
export function rollInclinationDeg(rng: ReturnType<typeof createRng>): number {
	const roll = rollD(rng, 2)
	if (roll <= 6) return rollD(rng, 1) / 2
	if (roll === 7) return rollD(rng, 1)
	if (roll === 8) return rollD(rng, 2)
	if (roll === 9) return rollD(rng, 2) * 3 + rollD(rng, 1)
	if (roll === 10) return (rollD(rng, 1) + 1) * 5 + rollD(rng, 1)
	if (roll === 11) return rollD(rng, 3) * 5 - rollD(rng, 1)
	return 180 - rollInclinationDeg(rng)
}

export function estimateMoonSizeClassFromDiameter(
	planetDiameterKm: number,
): number {
	let closestSizeClass = 0
	let closestDelta = Number.POSITIVE_INFINITY
	for (
		let sizeClass = 0;
		sizeClass < MOON_SIZE_DIAMETER_BANDS_KM.length;
		sizeClass++
	) {
		const [minKm, maxKm] = MOON_SIZE_DIAMETER_BANDS_KM[sizeClass]!
		const midpointKm = (minKm + maxKm) / 2
		const delta = Math.abs(planetDiameterKm - midpointKm)
		if (delta < closestDelta) {
			closestDelta = delta
			closestSizeClass = sizeClass
		}
	}
	return closestSizeClass
}

// Stamps each moon's tideLock now that its parent's SystemBody idx is known
// (moons are generated/rolled before that idx is assigned). "Locked" is read
// off siderealDayHours ≈ orbitalPeriodDays × 24, which is how the lock roll
// (rollMoonSiderealDayHours, or a preset's ported real rotation period) is
// already expressed -- this just makes that fact explicit as data instead of
// leaving callers to re-derive it via a float comparison. Uses a tolerance
// rather than strict equality: orbitalPeriodDays is itself derived as
// rotationHours / 24 for these ported presets, and re-multiplying by 24
// doesn't always round-trip exactly (e.g. Callisto's 400.54 comes back as
// 400.5400000000001), which previously made an actually-locked moon read as
// unlocked.
const TIDE_LOCK_TOLERANCE_HOURS = 1e-6

export function attachParentTideLocks(
	moons: MoonParams[],
	parentIdx: number,
): MoonParams[] {
	return moons.map((moon) => ({
		...moon,
		tideLock:
			Math.abs(moon.siderealDayHours - moon.orbitalPeriodDays * 24) <
			TIDE_LOCK_TOLERANCE_HOURS
				? { type: "planet", target: parentIdx }
				: null,
	}))
}

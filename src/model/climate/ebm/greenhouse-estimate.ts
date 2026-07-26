import type { SharedRng } from "@/model/shared"
import { roll3d6 } from "@/model/shared/dice"
import { EMB_CONSTANTS } from "./constants"
import type { RollGreenhouseFactorParams } from "./types"

// Heuristic for a generated (not real-data) world: scales greenhouseFactor
// by sqrt(pressure) off Earth's fitted anchor at pressure=1 bar -- not a
// real per-body fit (there's no known target temperature for a generated
// world), just a reasonable monotonic response to the pressure slider.
// Mirrors Traveller's tabletop "Initial Greenhouse Factor = 0.5 * sqrt(bar)"
// formula.
export function estimateGreenhouseFactor(pressure: number): number {
	return (
		EMB_CONSTANTS.surface.GREENHOUSE_FACTOR * Math.sqrt(Math.max(pressure, 0))
	)
}

/**
 * NOT WIRED UP ANYWHERE YET -- a proposed replacement for
 * estimateGreenhouseFactor that fixes its gas-giant failure mode. Kept here,
 * unused, until we decide to switch a call site over to it.
 *
 * The problem with 0.5*sqrt(pressure) (Traveller's tabletop formula,
 * mirrored in estimateGreenhouseFactor above): it assumes greenhouseFactor
 * scales monotonically with pressure, which real fitted Sol data flatly
 * contradicts. Comparing sol-system.ts's individually-fitted values:
 *
 *   Venus:   92 bar   -> greenhouseFactor 9
 *   Uranus:  1300 bar -> greenhouseFactor 1.3257
 *   Neptune: 1500 bar -> greenhouseFactor 2.4833
 *   Saturn:  2600 bar -> greenhouseFactor 1.9196
 *   Jupiter: 4200 bar -> greenhouseFactor 1.4332
 *
 * Jupiter needs *less* greenhouse effect than Venus despite 45x the
 * pressure, and less than Saturn despite more pressure than Saturn -- no
 * monotonic function of pressure alone can fit both regimes. The reason:
 * for a surface world, pressure *is* the whole atmosphere sitting between
 * the surface and space, so more of it directly means more trapping. For a
 * gas giant, "pressureBar" here is an arbitrary deep reference level (it's
 * what defines the 1-bar target temperature, not a measure of optical
 * depth) -- the real lapse-rate/opacity gap comes from the thin cloud-deck
 * layer near the top, which has nothing to do with the crushing pressure
 * thousands of km below it. The four gas giants' fitted values cluster
 * tightly (1.33..2.48) despite a 3x spread in pressure (1300..4200 bar) --
 * the signature of a roughly constant quantity, not a scaling law.
 *
 * This version keeps the pressure-based formula only for bodies with an
 * actual surface, and uses a small fixed constant (the middle of the real
 * fitted gas-giant band above) for gas giants instead.
 *
 * Pluto is deliberately NOT a case this handles: its own fitted value
 * (44.2956, see sol-system.ts) isn't a real atmospheric greenhouse effect at
 * all -- it's the EBM's diffusion coefficient getting amplified by Pluto's
 * small radius and very slow rotation (same mechanism as the old Mercury
 * instability), which needs an oversized greenhouseFactor to numerically
 * compensate. No pressure-or-composition-based formula should try to
 * predict that from a 0.03 bar trace atmosphere -- doing so would wreck
 * every other thin-atmosphere body's estimate. That's a model-limitation
 * outlier to flag, not something to fit.
 */
/**
 * Tabletop dice-based greenhouseFactor roll -- used at planet/moon generation
 * time (not for the real Sol seed data, which is individually hand-fitted;
 * see sol-system.ts). Call this once atmosphere is known, i.e. after
 * atmosphereCodeToProfile() has produced a pressureBar and atmosphere code.
 *
 * Base: Initial Greenhouse Factor = 0.5 * sqrt(pressure in bar).
 *
 * Then a modifier depending on the atmosphere code (Traveller hex notation:
 * A=10, B=11, C=12, D=13, E=14, F=15, G=16, H=17 -- G/H are this codebase's
 * helium/hydrogen gas-giant atmosphere codes, see
 * generate-system-bodies.ts's atmosphereCodeToProfile):
 *   - 1-9, D, or E: add 3D * 0.01 (3D = three d6 summed, so +0.03..+0.18)
 *   - A or F: multiply by (1D - 1), floored at 0.5 (so 0.5, 0.5, 1, 2, 3, 4)
 *   - B, C, G, or H: roll 1D; on 1-5, multiply by that roll; on 6, multiply
 *     by 3D instead (so either x1..x5, or x3..x18)
 *   - 0 (vacuum): no modifier -- the sqrt(~0) base is already ~0.
 *
 * Gas giants (atmosphere code 16/17) should NOT go through this at all --
 * see estimateGreenhouseFactorV2's doc for why pressure-based scaling fails
 * for them. Use rollGasGiantGreenhouseFactor instead.
 */
export function rollGreenhouseFactor(
	params: RollGreenhouseFactorParams,
): number {
	const { rng, pressureBar, atmosphereCode } = params
	let factor = 0.5 * Math.sqrt(Math.max(pressureBar, 0))
	if (atmosphereCode === 0) return factor
	if (
		(atmosphereCode >= 1 && atmosphereCode <= 9) ||
		atmosphereCode === 13 ||
		atmosphereCode === 14
	) {
		factor += roll3d6(rng) * 0.01
	} else if (atmosphereCode === 10 || atmosphereCode === 15) {
		factor *= Math.max(rng.randint(1, 6) - 1, 0.5)
	} else if (
		atmosphereCode === 11 ||
		atmosphereCode === 12 ||
		atmosphereCode === 16 ||
		atmosphereCode === 17
	) {
		const roll = rng.randint(1, 6)
		factor *= roll <= 5 ? roll : roll3d6(rng)
	}
	return factor
}

/**
 * Gas giants skip the pressure/atmosphere-code formula entirely (see
 * estimateGreenhouseFactorV2's doc) -- their real fitted greenhouseFactor
 * values cluster tightly around 1.33..2.48 regardless of pressure, so a
 * flat random range in the middle of that band is a better model than any
 * formula keyed on their (physically unrelated) deep reference pressure.
 */
export function rollGasGiantGreenhouseFactor(
	rng: Pick<SharedRng, "uniform">,
): number {
	return rng.uniform(1.5, 2)
}

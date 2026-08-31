import { GalaxyParam } from "@/ui/genesis/galaxy/renderer/Types"

/** Panel-editable subset of gal/Types.ts's GalaxyParam, as a plain object
 * (React state doesn't need the class wrapper -- that's only required by
 * Galaxy.reset's signature, see toGalaxyParam below). */
export interface PortedGalaxyParams {
	rad: number
	coreRad: number
	angleOffset: number
	exInner: number
	exOuter: number
	numStars: number
	hasDarkMatter: boolean
	pertN: number
	pertAmp: number
	dustRenderSize: number
	baseTemp: number
}

/** User-facing display toggles. Everything else GalaxyRenderer exposes
 * (axis grid, dust/filaments/H2, velocity curve, dark matter halo) is
 * pinned to a fixed value instead of being panel-editable -- see
 * PortedGalaxyView.tsx's mount effect and handleSelectPreset, which apply
 * those fixed values directly as renderer property assignments with no
 * regen involved. */
export interface PortedGalaxyDisplayFlags {
	showDensityWaves: boolean
	showGalaxy: boolean
	/** Toggles the OLD packed-galaxy model's points/lanes objects (the real,
	 * clickable systems -- see PortedGalaxyView.tsx's applyOldGalaxy), not
	 * GalaxyRenderer's own decorative star particles, which stay on
	 * unconditionally. */
	showStarOverlay: boolean
}

/** Exclusive galaxy map mode -- "stars" shows neither partition overlay,
 * "nations" / "cultures" show the matching one (see partition-overlay.ts).
 * Replaces the old independent showNationOverlay toggle. */
export type GalaxyMapMode = "stars" | "nations" | "cultures"

export const DEFAULT_GALAXY_MAP_MODE: GalaxyMapMode = "nations"

// Matches GalaxyRenderer's own initSimulation first preset exactly, so the
// panel's initial values agree with what's actually on screen at mount.
export const DEFAULT_PORTED_GALAXY_PARAMS: PortedGalaxyParams = {
	rad: 13000,
	coreRad: 4000,
	angleOffset: 0.0004,
	exInner: 0.85,
	exOuter: 0.95,
	numStars: 40000,
	hasDarkMatter: true,
	pertN: 2,
	pertAmp: 40,
	// Matches GalaxyRenderer.ts's own `private dustRenderSizeBase = 187`
	// default -- NOT the preset table's dustRenderSize field (70), which a
	// regen never actually applies (see applyFullRegen's comment in
	// PortedGalaxyView.tsx). Keeping the panel's starting value in sync with
	// what's really active avoids the slider looking like it's at 70 while
	// the renderer is actually still using 187.
	dustRenderSize: 187,
	baseTemp: 4000,
}

// Density-wave guides default off -- they're a debug/reference overlay
// (guide ellipses) rather than part of the galaxy itself, so they'd
// otherwise clutter the default view. The star overlay (real systems)
// defaults on since that's the whole point of this view.
export const DEFAULT_PORTED_GALAXY_DISPLAY_FLAGS: PortedGalaxyDisplayFlags = {
	showDensityWaves: false,
	showGalaxy: true,
	showStarOverlay: true,
}

export function toGalaxyParam(p: PortedGalaxyParams): GalaxyParam {
	return new GalaxyParam(
		p.rad,
		p.coreRad,
		p.angleOffset,
		p.exInner,
		p.exOuter,
		p.numStars,
		p.hasDarkMatter,
		p.pertN,
		p.pertAmp,
		p.dustRenderSize,
		p.baseTemp,
	)
}

export function fromGalaxyParam(p: GalaxyParam): PortedGalaxyParams {
	return {
		rad: p.rad,
		coreRad: p.radCore,
		angleOffset: p.deltaAng,
		exInner: p.ex1,
		exOuter: p.ex2,
		numStars: p.numStars,
		hasDarkMatter: p.hasDarkMatter,
		pertN: p.pertN,
		pertAmp: p.pertAmp,
		dustRenderSize: p.dustRenderSize,
		baseTemp: p.baseTemp,
	}
}

/** Density-wave shape knobs for GALAXY_PACKING.place (see packing/types.ts),
 * derived from this ported galaxy's own live params so the old packing
 * model's system positions trace the same spiral this renderer draws.
 *
 * angleOffset can't be copied over raw: it's radians of ellipse tilt per
 * world unit of radius, and the two models operate at very different
 * scales (this one's `rad` is in the tens of thousands; the old model's
 * radius.max is typically a few hundred). Copying the raw value would wind
 * the old model far less over its much smaller radius. Instead this
 * rescales it so the *total* winding -- radians of tilt accumulated from
 * the core out to the rim -- matches: total = rad * angleOffset here, so
 * the equivalent per-unit rate at the old model's scale is
 * total / oldRadiusMax. */
export function densityWaveShapeFor(
	params: PortedGalaxyParams,
	oldRadiusMax: number,
): {
	eccentricityInner: number
	eccentricityOuter: number
	angleWindPerUnit: number
	pertN: number
	pertAmp: number
} {
	const totalWindingRad = params.rad * params.angleOffset
	return {
		eccentricityInner: params.exInner,
		eccentricityOuter: params.exOuter,
		angleWindPerUnit: oldRadiusMax > 0 ? totalWindingRad / oldRadiusMax : 0,
		// NOT rescaled like angleOffset above -- the perturbation term's `a`
		// (orbit radius) is already in the SAME coordinate space as
		// oldRadiusMax (both models keep radiusMax pinned to params.rad, see
		// PortedGalaxyView.tsx's radiusMin/radiusMax state), so pertAmp's
		// divisor means the same thing in both places without conversion.
		pertN: params.pertN,
		pertAmp: params.pertAmp,
	}
}

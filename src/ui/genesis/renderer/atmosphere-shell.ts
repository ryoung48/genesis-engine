import * as THREE from "three"
import type { AtmosphereProfile } from "@/model/celestial/orbit-body/types"
import { buildAtmosphereMaterial } from "@/ui/genesis/renderer/atmosphere-material"

// Limb colour per atmosphere type. Breathable air scatters blue for the same
// reason Earth's does; the hostile types read as their own chemistry so a
// corrosive world is identifiable at a glance rather than looking Earthlike.
// A "gas" envelope has no single composition worth naming, so it borrows the
// body's own classification swatch instead (see GAS_TINT_MIX).
const ATMOSPHERE_COLOR_BY_TYPE: Record<AtmosphereProfile["type"], number> = {
	vacuum: 0x000000,
	trace: 0x000000,
	breathable: 0x85b4ff,
	exotic: 0xb08ad0,
	corrosive: 0xc4d94a,
	insidious: 0xd08a3c,
	gas: 0xffffff,
}

// A tainted-but-otherwise-breathable sky is pushed toward a smoggy yellow,
// enough to notice without making it unrecognisable as the same type.
const TAINT_COLOR = new THREE.Color(0xbfae55)
const TAINT_MIX = 0.35

// How much of the body's own swatch a gas envelope takes on.
const GAS_TINT_MIX = 0.7

// Shell thickness, as a fraction of the body's radius, following the globe
// view's own pressure curve (setAtmospherePressure) at a tighter offset --
// the haze hugs the body here rather than standing off it, and
// LIMB_CONCENTRATION below then fades it outward within that band.
const BASE_SHELL_THICKNESS = 0.06
const SHELL_THICKNESS_PER_PRESSURE = 0.015

// Densest against the body's limb, thinning to nothing at the shell's outer
// edge -- air thinning with altitude, rather than the evenly-lit band a
// value of 0 gives.
const LIMB_CONCENTRATION = 1.2

// A planet covers a small fraction of the screen here, where the globe view
// fills it, so the same per-pixel alpha reads far weaker. This also has to
// make up for LIMB_CONCENTRATION, which only reaches roughly 0.3 of its old
// flat value even at its peak against the limb.
const SCREEN_SIZE_COMPENSATION = 7

// Pressure below which an atmosphere is not worth drawing at all, in bar.
// Vacuum and trace profiles are excluded by type as well; this also catches
// a nominally-thicker type that rolled almost no pressure.
const MIN_VISIBLE_PRESSURE_BAR = 0.05

export type BodyAtmosphereShellInput = {
	atmosphere: AtmosphereProfile | null
	/** The body's classification swatch, used only to tint a gas envelope. */
	bodySwatchHex: number
	/** The body's own rendered radius in scene units. */
	sceneRadius: number
}

function shellColor(input: BodyAtmosphereShellInput): THREE.Color {
	const { atmosphere, bodySwatchHex } = input
	if (!atmosphere) return new THREE.Color(0xffffff)
	const base = new THREE.Color(ATMOSPHERE_COLOR_BY_TYPE[atmosphere.type])
	if (atmosphere.type === "gas") {
		return base.lerp(new THREE.Color(bodySwatchHex), GAS_TINT_MIX)
	}
	return atmosphere.tainted ? base.lerp(TAINT_COLOR, TAINT_MIX) : base
}

/**
 * One body's atmosphere as a limb-scattering shell, or null when the body
 * has no atmosphere worth rendering (airless rock, vacuum, trace, or a type
 * that rolled negligible pressure).
 *
 * The caller owns the returned mesh's `sunDirection` uniform: the shell is
 * lit from wherever its own star is, which changes as the body moves along
 * its orbit, so it has to be refreshed whenever the body is repositioned.
 */
export function buildBodyAtmosphereShell(
	input: BodyAtmosphereShellInput,
): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null {
	const { atmosphere, sceneRadius } = input
	if (!atmosphere) return null
	if (atmosphere.type === "vacuum" || atmosphere.type === "trace") return null
	const pressureBar = atmosphere.pressureBar
	if (!Number.isFinite(pressureBar) || pressureBar < MIN_VISIBLE_PRESSURE_BAR) {
		return null
	}

	// Same clamp and exponent as the globe view's own pressure response, so a
	// world looks consistent whether viewed up close or from the system map.
	// The clamp also keeps a 5000 bar hydrogen envelope from getting a shell
	// wider than the planet it wraps.
	const pressureFactor = Math.pow(Math.max(0.1, Math.min(10, pressureBar)), 0.4)
	const thickness =
		BASE_SHELL_THICKNESS + SHELL_THICKNESS_PER_PRESSURE * pressureFactor

	const mesh = new THREE.Mesh(
		new THREE.SphereGeometry(1, 32, 24),
		buildAtmosphereMaterial({
			color: shellColor(input),
			strength: (0.7 + pressureFactor * 0.45) * SCREEN_SIZE_COMPENSATION,
			limbConcentration: LIMB_CONCENTRATION,
		}),
	)
	mesh.scale.setScalar(sceneRadius * (1 + thickness))
	mesh.renderOrder = 3
	// Decorative: a raycast hit must resolve to the body itself, not to the
	// air around it, or the shell would swallow clicks aimed at the planet.
	mesh.raycast = () => {
		// Intentionally inert -- see doc above.
	}
	return mesh
}

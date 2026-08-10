import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import type { MoonBody, MoonOrbitRange } from "@/model/celestial/moons/types"
import type { OrbitBody } from "@/model/celestial/orbit-body/types"
import type { SystemBody } from "@/model/celestial/system/types"
import type { DistributionChartBucket } from "@/ui/components/composites/DistributionChart"
import { classificationSwatchColor } from "@/ui/genesis/solar-system/overlay/constants"
import { habitabilityCategoryLabel } from "@/ui/wiki/stats/orbit/formatters"

const FALLBACK_COLOR = "#94a3b8"

function collectPlanets(systems: readonly GalaxySystem[]): SystemBody[] {
	const planets: SystemBody[] = []
	for (const system of systems) {
		for (const star of system.stars) {
			for (const body of star.bodies) {
				if (body.classification !== "asteroid belt") planets.push(body)
			}
		}
	}
	return planets
}

function collectMoons(systems: readonly GalaxySystem[]): MoonBody[] {
	const moons: MoonBody[] = []
	for (const system of systems) {
		for (const star of system.stars) {
			for (const body of star.bodies) {
				for (const moon of body.moons) {
					if (moon.classification !== "asteroid belt") moons.push(moon)
				}
			}
		}
	}
	return moons
}

// Planets + moons together, excluding whole asteroid-belt bodies -- the same
// combined population galaxy-gen's Size/Eccentricity/AxialTilt/Rotation
// charts draw from (window.galaxy.orbits filtered by group !== "asteroid
// belt").
function collectNonBeltBodies(systems: readonly GalaxySystem[]): OrbitBody[] {
	const bodies: OrbitBody[] = []
	for (const system of systems) {
		for (const star of system.stars) {
			for (const body of star.bodies) {
				if (body.group !== "asteroid belt") bodies.push(body)
				for (const moon of body.moons) {
					if (moon.group !== "asteroid belt") bodies.push(moon)
				}
			}
		}
	}
	return bodies
}

function bucketBy<T>(
	items: readonly T[],
	keyOf: (item: T) => string | undefined,
	labelOf: (key: string) => string,
	colorOf: (key: string) => string,
): DistributionChartBucket[] {
	const counts = new Map<string, number>()
	for (const item of items) {
		const key = keyOf(item)
		if (key === undefined) continue
		counts.set(key, (counts.get(key) ?? 0) + 1)
	}
	return Array.from(counts.entries())
		.map(([key, count]) => ({
			label: labelOf(key),
			count,
			color: colorOf(key),
		}))
		.sort((a, b) => b.count - a.count)
}

export function buildPlanetClassificationDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	return bucketBy(
		collectPlanets(systems),
		(body) => body.classification,
		(key) => key,
		(key) => classificationSwatchColor(key) ?? FALLBACK_COLOR,
	)
}

export function buildMoonClassificationDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	return bucketBy(
		collectMoons(systems),
		(moon) => moon.classification,
		(key) => key,
		(key) => classificationSwatchColor(key) ?? FALLBACK_COLOR,
	)
}

// Ported from galaxy-gen's SIZE.colors/label (model/system/orbits/index.ts)
// -- sizeClass -1 (asteroid belt) never reaches here since
// collectNonBeltBodies already excludes the whole group.
const SIZE_COLOR: Record<number, string> = {
	[-1]: "#8b4513",
	0: "#a0522d",
	1: "#cd853f",
	2: "#daa520",
	3: "#b8860b",
	4: "#ff8c00",
	5: "#ffa500",
	6: "#ffd700",
	7: "#9acd32",
	8: "#228b22",
	9: "#32cd32",
	10: "#00ced1",
	11: "#4169e1",
	12: "#0000ff",
	13: "#4b0082",
	14: "#8a2be2",
	15: "#9370db",
	16: "#ba55d3",
	17: "#da70d6",
	18: "#ff69b4",
}
const SIZE_LABEL: Record<number, string> = {
	[-1]: "Asteroid Belt",
	0: "Small Bodies 0 (600km)",
	1: "Small Planets 1 (1,600km)",
	2: "Luna-class 2 (3,200km)",
	3: "Mercury-class 3 (4,800km)",
	4: "Mars-class 4 (6,400km)",
	5: "Size 5 (8,000km)",
	6: "Size 6 (9,600km)",
	7: "Size 7 (11,200km)",
	8: "Terra-class 8 (12,800km)",
	9: "Super-Earth 9 (14,400km)",
	10: "Size 10 (16,000km)",
	11: "Size 11 (17,600km)",
	12: "Size 12 (19,200km)",
	13: "Size 13 (20,800km)",
	14: "Size 14 (22,400km)",
	15: "Size 15 (24,000km)",
	16: "Gas Giant 16 (Small)",
	17: "Gas Giant 17 (Medium)",
	18: "Gas Giant 18 (Large)",
}

export function sizeSwatchColor(
	sizeClass: number | undefined,
): string | undefined {
	if (sizeClass === undefined) return undefined
	return SIZE_COLOR[sizeClass] ?? FALLBACK_COLOR
}

export function buildSizeDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectNonBeltBodies(systems),
		(body) => body.sizeClass?.toString(),
		(key) => SIZE_LABEL[Number(key)] ?? `Size ${key}`,
		(key) => SIZE_COLOR[Number(key)] ?? FALLBACK_COLOR,
	)
	return buckets.sort(
		(a, b) => (SIZE_CODE_OF[a.label] ?? 0) - (SIZE_CODE_OF[b.label] ?? 0),
	)
}
const SIZE_CODE_OF: Record<string, number> = Object.fromEntries(
	Object.entries(SIZE_LABEL).map(([code, label]) => [label, Number(code)]),
)

const ECCENTRICITY_CATEGORIES = [
	"Circular (<0.01)",
	"Slight (0.01-0.05)",
	"Moderate (0.05-0.15)",
	"Eccentric (0.15-0.3)",
	"High (0.3-0.6)",
	"Extreme (>0.6)",
] as const

const ECCENTRICITY_COLORS: Record<string, string> = {
	"Circular (<0.01)": "#0c6ba2",
	"Slight (0.01-0.05)": "#2a9ad4",
	"Moderate (0.05-0.15)": "#56b9e5",
	"Eccentric (0.15-0.3)": "#7fcaf0",
	"High (0.3-0.6)": "#ffb97d",
	"Extreme (>0.6)": "#f77f72",
}

function eccentricityCategory(eccentricity: number): string {
	if (eccentricity < 0.01) return "Circular (<0.01)"
	if (eccentricity < 0.05) return "Slight (0.01-0.05)"
	if (eccentricity < 0.15) return "Moderate (0.05-0.15)"
	if (eccentricity < 0.3) return "Eccentric (0.15-0.3)"
	if (eccentricity < 0.6) return "High (0.3-0.6)"
	return "Extreme (>0.6)"
}

export function eccentricitySwatchColor(eccentricity: number): string {
	return (
		ECCENTRICITY_COLORS[eccentricityCategory(eccentricity)] ?? FALLBACK_COLOR
	)
}

export function buildEccentricityDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectNonBeltBodies(systems),
		(body) => eccentricityCategory(body.eccentricity),
		(key) => key,
		(key) => ECCENTRICITY_COLORS[key] ?? FALLBACK_COLOR,
	)
	return ECCENTRICITY_CATEGORIES.map((category) =>
		buckets.find((bucket) => bucket.label === category),
	).filter((bucket): bucket is DistributionChartBucket => bucket !== undefined)
}

const TILT_CATEGORIES = [
	"Minimal (<1 deg)",
	"Low (1-10 deg)",
	"Moderate (10-25 deg)",
	"High (25-45 deg)",
	"Extreme (45-65 deg)",
	"Polar (65-90 deg)",
	"Retrograde (90-135 deg)",
	"Inverted (>135 deg)",
] as const

const TILT_COLORS: Record<string, string> = {
	"Minimal (<1 deg)": "#385d7c",
	"Low (1-10 deg)": "#4b81a6",
	"Moderate (10-25 deg)": "#769fc2",
	"High (25-45 deg)": "#b3c6d6",
	"Extreme (45-65 deg)": "#f6b38f",
	"Polar (65-90 deg)": "#f79a8a",
	"Retrograde (90-135 deg)": "#f78285",
	"Inverted (>135 deg)": "#f06778",
}

function tiltCategory(
	body: Pick<OrbitBody, "tideLockStatus" | "axialTiltDeg">,
): string {
	if (body.tideLockStatus === "1:1" || body.axialTiltDeg < 1)
		return "Minimal (<1 deg)"
	const tilt = body.axialTiltDeg
	if (tilt > 90)
		return tilt > 135 ? "Inverted (>135 deg)" : "Retrograde (90-135 deg)"
	if (tilt < 10) return "Low (1-10 deg)"
	if (tilt < 25) return "Moderate (10-25 deg)"
	if (tilt < 45) return "High (25-45 deg)"
	if (tilt < 65) return "Extreme (45-65 deg)"
	return "Polar (65-90 deg)"
}

export function axialTiltSwatchColor(
	body: Pick<OrbitBody, "tideLockStatus" | "axialTiltDeg">,
): string {
	return TILT_COLORS[tiltCategory(body)] ?? FALLBACK_COLOR
}

export function buildAxialTiltDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectNonBeltBodies(systems),
		tiltCategory,
		(key) => key,
		(key) => TILT_COLORS[key] ?? FALLBACK_COLOR,
	)
	return TILT_CATEGORIES.map((category) =>
		buckets.find((bucket) => bucket.label === category),
	).filter((bucket): bucket is DistributionChartBucket => bucket !== undefined)
}

export const TEMPERATURE_CATEGORIES = [
	"Frozen (<-50C)",
	"Cold (-50-0C)",
	"Temperate (0-30C)",
	"Hot (30-100C)",
	"Scorching (>100C)",
] as const

const TEMPERATURE_COLORS: Record<string, string> = {
	"Frozen (<-50C)": "#a8d8f0",
	"Cold (-50-0C)": "#6bb6de",
	"Temperate (0-30C)": "#8fcf7f",
	"Hot (30-100C)": "#f7a463",
	"Scorching (>100C)": "#e0524f",
}

// Mean estimate is stored in Kelvin (OrbitBody.temperatureEstimate) -- bodies
// without a computed estimate (e.g. skipped-naming bulk pre-generation) are
// excluded rather than guessed at.
export function temperatureCategory(body: OrbitBody): string | undefined {
	const meanK = body.temperatureEstimate?.mean
	if (meanK === undefined) return undefined
	const celsius = meanK - 273.15
	if (celsius < -50) return "Frozen (<-50C)"
	if (celsius < 0) return "Cold (-50-0C)"
	if (celsius < 30) return "Temperate (0-30C)"
	if (celsius < 100) return "Hot (30-100C)"
	return "Scorching (>100C)"
}

export function buildTemperatureDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectNonBeltBodies(systems),
		temperatureCategory,
		(key) => key,
		(key) => TEMPERATURE_COLORS[key] ?? FALLBACK_COLOR,
	)
	return TEMPERATURE_CATEGORIES.map((category) =>
		buckets.find((bucket) => bucket.label === category),
	).filter((bucket): bucket is DistributionChartBucket => bucket !== undefined)
}

const ROTATION_CATEGORIES = [
	"1:1 Tidal Lock (Star)",
	"1:1 Tidal Lock (Planet)",
	"1:1 Tidal Lock (Moon)",
	"1:1 Tidal Lock (Unknown)",
	"3:2 Tidal Lock",
	"Ultra Fast (<10h)",
	"Fast (10-18h)",
	"Terrestrial (18-30h)",
	"Slow (30-72h)",
	"Very Slow (72-240h)",
	"Long Days (>240h)",
] as const

const ROTATION_COLORS: Record<string, string> = {
	"1:1 Tidal Lock (Planet)": "#2f5867",
	"1:1 Tidal Lock (Star)": "#274955ff",
	"1:1 Tidal Lock (Moon)": "#42788bff",
	"1:1 Tidal Lock (Unknown)": "#5aa5c0",
	"3:2 Tidal Lock": "#468b8f",
	"Ultra Fast (<10h)": "#4eb6a4",
	"Fast (10-18h)": "#94c796",
	"Terrestrial (18-30h)": "#f1d08c",
	"Slow (30-72h)": "#f7b67b",
	"Very Slow (72-240h)": "#f18c6e",
	"Long Days (>240h)": "#b57de2",
}

// tideLock.type: "solar" (locked to the star), "planet" (a moon locked to
// its parent planet), "lunar" (a planet locked to one of its own moons) --
// see TideLock's doc in orbit-body/types.ts.
function rotationCategory(
	body: Pick<OrbitBody, "tideLockStatus" | "tideLock" | "siderealDayHours">,
): string {
	if (body.tideLockStatus === "1:1") {
		const lockType = body.tideLock?.type
		if (lockType === "solar") return "1:1 Tidal Lock (Star)"
		if (lockType === "planet") return "1:1 Tidal Lock (Planet)"
		if (lockType === "lunar") return "1:1 Tidal Lock (Moon)"
		return "1:1 Tidal Lock (Unknown)"
	}
	if (body.tideLockStatus === "3:2") return "3:2 Tidal Lock"
	const rotation = body.siderealDayHours
	if (rotation < 10) return "Ultra Fast (<10h)"
	if (rotation < 18) return "Fast (10-18h)"
	if (rotation < 30) return "Terrestrial (18-30h)"
	if (rotation < 72) return "Slow (30-72h)"
	if (rotation < 240) return "Very Slow (72-240h)"
	return "Long Days (>240h)"
}

export function rotationSwatchColor(
	body: Pick<OrbitBody, "tideLockStatus" | "tideLock" | "siderealDayHours">,
): string {
	return ROTATION_COLORS[rotationCategory(body)] ?? FALLBACK_COLOR
}

export function buildRotationDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectNonBeltBodies(systems),
		rotationCategory,
		(key) => key,
		(key) => ROTATION_COLORS[key] ?? FALLBACK_COLOR,
	)
	return ROTATION_CATEGORIES.map((category) =>
		buckets.find((bucket) => bucket.label === category),
	).filter((bucket): bucket is DistributionChartBucket => bucket !== undefined)
}

// Ported from galaxy-gen's ATMOSPHERE.color (model/system/orbits/atmosphere/
// index.ts).
const ATMOSPHERE_COLOR: Record<number, string> = {
	0: "#e5e5e5",
	1: "#bfbec0",
	2: "#7dd3d8",
	3: "#6bb6ff",
	4: "#4a9baa",
	5: "#357abd",
	6: "#2e5984",
	7: "#1e5572",
	8: "#0d3a5c",
	9: "#0a3546",
	10: "#9b59b6",
	11: "#e74c3c",
	12: "#8b0000",
	13: "#9e6202",
	14: "#e0bc81",
	15: "#d68910",
	16: "#e8daef",
	17: "#e9c0e9",
}
const ATMOSPHERE_LABEL: Record<number, string> = {
	0: "Vacuum (0)",
	1: "Trace (1)",
	2: "Very Thin, Tainted (2)",
	3: "Very Thin (3)",
	4: "Thin, Tainted (4)",
	5: "Thin (5)",
	6: "Standard (6)",
	7: "Standard, Tainted (7)",
	8: "Dense (8)",
	9: "Dense, Tainted (9)",
	10: "Exotic (A)",
	11: "Corrosive (B)",
	12: "Insidious (C)",
	13: "Very Dense (D)",
	14: "Low (E)",
	15: "Unusual (F)",
	16: "Gas, Helium (G)",
	17: "Gas, Hydrogen (H)",
}

export function atmosphereSwatchColor(
	code: number | undefined,
): string | undefined {
	if (code === undefined) return undefined
	return ATMOSPHERE_COLOR[code] ?? FALLBACK_COLOR
}

export const ATMOSPHERE_CATEGORIES = Object.values(ATMOSPHERE_LABEL)

export function atmosphereCategory(
	body: Pick<OrbitBody, "atmosphere">,
): string | undefined {
	const code = body.atmosphere?.code
	if (code === undefined) return undefined
	return ATMOSPHERE_LABEL[code] ?? `Code ${code}`
}

export function buildAtmosphereDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectNonBeltBodies(systems),
		(body) => body.atmosphere?.code.toString(),
		(key) => ATMOSPHERE_LABEL[Number(key)] ?? `Code ${key}`,
		(key) => ATMOSPHERE_COLOR[Number(key)] ?? FALLBACK_COLOR,
	)
	return buckets.sort(
		(a, b) =>
			(ATMOSPHERE_CODE_OF[a.label] ?? 0) - (ATMOSPHERE_CODE_OF[b.label] ?? 0),
	)
}
const ATMOSPHERE_CODE_OF: Record<string, number> = Object.fromEntries(
	Object.entries(ATMOSPHERE_LABEL).map(([code, label]) => [
		label,
		Number(code),
	]),
)

// Ported from galaxy-gen's HYDROSPHERE.color (model/system/orbits/
// hydrosphere/index.ts), indexed directly by code rather than by iteration
// order.
const HYDROSPHERE_COLOR: string[] = [
	"#d2b48c",
	"#c4a373",
	"#b6925a",
	"#a88141",
	"#9a7028",
	"#8c5f0f",
	"#7e6e3c",
	"#707d69",
	"#628c96",
	"#549bc3",
	"#46aaf0",
	"#5e7af8",
	"#ff625d",
	"#f290ff",
]
const HYDROSPHERE_LABEL: Record<number, string> = {
	0: "Desert (0%–05%)",
	1: "Dry (6%–15%)",
	2: "Arid (16%–25%)",
	3: "Semi-Arid (26%–35%)",
	4: "Moderate (36%–45%)",
	5: "Wet (46%–55%)",
	6: "Humid (56%–65%)",
	7: "Continental (66%–75%)",
	8: "Marine (76%–85%)",
	9: "Aquatic (86%–95%)",
	10: "Oceanic (96%–100%)",
	11: "Superdense (incredibly deep world oceans)",
	12: "Intense volcanism (molten surface)",
	13: "Gas giant core",
}

export function hydrosphereSwatchColor(
	code: number | undefined,
): string | undefined {
	if (code === undefined) return undefined
	return HYDROSPHERE_COLOR[code] ?? FALLBACK_COLOR
}

export const HYDROSPHERE_CATEGORIES = Object.values(HYDROSPHERE_LABEL)

export function hydrosphereCategory(
	body: Pick<OrbitBody, "hydrosphere">,
): string | undefined {
	const code = body.hydrosphere?.code
	if (code === undefined) return undefined
	return HYDROSPHERE_LABEL[code] ?? `Level ${code}`
}

export function buildHydrosphereDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectNonBeltBodies(systems),
		(body) => body.hydrosphere?.code.toString(),
		(key) => HYDROSPHERE_LABEL[Number(key)] ?? `Level ${key}`,
		(key) => HYDROSPHERE_COLOR[Number(key)] ?? FALLBACK_COLOR,
	)
	return buckets.sort(
		(a, b) =>
			(HYDROSPHERE_CODE_OF[a.label] ?? 0) - (HYDROSPHERE_CODE_OF[b.label] ?? 0),
	)
}
const HYDROSPHERE_CODE_OF: Record<string, number> = Object.fromEntries(
	Object.entries(HYDROSPHERE_LABEL).map(([code, label]) => [
		label,
		Number(code),
	]),
)

// Ported from galaxy-gen's BIOSPHERE.labels and METRICS.biosphere.color
// (components/maps/legend/metrics.ts) -- codes 0-10 are precomputed
// d3.interpolateGreens(scaleLinear([0,10],[0,1])(code)) values baked to hex,
// same as HYDROSPHERE_COLOR/ATMOSPHERE_COLOR above, since d3 isn't a
// dependency here. Code 0 ("sterile") is excluded by
// buildBiosphereDistribution itself, matching Biosphere.tsx's "non sterile"
// filter, but stays in these maps for completeness.
const BIOSPHERE_LABEL: Record<number, string> = {
	0: "Sterile",
	1: "Prebiotic Chemistry",
	2: "Simple Microbes",
	3: "Complex Microbes",
	4: "Multicellular Beginnings",
	5: "Small Macroscopic Life",
	6: "Large Macroscopic Life",
	7: "Complex Ecosystems",
	8: "Social Species",
	9: "Proto-Sapience",
	10: "Full Sapience",
	11: "Bio-Engineered Life",
}
const BIOSPHERE_COLOR: Record<number, string> = {
	0: "#f7fcf5",
	1: "#e8f6e3",
	2: "#d3eecd",
	3: "#b7e2b1",
	4: "#97d494",
	5: "#73c378",
	6: "#4daf62",
	7: "#2f984f",
	8: "#157f3b",
	9: "#036429",
	10: "#00441b",
}
const BIOSPHERE_OVERFLOW_COLOR = "#8268ed"

export function biosphereSwatchColor(
	code: number | undefined,
): string | undefined {
	if (code === undefined || code <= 0) return undefined
	return BIOSPHERE_COLOR[code] ?? BIOSPHERE_OVERFLOW_COLOR
}

// Ported from galaxy-gen's METRICS.habitability.color (maps/legend/
// metrics.ts) -- interpolateSpectral(scale(heat)) with scale = scaleLinear([0,
// 10], [0, 1]).clamp(true). Since heat 0-10 lands exactly on d3's 11-stop
// Spectral scheme, this table is those stops directly rather than a runtime
// d3-scale-chromatic dependency.
const HABITABILITY_COLOR: readonly string[] = [
	"#9e0142",
	"#d53e4f",
	"#f46d43",
	"#fdae61",
	"#fee08b",
	"#ffffbf",
	"#e6f598",
	"#abdda4",
	"#66c2a5",
	"#3288bd",
	"#5e4fa2",
]

export function habitabilitySwatchColor(
	code: number | undefined,
): string | undefined {
	if (code === undefined) return undefined
	const clamped = Math.max(0, Math.min(10, Math.round(code)))
	return HABITABILITY_COLOR[clamped]
}

// Ported from galaxy-gen's HabitabilityDistribution (components/statistics/
// Habitability.tsx) -- one bucket per system, keyed off that system's own
// highest-habitability body/moon (max(hab) per system), not per-body like
// buildBiosphereDistribution above.
const HABITABILITY_CATEGORIES = [
	{ label: habitabilityCategoryLabel(0), code: 0 },
	{ label: habitabilityCategoryLabel(2), code: 2 },
	{ label: habitabilityCategoryLabel(4), code: 4 },
	{ label: habitabilityCategoryLabel(6), code: 6 },
	{ label: habitabilityCategoryLabel(8), code: 8 },
	{ label: habitabilityCategoryLabel(10), code: 10 },
] as const
const HABITABILITY_CATEGORY_ORDER: Record<string, number> = Object.fromEntries(
	HABITABILITY_CATEGORIES.map((category, index) => [category.label, index]),
)
const HABITABILITY_CATEGORY_CODE: Record<string, number> = Object.fromEntries(
	HABITABILITY_CATEGORIES.map((category) => [category.label, category.code]),
)

function collectSystemMaxHabitability(
	systems: readonly GalaxySystem[],
): number[] {
	const maxes: number[] = []
	for (const system of systems) {
		let max: number | undefined
		for (const star of system.stars) {
			for (const body of star.bodies) {
				if (body.group !== "asteroid belt" && body.habitability) {
					max = Math.max(max ?? -Infinity, body.habitability.code)
				}
				for (const moon of body.moons) {
					if (moon.group !== "asteroid belt" && moon.habitability) {
						max = Math.max(max ?? -Infinity, moon.habitability.code)
					}
				}
			}
		}
		if (max !== undefined) maxes.push(max)
	}
	return maxes
}

export function buildSystemHabitabilityDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectSystemMaxHabitability(systems),
		(code) => habitabilityCategoryLabel(code),
		(key) => key,
		(key) =>
			habitabilitySwatchColor(HABITABILITY_CATEGORY_CODE[key]) ??
			FALLBACK_COLOR,
	)
	return buckets.sort(
		(a, b) =>
			(HABITABILITY_CATEGORY_ORDER[a.label] ?? 0) -
			(HABITABILITY_CATEGORY_ORDER[b.label] ?? 0),
	)
}

const MOON_ORBIT_RANGE_CATEGORIES = [
	"inner",
	"middle",
	"outer",
	"extreme",
] as const

const MOON_ORBIT_RANGE_COLORS: Record<string, string> = {
	inner: "#f7b67b",
	middle: "#94c796",
	outer: "#5aa5c0",
	extreme: "#8268ed",
}

function moonOrbitRangeLabel(key: string): string {
	return key.charAt(0).toUpperCase() + key.slice(1)
}

export function moonOrbitRangeSwatchColor(
	range: MoonOrbitRange | undefined,
): string | undefined {
	if (range === undefined) return undefined
	return MOON_ORBIT_RANGE_COLORS[range] ?? FALLBACK_COLOR
}

export function buildMoonOrbitRangeDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectMoons(systems),
		(moon) => moon.orbitRange,
		moonOrbitRangeLabel,
		(key) => MOON_ORBIT_RANGE_COLORS[key] ?? FALLBACK_COLOR,
	)
	const order = new Map(
		MOON_ORBIT_RANGE_CATEGORIES.map((category, index) => [
			moonOrbitRangeLabel(category),
			index,
		]),
	)
	return buckets.sort(
		(a, b) => (order.get(a.label) ?? 0) - (order.get(b.label) ?? 0),
	)
}

export function buildBiosphereDistribution(
	systems: readonly GalaxySystem[],
): DistributionChartBucket[] {
	const buckets = bucketBy(
		collectNonBeltBodies(systems).filter(
			(body) => (body.biosphere?.code ?? 0) > 0,
		),
		(body) => body.biosphere?.code.toString(),
		(key) => BIOSPHERE_LABEL[Number(key)] ?? `Code ${key}`,
		(key) => BIOSPHERE_COLOR[Number(key)] ?? BIOSPHERE_OVERFLOW_COLOR,
	)
	return buckets.sort(
		(a, b) =>
			(BIOSPHERE_CODE_OF[a.label] ?? 0) - (BIOSPHERE_CODE_OF[b.label] ?? 0),
	)
}
const BIOSPHERE_CODE_OF: Record<string, number> = Object.fromEntries(
	Object.entries(BIOSPHERE_LABEL).map(([code, label]) => [label, Number(code)]),
)

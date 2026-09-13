import { RAIN } from "@/model/climate/precipitation/rain"
import { WIND } from "@/model/climate/weather/wind"
import type {
	CellBoundariesGenerator,
	CellBoundariesResult,
	CellPressureAtBoundaryGenerator,
	CellSegment,
	ComputeWindVectorsWithLargeScaleInput,
	LargeScaleSolver,
	OuterBoundaryBaseInput,
	PressureComponents,
} from "@/model/climate/weather/wind/full/types"
import { OCEAN_INERTIA } from "@/model/climate/weather/wind/ocean-inertia"
import { ROUGHNESS } from "@/model/climate/weather/wind/roughness"
import { SHALLOW_WATER } from "@/model/climate/weather/wind/shallow-water"
import { SURFACE_BALANCE } from "@/model/climate/weather/wind/surface-balance"
import { TORQUE_BALANCE } from "@/model/climate/weather/wind/torque-balance"
import type { ComputeWindVectorsInput } from "@/model/climate/weather/wind/types"
import type { SphereMesh } from "@/model/mesh/types"
import { MATH } from "@/model/shared/math/core"
import { TIME } from "@/model/shared/time"
import { UNITS } from "@/model/shared/units"

// The full atmospheric-dynamics wind model: a Hadley/Ferrel/polar pressure
// template plus a surface torque balance, storm gustiness, western/eastern
// boundary flow and a shallow-water large-scale solver. This is the model
// under active development against the Earth NCEP comparison
// (src/test/earth/earth-real-wind-compare.smoke.test.ts and wind.md); it is
// not wired into the world-gen pipeline, which uses `wind/simple` for speed.
// Kept as a standalone module so ongoing atmospheric-model work doesn't need
// to pay the pipeline's stability/perf bar to be tested and iterated on.

// Cell boundaries from the surface trough outward: subtropical ridge,
// polar front, then further alternating boundaries for fast rotators whose
// cells are narrow enough to fit more of them. Eight offsets so the fastest
// tabulated rotators (the 1/4-day GCM row's eight boundaries) fit; entries
// past the pole clamp to no-ops, so slow rotators and Earth are unaffected.
const NUM_BOUNDARIES = 9
// Geostrophic scaling: the sea-level pressure contrast across a circulation
// cell is proportional to the zonal-mean temperature contrast across it
// (template units per degree C). Thermally direct cells (Hadley, polar)
// raise pressure toward their cold side; the eddy-driven indirect cell
// (Ferrel) lowers it.
const DIRECT_CELL_PRESSURE_PER_C = 0.22
const INDIRECT_CELL_PRESSURE_PER_C = 0.22
const POLAR_CELL_PRESSURE_PER_C = 0.15
// Each successive cell boundary is progressively less coupled to the thermal
// equator: the ITCZ trough follows it fully, the subtropical ridges only
// partially, the polar front barely at all. The trough follows the full
// thermal equator, monsoon troughs over summer continents included; the
// ridges and beyond follow the ocean thermal equator, since a hot summer
// continent pulls the trough poleward but not the oceanic subtropical highs.
const BOUNDARY_TEQ_COUPLING = 0.35
// GCM cell-boundary latitudes past the Hadley edge (Read et al., via the
// worldbuilding-pasta rotation table), log-interpolated in day length. b1
// (the Hadley edge itself) reuses the fitted hadleyWidth table, which
// matches that source point for point; these rows cover b2..b8 at day
// lengths of 1/4, 1/2, 1, 2, 4, 8 and 16 days. Tails of 90+ clamp to no-ops
// past the pole (zero temperature contrast), staging cell loss the way the
// GCMs show it: the polar cell gone by 4 days, one Ferrel band to the pole,
// full collapse left to cellCollapse.
const OUTER_BASE_DAY_ANCHORS = [6, 12, 24, 48, 96, 192, 384]
const OUTER_BASES: number[][] = [
	[21, 40, 60, 70, 90, 90, 90],
	[26, 55, 90, 90, 90, 90, 90],
	[33, 70, 120, 120, 120, 120, 120],
	[41, 90, 150, 150, 150, 150, 150],
	[49, 180, 180, 180, 180, 180, 180],
	[56, 210, 210, 210, 210, 210, 210],
	[64, 240, 240, 240, 240, 240, 240],
]
const LOG_OUTER_BASE_DAY_ANCHORS = OUTER_BASE_DAY_ANCHORS.map((h) =>
	Math.log(h),
)
// Boundary-layer friction relative to Earth's Coriolis parameter at the pole.
const FRICTION = 0.3
// Storm gustiness as a fraction of the thermal wind across one scale height,
// R_d |dT/dy| / f (~20 m/s in Earth's midlatitudes), giving ~5 m/s of surface
// gust spread in the storm tracks. It adds to the surface drag the torque
// balance sees, not to the mean wind. R_d assumes Earth-like (N2/O2) air.
const STORM_GUST_THERMAL_WIND_FRACTION = 0.25
const DRY_AIR_GAS_CONSTANT_J_KG_K = 287
const MAX_STORM_GUST_MS = 10
// Fraction of the Hadley width (from the thermal equator) at which storm
// gustiness starts fading in; it is full at the Hadley edge.
const STORM_TRACK_ONSET_HADLEY_FRACTION = 0.75
// Inside the deep tropics the surface flow is set by upstream momentum rather
// than the vanishing local Coriolis, so the effective Coriolis is floored at
// this fraction of a Hadley-cell width.
const EQUATORIAL_FLOOR_FRACTION = 2 / 3
const THERMAL_COUPLING = 0.1
const KATABATIC_FORCE = 20.0
const KATABATIC_FRICTION = 1.0
const SPEED_SCALE = 0.45
// Open-ocean fetch: over a latitude band that is nearly all water (the
// Southern Ocean, and only there on Earth) the surface wind builds up with no
// continental friction or blocking to interrupt it -- the Roaring Forties.
// Scales up ocean-cell wind speed with the zonal ocean fraction at that
// latitude; broken-up basins (the NH westerlies) get little of it.
const OPEN_OCEAN_FETCH_BOOST = 2
// Longitude smoothing (in 3-degree bins) of the surface trough. Narrower
// than the rain module's so monsoon troughs over summer continents survive.
const TROUGH_HALF_WINDOW_BINS = 5
// Broad high terrain heats the air above it more than free-atmosphere lapse
// implies (the elevated heat source that builds the Tibetan heat low), so
// the trough sees a warmer sea-level-reduced surface there in the warm season.
const PLATEAU_HEAT_PER_KM = 3
// A summer continent warmer than the ocean at its own latitude carries a
// heat low on top of the Hadley template (the Mongolian and Iranian lows),
// drawing in flow from the surrounding oceans. Only anomalies past the
// threshold count, so ordinary land-sea noise does not.
const HEAT_LOW_COUPLING = 0.8
const HEAT_LOW_THRESHOLD_C = 5
// Ice sheets have a large sea-level-reduced anomaly that means nothing at the
// surface, so a heat low needs the actual surface to be warm.
const HEAT_LOW_MIN_SURFACE_C = 5
// Fraction of the subtropical ridge / polar-front trough amplitude kept where
// the boundary's latitude band is entirely land; the rest is ocean-only.
const RIDGE_LAND_AMPLITUDE = 0.6
const POLAR_TROUGH_LAND_AMPLITUDE = 0
// Cell collapse: as rotation slows (Coriolis vanishes) or axial tilt gets
// extreme (the sub-solar point reaching the poles), the Ferrel and polar cells
// and the subtropical ridge disappear -- the circulation becomes a single
// thermally-direct overturning cell from the warm thermal equator to the cold
// opposite side. `cellCollapse` in [0, 1] blends the Hadley/Ferrel/polar
// pressure profile toward that single-cell profile (0 = Earth-like).
const COLLAPSE_TILT_EDGE0 = 50
const COLLAPSE_TILT_EDGE1 = 75
const EARTH_POLAR_CORIOLIS = 1.458e-4
// Western-boundary flow: along the western edge of an ocean basin the
// surface flow carries an along-boundary component toward the summer pole,
// the stand-in for the western intensification a steady balance cannot
// produce (cross-equatorial jets near the equator, the poleward western
// flank of the summer subtropical anticyclone). It decays eastward over
// the ocean and is turned in the Coriolis sense.
const BOUNDARY_FLOW_MS = 8
const BOUNDARY_TURN_DEG = 30
const BOUNDARY_DECAY_BINS = 3
const BOUNDARY_REACH_BINS = 6
const BOUNDARY_LAND_MIN = 0.5
// Eastern-boundary flow: along a continent's west coast, the surface wind on
// the eastern flank of the oceanic subtropical high is equatorward alongshore
// -- the upwelling regime (California, Iberia, Chile, Namibia). The pressure
// template smooths the high's eastern edge against the coast and underplays
// it, so it is added explicitly. It is GATED on a real subtropical high
// actually sitting offshore (pressure a few bins west above the zonal mean):
// a monsoon coast (western India, Somalia) has an offshore trough instead and
// its onshore-poleward summer jet must not be pushed the other way.
const EAST_BOUNDARY_FLOW_MS = 6
const EAST_BOUNDARY_TURN_DEG = 20
// Offshore pressure anomaly (template units above the latitude's zonal mean)
// at which the eastern-boundary term reaches full strength; it is zero where
// the offshore pressure is at or below the zonal mean.
const EAST_BOUNDARY_HIGH_FULL = 0.15
// Equatorial superrotation: on slow rotators upper-atmosphere momentum
// transfer drives flow faster than the surface rotates, showing up as
// westerlies at the equator. Gated on cellCollapse, so Earth-strength
// rotation (collapse 0) is untouched. No GCM surface number pins the
// strength, so it merely offsets collapsed-trade strength (~3 m/s) rather
// than claiming a magnitude.
const SUPERROTATION_FLOW_MS = 3
const SUPERROTATION_WIDTH_DEG = 15
const DEG2RAD = Math.PI / 180

function outerBase({
	boundaryIndex,
	hoursPerDay,
}: OuterBoundaryBaseInput): number {
	return MATH.piecewise({
		domain: LOG_OUTER_BASE_DAY_ANCHORS,
		range: OUTER_BASES[boundaryIndex],
		x: Math.log(hoursPerDay),
	})
}

function cellBoundaries({
	teq,
	ridgeTeq,
	bases,
	hemisphere,
}: {
	teq: number
	ridgeTeq: number
	bases: number[]
	hemisphere: number
}): number[] {
	const offsets: number[] = []
	let lo = 0
	for (let k = 0; k < NUM_BOUNDARIES - 1; k++) {
		const coupling = BOUNDARY_TEQ_COUPLING ** (k + 1)
		const hi = Math.max(
			lo + 1,
			bases[k] + hemisphere * (coupling * ridgeTeq - teq),
		)
		offsets.push(hi)
		lo = hi
	}
	return offsets
}

// Boundary offsets depend only on (teq, ridgeTeq, hemisphere) at a longitude
// bin, the same handful of values for every cell sharing that bin, so
// precompute them once per (bin, hemisphere) instead of allocating a fresh
// offsets array per cell.
function cellBoundariesTable({
	teqByLon,
	ridgeTeqByLon,
	bases,
}: {
	teqByLon: Float32Array
	ridgeTeqByLon: Float32Array
	bases: number[]
}): Float32Array {
	const lonBins = teqByLon.length
	const stride = NUM_BOUNDARIES - 1
	const table = new Float32Array(lonBins * 2 * stride)
	for (let bin = 0; bin < lonBins; bin++) {
		const teq = teqByLon[bin]
		const ridgeTeq = ridgeTeqByLon[bin]
		for (const hemisphere of [-1, 1]) {
			const offsets = cellBoundaries({
				teq,
				ridgeTeq,
				bases,
				hemisphere,
			})
			const rowStart = (bin * 2 + (hemisphere > 0 ? 1 : 0)) * stride
			for (let k = 0; k < stride; k++) table[rowStart + k] = offsets[k]
		}
	}
	return table
}

// Default boundary-count/spacing: the fixed geometric-coupling template.
// Alternative generators (e.g. a physically-derived cell count reacting to
// rotation speed) can be injected via ComputeWindVectorsWithLargeScaleInput's
// cellBoundariesGenerator, matching largeScaleSolver's injection pattern.
const standardCellBoundaries: CellBoundariesGenerator = ({
	teqByLon,
	ridgeTeqByLon,
	hw,
	hoursPerDay,
}): CellBoundariesResult => {
	const bases = [hw]
	for (let k = 0; k < OUTER_BASES.length; k++)
		bases.push(outerBase({ boundaryIndex: k, hoursPerDay }))
	return {
		offsets: cellBoundariesTable({ teqByLon, ridgeTeqByLon, bases }),
		boundaryCount: NUM_BOUNDARIES,
	}
}

function cellSegment({
	lat,
	teq,
	bin,
	boundaryOffsets,
	boundaryCount,
}: {
	lat: number
	teq: number
	bin: number
	boundaryOffsets: Float32Array
	boundaryCount: number
}): CellSegment {
	const s = lat >= teq ? 1 : -1
	const d = s * (lat - teq)
	const stride = boundaryCount - 1
	const rowStart = (bin * 2 + (s > 0 ? 1 : 0)) * stride
	const lastCell = stride - 1
	let lo = 0
	for (let k = 0; k <= lastCell; k++) {
		const hi = boundaryOffsets[rowStart + k]
		if (d <= hi || k === lastCell) {
			return {
				k,
				hemisphere: s,
				t: MATH.smoothstep({ edge0: lo, edge1: hi, x: d }),
			}
		}
		lo = hi
	}
	return { k: lastCell, hemisphere: s, t: 1 }
}

// Default boundary-value generator: the fixed, hand-fit per-degree-C
// coefficients, accumulated from the previous boundary (this template's small,
// fixed cell count doesn't telescope-cancel; see wind/full/physical-cells for
// a generator built for many cells, which can't use this cumulative approach).
// An alternative can be injected via ComputeWindVectorsWithLargeScaleInput's
// cellPressureAtBoundaryGenerator, matching cellBoundariesGenerator's pattern.
const standardCellPressureAtBoundary: CellPressureAtBoundaryGenerator = ({
	k,
	cellCollapse,
	previousPressureAt,
	contrastFromPrev,
}): number => {
	let perC: number
	if (k === 1) perC = DIRECT_CELL_PRESSURE_PER_C
	else if (k === 2) perC = -INDIRECT_CELL_PRESSURE_PER_C
	else
		perC = k % 2 === 1 ? POLAR_CELL_PRESSURE_PER_C : -POLAR_CELL_PRESSURE_PER_C
	// Collapsed circulation: every cell is thermally direct, so pressure rises
	// monotonically from the thermal equator to the cold pole.
	const blended =
		(1 - cellCollapse) * perC + cellCollapse * DIRECT_CELL_PRESSURE_PER_C
	return previousPressureAt + blended * contrastFromPrev
}

function boundaryPressure({
	base,
	k,
	oceanFrac,
	cellCollapse,
}: {
	base: number
	k: number
	oceanFrac: number
	cellCollapse: number
}): number {
	if (k === 0) return base
	// The subtropical ridge and the polar-front trough are ocean features:
	// over land the surface temperature swings far more than the cells'
	// dynamics assume, so their template amplitude is held only over ocean.
	// A collapsed circulation has neither feature, so the suppression fades.
	const rawLandAmp =
		k === 1 ? RIDGE_LAND_AMPLITUDE : k === 2 ? POLAR_TROUGH_LAND_AMPLITUDE : 1
	const landAmplitude = rawLandAmp + (1 - rawLandAmp) * cellCollapse
	return base * (landAmplitude + (1 - landAmplitude) * oceanFrac)
}

function computeTroughByLon({
	mesh,
	seaLevelTemps,
}: {
	mesh: SphereMesh
	seaLevelTemps: Float32Array
}): Float32Array {
	return RAIN.computeThermalEquator({
		mesh,
		temps: seaLevelTemps,
		halfWindowBins: TROUGH_HALF_WINDOW_BINS,
	})
}

function computePressureField({
	mesh,
	seaLevelTemps,
	elevation_km,
	heatLow,
	teqByLon,
	ridgeTeqByLon,
	hoursPerDay,
	planetRadiusKm,
	cellCollapse,
	cellBoundariesGenerator,
	cellPressureAtBoundaryGenerator,
}: {
	mesh: SphereMesh
	seaLevelTemps: Float32Array
	elevation_km: Float32Array
	heatLow: Float32Array
	teqByLon: Float32Array
	ridgeTeqByLon: Float32Array
	hoursPerDay: number
	planetRadiusKm: number
	cellCollapse: number
	cellBoundariesGenerator: CellBoundariesGenerator
	cellPressureAtBoundaryGenerator: CellPressureAtBoundaryGenerator
}): PressureComponents {
	const N = mesh.numRegions
	const { adjOffset, adjList } = mesh
	const { latDeg, regionBin } = RAIN.getClimateGeometry(mesh)
	const hw = RAIN.hadleyWidth(hoursPerDay)

	const LAT_BINS = 60
	const latBinOf = (lat: number) =>
		Math.max(
			0,
			Math.min(LAT_BINS - 1, Math.floor(((lat + 90) / 180) * LAT_BINS)),
		)
	const latBinSum = new Float64Array(LAT_BINS)
	const latBinCount = new Int32Array(LAT_BINS)
	for (let r = 0; r < N; r++) {
		const bin = latBinOf(latDeg[r])
		latBinSum[bin] += seaLevelTemps[r]
		latBinCount[bin]++
	}
	const latBinMean = new Float32Array(LAT_BINS)
	for (let i = 0; i < LAT_BINS; i++) {
		latBinMean[i] = latBinCount[i] > 0 ? latBinSum[i] / latBinCount[i] : 15
	}
	const zonalMeanAt = (lat: number) => {
		const x = Math.max(
			0,
			Math.min(LAT_BINS - 1, ((lat + 90) / 180) * LAT_BINS - 0.5),
		)
		const i0 = Math.floor(x)
		const i1 = Math.min(LAT_BINS - 1, i0 + 1)
		return latBinMean[i0] + (latBinMean[i1] - latBinMean[i0]) * (x - i0)
	}

	const { offsets: boundaryOffsets, boundaryCount } = cellBoundariesGenerator({
		teqByLon,
		ridgeTeqByLon,
		hw,
		hoursPerDay,
		planetRadiusKm,
		latBinMean,
	})

	// Ocean fraction per (longitude bin, hemisphere, cell boundary): the cells
	// whose nearest boundary is k contribute to boundary k's land-sea mix.
	const lonBins = teqByLon.length
	const boundaries = boundaryCount
	const segments: CellSegment[] = new Array(N)
	const slot = ({
		bin,
		hemisphere,
		k,
	}: {
		bin: number
		hemisphere: number
		k: number
	}) => (bin * 2 + (hemisphere > 0 ? 1 : 0)) * boundaries + k
	const oceanCount = new Float32Array(lonBins * 2 * boundaries)
	const cellCount = new Float32Array(lonBins * 2 * boundaries)
	for (let r = 0; r < N; r++) {
		const seg = cellSegment({
			lat: latDeg[r],
			teq: teqByLon[regionBin[r]],
			bin: regionBin[r],
			boundaryOffsets,
			boundaryCount,
		})
		segments[r] = seg
		const nearest = seg.t < 0.5 ? seg.k : seg.k + 1
		const i = slot({
			bin: regionBin[r],
			hemisphere: seg.hemisphere,
			k: nearest,
		})
		cellCount[i]++
		if (elevation_km[r] <= 0) oceanCount[i]++
	}
	const oceanFrac = new Float32Array(lonBins * 2 * boundaries)
	for (let bin = 0; bin < lonBins; bin++) {
		for (let h = 0; h < 2; h++) {
			for (let k = 0; k < boundaries; k++) {
				let ocean = 0
				let cells = 0
				for (
					let d = -TROUGH_HALF_WINDOW_BINS;
					d <= TROUGH_HALF_WINDOW_BINS;
					d++
				) {
					const j = (((bin + d) % lonBins) + lonBins) % lonBins
					const i = (j * 2 + h) * boundaries + k
					ocean += oceanCount[i]
					cells += cellCount[i]
				}
				oceanFrac[(bin * 2 + h) * boundaries + k] =
					cells > 0 ? ocean / cells : 1
			}
		}
	}

	// Boundary pressures per (longitude bin, hemisphere) accumulated outward
	// from the trough, each cell adding its temperature contrast times its
	// direct/indirect coefficient.
	const boundaryBase = new Float32Array(lonBins * 2 * boundaries)
	const offsetsStride = boundaryCount - 1
	for (let bin = 0; bin < lonBins; bin++) {
		const teq = teqByLon[bin]
		for (const hemisphere of [-1, 1]) {
			const offsetsRow = (bin * 2 + (hemisphere > 0 ? 1 : 0)) * offsetsStride
			let pressureAt = 0
			let latPrev = teq
			for (let k = 1; k < boundaries; k++) {
				const latK = Math.max(
					-90,
					Math.min(90, teq + hemisphere * boundaryOffsets[offsetsRow + k - 1]),
				)
				pressureAt = cellPressureAtBoundaryGenerator({
					k,
					cellCollapse,
					latPrev,
					latK,
					teq,
					previousPressureAt: pressureAt,
					contrastFromPrev: zonalMeanAt(latPrev) - zonalMeanAt(latK),
					contrastFromTrough: zonalMeanAt(teq) - zonalMeanAt(latK),
				})
				boundaryBase[slot({ bin, hemisphere, k })] = pressureAt
				latPrev = latK
			}
		}
	}

	// The Hadley component rises from the trough to the ridge across the
	// Hadley cell and stays flat at the ridge value poleward of it, so scaling
	// it by surface torque balance changes only the trades, not the Ferrel and
	// polar gradients. The rest is whatever remains of the full template.
	const hadley = new Float32Array(N)
	const rest = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const lat = latDeg[r]
		const seg = segments[r]
		const at = (k: number) =>
			slot({ bin: regionBin[r], hemisphere: seg.hemisphere, k })
		const pLo = boundaryPressure({
			base: boundaryBase[at(seg.k)],
			k: seg.k,
			oceanFrac: oceanFrac[at(seg.k)],
			cellCollapse,
		})
		const pHi = boundaryPressure({
			base: boundaryBase[at(seg.k + 1)],
			k: seg.k + 1,
			oceanFrac: oceanFrac[at(seg.k + 1)],
			cellCollapse,
		})
		const ridge = boundaryPressure({
			base: boundaryBase[at(1)],
			k: 1,
			oceanFrac: oceanFrac[at(1)],
			cellCollapse,
		})
		// Warm-relative-to-zonal-mean surfaces (summer continents) are thermal
		// lows, cold ones (winter continents) thermal highs. Uses sea-level-
		// reduced temperature so plateaus register as heat sources instead of
		// as spurious cold highs.
		const thermalAnomaly =
			(-THERMAL_COUPLING * (seaLevelTemps[r] - latBinMean[latBinOf(lat)])) / 15
		hadley[r] = seg.k === 0 ? ridge * seg.t : ridge
		rest[r] =
			pLo + (pHi - pLo) * seg.t - hadley[r] + thermalAnomaly + heatLow[r]
	}

	const buf = new Float32Array(N)
	for (const field of [hadley, rest]) {
		for (let pass = 0; pass < 4; pass++) {
			for (let r = 0; r < N; r++) {
				let sum = field[r]
				let count = 1
				for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
					sum += field[adjList[j]]
					count++
				}
				buf[r] = sum / count
			}
			field.set(buf)
		}
	}

	return { hadley, rest }
}

// Shallow-water large-scale solver, an explicit time-march to a quasi-steady
// state. This is the default: see wind.md for its Earth-comparison numbers.
const shallowWaterSolver: LargeScaleSolver = ({
	latDeg,
	lonDeg,
	pressure,
	elevation_km,
	planetRadiusKm,
	coriolisSign,
	omegaRatio,
	pressureFactor,
	rawPerMs,
}) => {
	const raw = SHALLOW_WATER.surfaceWind({
		latDeg,
		lonDeg,
		pressure,
		elevation_km,
		planetRadiusM: planetRadiusKm * 1000,
		coriolisPolar: coriolisSign * omegaRatio * EARTH_POLAR_CORIOLIS,
		pressureScale: pressureFactor,
	})
	const u = new Float32Array(raw.u.length)
	const v = new Float32Array(raw.v.length)
	for (let i = 0; i < u.length; i++) {
		u[i] = raw.u[i] * rawPerMs
		v[i] = raw.v[i] * rawPerMs
	}
	return { u, v, coarsePressure: raw.coarsePressure }
}

function computeWindVectorsWithLargeScale({
	mesh,
	climate,
	elevation_km,
	params,
	month,
	surface,
	largeScaleSolver,
	cellBoundariesGenerator = standardCellBoundaries,
	cellPressureAtBoundaryGenerator = standardCellPressureAtBoundary,
}: ComputeWindVectorsWithLargeScaleInput): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	const N = mesh.numRegions
	const {
		absLatDeg,
		sinLat: sinLatArr,
		regionBin,
	} = RAIN.getClimateGeometry(mesh)

	const hoursPerDay = params?.hoursPerDay ?? TIME.hoursPerDay
	const planetRadiusKm = params?.planetRadiusKm ?? UNITS.defaultPlanetRadiusKm
	const hw = RAIN.hadleyWidth(hoursPerDay)
	// Collapse the Hadley/Ferrel/polar template toward a single equator-to-pole
	// cell for slow rotators (weak Coriolis) or extreme axial tilt (sub-solar
	// point reaching the poles). `effTilt` folds obliquity into [0, 90] --
	// 0 upright, 90 the pole facing the star.
	const axialTilt = Math.abs(params?.obliquity ?? 23.4) % 360
	const uprightTilt = axialTilt > 180 ? 360 - axialTilt : axialTilt
	const effTilt = uprightTilt > 90 ? 180 - uprightTilt : uprightTilt
	const cellCollapse = Math.max(
		WIND.rotationCollapse(hoursPerDay),
		MATH.smoothstep({
			edge0: COLLAPSE_TILT_EDGE0,
			edge1: COLLAPSE_TILT_EDGE1,
			x: effTilt,
		}),
	)
	// Coriolis parameter relative to Earth's polar value; retrograde rotation
	// flips the deflection.
	const omegaRatio = TIME.hoursPerDay / hoursPerDay
	const coriolisSign = UNITS.isRetrogradeObliquity(params?.obliquity ?? 0)
		? -1
		: 1
	const floorSin = Math.sin(DEG2RAD * hw * EQUATORIAL_FLOOR_FRACTION)
	// Template gradients are per radian, so the same pressure contrast spread
	// over a larger planet drives weaker winds. Thinner atmospheres have less
	// air mass resisting the same forcing; 1 bar is neutral.
	const radiusFactor = UNITS.defaultPlanetRadiusKm / planetRadiusKm
	const pressureFactor =
		1.0 / Math.sqrt(Math.max(params?.pressure ?? 1.0, 0.01))
	const rawPerMs = 1 / (SPEED_SCALE * radiusFactor * pressureFactor)

	const hasMonth = month !== undefined && month >= 0 && month < 12
	const temps = hasMonth
		? climate.temperature_monthly.subarray(month * N, (month + 1) * N)
		: climate.temperature_avg
	let seaLevelTemps: Float32Array
	if (hasMonth) {
		seaLevelTemps = climate.temperature_monthly_nolapse.subarray(
			month * N,
			(month + 1) * N,
		)
	} else {
		seaLevelTemps = new Float32Array(N)
		for (let m = 0; m < 12; m++) {
			for (let r = 0; r < N; r++) {
				seaLevelTemps[r] += climate.temperature_monthly_nolapse[m * N + r] / 12
			}
		}
	}

	const { latDeg } = RAIN.getClimateGeometry(mesh)
	const OCEAN_BINS = 60
	const oceanBinOf = (lat: number) =>
		Math.max(
			0,
			Math.min(OCEAN_BINS - 1, Math.floor(((lat + 90) / 180) * OCEAN_BINS)),
		)
	const oceanSum = new Float64Array(OCEAN_BINS)
	const oceanCount = new Int32Array(OCEAN_BINS)
	for (let r = 0; r < N; r++) {
		if (elevation_km[r] > 0) continue
		oceanSum[oceanBinOf(latDeg[r])] += seaLevelTemps[r]
		oceanCount[oceanBinOf(latDeg[r])]++
	}
	const oceanZonal = new Float32Array(OCEAN_BINS)
	for (let i = 0; i < OCEAN_BINS; i++) {
		let j = i
		let step = 0
		while (oceanCount[j] === 0 && step < OCEAN_BINS) {
			step++
			j = i + (step % 2 === 1 ? Math.ceil(step / 2) : -step / 2)
			j = Math.max(0, Math.min(OCEAN_BINS - 1, j))
		}
		oceanZonal[i] = oceanCount[j] > 0 ? oceanSum[j] / oceanCount[j] : 15
	}
	// The ocean surface the trough follows carries the mixed layer's thermal
	// inertia, which damps and delays the oceanic ITCZ's seasonal swing; the
	// EBM's monthly ocean temperature responds too quickly. The subtropical
	// ridge (and the cells poleward of it) stays on the monthly temperature.
	const daysPerYear = params?.daysPerYear ?? UNITS.defaultDaysPerYear
	const surfaceTemps = hasMonth
		? OCEAN_INERTIA.laggedSeaLevelTemps({
				climate,
				elevation_km,
				month,
				monthSeconds: (daysPerYear * hoursPerDay * 3600) / 12,
			})
		: seaLevelTemps
	const troughTemps = new Float32Array(N)
	const oceanTemps = new Float32Array(N)
	const heatLow = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const warmSeason = MATH.clamp01((temps[r] - climate.temperature_avg[r]) / 8)
		troughTemps[r] =
			surfaceTemps[r] +
			PLATEAU_HEAT_PER_KM * Math.max(0, elevation_km[r]) * warmSeason
		oceanTemps[r] = elevation_km[r] > 0 ? -Infinity : seaLevelTemps[r]
		const anomaly = troughTemps[r] - oceanZonal[oceanBinOf(latDeg[r])]
		const warmSurface = MATH.smoothstep({
			edge0: HEAT_LOW_MIN_SURFACE_C,
			edge1: HEAT_LOW_MIN_SURFACE_C + 10,
			x: temps[r],
		})
		const excess = warmSurface * Math.max(0, anomaly - HEAT_LOW_THRESHOLD_C)
		heatLow[r] = (-HEAT_LOW_COUPLING * excess) / 15
	}
	const teqByLon = computeTroughByLon({
		mesh,
		seaLevelTemps: troughTemps,
	})
	const ridgeTeqByLon = RAIN.computeThermalEquator({ mesh, temps: oceanTemps })
	const components = computePressureField({
		mesh,
		seaLevelTemps,
		elevation_km,
		heatLow,
		teqByLon,
		ridgeTeqByLon,
		hoursPerDay,
		planetRadiusKm,
		cellCollapse,
		cellBoundariesGenerator,
		cellPressureAtBoundaryGenerator,
	})
	const { lonDeg } = RAIN.getClimateGeometry(mesh)

	// Storm-track gustiness: baroclinic eddies carry a share of the thermal
	// wind across one scale height, R_d |dT/dy| / f, so gusts grow with the
	// meridional temperature gradient (per metre, so planet size matters) and
	// with slower rotation (larger eddies), and vanish with the storm tracks
	// when the cells collapse.
	const binDeg = 180 / OCEAN_BINS
	const metersPerDeg = planetRadiusKm * 1000 * DEG2RAD
	const rotationRate = (2 * Math.PI) / (hoursPerDay * 3600)
	const gustByBin = new Float32Array(OCEAN_BINS)
	for (let i = 0; i < OCEAN_BINS; i++) {
		const lo = Math.max(0, i - 1)
		const hi = Math.min(OCEAN_BINS - 1, i + 1)
		const gradientPerM =
			Math.abs(oceanZonal[hi] - oceanZonal[lo]) /
			((hi - lo) * binDeg * metersPerDeg)
		const binLat = -90 + (i + 0.5) * binDeg
		const f =
			2 *
			rotationRate *
			Math.max(Math.abs(Math.sin(binLat * DEG2RAD)), floorSin)
		const thermalWind = (DRY_AIR_GAS_CONSTANT_J_KG_K * gradientPerM) / f
		const gustMs =
			Math.min(
				MAX_STORM_GUST_MS,
				STORM_GUST_THERMAL_WIND_FRACTION * thermalWind,
			) *
			(1 - cellCollapse)
		gustByBin[i] = gustMs * rawPerMs
	}
	const gust = new Float32Array(N)
	const coriolis = new Float32Array(N)
	const hemisphere = new Int8Array(N)
	const northHadley = new Float32Array(N)
	const southHadley = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const effSin = Math.max(
			Math.abs(sinLatArr[r]),
			floorSin * MATH.smoothstep({ edge0: 0, edge1: 5, x: absLatDeg[r] }),
		)
		coriolis[r] = coriolisSign * Math.sign(sinLatArr[r]) * effSin * omegaRatio
		hemisphere[r] = latDeg[r] >= teqByLon[regionBin[r]] ? 1 : -1
		// Baroclinic storms live poleward of the Hadley cell, whose flow is
		// steady; the gust fades in across its edge.
		gust[r] =
			gustByBin[oceanBinOf(latDeg[r])] *
			MATH.smoothstep({
				edge0: STORM_TRACK_ONSET_HADLEY_FRACTION * hw,
				edge1: hw,
				x: Math.abs(latDeg[r] - teqByLon[regionBin[r]]),
			})
		if (hemisphere[r] > 0) northHadley[r] = components.hadley[r]
		else southHadley[r] = components.hadley[r]
	}
	const restPressure = components.rest
	const northPressure = northHadley
	const southPressure = southHadley
	const hadleyScale = TORQUE_BALANCE.hadleyScales({
		mesh,
		rest: restPressure,
		north: northPressure,
		south: southPressure,
		coriolis,
		friction: FRICTION,
		hemisphere,
		gust,
	})
	const pressure = new Float32Array(N)
	for (let r = 0; r < N; r++)
		pressure[r] =
			restPressure[r] +
			hadleyScale.north * northPressure[r] +
			hadleyScale.south * southPressure[r]

	// The large-scale solver carries the coarse pressure response. Keep only
	// the mesh-scale residual for the local balance below.
	const largeScale = largeScaleSolver({
		latDeg,
		lonDeg,
		pressure,
		elevation_km,
		planetRadiusKm,
		coriolisSign,
		omegaRatio,
		pressureFactor,
		rawPerMs,
	})
	const localPressure = new Float32Array(N)
	for (let r = 0; r < N; r++)
		localPressure[r] = pressure[r] - largeScale.coarsePressure[r]

	// Land fraction on a coarse lat-lon grid and, per cell, how far east of a
	// western land boundary it sits.
	const lonBinCount = teqByLon.length
	const latBinCount = OCEAN_BINS
	const landCount = new Float32Array(lonBinCount * latBinCount)
	const cellCount = new Float32Array(lonBinCount * latBinCount)
	for (let r = 0; r < N; r++) {
		const idx = oceanBinOf(latDeg[r]) * lonBinCount + regionBin[r]
		cellCount[idx]++
		if (elevation_km[r] > 0) landCount[idx]++
	}
	const landFracAt = (latBin: number, lonBin: number) => {
		const idx =
			latBin * lonBinCount +
			(((lonBin % lonBinCount) + lonBinCount) % lonBinCount)
		return cellCount[idx] > 0 ? landCount[idx] / cellCount[idx] : 0
	}

	// Coarse ocean pressure per (latBin, lonBin) and its zonal mean, for the
	// eastern-boundary gate: only apply the west-coast term where a real
	// subtropical high sits offshore (pressure west of the coast above the
	// zonal mean), not where a monsoon trough does.
	const oceanPSum = new Float64Array(lonBinCount * latBinCount)
	const oceanPCnt = new Float32Array(lonBinCount * latBinCount)
	for (let r = 0; r < N; r++) {
		if (elevation_km[r] > 0) continue
		const idx = oceanBinOf(latDeg[r]) * lonBinCount + regionBin[r]
		oceanPSum[idx] += pressure[r]
		oceanPCnt[idx]++
	}
	const latPMean = new Float32Array(latBinCount)
	for (let lb = 0; lb < latBinCount; lb++) {
		let s = 0
		let c = 0
		for (let xb = 0; xb < lonBinCount; xb++) {
			const idx = lb * lonBinCount + xb
			if (oceanPCnt[idx] > 0) {
				s += oceanPSum[idx]
				c += oceanPCnt[idx]
			}
		}
		latPMean[lb] = c > 0 ? s / c : 0
	}
	const oceanPAt = (latBin: number, lonBin: number) => {
		const idx =
			latBin * lonBinCount +
			(((lonBin % lonBinCount) + lonBinCount) % lonBinCount)
		return oceanPCnt[idx] > 0
			? oceanPSum[idx] / oceanPCnt[idx]
			: latPMean[latBin]
	}

	const boundaryStrength = new Float32Array(N)
	const eastBoundaryStrength = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		const latBin = oceanBinOf(latDeg[r])
		const own = landFracAt(latBin, regionBin[r])
		if (own >= BOUNDARY_LAND_MIN) {
			// A coastal land cell is a western boundary only with ocean east of it.
			const eastIsOcean =
				landFracAt(latBin, regionBin[r] + 1) < BOUNDARY_LAND_MIN ? 1 : 0
			boundaryStrength[r] = (1 - own) * eastIsOcean
			const westIsOcean =
				landFracAt(latBin, regionBin[r] - 1) < BOUNDARY_LAND_MIN ? 1 : 0
			if (westIsOcean) {
				// Offshore pressure anomaly a couple bins west of the coast.
				const offshore =
					(oceanPAt(latBin, regionBin[r] - 2) +
						oceanPAt(latBin, regionBin[r] - 3)) *
					0.5
				const highFactor = MATH.smoothstep({
					edge0: 0,
					edge1: EAST_BOUNDARY_HIGH_FULL,
					x: offshore - latPMean[latBin],
				})
				eastBoundaryStrength[r] = (1 - own) * highFactor
			}
			continue
		}
		for (let k = 1; k <= BOUNDARY_REACH_BINS; k++) {
			if (landFracAt(latBin, regionBin[r] - k) < BOUNDARY_LAND_MIN) continue
			boundaryStrength[r] = Math.exp(-(k - 1) / BOUNDARY_DECAY_BINS)
			break
		}
	}
	const declination = hasMonth ? climate.declination_monthly[month] : 0
	const obliquity = Math.max(1, Math.abs(params?.obliquity ?? 23.4))
	const seasonSign = Math.sign(declination)
	const seasonMag = Math.min(1, Math.abs(declination) / obliquity)
	const boundaryTurn = BOUNDARY_TURN_DEG * DEG2RAD
	const eastBoundaryTurn = EAST_BOUNDARY_TURN_DEG * DEG2RAD

	const windU = new Float32Array(N)
	const windV = new Float32Array(N)
	const rawSpeed = new Float32Array(N)

	// Pressure gradient in template units per radian; terrain slope in km/km.
	const pressureGradient = SURFACE_BALANCE.meshGradient({
		mesh,
		field: localPressure,
	})
	const elevationGradient = SURFACE_BALANCE.meshGradient({
		mesh,
		field: elevation_km,
	})
	const roughnessField = surface
		? ROUGHNESS.surfaceFactorField({ N, surface })
		: undefined

	for (let r = 0; r < N; r++) {
		const forceEast = -pressureGradient.east[r]
		const forceNorth = -pressureGradient.north[r]
		const gradEEast = elevationGradient.east[r] / planetRadiusKm
		const gradENorth = elevationGradient.north[r] / planetRadiusKm

		const slopeMag = Math.hypot(gradEEast, gradENorth)
		const gEastHat = slopeMag > 1e-9 ? gradEEast / slopeMag : 0
		const gNorthHat = slopeMag > 1e-9 ? gradENorth / slopeMag : 0

		const f = coriolis[r]
		const bl = SURFACE_BALANCE.balance({
			friction: FRICTION,
			coriolis: f,
			forceEast,
			forceNorth,
		})
		const roughness = roughnessField ? roughnessField[r] : 1
		let u = bl.u * roughness
		let v = bl.v * roughness
		if (seasonSign !== 0 && boundaryStrength[r] > 0) {
			const lat = latDeg[r]
			const tropical = Math.exp(-((lat / (0.5 * hw)) ** 2))
			const summerSide = Math.sign(lat) === seasonSign ? 1 : 0
			const subtropical =
				summerSide * Math.exp(-(((Math.abs(lat) - hw) / (hw / 3)) ** 2))
			const weight = Math.min(1, tropical + subtropical)
			const speed =
				BOUNDARY_FLOW_MS * seasonMag * weight * boundaryStrength[r] * rawPerMs
			const east =
				seasonSign * Math.sign(lat) * coriolisSign * Math.sin(boundaryTurn)
			u += speed * east * roughness
			v += speed * seasonSign * Math.cos(boundaryTurn) * roughness
		}
		if (seasonSign !== 0 && eastBoundaryStrength[r] > 0) {
			const lat = latDeg[r]
			// Equatorward alongshore on the summer-hemisphere subtropical west
			// coast, with a slight onshore friction turn. Only fires where the
			// offshore-high gate (eastBoundaryStrength) is non-zero.
			const summerSide = Math.sign(lat) === seasonSign ? 1 : 0
			const weight =
				summerSide * Math.exp(-(((Math.abs(lat) - 0.9 * hw) / (0.7 * hw)) ** 2))
			const speed =
				EAST_BOUNDARY_FLOW_MS *
				seasonMag *
				weight *
				eastBoundaryStrength[r] *
				rawPerMs
			u += speed * Math.sin(eastBoundaryTurn) * roughness
			v -= speed * Math.sign(lat) * Math.cos(eastBoundaryTurn) * roughness
		}
		if (cellCollapse > 0) {
			const lat = latDeg[r]
			const speed =
				SUPERROTATION_FLOW_MS *
				cellCollapse *
				Math.exp(-((lat / SUPERROTATION_WIDTH_DEG) ** 2)) *
				rawPerMs
			u += speed * coriolisSign * roughness
		}
		u += largeScale.u[r] * roughness
		v += largeScale.v[r] * roughness

		// Katabatic drainage: over cold sloped surfaces (ice sheets, high
		// plateaus) dense surface air is pushed downhill. It is a shallow,
		// strongly frictional layer, so it is balanced with its own higher
		// friction: Coriolis still deflects it (Antarctic outflow becomes
		// coastal easterlies) but it keeps a large downslope component. It is
		// already a surface flow, so terrain roughness is not applied again.
		if (slopeMag > 1e-9 && elevation_km[r] > 0.2) {
			// Perennially cold surfaces (ice sheets) hold the persistent
			// inversion that drives drainage; seasonally cold continents don't.
			const iceFactor = MATH.smoothstep({
				edge0: -5,
				edge1: -15,
				x: climate.temperature_avg[r],
			})
			const coldFactor = MATH.smoothstep({
				edge0: 0,
				edge1: -25,
				x: temps[r],
			})
			const kMag =
				KATABATIC_FORCE *
				iceFactor *
				coldFactor *
				MATH.smoothstep({ edge0: 0.0001, edge1: 0.0013, x: slopeMag })
			if (kMag > 0) {
				const k = SURFACE_BALANCE.balance({
					friction: KATABATIC_FRICTION,
					coriolis: f,
					forceEast: -gEastHat * kMag,
					forceNorth: -gNorthHat * kMag,
				})
				u += k.u
				v += k.v
			}
		}

		// Orographic blocking: air moving into rising terrain is partly
		// stopped and steered along the contour rather than lifted over.
		if (slopeMag > 1e-9 && elevation_km[r] > 0) {
			const upComp = u * gEastHat + v * gNorthHat
			if (upComp > 0) {
				const block = MATH.smoothstep({
					edge0: 0.00016,
					edge1: 0.0021,
					x: slopeMag,
				})
				const tEast = -gNorthHat
				const tNorth = gEastHat
				const s = u * tEast + v * tNorth >= 0 ? 1 : -1
				u += block * (-0.7 * upComp * gEastHat + 0.35 * upComp * s * tEast)
				v += block * (-0.7 * upComp * gNorthHat + 0.35 * upComp * s * tNorth)
			}
		}

		const mag = Math.hypot(u, v)
		rawSpeed[r] = mag
		if (mag > 1e-9) {
			windU[r] = u / mag
			windV[r] = v / mag
		}
	}

	// Zonal ocean fraction per latitude band, for the open-ocean fetch boost.
	const latTotal = new Int32Array(OCEAN_BINS)
	const latOcean = new Int32Array(OCEAN_BINS)
	for (let r = 0; r < N; r++) {
		const b = oceanBinOf(latDeg[r])
		latTotal[b]++
		if (elevation_km[r] <= 0) latOcean[b]++
	}

	const windSpeed = new Float32Array(N)
	for (let r = 0; r < N; r++) {
		let fetch = 1
		if (elevation_km[r] <= 0) {
			const b = oceanBinOf(latDeg[r])
			const zonalOcean = latTotal[b] > 0 ? latOcean[b] / latTotal[b] : 1
			fetch =
				1 +
				OPEN_OCEAN_FETCH_BOOST *
					MATH.smoothstep({ edge0: 0.65, edge1: 0.98, x: zonalOcean })
		}
		windSpeed[r] =
			rawSpeed[r] * SPEED_SCALE * radiusFactor * pressureFactor * fetch
	}

	return { windU, windV, pressure, windSpeed }
}

function computeWindVectors(input: ComputeWindVectorsInput): {
	windU: Float32Array
	windV: Float32Array
	pressure: Float32Array
	windSpeed: Float32Array
} {
	return computeWindVectorsWithLargeScale({
		...input,
		largeScaleSolver: shallowWaterSolver,
	})
}

export const FULL_WIND = {
	computeWindVectors,
	computeWindVectorsWithLargeScale,
}

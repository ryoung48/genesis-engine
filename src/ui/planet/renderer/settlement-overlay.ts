import * as THREE from "three"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import type {
	BuildGlobeRealSettlementsParams,
	BuildMapRealSettlementsParams,
	BuildMapSettlementsParams,
} from "@/ui/planet/renderer/types"

const TERRAIN_ELEVATION_SCALE = 0.04
const SETTLEMENT_LIFT = 0.005
const MAP_Z_LIFT = 0.005
const MAP_Z_ELEVATION_FACTOR = 0.5
const SETTLEMENT_GLOBE_SCALE_MULTIPLIER = 0.75
const SETTLEMENT_MAP_RADIUS_MULTIPLIER = 0.5

// ── Tier definitions ─────────────────────────────────────────────────────────

interface SettlementTier {
	minPop: number
	maxPop: number
	label: string
	/** Canvas texture factory */
	buildTexture: (isCapital: boolean) => THREE.CanvasTexture
	/** Min/max sprite scale for globe mode (interpolated by urbanPop) */
	minGlobeScale: number
	maxGlobeScale: number
	/** Min/max circle radius for map mode (interpolated by urbanPop) */
	minMapRadius: number
	maxMapRadius: number
}

function makeCanvasTexture(
	size: number,
	draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
	const canvas = document.createElement("canvas")
	canvas.width = size
	canvas.height = size
	const ctx = canvas.getContext("2d")!
	ctx.clearRect(0, 0, size, size)
	draw(ctx, size, size)
	const tex = new THREE.CanvasTexture(canvas)
	tex.minFilter = THREE.LinearFilter
	tex.magFilter = THREE.LinearFilter
	return tex
}

// Styling constants
const RING_COLOR = "#1e293b"
const RING_WIDTH_RATIO = 0.06 // fraction of canvas size
const CROSS_COLOR = "#1e293b"
const CROSS_WIDTH_RATIO = 0.045
const FILL_COLOR = "#ffffff"
const SOLID_BLACK = "#0f172a"
const CAPITAL_FILL_COLOR = "#dc2626"

interface SettlementVisualStyle {
	fillColor: string
}

function getSettlementVisualStyle(isCapital: boolean): SettlementVisualStyle {
	return { fillColor: isCapital ? CAPITAL_FILL_COLOR : FILL_COLOR }
}

function drawRing(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	radius: number,
	lineWidth: number,
	color: string,
) {
	ctx.beginPath()
	ctx.arc(cx, cy, radius, 0, Math.PI * 2)
	ctx.strokeStyle = color
	ctx.lineWidth = lineWidth
	ctx.stroke()
}

function drawCross(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	size: number,
	lineWidth: number,
	color: string,
) {
	ctx.strokeStyle = color
	ctx.lineWidth = lineWidth
	ctx.lineCap = "round"
	ctx.beginPath()
	ctx.moveTo(cx - size, cy)
	ctx.lineTo(cx + size, cy)
	ctx.moveTo(cx, cy - size)
	ctx.lineTo(cx, cy + size)
	ctx.stroke()
}

function drawFilledCircle(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	radius: number,
	color: string,
) {
	ctx.beginPath()
	ctx.arc(cx, cy, radius, 0, Math.PI * 2)
	ctx.fillStyle = color
	ctx.fill()
}

const TIER_VISUALS = [
	{
		minGlobeScale: 0.0025,
		maxGlobeScale: 0.005,
		minMapRadius: 0.0008,
		maxMapRadius: 0.0017,
		buildTexture: (isCapital) =>
			makeCanvasTexture(128, (ctx, w) => {
				const style = getSettlementVisualStyle(isCapital)
				const cx = w / 2
				const cy = w / 2
				const r = w * 0.4
				drawFilledCircle(ctx, cx, cy, r, style.fillColor)
				drawRing(ctx, cx, cy, r, w * RING_WIDTH_RATIO, RING_COLOR)
			}),
	},
	{
		minGlobeScale: 0.005,
		maxGlobeScale: 0.0065,
		minMapRadius: 0.0017,
		maxMapRadius: 0.0022,
		buildTexture: (isCapital) =>
			makeCanvasTexture(128, (ctx, w) => {
				const style = getSettlementVisualStyle(isCapital)
				const cx = w / 2
				const cy = w / 2
				const r = w * 0.42
				drawFilledCircle(ctx, cx, cy, r, style.fillColor)
				drawRing(ctx, cx, cy, r, w * RING_WIDTH_RATIO, RING_COLOR)
			}),
	},
	{
		minGlobeScale: 0.0055,
		maxGlobeScale: 0.0075,
		minMapRadius: 0.0018,
		maxMapRadius: 0.0027,
		buildTexture: (isCapital) =>
			makeCanvasTexture(128, (ctx, w) => {
				const style = getSettlementVisualStyle(isCapital)
				const cx = w / 2
				const cy = w / 2
				const r = w * 0.38
				drawFilledCircle(ctx, cx, cy, r, style.fillColor)
				drawRing(ctx, cx, cy, r, w * RING_WIDTH_RATIO, RING_COLOR)
				drawCross(ctx, cx, cy, r * 0.55, w * CROSS_WIDTH_RATIO, CROSS_COLOR)
			}),
	},
	{
		minGlobeScale: 0.007,
		maxGlobeScale: 0.01,
		minMapRadius: 0.0024,
		maxMapRadius: 0.0033,
		buildTexture: (isCapital) =>
			makeCanvasTexture(128, (ctx, w) => {
				const style = getSettlementVisualStyle(isCapital)
				const cx = w / 2
				const cy = w / 2
				const outerR = w * 0.42
				const innerR = w * 0.35
				const lw = w * RING_WIDTH_RATIO
				drawFilledCircle(ctx, cx, cy, outerR, style.fillColor)
				drawRing(ctx, cx, cy, outerR, lw * 0.5, RING_COLOR)
				drawRing(ctx, cx, cy, innerR, lw * 0.5, RING_COLOR)
			}),
	},
	{
		minGlobeScale: 0.009,
		maxGlobeScale: 0.012,
		minMapRadius: 0.003,
		maxMapRadius: 0.004,
		buildTexture: (isCapital) =>
			makeCanvasTexture(128, (ctx, w) => {
				const style = getSettlementVisualStyle(isCapital)
				const cx = w / 2
				const cy = w / 2
				const outerR = w * 0.42
				const innerR = w * 0.35
				const lw = w * RING_WIDTH_RATIO
				drawFilledCircle(ctx, cx, cy, outerR, style.fillColor)
				drawRing(ctx, cx, cy, outerR, lw * 0.5, RING_COLOR)
				drawRing(ctx, cx, cy, innerR, lw * 0.5, RING_COLOR)
				drawCross(ctx, cx, cy, innerR * 0.6, w * CROSS_WIDTH_RATIO, CROSS_COLOR)
			}),
	},
	{
		minGlobeScale: 0.011,
		maxGlobeScale: 0.018,
		minMapRadius: 0.004,
		maxMapRadius: 0.0065,
		buildTexture: (isCapital) =>
			makeCanvasTexture(128, (ctx, w) => {
				const style = getSettlementVisualStyle(isCapital)
				const cx = w / 2
				const cy = w / 2
				const outerR = w * 0.42
				const innerR = w * 0.35
				const lw = w * RING_WIDTH_RATIO
				drawFilledCircle(ctx, cx, cy, outerR, style.fillColor)
				drawRing(ctx, cx, cy, outerR, lw * 0.5, RING_COLOR)
				drawFilledCircle(ctx, cx, cy, innerR, SOLID_BLACK)
				drawRing(ctx, cx, cy, innerR, lw * 0.5, RING_COLOR)
			}),
	},
] as const satisfies ReadonlyArray<
	Omit<SettlementTier, "minPop" | "maxPop" | "label">
>

function settlementTiers(world: SerializedGenesisWorld): SettlementTier[] {
	const thresholds = SETTLEMENT_TUNING.getSettlementRenderThresholds(
		world.params?.era,
	)
	return TIER_VISUALS.map((visual, index) => ({
		...visual,
		minPop: thresholds[index],
		maxPop: thresholds[index + 1] ?? Infinity,
		label:
			thresholds[index + 1] === undefined
				? `>${thresholds[index].toLocaleString()}`
				: `${thresholds[index].toLocaleString()}-${thresholds[index + 1].toLocaleString()}`,
	}))
}

function collectCapitalProvinces(
	world: SerializedGenesisWorld,
	locationsLength: number,
): Set<number> {
	const capitals = new Set<number>()
	const seeds = world.nations?.seeds
	if (!seeds) return capitals
	for (let i = 0; i < seeds.length; i++) {
		const province = seeds[i]
		if (province >= 0 && province < locationsLength) capitals.add(province)
	}
	return capitals
}

function getTierIndex(urbanPop: number, tiers: SettlementTier[]): number {
	for (let t = 0; t < tiers.length; t++) {
		if (urbanPop >= tiers[t].minPop && urbanPop < tiers[t].maxPop) return t
	}
	if (urbanPop >= tiers[tiers.length - 1]!.minPop) return tiers.length - 1
	return -1
}

/** Fraction [0, 1] of where `pop` sits within its tier's range (log scale). */
function tierFraction(pop: number, tier: SettlementTier): number {
	const lo = Math.log10(Math.max(1, tier.minPop))
	const hi = Math.log10(
		Number.isFinite(tier.maxPop) ? tier.maxPop : tier.minPop * 100,
	)
	const v = Math.log10(Math.max(1, pop))
	const range = hi - lo || 1
	return Math.max(0, Math.min(1, (v - lo) / range))
}

export function globeScaleForPop(
	pop: number,
	era: SerializedGenesisWorld["params"]["era"] | undefined = "lateMedieval",
): number {
	const tiers = settlementTiers({
		params: { era },
	} as SerializedGenesisWorld)
	const t = getTierIndex(pop, tiers)
	if (t < 0) return 0
	const tier = tiers[t]
	const f = tierFraction(pop, tier)
	return (
		(tier.minGlobeScale + (tier.maxGlobeScale - tier.minGlobeScale) * f) *
		SETTLEMENT_GLOBE_SCALE_MULTIPLIER
	)
}

export function mapRadiusForPop(
	pop: number,
	era: SerializedGenesisWorld["params"]["era"] | undefined = "lateMedieval",
): number {
	const tiers = settlementTiers({
		params: { era },
	} as SerializedGenesisWorld)
	const t = getTierIndex(pop, tiers)
	if (t < 0) return 0
	const tier = tiers[t]
	const f = tierFraction(pop, tier)
	return (
		(tier.minMapRadius + (tier.maxMapRadius - tier.minMapRadius) * f) *
		SETTLEMENT_MAP_RADIUS_MULTIPLIER
	)
}

// ── Globe settlements ───────────────────────────────────────────────────────

function settlementPositionGlobe(
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
	elevationVisible: boolean,
): [number, number, number] {
	const x = r_xyz[3 * region]
	const y = r_xyz[3 * region + 1]
	const z = r_xyz[3 * region + 2]
	const len = Math.sqrt(x * x + y * y + z * z)
	const nx = x / len
	const ny = y / len
	const nz = z / len
	const elev = elevation[region]
	const adj = elevationVisible
		? elev > 0
			? elev * TERRAIN_ELEVATION_SCALE
			: elev * TERRAIN_ELEVATION_SCALE * 0.3
		: 0
	const lift = elevationVisible ? SETTLEMENT_LIFT : 0.002
	const radius = 1 + adj + lift
	return [nx * radius, ny * radius, nz * radius]
}

export function buildGlobeSettlements(
	world: SerializedGenesisWorld,
	locations: Int32Array,
	urbanPop: Float32Array,
	elevationVisible: boolean,
): THREE.Group {
	const group = new THREE.Group()
	if (!world.provinces) return group

	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const tiers = settlementTiers(world)

	// Pre-build textures per tier
	const tierTextures = tiers.map((tier) => ({
		normal: tier.buildTexture(false),
		capital: tier.buildTexture(true),
	}))
	const capitalProvinces = collectCapitalProvinces(world, locations.length)

	for (let p = 0; p < locations.length; p++) {
		const r = locations[p]
		if (r < 0) continue
		const pop = urbanPop[p] ?? 0
		const t = getTierIndex(pop, tiers)
		if (t < 0) continue

		const [px, py, pz] = settlementPositionGlobe(
			r_xyz,
			elevation,
			r,
			elevationVisible,
		)
		const scale = globeScaleForPop(pop, world.params?.era)
		const isCapital = capitalProvinces.has(p)

		const spriteMat = new THREE.SpriteMaterial({
			map: isCapital ? tierTextures[t].capital : tierTextures[t].normal,
			depthWrite: false,
			transparent: true,
		})
		spriteMat.userData = {
			fillColor: isCapital ? CAPITAL_FILL_COLOR : FILL_COLOR,
			isCapital,
		}
		const sprite = new THREE.Sprite(spriteMat)
		sprite.position.set(px, py, pz)
		sprite.scale.setScalar(scale)
		sprite.renderOrder = 998
		sprite.userData = { isCapital, province: p }
		group.add(sprite)
	}

	return group
}

// ── Map settlements ─────────────────────────────────────────────────────────

function settlementPositionMap(
	projection: ReturnType<typeof createMapProjection>,
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
): [number, number, number] {
	const projected = projection.projectCartesian(
		r_xyz[3 * region],
		r_xyz[3 * region + 1],
		r_xyz[3 * region + 2],
	)
	const elev = elevation[region]
	const adj =
		elev > 0
			? elev * TERRAIN_ELEVATION_SCALE
			: elev * TERRAIN_ELEVATION_SCALE * 0.3
	const z = MAP_Z_LIFT + adj * MAP_Z_ELEVATION_FACTOR
	const [x, y] = projection.projectRadians(projected.lon, projected.lat, z)
	return [x, y, z]
}

export function buildMapSettlements({
	world,
	locations,
	urbanPop,
	centerLongitudeDeg,
	projectionLatitudeDeg,
}: BuildMapSettlementsParams): THREE.Group {
	const group = new THREE.Group()
	if (!world.provinces) return group

	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const tiers = settlementTiers(world)

	// Pre-build textures per tier
	const tierTextures = tiers.map((tier) => ({
		normal: tier.buildTexture(false),
		capital: tier.buildTexture(true),
	}))
	const capitalProvinces = collectCapitalProvinces(world, locations.length)

	for (let p = 0; p < locations.length; p++) {
		const r = locations[p]
		if (r < 0) continue
		const pop = urbanPop[p] ?? 0
		const t = getTierIndex(pop, tiers)
		if (t < 0) continue

		const [px, py, pz] = settlementPositionMap(projection, r_xyz, elevation, r)
		const radius = mapRadiusForPop(pop, world.params?.era)
		const isCapital = capitalProvinces.has(p)

		const circleGeo = new THREE.CircleGeometry(radius, 16)
		const mat = new THREE.MeshBasicMaterial({
			map: isCapital ? tierTextures[t].capital : tierTextures[t].normal,
			depthWrite: false,
			transparent: true,
			side: THREE.DoubleSide,
		})
		mat.userData = {
			fillColor: isCapital ? CAPITAL_FILL_COLOR : FILL_COLOR,
			isCapital,
		}
		const circle = new THREE.Mesh(circleGeo, mat)
		circle.position.set(px, py, pz)
		circle.renderOrder = 998
		circle.userData = { isCapital, province: p }
		group.add(circle)
	}

	return group
}

// ── Real (EU4-import) settlements: positioned by raw lon/lat, not the
// procedural mesh's province regions -- see eu4-nation-border-overlay.ts for
// the same lon/lat-direct convention used for border vectors. Capital
// styling reuses world.nations.seeds the same way the procedural overlay's
// collectCapitalProvinces does -- see GenesisView.tsx's capitalProvinceIds
// (raw EU4 ids, not compact indices, since these settlements are matched to
// provinces by raw id). Reuses the same tier textures as the procedural
// overlay for a consistent look. ───────────────────────────────────────────

const DEFAULT_ERA: SerializedGenesisWorld["params"]["era"] = "lateMedieval"

function realSettlementTiers(): SettlementTier[] {
	return settlementTiers({
		params: { era: DEFAULT_ERA },
	} as SerializedGenesisWorld)
}

function lonLatToUnitXyz(
	lonDeg: number,
	latDeg: number,
): [number, number, number] {
	const lon = (lonDeg * Math.PI) / 180
	const lat = (latDeg * Math.PI) / 180
	const cosLat = Math.cos(lat)
	return [Math.cos(lon) * cosLat, Math.sin(lon) * cosLat, Math.sin(lat)]
}

export function buildGlobeRealSettlements({
	lats,
	lons,
	populations,
	provinceIds,
	capitalProvinceIds,
	indices,
}: BuildGlobeRealSettlementsParams): THREE.Group {
	const group = new THREE.Group()
	const tiers = realSettlementTiers()
	const tierTextures = tiers.map((tier) => ({
		normal: tier.buildTexture(false),
		capital: tier.buildTexture(true),
	}))

	for (const i of indices) {
		const pop = populations[i]
		const t = getTierIndex(pop, tiers)
		if (t < 0) continue

		const isCapital = capitalProvinceIds.has(provinceIds[i])
		const [nx, ny, nz] = lonLatToUnitXyz(lons[i], lats[i])
		const radius = 1 + SETTLEMENT_LIFT
		const scale = globeScaleForPop(pop, DEFAULT_ERA)

		const spriteMat = new THREE.SpriteMaterial({
			map: isCapital ? tierTextures[t].capital : tierTextures[t].normal,
			depthWrite: false,
			transparent: true,
		})
		const sprite = new THREE.Sprite(spriteMat)
		sprite.position.set(nx * radius, ny * radius, nz * radius)
		sprite.scale.setScalar(scale)
		sprite.renderOrder = 998
		sprite.userData = { settlement: i, isCapital }
		group.add(sprite)
	}

	return group
}

export function buildMapRealSettlements({
	lats,
	lons,
	populations,
	provinceIds,
	capitalProvinceIds,
	indices,
	centerLongitudeDeg,
	projectionLatitudeDeg,
}: BuildMapRealSettlementsParams): THREE.Group {
	const group = new THREE.Group()
	const tiers = realSettlementTiers()
	const tierTextures = tiers.map((tier) => ({
		normal: tier.buildTexture(false),
		capital: tier.buildTexture(true),
	}))
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)

	for (const i of indices) {
		const pop = populations[i]
		const t = getTierIndex(pop, tiers)
		if (t < 0) continue

		const isCapital = capitalProvinceIds.has(provinceIds[i])
		const [x, y, z] = projection.projectDegrees(lons[i], lats[i], MAP_Z_LIFT)
		const radius = mapRadiusForPop(pop, DEFAULT_ERA)

		const circleGeo = new THREE.CircleGeometry(radius, 16)
		const mat = new THREE.MeshBasicMaterial({
			map: isCapital ? tierTextures[t].capital : tierTextures[t].normal,
			depthWrite: false,
			transparent: true,
			side: THREE.DoubleSide,
		})
		const circle = new THREE.Mesh(circleGeo, mat)
		circle.position.set(x, y, z)
		circle.renderOrder = 998
		circle.userData = { settlement: i, isCapital }
		group.add(circle)
	}

	return group
}

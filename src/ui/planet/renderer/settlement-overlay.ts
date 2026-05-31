import * as THREE from "three"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import { createMapProjection } from "./map-projection"

const TERRAIN_ELEVATION_SCALE = 0.04
const SETTLEMENT_LIFT = 0.005
const MAP_Z_LIFT = 0.005
const MAP_Z_ELEVATION_FACTOR = 0.5

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

const TIERS: SettlementTier[] = [
	{
		// 1K-10K: Small filled white circle with ring
		minPop: 1_000,
		maxPop: 10_000,
		label: "1K-10K",
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
		// 10K-20K: Larger filled white circle with ring
		minPop: 10_000,
		maxPop: 20_000,
		label: "10K-20K",
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
		// 20K-50K: Filled white circle with cross/plus inside
		minPop: 20_000,
		maxPop: 50_000,
		label: "20K-50K",
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
		// 50K-200K: White disc with outer border ring defined by inner dark ring (no cross)
		minPop: 50_000,
		maxPop: 200_000,
		label: "50K-200K",
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
		// 200K-1M: White disc with border ring and cross inside inner ring
		minPop: 200_000,
		maxPop: 1_000_000,
		label: "200K-1M",
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
		// >1M: White border ring with black inner circle
		minPop: 1_000_000,
		maxPop: Infinity,
		label: ">1M",
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
]

function collectCapitalProvinces(
	world: SerializedOrogenWorld,
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

function getTierIndex(urbanPop: number): number {
	for (let t = 0; t < TIERS.length; t++) {
		if (urbanPop >= TIERS[t].minPop && urbanPop < TIERS[t].maxPop) return t
	}
	// >= 1M
	if (urbanPop >= 1_000_000) return TIERS.length - 1
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

export function globeScaleForPop(pop: number): number {
	const t = getTierIndex(pop)
	if (t < 0) return 0
	const tier = TIERS[t]
	const f = tierFraction(pop, tier)
	return tier.minGlobeScale + (tier.maxGlobeScale - tier.minGlobeScale) * f
}

export function mapRadiusForPop(pop: number): number {
	const t = getTierIndex(pop)
	if (t < 0) return 0
	const tier = TIERS[t]
	const f = tierFraction(pop, tier)
	return tier.minMapRadius + (tier.maxMapRadius - tier.minMapRadius) * f
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
	world: SerializedOrogenWorld,
	locations: Int32Array,
	urbanPop: Float32Array,
	elevationVisible: boolean,
): THREE.Group {
	const group = new THREE.Group()
	if (!world.provinces) return group

	const { r_xyz } = world.mesh
	const elevation = world.elevation

	// Pre-build textures per tier
	const tierTextures = TIERS.map((tier) => ({
		normal: tier.buildTexture(false),
		capital: tier.buildTexture(true),
	}))
	const capitalProvinces = collectCapitalProvinces(world, locations.length)

	for (let p = 0; p < locations.length; p++) {
		const r = locations[p]
		if (r < 0) continue
		const pop = urbanPop[p] ?? 0
		const t = getTierIndex(pop)
		if (t < 0) continue

		const [px, py, pz] = settlementPositionGlobe(
			r_xyz,
			elevation,
			r,
			elevationVisible,
		)
		const scale = globeScaleForPop(pop)
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

export function buildMapSettlements(
	world: SerializedOrogenWorld,
	locations: Int32Array,
	urbanPop: Float32Array,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
): THREE.Group {
	const group = new THREE.Group()
	if (!world.provinces) return group

	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { r_xyz } = world.mesh
	const elevation = world.elevation

	// Pre-build textures per tier
	const tierTextures = TIERS.map((tier) => ({
		normal: tier.buildTexture(false),
		capital: tier.buildTexture(true),
	}))
	const capitalProvinces = collectCapitalProvinces(world, locations.length)

	for (let p = 0; p < locations.length; p++) {
		const r = locations[p]
		if (r < 0) continue
		const pop = urbanPop[p] ?? 0
		const t = getTierIndex(pop)
		if (t < 0) continue

		const [px, py, pz] = settlementPositionMap(projection, r_xyz, elevation, r)
		const radius = mapRadiusForPop(pop)
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

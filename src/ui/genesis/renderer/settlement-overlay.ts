import * as THREE from "three"
import { SETTLEMENT_TUNING } from "@/model/society/settlement-tuning"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import type {
	BuildGlobeRealSettlementsParams,
	BuildGlobeSettlementsParams,
	BuildMapRealSettlementsParams,
	BuildMapSettlementsParams,
	SettlementExistsParams,
} from "@/ui/genesis/renderer/types"

export function settlementId(p: number): string {
	return `p${p}`
}

export function ghslSettlementId(i: number): string {
	return `g${i}`
}

const TERRAIN_ELEVATION_SCALE = 0.04
export const SETTLEMENT_LIFT = 0.005
export const MAP_Z_LIFT = 0.005
const MAP_Z_ELEVATION_FACTOR = 0.5

// Fixed marker footprint -- no population-based size variance. Population
// still gates whether a settlement is rendered at all (see
// settlementExists), just not how big its dot is. Capitals get a fixed
// bump over ordinary settlements (see CAPITAL_SCALE_MULTIPLIER) so they
// stand out a little on top of their distinct ring+dot pattern.
const GLOBE_MARKER_SCALE = 0.003
const MAP_MARKER_RADIUS = 0.001
export const CAPITAL_SCALE_MULTIPLIER = 1.35

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
const OUTLINE_COLOR = "#000000"
const OUTLINE_WIDTH_RATIO = 0.08 // fraction of canvas size
const FILL_COLOR = "#ffffff"
const CAPITAL_DOT_COLOR = "#000000"

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

// Two fixed patterns: a plain white circle for ordinary settlements, and a
// black dot inside a black-outlined circle for capitals -- see
// The selected history frame supplies capital provinces; this is how "capital" is
// determined. Built once and reused by every marker (globe, map, procedural,
// and EU4-import alike).
let _normalTexture: THREE.CanvasTexture | undefined
let _capitalTexture: THREE.CanvasTexture | undefined

function normalTexture(): THREE.CanvasTexture {
	if (!_normalTexture) {
		_normalTexture = makeCanvasTexture(128, (ctx, w) => {
			const cx = w / 2
			const cy = w / 2
			drawFilledCircle(ctx, cx, cy, w * 0.42, FILL_COLOR)
			drawRing(ctx, cx, cy, w * 0.42, w * OUTLINE_WIDTH_RATIO, OUTLINE_COLOR)
		})
	}
	return _normalTexture
}

function capitalTexture(): THREE.CanvasTexture {
	if (!_capitalTexture) {
		_capitalTexture = makeCanvasTexture(128, (ctx, w) => {
			const cx = w / 2
			const cy = w / 2
			drawFilledCircle(ctx, cx, cy, w * 0.42, FILL_COLOR)
			drawRing(ctx, cx, cy, w * 0.42, w * OUTLINE_WIDTH_RATIO, OUTLINE_COLOR)
			drawFilledCircle(ctx, cx, cy, w * 0.16, CAPITAL_DOT_COLOR)
		})
	}
	return _capitalTexture
}

function textureFor(isCapital: boolean): THREE.CanvasTexture {
	return isCapital ? capitalTexture() : normalTexture()
}

function settlementExists({
	pop,
	era,
	province,
	routeEndpoints,
}: SettlementExistsParams): boolean {
	return (
		routeEndpoints.has(province) ||
		pop >= SETTLEMENT_TUNING.getSettlementRenderThresholds(era)[0]
	)
}

export function globeScaleForPop(): number {
	return GLOBE_MARKER_SCALE
}

export function mapRadiusForPop(): number {
	return MAP_MARKER_RADIUS
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

export function buildGlobeSettlements({
	world,
	locations,
	urbanPop,
	elevationVisible,
	routeEndpoints,
	capitalProvinces,
}: BuildGlobeSettlementsParams): THREE.Group {
	const group = new THREE.Group()
	if (!world.provinces) return group

	const { r_xyz } = world.mesh
	const elevation = world.elevation

	for (let p = 0; p < locations.length; p++) {
		const r = locations[p]
		if (r < 0) continue
		const pop = urbanPop[p] ?? 0
		if (
			!settlementExists({
				pop,
				era: world.params?.era,
				province: p,
				routeEndpoints,
			})
		)
			continue

		const [px, py, pz] = settlementPositionGlobe(
			r_xyz,
			elevation,
			r,
			elevationVisible,
		)
		const isCapital = capitalProvinces.has(p)

		const spriteMat = new THREE.SpriteMaterial({
			map: textureFor(isCapital),
			depthWrite: false,
			transparent: true,
		})
		spriteMat.userData = { isCapital }
		const sprite = new THREE.Sprite(spriteMat)
		sprite.position.set(px, py, pz)
		sprite.scale.setScalar(
			GLOBE_MARKER_SCALE * (isCapital ? CAPITAL_SCALE_MULTIPLIER : 1),
		)
		sprite.renderOrder = 998
		sprite.userData = {
			isCapital,
			province: p,
			settlementPop: pop,
			settlementId: settlementId(p),
		}
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
	routeEndpoints,
	capitalProvinces,
}: BuildMapSettlementsParams): THREE.Group {
	const group = new THREE.Group()
	if (!world.provinces) return group

	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { r_xyz } = world.mesh
	const elevation = world.elevation
	// Wrap-around copies are built as flat siblings here (matching
	// buildMapSettlementLabels' wrapOffsets), NOT via addMapSlideClones --
	// that helper deep-clones the whole group as a single child subtree,
	// which breaks applySettlementMarkerCollisionCulling: it only inspects
	// direct group.children, so a cloned subtree gets treated (and
	// shown/hidden) as one giant marker instead of its individual dots.
	const wrapOffsets = [-projection.repeatWidth, 0, projection.repeatWidth]

	for (let p = 0; p < locations.length; p++) {
		const r = locations[p]
		if (r < 0) continue
		const pop = urbanPop[p] ?? 0
		if (
			!settlementExists({
				pop,
				era: world.params?.era,
				province: p,
				routeEndpoints,
			})
		)
			continue

		const [px, py, pz] = settlementPositionMap(projection, r_xyz, elevation, r)
		const isCapital = capitalProvinces.has(p)
		const radius =
			MAP_MARKER_RADIUS * (isCapital ? CAPITAL_SCALE_MULTIPLIER : 1)

		for (const wrapOffset of wrapOffsets) {
			const circleGeo = new THREE.CircleGeometry(radius, 16)
			const mat = new THREE.MeshBasicMaterial({
				map: textureFor(isCapital),
				depthWrite: false,
				transparent: true,
				side: THREE.DoubleSide,
			})
			mat.userData = { isCapital }
			const circle = new THREE.Mesh(circleGeo, mat)
			circle.position.set(px + wrapOffset, py, pz)
			circle.renderOrder = 998
			circle.userData = {
				isCapital,
				province: p,
				settlementPop: pop,
				settlementId: settlementId(p),
				baseRadius: radius,
			}
			group.add(circle)
		}
	}

	return group
}

// ── Real (EU4-import) settlements: positioned by raw lon/lat, not the
// procedural mesh's province regions -- see eu4-nation-border-overlay.ts for
// the same lon/lat-direct convention used for border vectors. Capital
// styling uses capitalProvinceIds supplied for the selected history frame
// (raw EU4 ids, not compact indices, since these settlements are matched to
// provinces by raw id). Reuses the same fixed-pattern textures as the
// procedural overlay for a consistent look. ────────────────────────────────

export function lonLatToUnitXyz(
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

	for (const i of indices) {
		const pop = populations[i]

		const isCapital = capitalProvinceIds.has(provinceIds[i])
		const [nx, ny, nz] = lonLatToUnitXyz(lons[i], lats[i])
		const radius = 1 + SETTLEMENT_LIFT

		const spriteMat = new THREE.SpriteMaterial({
			map: textureFor(isCapital),
			depthWrite: false,
			transparent: true,
		})
		const sprite = new THREE.Sprite(spriteMat)
		sprite.position.set(nx * radius, ny * radius, nz * radius)
		sprite.scale.setScalar(
			GLOBE_MARKER_SCALE * (isCapital ? CAPITAL_SCALE_MULTIPLIER : 1),
		)
		sprite.renderOrder = 998
		sprite.userData = {
			settlement: i,
			isCapital,
			settlementPop: pop,
			settlementId: ghslSettlementId(i),
		}
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
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	// See buildMapSettlements' comment: flat wrap-offset siblings, not
	// addMapSlideClones, so collision culling can see each dot individually.
	const wrapOffsets = [-projection.repeatWidth, 0, projection.repeatWidth]

	for (const i of indices) {
		const pop = populations[i]

		const isCapital = capitalProvinceIds.has(provinceIds[i])
		const [x, y, z] = projection.projectDegrees(lons[i], lats[i], MAP_Z_LIFT)
		const radius =
			MAP_MARKER_RADIUS * (isCapital ? CAPITAL_SCALE_MULTIPLIER : 1)

		for (const wrapOffset of wrapOffsets) {
			const circleGeo = new THREE.CircleGeometry(radius, 16)
			const mat = new THREE.MeshBasicMaterial({
				map: textureFor(isCapital),
				depthWrite: false,
				transparent: true,
				side: THREE.DoubleSide,
			})
			const circle = new THREE.Mesh(circleGeo, mat)
			circle.position.set(x + wrapOffset, y, z)
			circle.renderOrder = 998
			circle.userData = {
				settlement: i,
				isCapital,
				settlementPop: pop,
				settlementId: ghslSettlementId(i),
				baseRadius: radius,
			}
			group.add(circle)
		}
	}

	return group
}

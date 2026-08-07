import * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import {
	GLOBE_BASE_POSITION,
	GLOBE_CAMERA_UP,
	LABEL_MAP_FONT_GAP_FACTOR,
	type LabelPool,
	type NationLabelPools,
	TERRAIN_ELEVATION_SCALE,
} from "@/ui/genesis/renderer/nation-label-overlay/constants"
import {
	applyGlobeLabelStyle,
	applyMapLabelStyle,
} from "@/ui/genesis/renderer/nation-label-overlay/nation-labels"
import {
	updateGlobeLabelOrientations,
	updateGlobeLabelPosition,
} from "@/ui/genesis/renderer/nation-label-overlay/orientation"
import {
	createLabelPool,
	ensurePoolSize,
	hideUnusedPool,
	prepareLabelGroup,
} from "@/ui/genesis/renderer/nation-label-overlay/pool"
import {
	globeLabelTangentOffset,
	labelPositionMap,
	orientGlobeLabel,
} from "@/ui/genesis/renderer/nation-label-overlay/positioning"
import { dampedPixelsPerWorldUnitAt } from "@/ui/genesis/renderer/nation-label-overlay/settlement-marker-collision"
import {
	ghslSettlementId,
	globeScaleForPop,
	lonLatToUnitXyz,
	MAP_Z_LIFT,
	mapRadiusForPop,
	SETTLEMENT_LIFT,
	settlementId,
} from "@/ui/genesis/renderer/settlement-overlay"

export const SETTLEMENT_LABEL_FONT_SIZE_GLOBE = 0.00145
export const SETTLEMENT_LABEL_FONT_SIZE_MAP = 0.0018
export const SETTLEMENT_LABEL_OFFSET_GLOBE_Y = 0.001
export const SETTLEMENT_LABEL_LIFT_GLOBE = 0.002
export const SETTLEMENT_LABEL_LIFT_GLOBE_ELEVATION = 0.003

// Fixed target on-screen text height, in pixels, at "neutral" zoom -- no
// population-based size variance (matches settlement-marker-collision.ts's
// FIXED_PX_RADIUS). Actual rendered size still grows/shrinks with zoom by
// SCREEN_SCALE_RESPONSIVENESS (see applySettlementLabelScreenScale below),
// just damped so it doesn't balloon or vanish at the extremes the way a
// pure world-space size would.
const FIXED_LABEL_PX = 2

const LABEL_WORLD_POS_VEC = new THREE.Vector3()

/** Real-Earth-import labels are keyed by compact province index `p`, but
 * their marker (buildGlobeRealSettlements/buildMapRealSettlements in
 * settlement-overlay.ts) lives in the raw GHSL settlement array's index
 * space instead -- see realSettlement.sourceIndex's doc comment in
 * worker-protocol/types.ts. Procedural (non-real-coord) settlements have no
 * such indirection: their marker is built from the same compact province
 * loop, so `p` itself is already the shared id. */
function labelSettlementId(
	world: SerializedGenesisWorld,
	p: number,
	hasRealCoord: boolean,
): string {
	if (hasRealCoord) {
		const sourceIndex = world.realSettlement?.sourceIndex[p] ?? -1
		return ghslSettlementId(sourceIndex)
	}
	return settlementId(p)
}

function settlementFontScale(_pop: number): number {
	return 1
}

function labelPxHeightForPop(_pop: number): number {
	return FIXED_LABEL_PX
}

/** Rescales every settlement label each frame so its text height matches
 * labelPxHeightForPop(pop), regardless of zoom -- the label counterpart of
 * applySettlementMarkerScreenScale (settlement-marker-collision.ts). Reads
 * population from userData.settlementPop, stamped at build time alongside
 * settlementId (see buildGlobeSettlementLabels/buildMapSettlementLabels). */
export function applySettlementLabelScreenScale(
	ctx: GenesisContext,
	group: THREE.Group | null,
): void {
	if (!group) return
	const cam: THREE.Camera =
		ctx.currentViewMode === "map" ? ctx.mapCamera : ctx.camera

	for (const child of group.children) {
		if (child.type === "Line") continue
		const label = child as THREE.Object3D & {
			userData: Record<string, unknown>
			fontSize: number
		}
		const pop = (label.userData.settlementPop as number | undefined) ?? 0
		const worldPos = label.getWorldPosition(LABEL_WORLD_POS_VEC)
		const pxPerWorldUnit = dampedPixelsPerWorldUnitAt(ctx, cam, worldPos)
		if (!(pxPerWorldUnit > 0)) continue
		label.fontSize = labelPxHeightForPop(pop) / pxPerWorldUnit
	}
}

/** lonLatOverride lets a settlement place at its exact real coordinate
 * (world.realSettlement's lons/lats) instead of the procedural
 * settlementRegions seed cell -- the only two things that differ for a real
 * Earth-import settlement are its name and its position; everything else
 * (pool reuse, billboard/stub math, frustum culling, the per-frame
 * animation-loop update) is unchanged. There's no per-lon/lat elevation to
 * look up, so the override skips the elevation lift term entirely (matching
 * the real settlement dot markers' own fixed lift -- see settlement-overlay's
 * SETTLEMENT_LIFT). */
function settlementLabelPositionGlobe(
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
	elevationVisible: boolean,
	lonLatOverride?: { lonDeg: number; latDeg: number },
) {
	if (lonLatOverride) {
		const [nx, ny, nz] = lonLatToUnitXyz(
			lonLatOverride.lonDeg,
			lonLatOverride.latDeg,
		)
		return {
			normal: new THREE.Vector3(nx, ny, nz),
			radius: 1 + SETTLEMENT_LIFT,
		}
	}
	const x = r_xyz[3 * region]
	const y = r_xyz[3 * region + 1]
	const z = r_xyz[3 * region + 2]
	const len = Math.sqrt(x * x + y * y + z * z) || 1
	const nx = x / len
	const ny = y / len
	const nz = z / len
	const elev = elevation[region]
	const adj = elevationVisible
		? elev > 0
			? elev * TERRAIN_ELEVATION_SCALE
			: elev * TERRAIN_ELEVATION_SCALE * 0.3
		: 0
	const lift = elevationVisible
		? SETTLEMENT_LABEL_LIFT_GLOBE_ELEVATION
		: SETTLEMENT_LABEL_LIFT_GLOBE
	return {
		normal: new THREE.Vector3(nx, ny, nz),
		radius: 1 + adj + lift,
	}
}

/** Map-mode counterpart of settlementLabelPositionGlobe's lonLatOverride --
 * see its doc comment. */
function settlementLabelPositionMapOverride(
	projection: ReturnType<typeof createMapProjection>,
	lonDeg: number,
	latDeg: number,
	markerRadius: number,
	fontSize: number,
): [number, number, number] {
	const [px, py, pz] = projection.projectDegrees(lonDeg, latDeg, MAP_Z_LIFT)
	return [
		px,
		py +
			markerRadius +
			fontSize * LABEL_MAP_FONT_GAP_FACTOR +
			SETTLEMENT_LABEL_OFFSET_GLOBE_Y,
		pz,
	]
}

function settlementGlobeLabelStubLength(markerScale: number): number {
	return markerScale * 0.5 + SETTLEMENT_LABEL_OFFSET_GLOBE_Y
}

export function createSettlementLabelPools(): NationLabelPools {
	return { globe: createLabelPool(), map: createLabelPool() }
}

export function buildGlobeSettlementLabels(
	world: SerializedGenesisWorld,
	settlementNames: string[],
	camera: THREE.PerspectiveCamera,
	pool: LabelPool,
	cullingEnabled = false,
	elevationVisible = true,
	targetGroup?: THREE.Group,
): THREE.Group {
	const group = prepareLabelGroup(targetGroup)
	if (!world.provinces || !world.settlementRegions) return group

	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const provinceCount = world.provinces.count ?? settlementNames.length

	ensurePoolSize(pool, provinceCount)
	const initialCameraUp = GLOBE_CAMERA_UP.set(0, 1, 0).applyQuaternion(
		camera.quaternion,
	)

	const realLons = world.realSettlement?.lons
	const realLats = world.realSettlement?.lats
	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		const name = settlementNames[p]
		if (!name) continue
		const hasRealCoord = world.realSettlement?.names[p] != null
		const region = world.settlementRegions[p] ?? -1
		if (!hasRealCoord && region < 0) continue
		const pop = hasRealCoord
			? (world.realSettlement?.population[p] ?? 0)
			: (world.urbanPopulation?.[p] ?? 0)
		const scale = settlementFontScale(pop)
		const fontSize = SETTLEMENT_LABEL_FONT_SIZE_GLOBE * scale
		const markerScale = globeScaleForPop(pop, world.params?.era)
		const globePlacement = settlementLabelPositionGlobe(
			r_xyz,
			elevation,
			region,
			elevationVisible,
			hasRealCoord ? { lonDeg: realLons![p], latDeg: realLats![p] } : undefined,
		)

		const text = pool.items[activeCount]
		applyGlobeLabelStyle(text)
		text.frustumCulled = cullingEnabled
		text.text = name
		text.fontSize = fontSize
		text.userData.settlementId = labelSettlementId(world, p, hasRealCoord)
		text.userData.settlementPop = pop
		text.userData.globeNormal = globePlacement.normal
		text.userData.globeBasePosition = GLOBE_BASE_POSITION.copy(
			globePlacement.normal,
		)
			.multiplyScalar(globePlacement.radius)
			.clone()
		text.userData.globeLeaderStubLength =
			settlementGlobeLabelStubLength(markerScale)
		text.userData.globeLabelTangentOffset = globeLabelTangentOffset(fontSize)
		text.sync()
		updateGlobeLabelPosition(text, initialCameraUp)
		orientGlobeLabel(text, camera.quaternion)
		text.visible = true
		group.add(text)
		activeCount++
	}

	hideUnusedPool(pool, activeCount)
	updateGlobeLabelOrientations(group, camera, cullingEnabled)
	return group
}

export function buildMapSettlementLabels(
	world: SerializedGenesisWorld,
	settlementNames: string[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	pool: LabelPool,
	cullingEnabled = false,
	targetGroup?: THREE.Group,
): THREE.Group {
	const group = prepareLabelGroup(targetGroup)
	if (!world.provinces || !world.settlementRegions) return group

	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const provinceCount = world.provinces.count ?? settlementNames.length
	const wrapOffsets = cullingEnabled
		? [-projection.repeatWidth, 0, projection.repeatWidth]
		: [0]

	ensurePoolSize(pool, provinceCount * wrapOffsets.length)

	const realLons = world.realSettlement?.lons
	const realLats = world.realSettlement?.lats
	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		const name = settlementNames[p]
		if (!name) continue
		const hasRealCoord = world.realSettlement?.names[p] != null
		const region = world.settlementRegions[p] ?? -1
		if (!hasRealCoord && region < 0) continue
		const pop = hasRealCoord
			? (world.realSettlement?.population[p] ?? 0)
			: (world.urbanPopulation?.[p] ?? 0)
		const scale = settlementFontScale(pop)
		const fontSize = SETTLEMENT_LABEL_FONT_SIZE_MAP * scale
		const markerRadius = mapRadiusForPop(pop, world.params?.era)
		const [px, py, pz] = hasRealCoord
			? settlementLabelPositionMapOverride(
					projection,
					realLons![p],
					realLats![p],
					markerRadius,
					fontSize,
				)
			: labelPositionMap(
					projection,
					r_xyz,
					elevation,
					region,
					markerRadius,
					fontSize,
				)

		for (const wrapOffset of wrapOffsets) {
			const text = pool.items[activeCount]
			applyMapLabelStyle(text)
			text.frustumCulled = cullingEnabled
			text.text = name
			text.userData.settlementId = labelSettlementId(world, p, hasRealCoord)
			text.userData.settlementPop = pop
			text.position.set(px + wrapOffset, py, pz)
			text.rotation.set(0, 0, 0)
			text.fontSize = fontSize
			text.sync()
			text.visible = true
			group.add(text)
			activeCount++
		}
	}

	hideUnusedPool(pool, activeCount)
	return group
}

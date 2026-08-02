import * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import {
	GLOBE_BASE_POSITION,
	GLOBE_CAMERA_UP,
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
import {
	globeScaleForPop,
	mapRadiusForPop,
} from "@/ui/genesis/renderer/settlement-overlay"

export const SETTLEMENT_LABEL_FONT_SIZE_GLOBE = 0.00145
export const SETTLEMENT_LABEL_FONT_SIZE_MAP = 0.0018
export const SETTLEMENT_LOG_MIN = Math.log10(1_000)
export const SETTLEMENT_LOG_MAX = Math.log10(1_000_000)
export const SETTLEMENT_LABEL_OFFSET_GLOBE_Y = 0.001
export const SETTLEMENT_LABEL_LIFT_GLOBE = 0.002
export const SETTLEMENT_LABEL_LIFT_GLOBE_ELEVATION = 0.003

function settlementFontScale(pop: number): number {
	const v = Math.log10(Math.max(1_000, pop))
	const t = Math.max(
		0,
		Math.min(
			1,
			(v - SETTLEMENT_LOG_MIN) / (SETTLEMENT_LOG_MAX - SETTLEMENT_LOG_MIN),
		),
	)
	return 0.7 + t * 1.3
}

function settlementLabelPositionGlobe(
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
	elevationVisible: boolean,
) {
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

	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		const name = settlementNames[p]
		if (!name) continue
		const region = world.settlementRegions[p] ?? -1
		if (region < 0) continue
		const pop = world.urbanPopulation?.[p] ?? 0
		const scale = settlementFontScale(pop)
		const fontSize = SETTLEMENT_LABEL_FONT_SIZE_GLOBE * scale
		const markerScale = globeScaleForPop(pop, world.params?.era)
		const globePlacement = settlementLabelPositionGlobe(
			r_xyz,
			elevation,
			region,
			elevationVisible,
		)

		const text = pool.items[activeCount]
		applyGlobeLabelStyle(text)
		text.frustumCulled = cullingEnabled
		text.text = name
		text.fontSize = fontSize
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

	let activeCount = 0
	for (let p = 0; p < provinceCount; p++) {
		const name = settlementNames[p]
		if (!name) continue
		const region = world.settlementRegions[p] ?? -1
		if (region < 0) continue
		const pop = world.urbanPopulation?.[p] ?? 0
		const scale = settlementFontScale(pop)
		const fontSize = SETTLEMENT_LABEL_FONT_SIZE_MAP * scale
		const markerRadius = mapRadiusForPop(pop, world.params?.era)
		const [px, py, pz] = labelPositionMap(
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

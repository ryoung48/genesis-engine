import type * as THREE from "three"
import type { Text } from "troika-three-text"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import {
	GLOBE_BASE_POSITION,
	GLOBE_CAMERA_UP,
	LABEL_FONT_SIZE_GLOBE,
	LABEL_FONT_SIZE_MAP,
	type LabelPool,
	type LabelScaleCurve,
} from "@/ui/planet/renderer/nation-label-overlay/constants"
import {
	nationCapitalProvince,
	nationCapitalRegion,
	nationProvinceCount,
} from "@/ui/planet/renderer/nation-label-overlay/nation-lookup"
import {
	updateGlobeLabelOrientations,
	updateGlobeLabelPosition,
} from "@/ui/planet/renderer/nation-label-overlay/orientation"
import {
	ensurePoolSize,
	hideUnusedPool,
	prepareLabelGroup,
} from "@/ui/planet/renderer/nation-label-overlay/pool"
import {
	computeLabelScale,
	globeLabelStubLength,
	globeLabelTangentOffset,
	labelPositionGlobe,
	labelPositionMap,
	orientGlobeLabel,
} from "@/ui/planet/renderer/nation-label-overlay/positioning"
import {
	globeScaleForPop,
	mapRadiusForPop,
} from "@/ui/planet/renderer/settlement-overlay"

export function applyGlobeLabelStyle(text: Text) {
	text.anchorX = "center"
	text.anchorY = "bottom"
}

export function applyMapLabelStyle(text: Text) {
	text.anchorX = "center"
	text.anchorY = "bottom"
}

export function buildGlobeNationLabels(
	world: SerializedGenesisWorld,
	nationNames: string[],
	camera: THREE.PerspectiveCamera,
	pool: LabelPool,
	cullingEnabled = false,
	elevationVisible = true,
	scaleCurve?: LabelScaleCurve,
	targetGroup?: THREE.Group,
): THREE.Group {
	const group = prepareLabelGroup(targetGroup)
	if (!world.provinces || !world.nations) return group

	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const nationCount = world.nations.seeds?.length ?? 0

	ensurePoolSize(pool, nationCount)
	const initialCameraUp = GLOBE_CAMERA_UP.set(0, 1, 0).applyQuaternion(
		camera.quaternion,
	)

	let activeCount = 0
	for (let n = 0; n < nationCount; n++) {
		const name = nationNames[n]
		if (!name) continue
		const capitalProvince = nationCapitalProvince(world, n)
		const capitalRegion = nationCapitalRegion(world, n)
		if (capitalRegion < 0) continue
		const settlementRegion = world.settlementRegions?.[capitalProvince] ?? -1
		const anchorRegion =
			settlementRegion >= 0 ? settlementRegion : capitalRegion
		const scale = computeLabelScale(
			nationProvinceCount(world, n),
			name,
			scaleCurve,
		)
		const globePlacement = labelPositionGlobe(
			r_xyz,
			elevation,
			anchorRegion,
			elevationVisible,
		)
		const markerScale =
			capitalProvince >= 0
				? globeScaleForPop(
						world.urbanPopulation?.[capitalProvince] ?? 0,
						world.params?.era,
					)
				: 0
		const text = pool.items[activeCount]
		applyGlobeLabelStyle(text)
		text.frustumCulled = cullingEnabled
		text.text = name
		text.fontSize = LABEL_FONT_SIZE_GLOBE * scale
		text.userData.globeNormal = globePlacement.normal
		text.userData.globeBasePosition = GLOBE_BASE_POSITION.copy(
			globePlacement.normal,
		)
			.multiplyScalar(globePlacement.radius)
			.clone()
		text.userData.globeLeaderStubLength =
			globeLabelStubLength(markerScale) + globeLabelTangentOffset(text.fontSize)
		text.userData.globeLabelTangentOffset = 0
		text.sync()
		updateGlobeLabelPosition(text, initialCameraUp)
		orientGlobeLabel(text, camera.quaternion)
		text.visible = true
		group.add(text)
		const leader = pool.leaders[activeCount]
		leader.visible = true
		group.add(leader)
		activeCount++
	}

	hideUnusedPool(pool, activeCount)
	updateGlobeLabelOrientations(group, camera, cullingEnabled)
	return group
}

export function buildMapNationLabels(
	world: SerializedGenesisWorld,
	nationNames: string[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	pool: LabelPool,
	cullingEnabled = false,
	scaleCurve?: LabelScaleCurve,
	targetGroup?: THREE.Group,
): THREE.Group {
	const group = prepareLabelGroup(targetGroup)
	if (!world.provinces || !world.nations) return group

	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const nationCount = world.nations.seeds?.length ?? 0
	const wrapOffsets = cullingEnabled
		? [-projection.repeatWidth, 0, projection.repeatWidth]
		: [0]

	ensurePoolSize(pool, nationCount * wrapOffsets.length)

	let activeCount = 0
	for (let n = 0; n < nationCount; n++) {
		const name = nationNames[n]
		if (!name) continue
		const capitalRegion = nationCapitalRegion(world, n)
		if (capitalRegion < 0) continue

		const scale = computeLabelScale(
			nationProvinceCount(world, n),
			name,
			scaleCurve,
		)
		const fontSize = LABEL_FONT_SIZE_MAP * scale
		const capitalProvince = nationCapitalProvince(world, n)
		const settlementRegion = world.settlementRegions?.[capitalProvince] ?? -1
		const anchorRegion =
			settlementRegion >= 0 ? settlementRegion : capitalRegion
		const markerRadius =
			capitalProvince >= 0
				? mapRadiusForPop(
						world.urbanPopulation?.[capitalProvince] ?? 0,
						world.params?.era,
					)
				: 0
		const [px, py, pz] = labelPositionMap(
			projection,
			r_xyz,
			elevation,
			anchorRegion,
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

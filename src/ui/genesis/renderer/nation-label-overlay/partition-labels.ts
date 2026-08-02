import type * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import {
	GLOBE_BASE_POSITION,
	GLOBE_CAMERA_UP,
	LABEL_FONT_SIZE_GLOBE,
	LABEL_FONT_SIZE_MAP,
	type LabelPool,
	type LabelScaleCurve,
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
	ensurePoolSize,
	hideUnusedPool,
	prepareLabelGroup,
} from "@/ui/genesis/renderer/nation-label-overlay/pool"
import {
	computeLabelScale,
	globeLabelStubLength,
	globeLabelTangentOffset,
	labelPositionGlobe,
	labelPositionMap,
	orientGlobeLabel,
} from "@/ui/genesis/renderer/nation-label-overlay/positioning"

function computePartitionCentralData(
	world: SerializedGenesisWorld,
	partitionCount: number,
	getProvincePartition: (province: number) => number,
): { centralRegions: Int32Array; provinceCounts: Int32Array } {
	const { seeds, count: provinceCount } = world.provinces!
	const { r_xyz } = world.mesh

	const cx = new Float64Array(partitionCount)
	const cy = new Float64Array(partitionCount)
	const cz = new Float64Array(partitionCount)
	const counts = new Int32Array(partitionCount)
	const centralRegions = new Int32Array(partitionCount).fill(-1)
	const bestDistsSq = new Float64Array(partitionCount).fill(Infinity)

	for (let p = 0; p < provinceCount; p++) {
		const idx = getProvincePartition(p)
		if (idx < 0 || idx >= partitionCount) continue
		const seedRegion = seeds[p] ?? -1
		if (seedRegion < 0) continue
		cx[idx] += r_xyz[3 * seedRegion]
		cy[idx] += r_xyz[3 * seedRegion + 1]
		cz[idx] += r_xyz[3 * seedRegion + 2]
		counts[idx]++
	}

	for (let p = 0; p < provinceCount; p++) {
		const idx = getProvincePartition(p)
		if (idx < 0 || idx >= partitionCount) continue
		const n = counts[idx]
		if (n === 0) continue
		const seedRegion = seeds[p] ?? -1
		if (seedRegion < 0) continue
		const invN = 1 / n
		const dx = r_xyz[3 * seedRegion] - cx[idx] * invN
		const dy = r_xyz[3 * seedRegion + 1] - cy[idx] * invN
		const dz = r_xyz[3 * seedRegion + 2] - cz[idx] * invN
		const distSq = dx * dx + dy * dy + dz * dz
		if (distSq < bestDistsSq[idx]) {
			bestDistsSq[idx] = distSq
			centralRegions[idx] = seedRegion
		}
	}

	return { centralRegions, provinceCounts: counts }
}

/** Generic label placement shared by culture/heritage labels and, for Earth
 * imports, real culture/religion labels (see create-genesis-scene.ts's
 * rebuildCultureLabels/rebuildReligionLabels) -- callers that don't have a
 * `world.cultures`/`world.heritages`-shaped structure (religion has no such
 * field at all; earth-history's culture/religion partitions are keyed by
 * different ids than the procedural ones) can supply an arbitrary
 * `getProvincePartition` directly instead of going through the
 * buildGlobeCultureLabels-style wrappers below. */
export function buildGlobePartitionLabels(
	world: SerializedGenesisWorld,
	names: string[],
	partitionCount: number,
	getProvincePartition: (province: number) => number,
	camera: THREE.PerspectiveCamera,
	pool: LabelPool,
	cullingEnabled: boolean,
	elevationVisible: boolean,
	scaleCurve?: LabelScaleCurve,
	targetGroup?: THREE.Group,
): THREE.Group {
	const group = prepareLabelGroup(targetGroup)
	if (!world.provinces) return group

	const { centralRegions, provinceCounts } = computePartitionCentralData(
		world,
		partitionCount,
		getProvincePartition,
	)
	const { r_xyz } = world.mesh
	const elevation = world.elevation

	ensurePoolSize(pool, partitionCount)
	const initialCameraUp = GLOBE_CAMERA_UP.set(0, 1, 0).applyQuaternion(
		camera.quaternion,
	)

	let activeCount = 0
	for (let c = 0; c < partitionCount; c++) {
		const name = names[c]
		if (!name) continue
		const centralRegion = centralRegions[c]
		if (centralRegion < 0) continue
		const scale = computeLabelScale(provinceCounts[c] ?? 0, name, scaleCurve)
		const globePlacement = labelPositionGlobe(
			r_xyz,
			elevation,
			centralRegion,
			elevationVisible,
		)
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
		text.userData.globeLeaderStubLength = globeLabelStubLength(0)
		text.userData.globeLabelTangentOffset = globeLabelTangentOffset(
			text.fontSize,
		)
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

export function buildMapPartitionLabels(
	world: SerializedGenesisWorld,
	names: string[],
	partitionCount: number,
	getProvincePartition: (province: number) => number,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	pool: LabelPool,
	cullingEnabled: boolean,
	scaleCurve?: LabelScaleCurve,
	targetGroup?: THREE.Group,
): THREE.Group {
	const group = prepareLabelGroup(targetGroup)
	if (!world.provinces) return group

	const { centralRegions, provinceCounts } = computePartitionCentralData(
		world,
		partitionCount,
		getProvincePartition,
	)
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const wrapOffsets = cullingEnabled
		? [-projection.repeatWidth, 0, projection.repeatWidth]
		: [0]

	ensurePoolSize(pool, partitionCount * wrapOffsets.length)

	let activeCount = 0
	for (let c = 0; c < partitionCount; c++) {
		const name = names[c]
		if (!name) continue
		const centralRegion = centralRegions[c]
		if (centralRegion < 0) continue
		const scale = computeLabelScale(provinceCounts[c] ?? 0, name, scaleCurve)
		const fontSize = LABEL_FONT_SIZE_MAP * scale
		const [px, py, pz] = labelPositionMap(
			projection,
			r_xyz,
			elevation,
			centralRegion,
			0,
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

export function buildGlobeHeritageLabels(
	world: SerializedGenesisWorld,
	heritageNames: string[],
	camera: THREE.PerspectiveCamera,
	pool: LabelPool,
	cullingEnabled = false,
	elevationVisible = true,
	targetGroup?: THREE.Group,
): THREE.Group {
	if (!world.heritages || !world.cultures || !world.provinces)
		return prepareLabelGroup(targetGroup)
	const ca = world.cultures.assignment
	const ha = world.heritages.assignment
	return buildGlobePartitionLabels(
		world,
		heritageNames,
		world.heritages.count,
		(p) => {
			const c = ca[p] ?? -1
			return c >= 0 ? (ha[c] ?? -1) : -1
		},
		camera,
		pool,
		cullingEnabled,
		elevationVisible,
		undefined,
		targetGroup,
	)
}

export function buildMapHeritageLabels(
	world: SerializedGenesisWorld,
	heritageNames: string[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	pool: LabelPool,
	cullingEnabled = false,
	targetGroup?: THREE.Group,
): THREE.Group {
	if (!world.heritages || !world.cultures || !world.provinces)
		return prepareLabelGroup(targetGroup)
	const ca = world.cultures.assignment
	const ha = world.heritages.assignment
	return buildMapPartitionLabels(
		world,
		heritageNames,
		world.heritages.count,
		(p) => {
			const c = ca[p] ?? -1
			return c >= 0 ? (ha[c] ?? -1) : -1
		},
		centerLongitudeDeg,
		projectionLatitudeDeg,
		pool,
		cullingEnabled,
		undefined,
		targetGroup,
	)
}

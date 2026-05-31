import * as THREE from "three"
import { Text } from "troika-three-text"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import { createMapProjection } from "./map-projection"
import { globeScaleForPop, mapRadiusForPop } from "./settlement-overlay"

const TERRAIN_ELEVATION_SCALE = 0.04
const LABEL_LIFT_GLOBE = 0.005
const LABEL_LIFT_MAP = 0.008
const MAP_Z_ELEVATION_FACTOR = 0.5

const LABEL_OFFSET_GLOBE_Y = 0.003
const LABEL_OFFSET_MAP_X = 0
const LABEL_OFFSET_MAP_Y = 0.001
const LABEL_MAP_FONT_GAP_FACTOR = 0.08
const LABEL_GLOBE_FONT_GAP_FACTOR = 0.04

const LABEL_FONT_SIZE_GLOBE = 0.004
const LABEL_FONT_SIZE_MAP = 0.005
const LABEL_OUTLINE_WIDTH = 0.2
const LABEL_OUTLINE_COLOR = 0x0f172a
const LABEL_TEXT_COLOR = "#f1f5f9"
const LABEL_RENDER_ORDER = 1001

const MIN_LABEL_SCALE = 0.5
const MAX_LABEL_SCALE = 4.5

const GLOBE_CAMERA_UP = new THREE.Vector3()
const GLOBE_PROJECTED_UP = new THREE.Vector3()
const GLOBE_BASE_POSITION = new THREE.Vector3()
const GLOBE_CAMERA_LOCAL_POSITION = new THREE.Vector3()
const GLOBE_TO_CAMERA = new THREE.Vector3()

interface LabelPool {
	items: Text[]
}

interface NationLabelPools {
	globe: LabelPool
	map: LabelPool
}

function createLabelPool(): LabelPool {
	return { items: [] }
}

function createNationLabelPools(): NationLabelPools {
	return {
		globe: createLabelPool(),
		map: createLabelPool(),
	}
}

function ensurePoolSize(pool: LabelPool, count: number) {
	while (pool.items.length < count) {
		const text = new Text()
		text.fontSize = LABEL_FONT_SIZE_GLOBE
		text.fontWeight = 500
		text.color = LABEL_TEXT_COLOR
		text.strokeWidth = LABEL_OUTLINE_WIDTH
		text.strokeColor = LABEL_OUTLINE_COLOR
		text.anchorX = "center"
		text.anchorY = "middle"
		text.textRenderingMode = "distanceField"
		text.renderOrder = LABEL_RENDER_ORDER
		text.frustumCulled = true
		text.visible = false
		pool.items.push(text)
	}
}

function applyGlobeLabelStyle(text: Text) {
	text.anchorX = "center"
	text.anchorY = "bottom"
}

function applyMapLabelStyle(text: Text) {
	text.anchorX = "center"
	text.anchorY = "bottom"
}

function hideUnusedPool(pool: LabelPool, usedCount: number) {
	for (let i = usedCount; i < pool.items.length; i++) {
		const text = pool.items[i]
		if (text.visible) text.visible = false
	}
}

function disposePool(pool: LabelPool) {
	for (const text of pool.items) {
		text.dispose()
	}
	pool.items = []
}

function nationCapitalRegion(
	world: SerializedOrogenWorld,
	nationIdx: number,
): number {
	const nationSeeds = world.nations?.seeds
	if (!nationSeeds || nationIdx < 0 || nationIdx >= nationSeeds.length) {
		return -1
	}
	const capitalProvince = nationSeeds[nationIdx]
	if (capitalProvince < 0) return -1
	const provinceSeeds = world.provinces?.seeds
	if (!provinceSeeds || capitalProvince >= provinceSeeds.length) return -1
	return provinceSeeds[capitalProvince]
}

function nationCapitalProvince(
	world: SerializedOrogenWorld,
	nationIdx: number,
): number {
	const nationSeeds = world.nations?.seeds
	if (!nationSeeds || nationIdx < 0 || nationIdx >= nationSeeds.length) {
		return -1
	}
	return nationSeeds[nationIdx] ?? -1
}

function nationProvinceCount(
	world: SerializedOrogenWorld,
	nationIdx: number,
): number {
	const directCount = world.nations?.size?.[nationIdx]
	if (typeof directCount === "number" && directCount > 0) return directCount

	const assignment = world.nations?.assignment
	const provinceCount = world.provinces?.count ?? 0
	if (!assignment || provinceCount <= 0) return 0

	let count = 0
	for (let province = 0; province < provinceCount; province++) {
		if (assignment[province] === nationIdx) count++
	}
	return count
}

function computeLabelScale(componentSize: number, name: string): number {
	const areaScale = 0.1 + Math.pow(componentSize, 0.55) * 0.5
	const lengthPenalty = Math.max(0.7, 1 - Math.max(0, name.length - 12) * 0.02)
	return THREE.MathUtils.clamp(
		areaScale * lengthPenalty,
		MIN_LABEL_SCALE,
		MAX_LABEL_SCALE,
	)
}

function labelPositionGlobe(
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
	elevationVisible = true,
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
	return {
		normal: new THREE.Vector3(nx, ny, nz),
		radius: 1 + adj + LABEL_LIFT_GLOBE,
	}
}

function labelPositionMap(
	projection: ReturnType<typeof createMapProjection>,
	r_xyz: Float32Array,
	elevation: Float32Array,
	region: number,
	markerRadius: number,
	fontSize: number,
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
	const z = LABEL_LIFT_MAP + adj * MAP_Z_ELEVATION_FACTOR
	const [x, y] = projection.projectRadians(projected.lon, projected.lat, z)
	return [
		x + LABEL_OFFSET_MAP_X,
		y +
			markerRadius +
			fontSize * LABEL_MAP_FONT_GAP_FACTOR +
			LABEL_OFFSET_MAP_Y,
		z,
	]
}

function orientGlobeLabel(text: Text, cameraQuaternion: THREE.Quaternion) {
	text.quaternion.copy(cameraQuaternion)
}

function globeLabelOffset(markerScale: number, fontSize: number): number {
	return (
		markerScale * 0.5 +
		fontSize * LABEL_GLOBE_FONT_GAP_FACTOR +
		LABEL_OFFSET_GLOBE_Y
	)
}

function updateGlobeLabelPosition(text: Text, cameraUp: THREE.Vector3): void {
	const normal = text.userData.globeNormal as THREE.Vector3 | undefined
	const basePosition = text.userData.globeBasePosition as
		| THREE.Vector3
		| undefined
	const offset = text.userData.globeLabelOffset as number | undefined
	if (!normal || !basePosition || offset == null) return

	GLOBE_PROJECTED_UP.copy(cameraUp).addScaledVector(
		normal,
		-cameraUp.dot(normal),
	)
	if (GLOBE_PROJECTED_UP.lengthSq() < 1e-8) {
		text.position.copy(basePosition)
		return
	}
	GLOBE_PROJECTED_UP.normalize()
	text.position.copy(basePosition).addScaledVector(GLOBE_PROJECTED_UP, offset)
}

function isGlobeLabelVisible(
	text: Text,
	cameraPosition: THREE.Vector3,
): boolean {
	const normal = text.userData.globeNormal as THREE.Vector3 | undefined
	const basePosition = text.userData.globeBasePosition as
		| THREE.Vector3
		| undefined
	if (!normal || !basePosition) return false

	return GLOBE_TO_CAMERA.copy(cameraPosition).sub(basePosition).dot(normal) > 0
}

function updateGlobeLabelOrientations(
	group: THREE.Group | null,
	camera: THREE.PerspectiveCamera,
	cullingEnabled = false,
) {
	if (!group) return
	camera.getWorldPosition(GLOBE_CAMERA_LOCAL_POSITION)
	group.worldToLocal(GLOBE_CAMERA_LOCAL_POSITION)

	const lastCameraQuaternion = group.userData.globeCameraQuaternion as
		| THREE.Quaternion
		| undefined
	const lastCameraPosition = group.userData.globeCameraPosition as
		| THREE.Vector3
		| undefined
	const rotationChanged =
		!lastCameraQuaternion ||
		lastCameraQuaternion.angleTo(camera.quaternion) > 1e-8
	const positionChanged =
		!lastCameraPosition ||
		lastCameraPosition.distanceToSquared(GLOBE_CAMERA_LOCAL_POSITION) > 1e-12

	if (!rotationChanged && !positionChanged) return

	if (lastCameraQuaternion) {
		lastCameraQuaternion.copy(camera.quaternion)
	} else {
		group.userData.globeCameraQuaternion = camera.quaternion.clone()
	}
	if (lastCameraPosition) {
		lastCameraPosition.copy(GLOBE_CAMERA_LOCAL_POSITION)
	} else {
		group.userData.globeCameraPosition = GLOBE_CAMERA_LOCAL_POSITION.clone()
	}
	GLOBE_CAMERA_UP.set(0, 1, 0).applyQuaternion(camera.quaternion)
	for (const child of group.children) {
		const text = child as Text
		const visible = cullingEnabled
			? isGlobeLabelVisible(text, GLOBE_CAMERA_LOCAL_POSITION)
			: true

		text.visible = visible
		if (!visible) continue

		updateGlobeLabelPosition(text, GLOBE_CAMERA_UP)
		orientGlobeLabel(text, camera.quaternion)
	}
}

export function buildGlobeNationLabels(
	world: SerializedOrogenWorld,
	nationNames: string[],
	camera: THREE.PerspectiveCamera,
	pool: LabelPool,
	cullingEnabled = false,
	elevationVisible = true,
): THREE.Group {
	const group = new THREE.Group()
	if (!world.provinces || !world.nations) return group

	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const nationCount = world.nations.seeds?.length ?? 0

	ensurePoolSize(pool, nationCount)
	const cameraUp = GLOBE_CAMERA_UP.set(0, 1, 0).applyQuaternion(
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
		const scale = computeLabelScale(nationProvinceCount(world, n), name)
		const globePlacement = labelPositionGlobe(
			r_xyz,
			elevation,
			anchorRegion,
			elevationVisible,
		)
		const markerScale =
			capitalProvince >= 0
				? globeScaleForPop(world.urbanPopulation?.[capitalProvince] ?? 0)
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
		text.userData.globeLabelOffset = globeLabelOffset(
			markerScale,
			text.fontSize,
		)
		text.sync()
		updateGlobeLabelPosition(text, cameraUp)
		orientGlobeLabel(text, camera.quaternion)
		text.visible = true
		group.add(text)
		activeCount++
	}

	hideUnusedPool(pool, activeCount)
	updateGlobeLabelOrientations(group, camera, cullingEnabled)
	return group
}

export function buildMapNationLabels(
	world: SerializedOrogenWorld,
	nationNames: string[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	pool: LabelPool,
	cullingEnabled = false,
): THREE.Group {
	const group = new THREE.Group()
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

		const scale = computeLabelScale(nationProvinceCount(world, n), name)
		const fontSize = LABEL_FONT_SIZE_MAP * scale
		const capitalProvince = nationCapitalProvince(world, n)
		const settlementRegion = world.settlementRegions?.[capitalProvince] ?? -1
		const anchorRegion =
			settlementRegion >= 0 ? settlementRegion : capitalRegion
		const markerRadius =
			capitalProvince >= 0
				? mapRadiusForPop(world.urbanPopulation?.[capitalProvince] ?? 0)
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

// ── Settlement labels ─────────────────────────────────────────────────────────

const SETTLEMENT_LABEL_FONT_SIZE_GLOBE = 0.0016
const SETTLEMENT_LABEL_FONT_SIZE_MAP = 0.002
const SETTLEMENT_LOG_MIN = Math.log10(1_000)
const SETTLEMENT_LOG_MAX = Math.log10(1_000_000)
const SETTLEMENT_LABEL_OFFSET_GLOBE_Y = 0.001
const SETTLEMENT_LABEL_LIFT_GLOBE = 0.002
const SETTLEMENT_LABEL_LIFT_GLOBE_ELEVATION = 0.003

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

function settlementGlobeLabelOffset(
	markerScale: number,
	fontSize: number,
): number {
	return (
		markerScale * 0.5 +
		fontSize * LABEL_GLOBE_FONT_GAP_FACTOR +
		SETTLEMENT_LABEL_OFFSET_GLOBE_Y
	)
}

function createSettlementLabelPools(): NationLabelPools {
	return { globe: createLabelPool(), map: createLabelPool() }
}

export function buildGlobeSettlementLabels(
	world: SerializedOrogenWorld,
	settlementNames: string[],
	camera: THREE.PerspectiveCamera,
	pool: LabelPool,
	cullingEnabled = false,
	elevationVisible = true,
): THREE.Group {
	const group = new THREE.Group()
	if (!world.provinces || !world.settlementRegions) return group

	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const provinceCount = world.provinces.count ?? settlementNames.length

	ensurePoolSize(pool, provinceCount)
	const cameraUp = GLOBE_CAMERA_UP.set(0, 1, 0).applyQuaternion(
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
		const markerScale = globeScaleForPop(pop)
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
		text.userData.globeLabelOffset = settlementGlobeLabelOffset(
			markerScale,
			fontSize,
		)
		text.sync()
		updateGlobeLabelPosition(text, cameraUp)
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
	world: SerializedOrogenWorld,
	settlementNames: string[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	pool: LabelPool,
	cullingEnabled = false,
): THREE.Group {
	const group = new THREE.Group()
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
		const markerRadius = mapRadiusForPop(pop)
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

export {
	createNationLabelPools,
	createSettlementLabelPools,
	disposePool,
	orientGlobeLabel,
	updateGlobeLabelOrientations,
}

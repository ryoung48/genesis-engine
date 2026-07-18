import * as THREE from "three"
import { Text } from "troika-three-text"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import jedarFontUrl from "@/ui/assets/fonts/Jedar.otf"
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

const LABEL_FONT_SIZE_GLOBE = 0.0035
const LABEL_FONT_SIZE_MAP = 0.0044
const LABEL_OUTLINE_WIDTH = 0.2
const LABEL_OUTLINE_COLOR = 0x0f172a
const LABEL_TEXT_COLOR = "#f1f5f9"
const LABEL_RENDER_ORDER = 1001

const LABEL_LEADER_COLOR = 0xf8fafc
const LABEL_LEADER_OPACITY = 0.55
const LABEL_LEADER_RENDER_ORDER = 1000
const LABEL_LEADER_HEIGHT_FACTOR = 1.8

const MIN_LABEL_SCALE = 0.5
const MAX_LABEL_SCALE = 4.5

const GLOBE_BASE_POSITION = new THREE.Vector3()
const GLOBE_CAMERA_LOCAL_POSITION = new THREE.Vector3()
const GLOBE_TO_CAMERA = new THREE.Vector3()
const GLOBE_GROUP_WORLD_QUATERNION = new THREE.Quaternion()
const GLOBE_LOCAL_CAMERA_QUATERNION = new THREE.Quaternion()
const GLOBE_CAMERA_UP = new THREE.Vector3()
const GLOBE_PROJECTED_UP = new THREE.Vector3()
const GLOBE_STUB_TIP = new THREE.Vector3()

// Labels are children of globeGroup, which carries its own rotation (axial
// tilt + day/night spin). Billboarding against camera.quaternion directly
// ignores that parent rotation and produces mis-oriented ("backwards")
// labels once the globe isn't at its identity orientation. Composing with
// the inverse of the group's world quaternion cancels the parent rotation
// so the label's resulting *world* orientation is a true camera billboard.
function localCameraQuaternion(
	group: THREE.Object3D,
	camera: THREE.PerspectiveCamera,
): THREE.Quaternion {
	group.getWorldQuaternion(GLOBE_GROUP_WORLD_QUATERNION)
	return GLOBE_LOCAL_CAMERA_QUATERNION.copy(GLOBE_GROUP_WORLD_QUATERNION)
		.invert()
		.multiply(camera.quaternion)
}

interface LabelPool {
	items: Text[]
	leaders: THREE.Line[]
}

interface NationLabelPools {
	globe: LabelPool
	map: LabelPool
}

function createLabelPool(): LabelPool {
	return { items: [], leaders: [] }
}

function createNationLabelPools(): NationLabelPools {
	return {
		globe: createLabelPool(),
		map: createLabelPool(),
	}
}

function createLabelLeaderLine(): THREE.Line {
	const geometry = new THREE.BufferGeometry().setFromPoints([
		new THREE.Vector3(),
		new THREE.Vector3(),
	])
	const material = new THREE.LineBasicMaterial({
		color: LABEL_LEADER_COLOR,
		transparent: true,
		opacity: LABEL_LEADER_OPACITY,
		depthWrite: false,
	})
	const line = new THREE.Line(geometry, material)
	line.renderOrder = LABEL_LEADER_RENDER_ORDER
	line.visible = false
	line.frustumCulled = false
	return line
}

function ensurePoolSize(pool: LabelPool, count: number) {
	while (pool.items.length < count) {
		const text = new Text()
		text.font = jedarFontUrl
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
		const leader = createLabelLeaderLine()
		text.userData.leaderLine = leader
		pool.items.push(text)
		pool.leaders.push(leader)
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
		const leader = pool.leaders[i]
		if (leader && leader.visible) leader.visible = false
	}
}

function prepareLabelGroup(targetGroup?: THREE.Group): THREE.Group {
	const group = targetGroup ?? new THREE.Group()
	group.clear()
	return group
}

function disposePool(pool: LabelPool) {
	for (const text of pool.items) {
		text.dispose()
	}
	for (const leader of pool.leaders) {
		leader.geometry.dispose()
		;(leader.material as THREE.Material).dispose()
	}
	pool.items = []
	pool.leaders = []
}

function nationCapitalRegion(
	world: SerializedGenesisWorld,
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
	world: SerializedGenesisWorld,
	nationIdx: number,
): number {
	const nationSeeds = world.nations?.seeds
	if (!nationSeeds || nationIdx < 0 || nationIdx >= nationSeeds.length) {
		return -1
	}
	return nationSeeds[nationIdx] ?? -1
}

function nationProvinceCount(
	world: SerializedGenesisWorld,
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

interface LabelScaleCurve {
	exponent: number
	factor: number
	maxScale: number
}

/** Default curve, tuned for the procedural generator's nation sizes. Earth
 * import passes a wider curve (see EARTH_HISTORY_LABEL_SCALE_CURVE below) --
 * real historical province-count distributions are far more skewed (Ming's
 * 113 provinces vs. a 1-province German principality in the same era) than
 * anything the procedural generator produces, so this curve's exponent/cap
 * compressed large real empires together almost indistinguishably (e.g.
 * Vijayanagara's 33 provinces and Ming's 113 both landing near/at the same
 * clamped scale). */
const DEFAULT_LABEL_SCALE_CURVE: LabelScaleCurve = {
	exponent: 0.55,
	factor: 0.5,
	maxScale: MAX_LABEL_SCALE,
}

/** Lower exponent/factor spread mid-size nations out more before the curve
 * flattens, and a higher cap keeps only genuinely massive empires (a few
 * hundred+ provinces, e.g. the British Empire by 1900) pinned at the max
 * instead of every empire past ~50 provinces looking the same size. */
export const EARTH_HISTORY_LABEL_SCALE_CURVE: LabelScaleCurve = {
	exponent: 0.6,
	factor: 0.32,
	maxScale: 6,
}

function computeLabelScale(
	componentSize: number,
	name: string,
	curve: LabelScaleCurve = DEFAULT_LABEL_SCALE_CURVE,
): number {
	const areaScale = 0.1 + Math.pow(componentSize, curve.exponent) * curve.factor
	const lengthPenalty = Math.max(0.7, 1 - Math.max(0, name.length - 12) * 0.02)
	return THREE.MathUtils.clamp(
		areaScale * lengthPenalty,
		MIN_LABEL_SCALE,
		curve.maxScale,
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

type GlobeLabelLike = THREE.Object3D & {
	visible: boolean
	userData: Record<string, unknown>
}

function orientGlobeLabel(
	label: GlobeLabelLike,
	cameraQuaternion: THREE.Quaternion,
) {
	label.quaternion.copy(cameraQuaternion)
}

// The leader line is a short radial stub (straight out from the surface, like
// the solar terminator's leader stubs). The label itself floats further out,
// nudged tangentially toward the on-screen "up" direction so it reads above
// its marker the same way map-view labels sit above their marker dot instead
// of overlapping it. Bigger/more important names get a taller tangential
// nudge (scaled by font size) so they sit further from their marker.
function globeLabelStubLength(markerScale: number): number {
	return markerScale * 0.5 + LABEL_OFFSET_GLOBE_Y
}

function globeLabelTangentOffset(fontSize: number): number {
	return (
		fontSize * LABEL_GLOBE_FONT_GAP_FACTOR +
		fontSize * LABEL_LEADER_HEIGHT_FACTOR
	)
}

function updateLabelLeaderLine(
	label: GlobeLabelLike,
	basePosition: THREE.Vector3,
): void {
	const leader = label.userData.leaderLine as THREE.Line | undefined
	if (!leader) return
	const positions = (leader.geometry as THREE.BufferGeometry).attributes
		.position as THREE.BufferAttribute
	positions.setXYZ(0, basePosition.x, basePosition.y, basePosition.z)
	positions.setXYZ(1, label.position.x, label.position.y, label.position.z)
	positions.needsUpdate = true
	leader.geometry.computeBoundingSphere()
}

function updateGlobeLabelPosition(
	label: GlobeLabelLike,
	cameraUp: THREE.Vector3,
): void {
	const normal = label.userData.globeNormal as THREE.Vector3 | undefined
	const basePosition = label.userData.globeBasePosition as
		| THREE.Vector3
		| undefined
	const stubLength = label.userData.globeLeaderStubLength as number | undefined
	const tangentOffset = label.userData.globeLabelTangentOffset as
		| number
		| undefined
	if (!normal || !basePosition || stubLength == null || tangentOffset == null)
		return

	const stubTip = GLOBE_STUB_TIP.copy(basePosition).addScaledVector(
		normal,
		stubLength,
	)

	GLOBE_PROJECTED_UP.copy(cameraUp).addScaledVector(
		normal,
		-cameraUp.dot(normal),
	)
	if (GLOBE_PROJECTED_UP.lengthSq() < 1e-8) {
		label.position.copy(stubTip)
	} else {
		GLOBE_PROJECTED_UP.normalize()
		label.position
			.copy(stubTip)
			.addScaledVector(GLOBE_PROJECTED_UP, tangentOffset)
	}
	updateLabelLeaderLine(label, basePosition)
}

function isGlobeLabelVisible(
	label: GlobeLabelLike,
	cameraPosition: THREE.Vector3,
): boolean {
	const normal = label.userData.globeNormal as THREE.Vector3 | undefined
	const basePosition = label.userData.globeBasePosition as
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
	group.getWorldQuaternion(GLOBE_GROUP_WORLD_QUATERNION)

	const lastCameraQuaternion = group.userData.globeCameraQuaternion as
		| THREE.Quaternion
		| undefined
	const lastGroupQuaternion = group.userData.globeGroupWorldQuaternion as
		| THREE.Quaternion
		| undefined
	const lastCameraPosition = group.userData.globeCameraPosition as
		| THREE.Vector3
		| undefined
	const rotationChanged =
		!lastCameraQuaternion ||
		lastCameraQuaternion.angleTo(camera.quaternion) > 1e-8 ||
		!lastGroupQuaternion ||
		lastGroupQuaternion.angleTo(GLOBE_GROUP_WORLD_QUATERNION) > 1e-8
	const positionChanged =
		!lastCameraPosition ||
		lastCameraPosition.distanceToSquared(GLOBE_CAMERA_LOCAL_POSITION) > 1e-12

	if (!rotationChanged && !positionChanged) return

	if (lastCameraQuaternion) {
		lastCameraQuaternion.copy(camera.quaternion)
	} else {
		group.userData.globeCameraQuaternion = camera.quaternion.clone()
	}
	if (lastGroupQuaternion) {
		lastGroupQuaternion.copy(GLOBE_GROUP_WORLD_QUATERNION)
	} else {
		group.userData.globeGroupWorldQuaternion =
			GLOBE_GROUP_WORLD_QUATERNION.clone()
	}
	if (lastCameraPosition) {
		lastCameraPosition.copy(GLOBE_CAMERA_LOCAL_POSITION)
	} else {
		group.userData.globeCameraPosition = GLOBE_CAMERA_LOCAL_POSITION.clone()
	}
	const localCamQuat = localCameraQuaternion(group, camera)
	GLOBE_CAMERA_UP.set(0, 1, 0).applyQuaternion(localCamQuat)
	for (const child of group.children) {
		if (child.type === "Line") continue
		const label = child as GlobeLabelLike
		const visible = cullingEnabled
			? isGlobeLabelVisible(label, GLOBE_CAMERA_LOCAL_POSITION)
			: true

		const leader = label.userData.leaderLine as THREE.Line | undefined
		if (leader) leader.visible = visible

		label.visible = visible
		if (!visible) continue

		updateGlobeLabelPosition(label, GLOBE_CAMERA_UP)
		orientGlobeLabel(label, localCamQuat)
	}
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

// ── Partition-based labels (culture, heritage) ────────────────────────────────

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

// ── Settlement labels ─────────────────────────────────────────────────────────

const SETTLEMENT_LABEL_FONT_SIZE_GLOBE = 0.00145
const SETTLEMENT_LABEL_FONT_SIZE_MAP = 0.0018
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

function settlementGlobeLabelStubLength(markerScale: number): number {
	return markerScale * 0.5 + SETTLEMENT_LABEL_OFFSET_GLOBE_Y
}

function createSettlementLabelPools(): NationLabelPools {
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

export {
	LABEL_FONT_SIZE_GLOBE,
	LABEL_FONT_SIZE_MAP,
	LABEL_OUTLINE_COLOR,
	LABEL_RENDER_ORDER,
	createNationLabelPools,
	createSettlementLabelPools,
	disposePool,
	globeLabelStubLength,
	globeLabelTangentOffset,
	labelPositionGlobe,
	labelPositionMap,
	nationCapitalProvince,
	nationCapitalRegion,
	nationProvinceCount,
	computeLabelScale,
	updateGlobeLabelOrientations,
}

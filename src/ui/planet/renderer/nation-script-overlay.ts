import * as THREE from "three"
import type { HeritageScript } from "@/model/society/script"
import { compressName } from "@/model/society/script/compress"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import { createMapProjection } from "./map-projection"
import {
	computeLabelScale,
	globeLabelOffset,
	LABEL_FONT_SIZE_GLOBE,
	LABEL_FONT_SIZE_MAP,
	LABEL_RENDER_ORDER,
	labelPositionGlobe,
	labelPositionMap,
	nationCapitalProvince,
	nationCapitalRegion,
	nationProvinceCount,
} from "./nation-label-overlay"
import { renderScriptTexture } from "./script-texture"
import { globeScaleForPop, mapRadiusForPop } from "./settlement-overlay"

const SCRIPT_HEIGHT_FACTOR = 0.45
const SCRIPT_GLOBE_GAP_FACTOR = 0.12
const SCRIPT_MAP_GAP_FACTOR = 0.12

export interface ScriptTextureCacheEntry {
	texture: THREE.CanvasTexture
	aspect: number
}

interface PendingScriptTextureSubscriber {
	group: THREE.Group
	mesh: ScriptMesh
}

interface PendingScriptTextureTask {
	key: string
	heritageIdx: number
	script: HeritageScript
	text: string
	subscribers: PendingScriptTextureSubscriber[]
}

export interface PendingNationScriptTextureQueue {
	tasks: PendingScriptTextureTask[]
	byKey: Map<string, PendingScriptTextureTask>
}

interface ScriptMesh
	extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
	userData: THREE.Mesh["userData"] & {
		globeNormal?: THREE.Vector3
		globeBasePosition?: THREE.Vector3
		globeLabelOffset?: number
		scriptPlaneHeight?: number
	}
}

interface ScriptMeshPool {
	items: ScriptMesh[]
}

interface NationScriptPools {
	globe: ScriptMeshPool
	map: ScriptMeshPool
}

function createScriptMesh(): ScriptMesh {
	const material = new THREE.MeshBasicMaterial({
		transparent: true,
		depthWrite: false,
		toneMapped: false,
	})
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(1, 1),
		material,
	) as ScriptMesh
	mesh.renderOrder = LABEL_RENDER_ORDER
	mesh.frustumCulled = true
	mesh.visible = false
	return mesh
}

function createScriptMeshPool(): ScriptMeshPool {
	return { items: [] }
}

export function createNationScriptPools(): NationScriptPools {
	return {
		globe: createScriptMeshPool(),
		map: createScriptMeshPool(),
	}
}

export function createPendingNationScriptTextureQueue(): PendingNationScriptTextureQueue {
	return {
		tasks: [],
		byKey: new Map(),
	}
}

function ensurePoolSize(pool: ScriptMeshPool, count: number) {
	while (pool.items.length < count) {
		pool.items.push(createScriptMesh())
	}
}

function hideUnusedPool(pool: ScriptMeshPool, usedCount: number) {
	for (let i = usedCount; i < pool.items.length; i++) {
		pool.items[i].visible = false
	}
}

export function disposeNationScriptPools(pools: NationScriptPools) {
	for (const pool of [pools.globe, pools.map]) {
		for (const mesh of pool.items) {
			mesh.geometry.dispose()
			mesh.material.map?.dispose()
			mesh.material.map = null
			mesh.material.dispose()
		}
		pool.items = []
	}
}

function getNationHeritageIndex(
	world: SerializedGenesisWorld,
	nationIdx: number,
): number {
	if (!world.cultures || !world.heritages) return -1
	const province = nationCapitalProvince(world, nationIdx)
	if (province < 0) return -1
	const cultureIdx = world.cultures.assignment[province] ?? -1
	return cultureIdx >= 0 ? (world.heritages.assignment[cultureIdx] ?? -1) : -1
}

function getCachedScriptTexture(
	cache: Map<string, ScriptTextureCacheEntry>,
	heritageIdx: number,
	script: HeritageScript,
	text: string,
): ScriptTextureCacheEntry | null {
	const key = `${heritageIdx}:${text}`
	const existing = cache.get(key)
	if (existing) return existing

	const rendered = renderScriptTexture(script, text)
	if (!rendered) return null

	const texture = new THREE.CanvasTexture(rendered.canvas)
	texture.needsUpdate = true
	texture.colorSpace = THREE.SRGBColorSpace
	const entry = { texture, aspect: rendered.aspect }
	cache.set(key, entry)
	return entry
}

function attachScriptTexture(
	group: THREE.Group,
	mesh: ScriptMesh,
	textureEntry: ScriptTextureCacheEntry,
) {
	mesh.material.map = textureEntry.texture
	mesh.material.needsUpdate = true
	const planeHeight = mesh.userData.scriptPlaneHeight ?? 1
	mesh.scale.set(planeHeight * textureEntry.aspect, planeHeight, 1)
	mesh.visible = true
	group.add(mesh)
}

function queueScriptTexture(
	queue: PendingNationScriptTextureQueue,
	cache: Map<string, ScriptTextureCacheEntry>,
	heritageIdx: number,
	script: HeritageScript,
	text: string,
	group: THREE.Group,
	mesh: ScriptMesh,
): boolean {
	const key = `${heritageIdx}:${text}`
	const existing = cache.get(key)
	if (existing) {
		attachScriptTexture(group, mesh, existing)
		return true
	}

	const task = queue.byKey.get(key)
	if (task) {
		task.subscribers.push({ group, mesh })
		return false
	}

	const createdTask: PendingScriptTextureTask = {
		key,
		heritageIdx,
		script,
		text,
		subscribers: [{ group, mesh }],
	}
	queue.byKey.set(key, createdTask)
	queue.tasks.push(createdTask)
	return false
}

export function processPendingNationScriptTextures(
	queue: PendingNationScriptTextureQueue | null,
	cache: Map<string, ScriptTextureCacheEntry>,
	maxTasksPerFrame = 4,
): { processed: number; pending: number } {
	if (!queue || queue.tasks.length === 0) {
		return { processed: 0, pending: 0 }
	}

	let processed = 0
	while (processed < maxTasksPerFrame && queue.tasks.length > 0) {
		const task = queue.tasks.shift()
		if (!task) break
		queue.byKey.delete(task.key)
		const textureEntry = getCachedScriptTexture(
			cache,
			task.heritageIdx,
			task.script,
			task.text,
		)
		if (textureEntry) {
			for (const subscriber of task.subscribers) {
				attachScriptTexture(subscriber.group, subscriber.mesh, textureEntry)
			}
		}
		processed++
	}

	return {
		processed,
		pending: queue.tasks.length,
	}
}

export function disposeScriptTextureCache(
	cache: Map<string, ScriptTextureCacheEntry>,
) {
	for (const entry of cache.values()) {
		entry.texture.dispose()
	}
	cache.clear()
}

export function buildGlobeNationScripts(
	world: SerializedGenesisWorld,
	labelNames: string[],
	scripts: Map<number, HeritageScript>,
	textureCache: Map<string, ScriptTextureCacheEntry>,
	textureQueue: PendingNationScriptTextureQueue,
	_camera: THREE.PerspectiveCamera,
	pool: ScriptMeshPool,
	cullingEnabled = false,
	elevationVisible = true,
): THREE.Group {
	const group = new THREE.Group()
	if (
		!world.provinces ||
		!world.nations ||
		!world.cultures ||
		!world.heritages
	) {
		return group
	}

	const { r_xyz } = world.mesh
	const elevation = world.elevation
	const nationCount = world.nations.seeds?.length ?? 0
	ensurePoolSize(pool, nationCount)

	let activeCount = 0
	for (let nationIdx = 0; nationIdx < nationCount; nationIdx++) {
		const name = labelNames[nationIdx]
		if (!name) continue

		const heritageIdx = getNationHeritageIndex(world, nationIdx)
		if (heritageIdx < 0) continue
		const script = scripts.get(heritageIdx)
		if (!script) continue

		const text = compressName(
			name,
			script.compressionRatio,
			`heritage:${heritageIdx}`,
		)
		if (!text) continue

		const capitalProvince = nationCapitalProvince(world, nationIdx)
		const capitalRegion = nationCapitalRegion(world, nationIdx)
		if (capitalRegion < 0) continue
		const settlementRegion = world.settlementRegions?.[capitalProvince] ?? -1
		const anchorRegion =
			settlementRegion >= 0 ? settlementRegion : capitalRegion
		const scale = computeLabelScale(nationProvinceCount(world, nationIdx), name)
		const fontSize = LABEL_FONT_SIZE_GLOBE * scale
		const planeHeight = fontSize * SCRIPT_HEIGHT_FACTOR
		const placement = labelPositionGlobe(
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

		const mesh = pool.items[activeCount]
		mesh.frustumCulled = cullingEnabled
		mesh.visible = false
		mesh.userData.scriptPlaneHeight = planeHeight
		mesh.userData.globeNormal = placement.normal
		mesh.userData.globeBasePosition = placement.normal
			.clone()
			.multiplyScalar(placement.radius)
		mesh.userData.globeLabelOffset =
			-globeLabelOffset(markerScale, fontSize) -
			(planeHeight / 2 + fontSize * SCRIPT_GLOBE_GAP_FACTOR)
		queueScriptTexture(
			textureQueue,
			textureCache,
			heritageIdx,
			script,
			text,
			group,
			mesh,
		)
		activeCount++
	}

	hideUnusedPool(pool, activeCount)
	return group
}

export function buildMapNationScripts(
	world: SerializedGenesisWorld,
	labelNames: string[],
	scripts: Map<number, HeritageScript>,
	textureCache: Map<string, ScriptTextureCacheEntry>,
	textureQueue: PendingNationScriptTextureQueue,
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	pool: ScriptMeshPool,
	cullingEnabled = false,
): THREE.Group {
	const group = new THREE.Group()
	if (
		!world.provinces ||
		!world.nations ||
		!world.cultures ||
		!world.heritages
	) {
		return group
	}

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
	for (let nationIdx = 0; nationIdx < nationCount; nationIdx++) {
		const name = labelNames[nationIdx]
		if (!name) continue

		const heritageIdx = getNationHeritageIndex(world, nationIdx)
		if (heritageIdx < 0) continue
		const script = scripts.get(heritageIdx)
		if (!script) continue

		const text = compressName(
			name,
			script.compressionRatio,
			`heritage:${heritageIdx}`,
		)
		if (!text) continue

		const capitalRegion = nationCapitalRegion(world, nationIdx)
		if (capitalRegion < 0) continue

		const scale = computeLabelScale(nationProvinceCount(world, nationIdx), name)
		const fontSize = LABEL_FONT_SIZE_MAP * scale
		const planeHeight = fontSize * SCRIPT_HEIGHT_FACTOR
		const capitalProvince = nationCapitalProvince(world, nationIdx)
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
		const y = py - planeHeight / 2 - fontSize * SCRIPT_MAP_GAP_FACTOR

		for (const wrapOffset of wrapOffsets) {
			const mesh = pool.items[activeCount]
			mesh.frustumCulled = cullingEnabled
			mesh.position.set(px + wrapOffset, y, pz)
			mesh.rotation.set(0, 0, 0)
			mesh.visible = false
			mesh.userData.scriptPlaneHeight = planeHeight
			queueScriptTexture(
				textureQueue,
				textureCache,
				heritageIdx,
				script,
				text,
				group,
				mesh,
			)
			activeCount++
		}
	}

	hideUnusedPool(pool, activeCount)
	return group
}

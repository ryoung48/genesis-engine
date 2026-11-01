import * as THREE from "three"
import type { Text } from "troika-three-text"
import type { HeritageScript } from "@/model/society/script"
import { COMPRESS } from "@/model/society/script/compress"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { LABEL_RENDER_ORDER } from "@/ui/genesis/renderer/nation-label-overlay/constants"
import {
	type PendingNationScriptTextureQueue,
	queueScriptTexture,
	type ScriptMesh,
	type ScriptTextureCacheEntry,
} from "@/ui/genesis/renderer/nation-script-overlay"

export interface SettlementScriptUpdate {
	groups: (THREE.Group | null)[]
	world: SerializedGenesisWorld
	names: readonly string[]
	scripts: Map<number, HeritageScript>
	enabled: boolean
}

export interface SettlementScriptRequest {
	group: THREE.Group
	textureCache: Map<string, ScriptTextureCacheEntry>
	textureQueue: PendingNationScriptTextureQueue
}

interface SettlementScriptPending {
	heritageIdx: number
	script: HeritageScript
	text: string
	queued: boolean
}

const SETTLEMENT_SCRIPT_RENDER_SCALE = 3

const sharedGeometry = new THREE.PlaneGeometry(1, 1)

function settlementHeritageIndex(
	world: SerializedGenesisWorld,
	province: number,
): number {
	if (!world.cultures || !world.heritages) return -1
	const cultureIdx = world.cultures.assignment[province] ?? -1
	return cultureIdx >= 0 ? (world.heritages.assignment[cultureIdx] ?? -1) : -1
}

function scriptMeshFor(label: Text): ScriptMesh {
	const existing = label.userData.settlementScriptMesh as ScriptMesh | undefined
	if (existing) return existing
	const mesh = new THREE.Mesh(
		sharedGeometry,
		new THREE.MeshBasicMaterial({
			transparent: true,
			depthWrite: false,
			toneMapped: false,
		}),
	) as ScriptMesh
	mesh.renderOrder = LABEL_RENDER_ORDER
	mesh.visible = false
	label.userData.settlementScriptMesh = mesh
	return mesh
}

const SETTLEMENT_SCRIPT_HEIGHT_FACTOR = 0.8
const SETTLEMENT_SCRIPT_GAP_FACTOR = 0.4
const SETTLEMENT_SCRIPT_CLEARANCE_FACTOR = 0.3

function liftLabel(label: Text, lift: number) {
	const baseY = label.userData.settlementBaseY as number | undefined
	if (baseY !== undefined) label.position.y = baseY + lift
	const baseTangent = label.userData.settlementBaseTangent as number | undefined
	if (baseTangent !== undefined) {
		label.userData.globeLabelTangentOffset = baseTangent + lift
	}
}

function layoutSettlementScript(label: Text) {
	const mesh = label.userData.settlementScriptMesh as ScriptMesh | undefined
	if (!mesh) return
	const planeHeight = label.fontSize * SETTLEMENT_SCRIPT_HEIGHT_FACTOR
	const aspect = mesh.userData.scriptAspect
	if (aspect !== undefined) mesh.scale.set(planeHeight * aspect, planeHeight, 1)
	mesh.position.set(
		0,
		-planeHeight / 2 - label.fontSize * SETTLEMENT_SCRIPT_GAP_FACTOR,
		0,
	)
}

function update({
	groups,
	world,
	names,
	scripts,
	enabled,
}: SettlementScriptUpdate) {
	for (const group of groups) {
		if (!group) continue
		for (const child of group.children) {
			if (child.type === "Line") continue
			const label = child as Text
			const province = label.userData.settlementProvince as number | undefined
			if (province === undefined) continue
			const existing = label.userData.settlementScriptMesh as
				| ScriptMesh
				| undefined
			if (existing) existing.visible = false
			delete label.userData.settlementScriptRequest
			liftLabel(label, 0)
			if (!enabled) continue
			const name = names[province]
			if (!name) continue
			const heritageIdx = settlementHeritageIndex(world, province)
			if (heritageIdx < 0) continue
			const script = scripts.get(heritageIdx)
			if (!script) continue
			const text = COMPRESS.compressName({
				name,
				ratio: script.compressionRatio,
				seedSalt: `heritage:${heritageIdx}`,
			})
			if (!text) continue
			scriptMeshFor(label).userData.scriptPlaneHeight =
				label.fontSize * SETTLEMENT_SCRIPT_HEIGHT_FACTOR
			liftLabel(
				label,
				label.fontSize *
					(SETTLEMENT_SCRIPT_HEIGHT_FACTOR +
						SETTLEMENT_SCRIPT_GAP_FACTOR +
						SETTLEMENT_SCRIPT_CLEARANCE_FACTOR),
			)
			layoutSettlementScript(label)
			label.userData.settlementScriptRequest = {
				heritageIdx,
				script,
				text,
				queued: false,
			}
		}
	}
}

function request({
	group,
	textureCache,
	textureQueue,
}: SettlementScriptRequest): boolean {
	let queued = false
	for (const child of group.children) {
		if (child.type === "Line" || !child.visible) continue
		const label = child as Text
		const pending = label.userData.settlementScriptRequest as
			| SettlementScriptPending
			| undefined
		if (!pending || pending.queued) continue
		pending.queued = true
		const attached = queueScriptTexture(
			textureQueue,
			textureCache,
			pending.heritageIdx,
			pending.script,
			pending.text,
			label,
			scriptMeshFor(label),
			SETTLEMENT_SCRIPT_RENDER_SCALE,
		)
		if (attached) layoutSettlementScript(label)
		else queued = true
	}
	return queued
}

function dispose(pools: readonly { items: Text[] }[]) {
	for (const pool of pools) {
		for (const label of pool.items) {
			const mesh = label.userData.settlementScriptMesh as ScriptMesh | undefined
			if (!mesh) continue
			label.remove(mesh)
			mesh.material.dispose()
			delete label.userData.settlementScriptMesh
		}
	}
}

export const SETTLEMENT_SCRIPT = {
	update,
	request,
	layout: layoutSettlementScript,
	dispose,
}

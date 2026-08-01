import * as THREE from "three"
import { Text } from "troika-three-text"
import jedarFontUrl from "@/ui/assets/fonts/Jedar.otf"
import {
	LABEL_FONT_SIZE_GLOBE,
	LABEL_LEADER_COLOR,
	LABEL_LEADER_OPACITY,
	LABEL_LEADER_RENDER_ORDER,
	LABEL_OUTLINE_COLOR,
	LABEL_OUTLINE_WIDTH,
	LABEL_RENDER_ORDER,
	LABEL_TEXT_COLOR,
	type LabelPool,
	type NationLabelPools,
} from "@/ui/planet/renderer/nation-label-overlay/constants"

export function createLabelPool(): LabelPool {
	return { items: [], leaders: [] }
}

export function createNationLabelPools(): NationLabelPools {
	return {
		globe: createLabelPool(),
		map: createLabelPool(),
	}
}

export function ensurePoolSize(pool: LabelPool, count: number) {
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

export function hideUnusedPool(pool: LabelPool, usedCount: number) {
	for (let i = usedCount; i < pool.items.length; i++) {
		const text = pool.items[i]
		if (text.visible) text.visible = false
		const leader = pool.leaders[i]
		if (leader && leader.visible) leader.visible = false
	}
}

export function disposePool(pool: LabelPool) {
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

export function createLabelLeaderLine(): THREE.Line {
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

export function prepareLabelGroup(targetGroup?: THREE.Group): THREE.Group {
	const group = targetGroup ?? new THREE.Group()
	group.clear()
	return group
}

import * as THREE from "three"
import { Text } from "troika-three-text"
import { expect, it, vi } from "vitest"
import {
	activateSettlementLabels,
	settlementLabelsInView,
	syncSettlementLabelsForExport,
} from "@/ui/genesis/renderer/nation-label-overlay/settlement-labels"
import {
	applySettlementLabelCulling,
	applySettlementMarkerCollisionCulling,
	createSettlementFrustum,
} from "@/ui/genesis/renderer/nation-label-overlay/settlement-marker-collision"

it("keeps partially visible circles, skips off-screen collisions and separates map wraps", () => {
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
	camera.position.z = 2
	camera.zoom = 4
	camera.updateProjectionMatrix()
	const frustum = createSettlementFrustum(camera)
	const viewport = { camera, frustum, width: 400, height: 400 }
	const markers = new THREE.Group()
	const labels = new THREE.Group()
	const geometry = new THREE.CircleGeometry(1)
	const material = new THREE.MeshBasicMaterial()
	for (const [x, wrap, id] of [
		[0, 0, "town"],
		[4, 4, "town"],
		[0, 0, "capital"],
		[0.2502, 0, "edge"],
	] as const) {
		const marker = new THREE.Mesh(geometry, material)
		marker.position.x = x
		marker.userData = {
			settlementId: id,
			settlementWrapOffset: wrap,
			isCapital: id === "capital",
		}
		markers.add(marker)
		const label = new THREE.Object3D()
		label.userData = { settlementId: id, settlementWrapOffset: wrap }
		labels.add(label)
	}
	const visibility = new Map<string, boolean>()
	applySettlementMarkerCollisionCulling({
		group: markers,
		viewport,
		visibility,
	})
	applySettlementLabelCulling({ group: labels, isGlobe: false, visibility })
	expect([...visibility.keys()]).toEqual(["capital:0", "town:0", "edge:0"])
	expect(labels.children.map((label) => label.visible)).toEqual([
		false,
		true,
		true,
		true,
	])
	expect(frustum.intersectsObject(markers.children[1])).toBe(false)
	expect(frustum.intersectsObject(markers.children[3])).toBe(true)
	camera.position.x = 4
	applySettlementMarkerCollisionCulling({
		group: markers,
		viewport: { ...viewport, frustum: createSettlementFrustum(camera) },
		visibility: new Map(),
	})
	expect(markers.children[1].visible).toBe(true)
})

it("activates only labels within the current view and prepares labels in the export view", async () => {
	const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
	camera.position.z = 2
	camera.zoom = 4
	camera.updateProjectionMatrix()
	const labels = new THREE.Group()
	const inView = new Text()
	inView.fontSize = 0.01
	inView.userData.settlementName = "Visible"
	const outsideView = new Text()
	outsideView.position.x = 0.8
	outsideView.fontSize = 0.01
	outsideView.userData.settlementName = "Outside"
	const activated = vi
		.spyOn(inView, "sync")
		.mockImplementation((onSync) => onSync?.())
	const exported = vi
		.spyOn(outsideView, "sync")
		.mockImplementation((onSync) => onSync?.())
	labels.add(inView, outsideView)
	const visibleLabels = settlementLabelsInView({
		group: labels,
		frustum: createSettlementFrustum(camera),
	})
	expect(visibleLabels).toEqual([inView])
	expect(activateSettlementLabels(visibleLabels)).toBe(false)
	expect(activated).toHaveBeenCalledOnce()
	expect(exported).not.toHaveBeenCalled()
	camera.zoom = 1
	camera.updateProjectionMatrix()
	await syncSettlementLabelsForExport(
		settlementLabelsInView({
			group: labels,
			frustum: createSettlementFrustum(camera),
		}),
	)
	expect(exported).toHaveBeenCalledOnce()
})

it("filters globe sprites against the perspective camera after it moves", () => {
	const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 10)
	camera.position.z = 1.3
	const markers = new THREE.Group()
	const material = new THREE.SpriteMaterial()
	for (const x of [0, 0.3]) {
		const marker = new THREE.Sprite(material)
		marker.position.set(x, 0, 1)
		marker.userData.settlementId = `town${x}`
		markers.add(marker)
	}
	const cull = () => {
		const visibility = new Map<string, boolean>()
		applySettlementMarkerCollisionCulling({
			group: markers,
			viewport: {
				camera,
				frustum: createSettlementFrustum(camera),
				width: 400,
				height: 400,
			},
			visibility,
		})
		return [...visibility.keys()]
	}
	expect(cull()).toEqual(["town0:0"])
	camera.position.x = 0.3
	expect(cull()).toEqual(["town0.3:0"])
})

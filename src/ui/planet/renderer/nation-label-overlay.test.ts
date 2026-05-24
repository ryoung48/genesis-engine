import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"
import type { SerializedOrogenWorld } from "@/model/transport/worker-types"
import { createMapProjection } from "./map-projection"
import {
	buildGlobeNationLabels,
	buildMapNationLabels,
	createNationLabelPools,
	orientGlobeLabel,
	updateGlobeLabelOrientations,
} from "./nation-label-overlay"

vi.mock("troika-three-text", () => {
	class MockText extends THREE.Object3D {
		text = ""
		fontSize = 0
		fontWeight = 0
		color = ""
		strokeWidth = 0
		strokeColor = 0
		anchorX: string | number = "center"
		anchorY: string | number = "middle"
		textRenderingMode = "distanceField"
		renderOrder = 0

		dispose(): void {
			return
		}
	}

	return { Text: MockText }
})

function cartesianFromLonLat(
	lonDeg: number,
	latDeg: number,
): [number, number, number] {
	const lon = THREE.MathUtils.degToRad(lonDeg)
	const lat = THREE.MathUtils.degToRad(latDeg)
	const cosLat = Math.cos(lat)
	return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)]
}

function buildWorld(): SerializedOrogenWorld {
	return {
		mesh: {
			r_xyz: new Float32Array([
				...cartesianFromLonLat(-40, 0),
				...cartesianFromLonLat(20, 12),
				...cartesianFromLonLat(25, 14),
				...cartesianFromLonLat(30, 16),
				...cartesianFromLonLat(35, 18),
				...cartesianFromLonLat(40, 20),
			]),
			adjOffset: new Int32Array([0, 0, 1, 3, 5, 7, 8]),
			adjList: new Int32Array([2, 1, 3, 2, 4, 3, 5, 4]),
		},
		elevation: new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
		provinces: {
			regionProvince: new Int32Array([0, 1, 1, 1, 1, 1]),
			seeds: new Int32Array([0, 1]),
			count: 2,
		},
		settlementRegions: new Int32Array([0, 3]),
		urbanPopulation: new Float32Array([5_000, 400_000]),
		nations: {
			seeds: new Int32Array([0, 1]),
			assignment: new Int32Array([0, 1]),
			size: new Int32Array([1, 5]),
		},
	} as unknown as SerializedOrogenWorld
}

describe("nation-label-overlay", () => {
	it("keeps separate text objects for globe and map label groups", () => {
		const pools = createNationLabelPools()
		const world = buildWorld()
		const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
		camera.position.set(0, 0, 3)

		const globeGroup = buildGlobeNationLabels(
			world,
			["A", "Large Dominion"],
			camera,
			pools.globe,
		)
		const mapGroup = buildMapNationLabels(
			world,
			["A", "Large Dominion"],
			0,
			0,
			pools.map,
		)

		expect(globeGroup.children).toHaveLength(2)
		expect(mapGroup.children).toHaveLength(2)
		expect(globeGroup.children[0]?.parent).toBe(globeGroup)
		expect(mapGroup.children[0]?.parent).toBe(mapGroup)
		expect(globeGroup.children[0]).not.toBe(mapGroup.children[0])
	})

	it("faces globe labels toward the camera", () => {
		const text = new THREE.Object3D()
		const cameraQuaternion = new THREE.Quaternion().setFromEuler(
			new THREE.Euler(0, Math.PI / 6, 0),
		)

		orientGlobeLabel(text as never, cameraQuaternion)

		expect(text.quaternion.angleTo(cameraQuaternion)).toBeLessThan(1e-6)
	})

	it("places globe labels around the capital instead of directly on top of it", () => {
		const pools = createNationLabelPools()
		const world = buildWorld()
		const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
		camera.position.set(0, 0, 3)

		const globeGroup = buildGlobeNationLabels(
			world,
			["A", "Large Dominion"],
			camera,
			pools.globe,
		)
		const label = globeGroup.children[0] as THREE.Object3D
		const capital = new THREE.Vector3(
			world.mesh.r_xyz[0] * 1.014,
			world.mesh.r_xyz[1] * 1.014,
			world.mesh.r_xyz[2] * 1.014,
		)

		expect(label.position.distanceTo(capital)).toBeGreaterThan(0.007)
	})

	it("places map labels around the capital instead of covering it", () => {
		const pools = createNationLabelPools()
		const world = buildWorld()
		const mapGroup = buildMapNationLabels(
			world,
			["A", "Large Dominion"],
			0,
			0,
			pools.map,
		)
		const label = mapGroup.children[0] as THREE.Object3D
		const projection = createMapProjection(0, 0)
		const capital = projection.projectCartesian(
			world.mesh.r_xyz[0],
			world.mesh.r_xyz[1],
			world.mesh.r_xyz[2],
		)
		const [capitalX, capitalY] = projection.projectRadians(
			capital.lon,
			capital.lat,
			0,
		)
		const anchoredLabel = label as THREE.Object3D & {
			anchorY?: string | number
		}

		expect(label.position.x).toBeCloseTo(capitalX, 4)
		expect(label.position.y).toBeGreaterThan(capitalY)
		expect(anchoredLabel.anchorY).toBe("bottom")
	})

	it("scales larger nations up relative to smaller nations", () => {
		const pools = createNationLabelPools()
		const world = buildWorld()
		const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
		camera.position.set(0, 0, 3)

		const globeGroup = buildGlobeNationLabels(
			world,
			["A", "Large Dominion"],
			camera,
			pools.globe,
		)
		const smallNation = globeGroup.children[0] as unknown as {
			fontSize: number
		}
		const largeNation = globeGroup.children[1] as unknown as {
			fontSize: number
		}

		expect(largeNation.fontSize).toBeGreaterThan(smallNation.fontSize * 2)
	})

	it("caches stable globe anchor data for per-frame label updates", () => {
		const pools = createNationLabelPools()
		const world = buildWorld()
		const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
		camera.position.set(0, 0, 3)

		const globeGroup = buildGlobeNationLabels(
			world,
			["A", "Large Dominion"],
			camera,
			pools.globe,
		)
		const label = globeGroup.children[0] as THREE.Object3D & {
			userData: {
				globeBasePosition?: THREE.Vector3
				globeLabelOffset?: number
				globeNormal?: THREE.Vector3
			}
		}
		const basePosition = label.userData.globeBasePosition
		const normal = label.userData.globeNormal

		expect(basePosition).toBeInstanceOf(THREE.Vector3)
		expect(normal).toBeInstanceOf(THREE.Vector3)
		expect(basePosition).not.toBe(normal)
		expect(label.userData.globeLabelOffset).toBeGreaterThan(0)
		expect(globeGroup.userData.globeCameraQuaternion).toBeInstanceOf(
			THREE.Quaternion,
		)

		const before = basePosition?.clone()
		camera.quaternion.setFromEuler(new THREE.Euler(Math.PI / 6, Math.PI / 8, 0))
		updateGlobeLabelOrientations(globeGroup, camera)

		expect(label.userData.globeBasePosition?.distanceTo(before!)).toBeLessThan(
			1e-6,
		)
		expect(
			globeGroup.userData.globeCameraQuaternion.angleTo(camera.quaternion),
		).toBeLessThan(1e-6)
	})

	it("reorients globe labels when the viewer rotates", () => {
		const pools = createNationLabelPools()
		const world = buildWorld()
		const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100)
		camera.position.set(0, 0, 3)

		const globeGroup = buildGlobeNationLabels(
			world,
			["A", "Large Dominion"],
			camera,
			pools.globe,
		)
		const label = globeGroup.children[0] as THREE.Object3D
		const initialQuaternion = label.quaternion.clone()
		const initialPosition = label.position.clone()

		camera.quaternion.setFromEuler(new THREE.Euler(Math.PI / 5, Math.PI / 4, 0))
		updateGlobeLabelOrientations(globeGroup, camera)

		expect(label.quaternion.angleTo(initialQuaternion)).toBeGreaterThan(0.1)
		expect(label.position.distanceTo(initialPosition)).toBeGreaterThan(0.001)
	})
})

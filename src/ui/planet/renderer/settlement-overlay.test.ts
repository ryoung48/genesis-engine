import * as THREE from "three"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { SerializedGenesisWorld } from "@/model/transport/worker-types"
import {
	buildGlobeSettlements,
	buildMapSettlements,
} from "./settlement-overlay"

function installCanvasDocumentStub() {
	const context = {
		clearRect: (): void => undefined,
		beginPath: (): void => undefined,
		arc: (): void => undefined,
		stroke: (): void => undefined,
		moveTo: (): void => undefined,
		lineTo: (): void => undefined,
		fill: (): void => undefined,
		strokeStyle: "",
		fillStyle: "",
		lineWidth: 0,
		lineCap: "round",
	} as unknown as CanvasRenderingContext2D

	const documentStub = {
		createElement(tagName: string) {
			if (tagName !== "canvas") throw new Error(`Unexpected tag: ${tagName}`)
			return {
				width: 0,
				height: 0,
				getContext: () => context,
			} as unknown as HTMLCanvasElement
		},
	}

	Object.defineProperty(globalThis, "document", {
		value: documentStub,
		configurable: true,
		writable: true,
	})
}

beforeAll(() => {
	installCanvasDocumentStub()
})

afterAll(() => {
	Reflect.deleteProperty(globalThis, "document")
})

function buildSettlementWorld(): SerializedGenesisWorld {
	return {
		params: {
			era: "lateMedieval",
		},
		mesh: {
			r_xyz: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
		},
		elevation: new Float32Array([0.2, 0.2, 0.2]),
		provinces: {
			count: 3,
		},
		nations: {
			seeds: new Int32Array([1]),
		},
	} as unknown as SerializedGenesisWorld
}

describe("settlement-overlay", () => {
	it("marks capital globe settlements with the red capital fill style", () => {
		const group = buildGlobeSettlements(
			buildSettlementWorld(),
			new Int32Array([0, 1, 2]),
			new Float32Array([5_000, 5_000, 5_000]),
			true,
		)

		expect(group.children).toHaveLength(3)
		const capital = group.children.find(
			(child) => child.userData.province === 1,
		) as THREE.Sprite
		const nonCapital = group.children.find(
			(child) => child.userData.province === 0,
		) as THREE.Sprite

		expect(capital.userData.isCapital).toBe(true)
		expect(nonCapital.userData.isCapital).toBe(false)
		expect((capital.material as THREE.SpriteMaterial).userData.fillColor).toBe(
			"#dc2626",
		)
		expect(
			(nonCapital.material as THREE.SpriteMaterial).userData.fillColor,
		).toBe("#ffffff")
	})

	it("marks capital map settlements with the red capital fill style", () => {
		const group = buildMapSettlements(
			buildSettlementWorld(),
			new Int32Array([0, 1, 2]),
			new Float32Array([15_000, 15_000, 15_000]),
			0,
			0,
		)

		expect(group.children).toHaveLength(3)
		const capital = group.children.find(
			(child) => child.userData.province === 1,
		) as THREE.Mesh
		const nonCapital = group.children.find(
			(child) => child.userData.province === 2,
		) as THREE.Mesh

		expect(capital.userData.isCapital).toBe(true)
		expect(nonCapital.userData.isCapital).toBe(false)
		expect(
			(capital.material as THREE.MeshBasicMaterial).userData.fillColor,
		).toBe("#dc2626")
		expect(
			(nonCapital.material as THREE.MeshBasicMaterial).userData.fillColor,
		).toBe("#ffffff")
	})

	it("uses era-specific town minimums before rendering settlements", () => {
		const world = {
			...buildSettlementWorld(),
			params: { era: "information" },
		} as SerializedGenesisWorld

		const group = buildGlobeSettlements(
			world,
			new Int32Array([0, 1, 2]),
			new Float32Array([9_999, 10_000, 50_000]),
			true,
		)

		expect(group.children).toHaveLength(2)
		expect(group.children.map((child) => child.userData.province)).toEqual([
			1, 2,
		])
	})
})

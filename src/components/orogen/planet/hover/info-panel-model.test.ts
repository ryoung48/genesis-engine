import { describe, expect, it } from "vitest"
import type { SerializedOrogenWorld } from "@/model/orogen/worker-types"
import {
	buildClimateSwatchColor,
	buildTopographySwatchColor,
	buildVegetationSwatchColor,
} from "./info-panel-model"

function makeWorld(
	overrides: Partial<SerializedOrogenWorld>,
): SerializedOrogenWorld {
	return overrides as unknown as SerializedOrogenWorld
}

describe("buildClimateSwatchColor", () => {
	it("returns null when hoverRegion is null", () => {
		expect(buildClimateSwatchColor(null, makeWorld({}), "terrain")).toBeNull()
	})

	it("returns null when world is null", () => {
		expect(buildClimateSwatchColor(0, null, "terrain")).toBeNull()
	})

	it("returns null when no climate zones or matching mode data", () => {
		const world = makeWorld({ climateZones: undefined })
		expect(buildClimateSwatchColor(0, world, "terrain")).toBeNull()
	})

	it("returns a css color string for pastaClimate mode", () => {
		const world = makeWorld({ pastaClimate: new Uint8Array([3]) })
		const result = buildClimateSwatchColor(0, world, "pastaClimate")
		expect(result).toMatch(/^rgb/)
	})

	it("returns a css color string for koppenClimate mode", () => {
		const world = makeWorld({ koppenClimate: new Uint8Array([1]) })
		const result = buildClimateSwatchColor(0, world, "koppenClimate")
		expect(result).toMatch(/^rgb/)
	})

	it("falls back to climateZone color when mode is terrain", () => {
		const world = makeWorld({ climateZones: new Uint8Array([2]) })
		const result = buildClimateSwatchColor(0, world, "terrain")
		expect(result).toMatch(/^rgb/)
	})
})

describe("buildVegetationSwatchColor", () => {
	it("returns null when hoverRegion is null", () => {
		expect(buildVegetationSwatchColor(null, makeWorld({}))).toBeNull()
	})

	it("returns null when world has no vegetation", () => {
		expect(buildVegetationSwatchColor(0, makeWorld({}))).toBeNull()
	})

	it("returns a css color string for valid region", () => {
		const world = makeWorld({ vegetation: new Uint8Array([1]) })
		const result = buildVegetationSwatchColor(0, world)
		expect(result).toMatch(/^rgb/)
	})
})

describe("buildTopographySwatchColor", () => {
	it("returns null when hoverRegion is null", () => {
		expect(buildTopographySwatchColor(null, makeWorld({}))).toBeNull()
	})

	it("returns null when world has no topography", () => {
		expect(buildTopographySwatchColor(0, makeWorld({}))).toBeNull()
	})

	it("returns a css color string for a land topography index", () => {
		const world = makeWorld({ topography: new Uint8Array([1]) })
		const result = buildTopographySwatchColor(0, world)
		expect(result).toMatch(/^rgb/)
	})
})

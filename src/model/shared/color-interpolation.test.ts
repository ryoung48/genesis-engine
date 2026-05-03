import { describe, expect, it } from "vitest"
import {
	cssColorToRgb,
	lerp,
	mapLinear,
	quantizeRgb,
	rgbToCss,
	sampleBasisColorStops,
	sampleColorStops,
} from "./color-interpolation"

describe("color interpolation", () => {
	it("parses css colors and formats rgb output", () => {
		expect(cssColorToRgb("#804020")).toEqual([128 / 255, 64 / 255, 32 / 255])
		expect(cssColorToRgb("#f80")).toEqual([1, 136 / 255, 0])
		expect(cssColorToRgb("rgb(255, 128, 0)")).toEqual([1, 128 / 255, 0])
		expect(rgbToCss([0.5, 0.25, 0])).toBe("rgb(128, 64, 0)")
	})

	it("rejects unsupported css color formats", () => {
		expect(() => cssColorToRgb("rgba(255, 128, 0, 1)")).toThrow(
			"Unsupported color format",
		)
	})

	it("samples discrete color stops linearly", () => {
		expect(
			sampleColorStops(
				[
					[0, 0, 0],
					[1, 1, 1],
				],
				0.5,
			),
		).toEqual([0.5, 0.5, 0.5])
	})

	it("handles empty, singleton, and clamped color stop ranges", () => {
		const singleton = [[0.2, 0.4, 0.6] as [number, number, number]]

		expect(sampleColorStops([], 0.5)).toEqual([0, 0, 0])
		expect(sampleColorStops(singleton, 0.5)).toEqual([0.2, 0.4, 0.6])
		expect(
			sampleColorStops(
				[
					[0, 0, 0],
					[1, 1, 1],
				],
				-1,
			),
		).toEqual([0, 0, 0])
		expect(
			sampleColorStops(
				[
					[0, 0, 0],
					[1, 1, 1],
				],
				2,
			),
		).toEqual([1, 1, 1])
	})

	it("interpolates cubic basis endpoints", () => {
		const stops = [
			cssColorToRgb("#eff6ff"),
			cssColorToRgb("#facc15"),
			cssColorToRgb("#f97316"),
			cssColorToRgb("#dc2626"),
			cssColorToRgb("#fff7ed"),
		]
		expect(quantizeRgb(sampleBasisColorStops(stops, 0))).toEqual(stops[0])
		expect(quantizeRgb(sampleBasisColorStops(stops, 1))).toEqual(
			stops[stops.length - 1],
		)
	})

	it("handles basis interpolation edge cases", () => {
		expect(sampleBasisColorStops([], 0.5)).toEqual([0, 0, 0])
		expect(sampleBasisColorStops([[0.2, 0.4, 0.6]], 0.5)).toEqual([
			0.2, 0.4, 0.6,
		])
		expect(
			quantizeRgb(
				sampleBasisColorStops(
					[
						[0, 0, 0],
						[1, 1, 1],
					],
					2,
				),
			),
		).toEqual([1, 1, 1])
	})

	it("maps linear ranges with optional clamping", () => {
		expect(lerp(10, 20, 0.25)).toBe(12.5)
		expect(mapLinear(5, 0, 10, 0, 1, true)).toBe(0.5)
		expect(mapLinear(20, 0, 10, 0, 1, true)).toBe(1)
		expect(mapLinear(-5, 0, 10, 0, 1)).toBe(-0.5)
		expect(mapLinear(7, 1, 1, 3, 9)).toBe(9)
	})
})

import { describe, expect, it } from "vitest"
import {
	buildGenerationPreviewConfig,
	getGenerationPreviewCanvasClassName,
	getGenerationPreviewExitState,
	getGenerationPreviewToggleLabel,
} from "./generation-preview"

describe("buildGenerationPreviewConfig", () => {
	it("maps generation params to ebm preview inputs", () => {
		expect(
			buildGenerationPreviewConfig({
				tidallyLocked: false,
				obliquity: 23.5,
				eccentricity: 0.1,
				perihelion: 90,
				antistellarLon: 210,
				spectralClass: "G",
				starSubtype: 2,
				orbitalDistanceAU: 1.0,
				hoursPerDay: 30,
				daysPerYear: 480,
				landCoverage: 0.42,
				planetRadiusKm: 8000,
				pressure: 1.6,
			}),
		).toEqual({
			obliquity: 23.5,
			eccentricity: 0.1,
			perihelion: 90,
			antistellarLon: 210,
			spectralClass: "G",
			starSubtype: 2,
			orbitalDistanceAU: 1.0,
			hoursPerDay: 30,
			daysPerYear: 480,
			landFraction: 0.42,
			radius: 8000,
			planetRadiusKm: 8000,
			pressure: 1.6,
		})
	})

	it("preserves the preview obliquity for tidally locked planets", () => {
		expect(
			buildGenerationPreviewConfig({
				tidallyLocked: true,
				obliquity: 45,
				eccentricity: 0.02,
				perihelion: 180,
				antistellarLon: 180,
				spectralClass: "G",
				starSubtype: 2,
				orbitalDistanceAU: 1.0,
				hoursPerDay: 24,
				daysPerYear: 365,
				landCoverage: 0.3,
				planetRadiusKm: 6371,
				pressure: 1,
			}).obliquity,
		).toBe(45)
	})

	it("switches the toggle label based on the active viewport", () => {
		expect(getGenerationPreviewToggleLabel(false)).toBe("Preview")
		expect(getGenerationPreviewToggleLabel(true)).toBe("Globe")
	})

	it("keeps the globe canvas mounted while preview is active", () => {
		expect(getGenerationPreviewCanvasClassName(true, false)).toBe(
			"h-full w-full block invisible",
		)
		expect(getGenerationPreviewCanvasClassName(false, true)).toBe(
			"h-full w-full block cursor-crosshair",
		)
	})

	it("returns to the globe when generation exits the preview", () => {
		expect(getGenerationPreviewExitState()).toEqual({
			showPreview: false,
			viewMode: "globe",
		})
	})
})

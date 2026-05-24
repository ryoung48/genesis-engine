import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { type MeasureMode, OverlayControls } from "./OverlayControls"

function renderWithProps(
	overrides: Partial<React.ComponentProps<typeof OverlayControls>> = {},
) {
	const props: React.ComponentProps<typeof OverlayControls> = {
		overlaysExpanded: false,
		setOverlaysExpanded: vi.fn(),
		measureMode: "off" as MeasureMode,
		setMeasureMode: vi.fn(),
		pathfindingLand: true,
		setPathfindingLand: vi.fn(),
		pathfindingSea: true,
		setPathfindingSea: vi.fn(),
		pathfindingResult: null,
		showWireframe: false,
		setShowWireframe: vi.fn(),
		showRivers: false,
		setShowRivers: vi.fn(),
		showThermalEquator: false,
		setShowThermalEquator: vi.fn(),
		showGrid: true,
		setShowGrid: vi.fn(),
		showNationBorders: false,
		setShowNationBorders: vi.fn(),
		showNationHierarchy: false,
		setShowNationHierarchy: vi.fn(),
		showNationLabels: false,
		setShowNationLabels: vi.fn(),
		showElevation: true,
		setShowElevation: vi.fn(),
		showInfrastructure: false,
		setShowInfrastructure: vi.fn(),
		gridSpacing: 15,
		setGridSpacing: vi.fn(),
		viewMode: "globe",
		setViewMode: vi.fn(),
		unitSystem: "metric",
		setUnitSystem: vi.fn(),
		mapProjectionLatitude: 0,
		draftMapProjectionLatitude: 0,
		setDraftMapProjectionLatitude: vi.fn(),
		setMapProjectionLatitude: vi.fn(),
		debugMapModes: false,
		setDebugMapModes: vi.fn(),
		...overrides,
	}
	const markup = renderToStaticMarkup(<OverlayControls {...props} />)
	return { markup, props }
}

describe("OverlayControls", () => {
	it("renders the view selector inside the expanded overlays panel", () => {
		const { markup } = renderWithProps({
			overlaysExpanded: true,
			measureMode: "ruler",
			viewMode: "map",
			mapProjectionLatitude: 30,
			draftMapProjectionLatitude: 42,
			canCopyCode: true,
			onCopyCode: vi.fn(),
		})

		expect(markup).toContain('aria-label="Globe view"')
		expect(markup).toContain('aria-label="Map view"')
		expect(markup).toContain(">Copy seed<")
		expect(markup).toContain('aria-label="Metric units"')
		expect(markup).toContain('aria-label="Imperial units"')
		expect(markup).toContain(">me<")
		expect(markup).toContain(">im<")
		expect(markup).toContain("Projection Latitude")
		expect(markup).toContain("Debug Map Modes")
		expect(markup).not.toContain(">Close<")
		expect(markup).not.toContain(">View<")
	})

	it("uses an icon-only trigger instead of the overlays text label", () => {
		const { markup } = renderWithProps({
			overlaysExpanded: false,
			measureMode: "ruler",
		})

		expect(markup).toContain("Show settings")
		expect(markup).not.toContain(">Overlays<")
	})

	it("wires overlay controls to the provided setters", () => {
		const setOverlaysExpanded = vi.fn()
		const setMeasureMode = vi.fn()
		const setShowWireframe = vi.fn()
		const setShowGrid = vi.fn()
		const setShowNationBorders = vi.fn()
		const setShowNationHierarchy = vi.fn()
		const setViewMode = vi.fn()
		const setUnitSystem = vi.fn()
		const setDraftMapProjectionLatitude = vi.fn()
		const setMapProjectionLatitude = vi.fn()
		const setDebugMapModes = vi.fn()
		const onCopyCode = vi.fn()
		const onReset = vi.fn()
		const onToggleGenerationPanel = vi.fn()

		const { props } = renderWithProps({
			overlaysExpanded: true,
			setOverlaysExpanded,
			setMeasureMode,
			setShowWireframe,
			setShowGrid,
			setShowNationBorders,
			setShowNationHierarchy,
			setViewMode,
			setUnitSystem,
			setDraftMapProjectionLatitude,
			setMapProjectionLatitude,
			setDebugMapModes,
			canCopyCode: true,
			onCopyCode,
			onReset,
			viewMode: "map",
			mapProjectionLatitude: 18,
			draftMapProjectionLatitude: 18,
			generationPanelOpen: false,
			onToggleGenerationPanel,
		})

		props.setMeasureMode?.("ruler")
		props.setShowWireframe?.(true)
		props.setShowNationBorders?.(true)
		props.setShowNationHierarchy?.(true)
		props.setShowGrid?.(false)
		props.setDraftMapProjectionLatitude?.(-42)
		props.setMapProjectionLatitude?.(-42)
		props.setDebugMapModes?.(true)
		props.onCopyCode?.()
		props.onReset?.()
		props.onToggleGenerationPanel?.()
		props.setOverlaysExpanded?.((v: boolean) => !v)

		expect(setViewMode).not.toHaveBeenCalled()
		props.setViewMode?.("map")
		expect(setViewMode).toHaveBeenCalledWith("map")

		expect(setUnitSystem).not.toHaveBeenCalled()
		props.setUnitSystem?.("imperial")
		expect(setUnitSystem).toHaveBeenCalledWith("imperial")

		expect(onCopyCode).toHaveBeenCalledTimes(1)
		expect(onReset).toHaveBeenCalledTimes(1)
		expect(setMeasureMode).toHaveBeenCalledWith("ruler")
		expect(setShowWireframe).toHaveBeenCalledWith(true)
		expect(setShowNationBorders).toHaveBeenCalledWith(true)
		expect(setShowNationHierarchy).toHaveBeenCalledWith(true)
		expect(setShowGrid).toHaveBeenCalledWith(false)
		expect(setDraftMapProjectionLatitude).toHaveBeenCalledWith(-42)
		expect(setMapProjectionLatitude).toHaveBeenCalledWith(-42)
		expect(setDebugMapModes).toHaveBeenCalledWith(true)
		expect(onToggleGenerationPanel).toHaveBeenCalledTimes(1)
		expect(setOverlaysExpanded).toHaveBeenCalledWith(expect.any(Function))
	})

	it("renders only generation and settings buttons in the action row", () => {
		const { markup } = renderWithProps({
			overlaysExpanded: false,
			measureMode: "ruler",
			generationPanelOpen: false,
			onToggleGenerationPanel: vi.fn(),
		})

		expect(markup).not.toContain("Hide simulation controls")
		expect(markup).toContain("Show generation panel")
		expect(markup).toContain("Show settings")
	})

	it("renders copied state and skips unchanged or invalid projection commits", () => {
		const { markup } = renderWithProps({
			overlaysExpanded: true,
			showGrid: false,
			gridSpacing: 7,
			viewMode: "map",
			mapProjectionLatitude: 18,
			draftMapProjectionLatitude: 18,
			canCopyCode: true,
			codeCopied: true,
			onCopyCode: vi.fn(),
		})

		expect(markup).toContain(">Copied<")
		expect(markup).toContain("bg-emerald-400/20")
		expect(markup).toContain("Projection Latitude")
		expect(markup).toContain('value="18"')
	})

	it("renders pathfinding travel rates in the active unit system", () => {
		const metric = renderWithProps({
			overlaysExpanded: true,
			measureMode: "pathfinding",
			unitSystem: "metric",
		}).markup
		const imperial = renderWithProps({
			overlaysExpanded: true,
			measureMode: "pathfinding",
			unitSystem: "imperial",
		}).markup

		expect(metric).toContain("Land Travel (30 km/day)")
		expect(metric).toContain("Sea Travel (100 km/day)")
		expect(imperial).toContain("Land Travel (19 mi/day)")
		expect(imperial).toContain("Sea Travel (62 mi/day)")
		expect(imperial).not.toContain("30 km/day")
	})
})

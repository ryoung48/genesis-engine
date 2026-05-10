import React, { type ReactElement, type ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { OverlayControls } from "./OverlayControls"

type ChildrenProps = {
	children?: ReactNode
}

type ClickableProps = {
	onClick?: React.MouseEventHandler<HTMLButtonElement>
}

type InputProps = {
	onChange?: React.ChangeEventHandler<HTMLInputElement>
	onPointerUp?: React.PointerEventHandler<HTMLInputElement>
	onBlur?: React.FocusEventHandler<HTMLInputElement>
	onKeyUp?: React.KeyboardEventHandler<HTMLInputElement>
}

function createTree(
	overrides: Partial<React.ComponentProps<typeof OverlayControls>> = {},
) {
	return OverlayControls({
		overlaysExpanded: false,
		setOverlaysExpanded: vi.fn(),
		isMeasuring: false,
		setIsMeasuring: vi.fn(),
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
	}) as ReactElement<ChildrenProps>
}

describe("OverlayControls", () => {
	it("renders the view selector inside the expanded overlays panel", () => {
		const markup = renderToStaticMarkup(
			<OverlayControls
				overlaysExpanded
				setOverlaysExpanded={vi.fn()}
				isMeasuring={false}
				setIsMeasuring={vi.fn()}
				showWireframe={false}
				setShowWireframe={vi.fn()}
				showRivers={false}
				setShowRivers={vi.fn()}
				showThermalEquator={false}
				setShowThermalEquator={vi.fn()}
				showGrid={true}
				setShowGrid={vi.fn()}
				showNationBorders={false}
				setShowNationBorders={vi.fn()}
				showNationHierarchy={false}
				setShowNationHierarchy={vi.fn()}
				gridSpacing={15}
				setGridSpacing={vi.fn()}
				viewMode="map"
				setViewMode={vi.fn()}
				unitSystem="metric"
				setUnitSystem={vi.fn()}
				mapProjectionLatitude={30}
				draftMapProjectionLatitude={42}
				setDraftMapProjectionLatitude={vi.fn()}
				setMapProjectionLatitude={vi.fn()}
				debugMapModes={false}
				setDebugMapModes={vi.fn()}
				canCopyCode
				onCopyCode={vi.fn()}
			/>,
		)

		expect(markup).toContain('aria-label="Globe view"')
		expect(markup).toContain('aria-label="Map view"')
		expect(markup).toContain(">Copy seed<")
		expect(markup).toContain('aria-label="Metric units"')
		expect(markup).toContain('aria-label="Imperial units"')
		expect(markup).toContain(">km<")
		expect(markup).toContain(">mi<")
		expect(markup).toContain("Projection Latitude")
		expect(markup).toContain("Debug Map Modes")
		expect(markup).not.toContain(">Close<")
		expect(markup).not.toContain(">View<")
	})

	it("uses an icon-only trigger instead of the overlays text label", () => {
		const markup = renderToStaticMarkup(
			<OverlayControls
				overlaysExpanded={false}
				setOverlaysExpanded={vi.fn()}
				isMeasuring={false}
				setIsMeasuring={vi.fn()}
				showWireframe={false}
				setShowWireframe={vi.fn()}
				showRivers={false}
				setShowRivers={vi.fn()}
				showThermalEquator={false}
				setShowThermalEquator={vi.fn()}
				showGrid={true}
				setShowGrid={vi.fn()}
				showNationBorders={false}
				setShowNationBorders={vi.fn()}
				showNationHierarchy={false}
				setShowNationHierarchy={vi.fn()}
				gridSpacing={15}
				setGridSpacing={vi.fn()}
				viewMode="globe"
				setViewMode={vi.fn()}
				unitSystem="metric"
				setUnitSystem={vi.fn()}
				mapProjectionLatitude={0}
				draftMapProjectionLatitude={0}
				setDraftMapProjectionLatitude={vi.fn()}
				setMapProjectionLatitude={vi.fn()}
				debugMapModes={false}
				setDebugMapModes={vi.fn()}
			/>,
		)

		expect(markup).toContain('title="Show settings"')
		expect(markup).not.toContain(">Overlays<")
	})

	it("wires overlay controls to the provided setters", () => {
		const setOverlaysExpanded = vi.fn()
		const setIsMeasuring = vi.fn()
		const setShowWireframe = vi.fn()
		const setShowGrid = vi.fn()
		const setShowNationBorders = vi.fn()
		const setShowNationHierarchy = vi.fn()
		const setGridSpacing = vi.fn()
		const setViewMode = vi.fn()
		const setUnitSystem = vi.fn()
		const setDraftMapProjectionLatitude = vi.fn()
		const setMapProjectionLatitude = vi.fn()
		const setDebugMapModes = vi.fn()
		const onCopyCode = vi.fn()
		const onToggleGenerationPanel = vi.fn()

		const tree = createTree({
			overlaysExpanded: true,
			setOverlaysExpanded,
			setIsMeasuring,
			setShowWireframe,
			setShowGrid,
			setShowNationBorders,
			setShowNationHierarchy,
			setGridSpacing,
			setViewMode,
			setUnitSystem,
			setDraftMapProjectionLatitude,
			setMapProjectionLatitude,
			setDebugMapModes,
			canCopyCode: true,
			onCopyCode,
			viewMode: "map",
			mapProjectionLatitude: 18,
			draftMapProjectionLatitude: 18,
			generationPanelOpen: false,
			onToggleGenerationPanel,
		})
		const anchored = React.Children.only(
			tree.props.children,
		) as ReactElement<ChildrenProps>
		const panelWrapper = React.Children.toArray(
			anchored.props.children,
		)[0] as ReactElement<ChildrenProps>
		const actionRow = React.Children.toArray(
			anchored.props.children,
		)[1] as ReactElement<ChildrenProps>
		const panel = React.Children.only(
			panelWrapper.props.children,
		) as ReactElement<ChildrenProps>
		const floatingPanel = React.Children.only(
			panel.props.children,
		) as ReactElement<ChildrenProps>
		const header = React.Children.toArray(
			floatingPanel.props.children,
		)[0] as ReactElement<{ action?: ReactNode }>
		const optionGroups = React.Children.toArray(
			floatingPanel.props.children,
		)[1] as ReactElement<ChildrenProps>
		const copyButton = header.props.action as ReactElement<ClickableProps>
		const optionGroupChildren = React.Children.toArray(
			optionGroups.props.children,
		) as ReactElement<ChildrenProps>[]
		const measureLabel = optionGroupChildren[0]
		const wireframeLabel = optionGroupChildren[1]
		const nationBordersLabel = optionGroupChildren[4]
		const hierarchyLabel = optionGroupChildren[5]
		const gridLabel = optionGroupChildren[6]
		const gridSection = optionGroupChildren[7]
		const projectionSection = optionGroupChildren[8]
		const debugLabel = optionGroupChildren[9]
		const footerRow = optionGroupChildren[10]
		const generationButton = React.Children.toArray(
			actionRow.props.children,
		)[0] as ReactElement<ClickableProps>
		const overlaysButton = React.Children.toArray(
			actionRow.props.children,
		)[1] as ReactElement<ClickableProps>

		const footerChildren = React.Children.toArray(
			footerRow.props.children,
		) as ReactElement[]
		const viewControl = footerChildren[0] as ReactElement<{
			onChange?: (value: "globe" | "map") => void
		}>
		const unitControl = footerChildren[1] as ReactElement<{
			onChange?: (value: "metric" | "imperial") => void
		}>
		const measureInput = React.Children.toArray(
			measureLabel.props.children,
		)[1] as ReactElement<InputProps>
		const wireframeInput = React.Children.toArray(
			wireframeLabel.props.children,
		)[1] as ReactElement<InputProps>
		const nationBordersInput = React.Children.toArray(
			nationBordersLabel.props.children,
		)[1] as ReactElement<InputProps>
		const hierarchyInput = React.Children.toArray(
			hierarchyLabel.props.children,
		)[1] as ReactElement<InputProps>
		const gridToggle = React.Children.toArray(
			gridLabel.props.children,
		)[1] as ReactElement<InputProps>
		const gridRange = React.Children.toArray(
			gridSection.props.children,
		)[1] as ReactElement<InputProps>
		const projectionRange = React.Children.toArray(
			projectionSection.props.children,
		)[1] as ReactElement<InputProps>
		const debugInput = React.Children.toArray(
			debugLabel.props.children,
		)[1] as ReactElement<InputProps>

		viewControl.props.onChange?.("map")
		unitControl.props.onChange?.("imperial")
		copyButton.props.onClick?.(undefined as never)
		measureInput.props.onChange?.({
			target: { checked: true },
		} as React.ChangeEvent<HTMLInputElement>)
		wireframeInput.props.onChange?.({
			target: { checked: true },
		} as React.ChangeEvent<HTMLInputElement>)
		nationBordersInput.props.onChange?.({
			target: { checked: true },
		} as React.ChangeEvent<HTMLInputElement>)
		hierarchyInput.props.onChange?.({
			target: { checked: true },
		} as React.ChangeEvent<HTMLInputElement>)
		gridToggle.props.onChange?.({
			target: { checked: false },
		} as React.ChangeEvent<HTMLInputElement>)
		gridRange.props.onChange?.({
			target: { value: "2" },
		} as React.ChangeEvent<HTMLInputElement>)
		projectionRange.props.onChange?.({
			target: { value: "-42" },
		} as React.ChangeEvent<HTMLInputElement>)
		projectionRange.props.onPointerUp?.({
			currentTarget: { value: "-42" },
		} as React.PointerEvent<HTMLInputElement>)
		debugInput.props.onChange?.({
			target: { checked: true },
		} as React.ChangeEvent<HTMLInputElement>)
		generationButton.props.onClick?.(undefined as never)
		overlaysButton.props.onClick?.(undefined as never)

		expect(setViewMode).toHaveBeenCalledWith("map")
		expect(setUnitSystem).toHaveBeenCalledWith("imperial")
		expect(onCopyCode).toHaveBeenCalledTimes(1)
		expect(setIsMeasuring).toHaveBeenCalledWith(true)
		expect(setShowWireframe).toHaveBeenCalledWith(true)
		expect(setShowNationBorders).toHaveBeenCalledWith(true)
		expect(setShowNationHierarchy).toHaveBeenCalledWith(true)
		expect(setShowGrid).toHaveBeenCalledWith(false)
		expect(setGridSpacing).toHaveBeenCalledWith(10)
		expect(setDraftMapProjectionLatitude).toHaveBeenCalledWith(-42)
		expect(setMapProjectionLatitude).toHaveBeenCalledWith(-42)
		expect(setDebugMapModes).toHaveBeenCalledWith(true)
		expect(onToggleGenerationPanel).toHaveBeenCalledTimes(1)
		expect(setOverlaysExpanded).toHaveBeenCalledWith(expect.any(Function))
	})

	it("renders only generation and settings buttons in the action row", () => {
		const markup = renderToStaticMarkup(
			<OverlayControls
				overlaysExpanded={false}
				setOverlaysExpanded={vi.fn()}
				isMeasuring={false}
				setIsMeasuring={vi.fn()}
				showWireframe={false}
				setShowWireframe={vi.fn()}
				showRivers={false}
				setShowRivers={vi.fn()}
				showThermalEquator={false}
				setShowThermalEquator={vi.fn()}
				showGrid={true}
				setShowGrid={vi.fn()}
				showNationBorders={false}
				setShowNationBorders={vi.fn()}
				showNationHierarchy={false}
				setShowNationHierarchy={vi.fn()}
				gridSpacing={15}
				setGridSpacing={vi.fn()}
				viewMode="globe"
				setViewMode={vi.fn()}
				unitSystem="metric"
				setUnitSystem={vi.fn()}
				mapProjectionLatitude={0}
				draftMapProjectionLatitude={0}
				setDraftMapProjectionLatitude={vi.fn()}
				setMapProjectionLatitude={vi.fn()}
				debugMapModes={false}
				setDebugMapModes={vi.fn()}
				generationPanelOpen={false}
				onToggleGenerationPanel={vi.fn()}
			/>,
		)
		const tree = createTree({
			generationPanelOpen: false,
			onToggleGenerationPanel: vi.fn(),
		})
		const anchored = React.Children.only(
			tree.props.children,
		) as ReactElement<ChildrenProps>
		const actionRow = React.Children.toArray(
			anchored.props.children,
		)[1] as ReactElement<ChildrenProps>
		const actionButtons = React.Children.toArray(
			actionRow.props.children,
		).filter(Boolean)

		expect(markup).not.toContain("Hide simulation controls")
		expect(actionButtons).toHaveLength(2)
	})

	it("renders copied state and skips unchanged or invalid projection commits", () => {
		const setGridSpacing = vi.fn()
		const setMapProjectionLatitude = vi.fn()

		const markup = renderToStaticMarkup(
			<OverlayControls
				overlaysExpanded
				setOverlaysExpanded={vi.fn()}
				isMeasuring={false}
				setIsMeasuring={vi.fn()}
				showWireframe={false}
				setShowWireframe={vi.fn()}
				showRivers={false}
				setShowRivers={vi.fn()}
				showThermalEquator={false}
				setShowThermalEquator={vi.fn()}
				showGrid={false}
				setShowGrid={vi.fn()}
				showNationBorders={false}
				setShowNationBorders={vi.fn()}
				showNationHierarchy={false}
				setShowNationHierarchy={vi.fn()}
				gridSpacing={7}
				setGridSpacing={setGridSpacing}
				viewMode="map"
				setViewMode={vi.fn()}
				unitSystem="metric"
				setUnitSystem={vi.fn()}
				mapProjectionLatitude={18}
				draftMapProjectionLatitude={18}
				setDraftMapProjectionLatitude={vi.fn()}
				setMapProjectionLatitude={setMapProjectionLatitude}
				debugMapModes={false}
				setDebugMapModes={vi.fn()}
				canCopyCode
				codeCopied
				onCopyCode={vi.fn()}
			/>,
		)

		expect(markup).toContain(">Copied<")
		expect(markup).toContain("bg-emerald-400/20")
		expect(markup).toContain("space-y-1.5 opacity-50")

		const tree = createTree({
			overlaysExpanded: true,
			showGrid: false,
			gridSpacing: 7,
			setGridSpacing,
			viewMode: "map",
			mapProjectionLatitude: 18,
			draftMapProjectionLatitude: 18,
			setMapProjectionLatitude,
			canCopyCode: true,
			codeCopied: true,
			onCopyCode: vi.fn(),
		})
		const anchored = React.Children.only(
			tree.props.children,
		) as ReactElement<ChildrenProps>
		const panelWrapper = React.Children.toArray(
			anchored.props.children,
		)[0] as ReactElement<ChildrenProps>
		const panel = React.Children.only(
			panelWrapper.props.children,
		) as ReactElement<ChildrenProps>
		const floatingPanel = React.Children.only(
			panel.props.children,
		) as ReactElement<ChildrenProps>
		const optionGroups = React.Children.toArray(
			floatingPanel.props.children,
		)[1] as ReactElement<ChildrenProps>
		const optionGroupChildren = React.Children.toArray(
			optionGroups.props.children,
		) as ReactElement<ChildrenProps>[]
		const gridSection = optionGroupChildren[7]
		const projectionSection = optionGroupChildren[8]
		const gridRange = React.Children.toArray(
			gridSection.props.children,
		)[1] as ReactElement<InputProps>
		const projectionRange = React.Children.toArray(
			projectionSection.props.children,
		)[1] as ReactElement<InputProps>

		gridRange.props.onChange?.({
			target: { value: "999" },
		} as React.ChangeEvent<HTMLInputElement>)
		projectionRange.props.onKeyUp?.({
			currentTarget: { value: "18" },
		} as React.KeyboardEvent<HTMLInputElement>)
		projectionRange.props.onBlur?.({
			currentTarget: { value: "NaN" },
		} as React.FocusEvent<HTMLInputElement>)

		expect(setGridSpacing).toHaveBeenCalledWith(30)
		expect(setMapProjectionLatitude).not.toHaveBeenCalled()
	})
})

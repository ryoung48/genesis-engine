import type { ComponentProps } from "react"
import React, { type ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { ModeBar } from "./ModeBar"
import { BinaryToggle, ModeButtonGroup } from "./mode-controls"

function createProps(overrides: Partial<ComponentProps<typeof ModeBar>> = {}) {
	return {
		colorMode: "terrain" as const,
		setColorMode: vi.fn(),
		geographyMode: "terrain" as const,
		setGeographyMode: vi.fn(),
		nationMode: "borders" as const,
		setNationMode: vi.fn(),
		populationMode: "density" as const,
		setPopulationMode: vi.fn(),
		debugMapModes: false,
		climateSubMode: "basic" as const,
		elevationSubMode: "colored" as const,
		topographySubMode: "classification" as const,
		...overrides,
	}
}

function getPrimaryControl(
	props: ComponentProps<typeof ModeBar>,
): ReactElement<{ onChange: (value: string) => void }> {
	const root = ModeBar(props) as ReactElement<{ children?: React.ReactNode }>
	const children = React.Children.toArray(root.props.children) as ReactElement[]
	const familyPill = children[children.length - 1] as ReactElement<{
		children?: React.ReactNode
	}>
	return React.Children.only(familyPill.props.children) as ReactElement<{
		onChange: (value: string) => void
	}>
}

describe("ModeBar", () => {
	it("renders geography defaults without debug-only map modes", () => {
		const markup = renderToStaticMarkup(<ModeBar {...createProps()} />)

		expect(markup.indexOf(">Terrain<")).toBeLessThan(
			markup.indexOf(">Geography<"),
		)
		expect(markup).toContain(">Geography<")
		expect(markup).toContain(">Elevation<")
		expect(markup).toContain(">Topography<")
		expect(markup).toContain(">Vegetation<")
		expect(markup).toContain(">Climate<")
		expect(markup).toContain(">Temperature<")
		expect(markup).toContain(">Rain<")
		expect(markup).not.toContain(">Slope<")
		expect(markup).not.toContain(">Pasta<")
		expect(markup).not.toContain(">Koppen<")
		expect(markup).not.toContain(">Current<")
		expect(markup).not.toContain(">Sim<")
		expect(markup).not.toContain(">Annual<")
	})

	it("renders political and demographic defaults with the requested labels", () => {
		const politicalMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "nations",
					nationMode: "borders",
				})}
			/>,
		)
		const demographicMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "population",
					populationMode: "religion",
				})}
			/>,
		)

		expect(politicalMarkup).toContain(">Political<")
		expect(politicalMarkup).toContain(">Nations<")
		expect(politicalMarkup).toContain(">Dynasty<")
		expect(politicalMarkup).not.toContain(">Provinces<")
		expect(demographicMarkup).toContain(">Demographics<")
		expect(demographicMarkup).toContain(">Population<")
		expect(demographicMarkup).toContain(">Development<")
		expect(demographicMarkup).toContain(">Religion<")
		expect(demographicMarkup).not.toContain(">Migration<")
		expect(demographicMarkup).not.toContain(">Gravity<")
	})

	it("shows hidden debug map modes in their categories when enabled", () => {
		const geographyMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "dtr",
					debugMapModes: true,
				})}
			/>,
		)
		const politicalMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "nations",
					debugMapModes: true,
				})}
			/>,
		)
		const demographicMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "population",
					debugMapModes: true,
				})}
			/>,
		)

		expect(geographyMarkup).toContain(">DTR<")
		expect(geographyMarkup).toContain(">Current<")
		expect(geographyMarkup).not.toContain(">Pasta<")
		expect(geographyMarkup).not.toContain(">Koppen<")
		expect(geographyMarkup).not.toContain(">Grayscale<")
		expect(geographyMarkup).not.toContain(">Slope<")
		expect(politicalMarkup).toContain(">Provinces<")
		expect(demographicMarkup).toContain(">Migration<")
	})

	it("renders the primary selector without an extra bordered wrapper", () => {
		const tree = ModeBar(createProps()) as ReactElement<{
			children?: React.ReactNode
			className?: string
		}>
		const children = React.Children.toArray(
			tree.props.children,
		) as ReactElement[]
		const primaryWrapper = children[1] as ReactElement<{ className?: string }>

		expect(primaryWrapper.props.className).toBe("inline-flex")
	})

	it("routes primary switches to the expected backing modes", () => {
		const setColorMode = vi.fn()
		const geographyControl = getPrimaryControl(
			createProps({
				colorMode: "population",
				geographyMode: "terrain",
				setColorMode,
			}),
		)
		const politicalControl = getPrimaryControl(
			createProps({
				colorMode: "terrain",
				setColorMode,
			}),
		)
		const demographicsControl = getPrimaryControl(
			createProps({
				colorMode: "nations",
				setColorMode,
			}),
		)

		geographyControl.props.onChange("geography")
		politicalControl.props.onChange("political")
		demographicsControl.props.onChange("demographics")

		expect(setColorMode).toHaveBeenNthCalledWith(1, "terrain")
		expect(setColorMode).toHaveBeenNthCalledWith(2, "nations")
		expect(setColorMode).toHaveBeenNthCalledWith(3, "population")
	})

	it("ignores unexpected primary mode values", () => {
		const setColorMode = vi.fn()
		const primaryControl = getPrimaryControl(
			createProps({
				colorMode: "terrain",
				setColorMode,
			}),
		)

		primaryControl.props.onChange("unexpected")

		expect(setColorMode).not.toHaveBeenCalled()
	})

	it("keeps the current geography submode when switching within geography", () => {
		const setColorMode = vi.fn()
		const geographyControl = getPrimaryControl(
			createProps({
				colorMode: "dtr",
				geographyMode: "dtr",
				setColorMode,
			}),
		)

		geographyControl.props.onChange("geography")

		expect(setColorMode).toHaveBeenCalledWith("dtr")
	})

	it("restores the last geography submode when switching back from another primary", () => {
		const setColorMode = vi.fn()
		const geographyControl = getPrimaryControl(
			createProps({
				colorMode: "nations",
				geographyMode: "topography",
				setColorMode,
			}),
		)

		geographyControl.props.onChange("geography")

		expect(setColorMode).toHaveBeenCalledWith("topography")
	})

	it("wires shared mode-control helpers through active-state callbacks", () => {
		const onChange = vi.fn()
		const groupTree = ModeButtonGroup({
			options: [
				["terrain", "Terrain"],
				["climate", "Climate"],
			] as const,
			value: "terrain",
			isActive: (mode) => mode === "climate",
			onChange,
			buttonClassName: "px-1",
		}) as ReactElement<{ children?: React.ReactNode }>
		const groupButtons = React.Children.toArray(
			groupTree.props.children,
		) as ReactElement<{
			onClick?: () => void
			className?: string
		}>[]

		groupButtons[0]?.props.onClick?.()
		groupButtons[1]?.props.onClick?.()

		expect(groupButtons[0]?.props.className).toContain("text-slate-400")
		expect(groupButtons[1]?.props.className).toContain("bg-white/15")
		expect(onChange).toHaveBeenNthCalledWith(1, "terrain")
		expect(onChange).toHaveBeenNthCalledWith(2, "climate")

		const toggleTree = BinaryToggle({
			value: false,
			onChange,
			trueLabel: "Year",
			falseLabel: "Sim",
			className: "px-1",
		}) as ReactElement<{ children?: React.ReactNode }>
		const toggleButtons = React.Children.toArray(
			toggleTree.props.children,
		) as ReactElement<{
			onClick?: () => void
			className?: string
			children?: React.ReactNode
		}>[]

		toggleButtons[0]?.props.onClick?.()
		toggleButtons[1]?.props.onClick?.()

		expect(toggleButtons[0]?.props.className).toContain("text-slate-400")
		expect(toggleButtons[1]?.props.className).toContain("bg-white/15")
		expect(toggleButtons[0]?.props.children).toBe("Year")
		expect(toggleButtons[1]?.props.children).toBe("Sim")
		expect(onChange).toHaveBeenNthCalledWith(3, true)
		expect(onChange).toHaveBeenNthCalledWith(4, false)
	})
})

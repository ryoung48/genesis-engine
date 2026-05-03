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
		nationMode: "borders" as const,
		setNationMode: vi.fn(),
		populationMode: "density" as const,
		setPopulationMode: vi.fn(),
		isClimateMode: false,
		tempAnnual: true,
		setTempAnnual: vi.fn(),
		rainAnnual: true,
		setRainAnnual: vi.fn(),
		currentAnnual: true,
		setCurrentAnnual: vi.fn(),
		dtrAnnual: true,
		setDtrAnnual: vi.fn(),
		...overrides,
	}
}

function getFamilyControl(
	props: ComponentProps<typeof ModeBar>,
): ReactElement<{ onChange: (value: string) => void }> {
	const root = ModeBar(props) as ReactElement<{ children?: React.ReactNode }>
	const children = React.Children.toArray(root.props.children) as ReactElement[]
	const familyPill = children[1] as ReactElement<{ children?: React.ReactNode }>
	return React.Children.only(familyPill.props.children) as ReactElement<{
		onChange: (value: string) => void
	}>
}

describe("ModeBar", () => {
	it("renders the climate tray without satellite modes", () => {
		const markup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "koppenClimate",
					isClimateMode: true,
				})}
			/>,
		)

		expect(markup).toContain(">Climate<")
		expect(markup).toContain(">Pasta<")
		expect(markup).toContain(">Koppen<")
		expect(markup).not.toContain(">Sat<")
		expect(markup).not.toContain(">Sat K<")
	})

	it("shows the simulation-time toggle for monthly climate metrics", () => {
		const markup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "temperature",
					isClimateMode: true,
					tempAnnual: false,
				})}
			/>,
		)

		expect(markup).toContain(">Annual<")
		expect(markup).toContain(">Sim<")
	})

	it("renders population trays without nation controls", () => {
		const markup = renderToStaticMarkup(
			<ModeBar
				{...createProps({ colorMode: "population", populationMode: "faith" })}
			/>,
		)

		expect(markup).toContain(">Density<")
		expect(markup).toContain(">Faith<")
		expect(markup).not.toContain(">Borders<")
	})

	it("renders nation trays and exposes metric toggles for precipitation, dtr, and currents", () => {
		const nationMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({ colorMode: "nations", nationMode: "provinces" })}
			/>,
		)
		const precipitationMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "precipitation",
					isClimateMode: true,
					rainAnnual: false,
				})}
			/>,
		)
		const dtrMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "dtr",
					isClimateMode: true,
					dtrAnnual: false,
				})}
			/>,
		)
		const currentMarkup = renderToStaticMarkup(
			<ModeBar
				{...createProps({
					colorMode: "oceanCurrents",
					isClimateMode: true,
					currentAnnual: false,
				})}
			/>,
		)

		expect(nationMarkup).toContain(">Borders<")
		expect(nationMarkup).toContain(">Provinces<")
		expect(precipitationMarkup).toContain(">Rain<")
		expect(precipitationMarkup).toContain(">Sim<")
		expect(dtrMarkup).toContain(">DTR<")
		expect(dtrMarkup).toContain(">Sim<")
		expect(currentMarkup).toContain(">Current<")
		expect(currentMarkup).toContain(">Sim<")
	})

	it("renders terrain controls and routes family switches to the expected modes", () => {
		const setColorMode = vi.fn()
		const markup = renderToStaticMarkup(
			<ModeBar {...createProps({ setColorMode })} />,
		)
		const climateControl = getFamilyControl(
			createProps({
				colorMode: "terrain",
				setColorMode,
			}),
		)
		const populationControl = getFamilyControl(
			createProps({
				colorMode: "nations",
				setColorMode,
			}),
		)
		const nationControl = getFamilyControl(
			createProps({
				colorMode: "population",
				setColorMode,
			}),
		)

		expect(markup).toContain(">Elev<")
		expect(markup).toContain(">Danger<")

		climateControl.props.onChange("terrain")
		climateControl.props.onChange("climate")
		populationControl.props.onChange("population")
		nationControl.props.onChange("nations")

		expect(setColorMode).toHaveBeenNthCalledWith(1, "terrain")
		expect(setColorMode).toHaveBeenNthCalledWith(2, "climate")
		expect(setColorMode).toHaveBeenNthCalledWith(3, "population")
		expect(setColorMode).toHaveBeenNthCalledWith(4, "nations")
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

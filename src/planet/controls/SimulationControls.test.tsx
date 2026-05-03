import React, {
	type ComponentProps,
	type ReactElement,
	type ReactNode,
} from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { YEAR_MS } from "@/model/history/state"
import { SimulationControls } from "./SimulationControls"

type SimulationControlsProps = ComponentProps<typeof SimulationControls>

type ChildrenProps = {
	children?: ReactNode
}

type ClickableProps = {
	onClick?: React.MouseEventHandler<HTMLButtonElement>
	disabled?: boolean
	children?: ReactNode
}

type InputProps = {
	onChange?: React.ChangeEventHandler<HTMLInputElement>
}

function createProps(
	overrides: Partial<SimulationControlsProps> = {},
): SimulationControlsProps {
	return {
		selectedTimeMs: 5 * YEAR_MS,
		minTimeMs: YEAR_MS,
		maxTimeMs: 5 * YEAR_MS,
		onTimeChange: vi.fn(),
		floating: false,
		...overrides,
	}
}

function getActionButtons(props: SimulationControlsProps): {
	previousButton: ReactElement<ClickableProps>
	nextButton: ReactElement<ClickableProps>
	slider: ReactElement<InputProps>
} {
	const root = SimulationControls(props) as ReactElement<ChildrenProps>
	const content = React.Children.only(
		root.props.children,
	) as ReactElement<ChildrenProps>
	const panel = React.Children.toArray(
		content.props.children,
	)[0] as ReactElement<ChildrenProps>
	const rowChildren = React.Children.toArray(
		panel.props.children,
	) as ReactElement<ClickableProps | InputProps>[]

	return {
		previousButton: rowChildren[0] as ReactElement<ClickableProps>,
		nextButton: rowChildren[3] as ReactElement<ClickableProps>,
		slider: rowChildren[2] as ReactElement<InputProps>,
	}
}

describe("SimulationControls", () => {
	it("renders recovery controls when reviewing history", () => {
		const markup = renderToStaticMarkup(
			<SimulationControls
				{...createProps({
					selectedTimeMs: 2 * YEAR_MS,
				})}
			/>,
		)

		expect(markup).toContain("Y2")
		expect(markup).toContain("Simulation year")
		expect(markup).not.toContain("Latest Y5")
		expect(markup).not.toContain("Start simulation")
	})

	it("updates the selected year directly from the single-row slider", () => {
		const onTimeChange = vi.fn()
		const { slider } = getActionButtons(
			createProps({
				onTimeChange,
			}),
		)

		slider.props.onChange?.({
			target: { value: `${3 * YEAR_MS}` },
		} as React.ChangeEvent<HTMLInputElement>)

		expect(onTimeChange).toHaveBeenCalledWith(3 * YEAR_MS)
	})

	it("clamps step controls to the available timeline range", () => {
		const onTimeChange = vi.fn()
		const { previousButton, nextButton } = getActionButtons(
			createProps({
				selectedTimeMs: YEAR_MS,
				onTimeChange,
			}),
		)

		expect(previousButton.props.disabled).toBe(true)
		expect(nextButton.props.disabled).not.toBe(true)

		nextButton.props.onClick?.(undefined as never)

		expect(onTimeChange).toHaveBeenCalledWith(2 * YEAR_MS)
	})

	it("keeps the compact single-row layout even without history", () => {
		const markup = renderToStaticMarkup(
			<SimulationControls
				{...createProps({
					minTimeMs: YEAR_MS,
					maxTimeMs: YEAR_MS,
					selectedTimeMs: YEAR_MS,
					floating: true,
				})}
			/>,
		)

		expect(markup).toContain("Simulation year")
		expect(markup).toContain("Y1")
		expect(markup).not.toContain("Start simulation")
		expect(markup).not.toContain("Latest Y1")
	})
})

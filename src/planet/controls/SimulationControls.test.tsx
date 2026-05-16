import React, {
	type ComponentProps,
	type ReactElement,
	type ReactNode,
} from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { MONTH_MS, YEAR_MS } from "@/model/history/state"
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
	playPauseButton?: ReactElement<ClickableProps>
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

	const playPauseFragment = rowChildren[4] as
		| ReactElement<ChildrenProps>
		| undefined
	const playPauseButton = playPauseFragment
		? (React.Children.toArray(
				playPauseFragment.props.children,
			)[1] as ReactElement<ClickableProps>)
		: undefined

	return {
		previousButton: rowChildren[0] as ReactElement<ClickableProps>,
		nextButton: rowChildren[3] as ReactElement<ClickableProps>,
		slider: rowChildren[2] as ReactElement<InputProps>,
		playPauseButton,
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
		expect(markup).toContain("Simulation month")
		expect(markup).not.toContain("Latest Y5")
		expect(markup).not.toContain("Start simulation")
	})

	it("updates the selected month directly from the single-row slider", () => {
		const onTimeChange = vi.fn()
		const { slider } = getActionButtons(
			createProps({
				onTimeChange,
			}),
		)

		slider.props.onChange?.({
			target: { value: `${YEAR_MS + 3 * MONTH_MS}` },
		} as React.ChangeEvent<HTMLInputElement>)

		expect(onTimeChange).toHaveBeenCalledWith(YEAR_MS + 3 * MONTH_MS)
	})

	it("clamps monthly step controls to the available timeline range", () => {
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

		expect(onTimeChange).toHaveBeenCalledWith(YEAR_MS + MONTH_MS)
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

		expect(markup).toContain("Simulation month")
		expect(markup).toContain("Y1")
		expect(markup).not.toContain("Start simulation")
		expect(markup).not.toContain("Latest Y1")
	})

	it("does not render play/pause button when onPlayPause is not provided", () => {
		const markup = renderToStaticMarkup(
			<SimulationControls {...createProps()} />,
		)

		expect(markup).not.toContain("Start simulation")
		expect(markup).not.toContain("Pause simulation")
	})

	it("renders play button when onPlayPause is provided and not playing", () => {
		const markup = renderToStaticMarkup(
			<SimulationControls
				{...createProps({ onPlayPause: vi.fn(), simPlaying: false })}
			/>,
		)

		expect(markup).toContain("Start simulation")
		expect(markup).not.toContain("Pause simulation")
	})

	it("renders pause button when simPlaying is true", () => {
		const markup = renderToStaticMarkup(
			<SimulationControls
				{...createProps({ onPlayPause: vi.fn(), simPlaying: true })}
			/>,
		)

		expect(markup).toContain("Pause simulation")
		expect(markup).not.toContain("Start simulation")
	})

	it("calls onPlayPause when play/pause button is clicked", () => {
		const onPlayPause = vi.fn()
		const { playPauseButton } = getActionButtons(createProps({ onPlayPause }))

		playPauseButton?.props.onClick?.(undefined as never)

		expect(onPlayPause).toHaveBeenCalledOnce()
	})
})

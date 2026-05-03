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

function createProps(
	overrides: Partial<SimulationControlsProps> = {},
): SimulationControlsProps {
	return {
		canSimulate: true,
		playing: false,
		onPlay: vi.fn(),
		onPause: vi.fn(),
		selectedTimeMs: 5 * YEAR_MS,
		currentTimeMs: 5 * YEAR_MS,
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
	latestButton: ReactElement<ClickableProps>
	playButton: ReactElement<ClickableProps>
} {
	const root = SimulationControls(props) as ReactElement<ChildrenProps>
	const content = React.Children.only(
		root.props.children,
	) as ReactElement<ChildrenProps>
	const panel = React.Children.toArray(
		content.props.children,
	)[0] as ReactElement<ChildrenProps>
	const topRow = React.Children.toArray(
		(
			React.Children.toArray(
				panel.props.children,
			)[0] as ReactElement<ChildrenProps>
		).props.children,
	) as ReactElement<ChildrenProps>[]
	const actionRow = topRow[1] as ReactElement<ChildrenProps>
	const actionGroup = React.Children.toArray(
		actionRow.props.children,
	) as ReactElement<ClickableProps>[]
	const buttons = React.Children.toArray(
		(
			React.Children.toArray(
				panel.props.children,
			)[1] as ReactElement<ChildrenProps>
		).props.children,
	) as ReactElement<ClickableProps>[]

	return {
		previousButton: buttons[0],
		nextButton: buttons[2],
		latestButton: actionGroup[0],
		playButton: actionGroup[1],
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
		expect(markup).toContain("Latest Y5")
		expect(markup).not.toContain("Reviewing history")
		expect(markup).not.toContain("Start Y1")
	})

	it("returns to the latest year before resuming simulation", () => {
		const onPlay = vi.fn()
		const onTimeChange = vi.fn()
		const { playButton } = getActionButtons(
			createProps({
				selectedTimeMs: 2 * YEAR_MS,
				onPlay,
				onTimeChange,
			}),
		)

		playButton.props.onClick?.(undefined as never)

		expect(onTimeChange).toHaveBeenCalledWith(5 * YEAR_MS)
		expect(onPlay).toHaveBeenCalledTimes(1)
	})

	it("makes the latest year control jump back to the live edge", () => {
		const onTimeChange = vi.fn()
		const { latestButton } = getActionButtons(
			createProps({
				selectedTimeMs: 2 * YEAR_MS,
				onTimeChange,
			}),
		)

		expect(latestButton.props.disabled).not.toBe(true)

		latestButton.props.onClick?.(undefined as never)

		expect(onTimeChange).toHaveBeenCalledWith(5 * YEAR_MS)
	})

	it("keeps the live edge selected when starting from the latest year", () => {
		const onPlay = vi.fn()
		const onTimeChange = vi.fn()
		const { latestButton, playButton } = getActionButtons(
			createProps({
				onPlay,
				onTimeChange,
			}),
		)

		expect(latestButton.props.disabled).toBe(true)

		playButton.props.onClick?.(undefined as never)

		expect(onTimeChange).not.toHaveBeenCalled()
		expect(onPlay).toHaveBeenCalledTimes(1)
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

	it("renders a single floating play button when no history is available", () => {
		const markup = renderToStaticMarkup(
			<SimulationControls
				{...createProps({
					minTimeMs: YEAR_MS,
					maxTimeMs: YEAR_MS,
					selectedTimeMs: YEAR_MS,
					currentTimeMs: YEAR_MS,
					floating: true,
				})}
			/>,
		)

		expect(markup).toContain("Start simulation")
		expect(markup).not.toContain("Simulation year")
		expect(markup).not.toContain("Latest Y1")
	})

	it("rewinds to the current year from the floating button before starting", () => {
		const onPlay = vi.fn()
		const onTimeChange = vi.fn()
		const tree = SimulationControls(
			createProps({
				minTimeMs: YEAR_MS,
				maxTimeMs: YEAR_MS,
				selectedTimeMs: 0,
				currentTimeMs: YEAR_MS,
				onPlay,
				onTimeChange,
			}),
		) as ReactElement<ChildrenProps>
		const content = React.Children.only(
			tree.props.children,
		) as ReactElement<ChildrenProps>
		const button = React.Children.toArray(
			content.props.children,
		)[0] as ReactElement<ClickableProps>

		expect(button.props.children).not.toBeUndefined()
		expect(button.props.disabled).not.toBe(true)
		button.props.onClick?.(undefined as never)

		expect(onTimeChange).toHaveBeenCalledWith(YEAR_MS)
		expect(onPlay).toHaveBeenCalledTimes(1)
	})

	it("pauses an active simulation without rewinding the selected year", () => {
		const onPause = vi.fn()
		const onTimeChange = vi.fn()
		const { playButton } = getActionButtons(
			createProps({
				playing: true,
				onPause,
				onTimeChange,
			}),
		)

		playButton.props.onClick?.(undefined as never)

		expect(onPause).toHaveBeenCalledTimes(1)
		expect(onTimeChange).not.toHaveBeenCalled()
	})
})

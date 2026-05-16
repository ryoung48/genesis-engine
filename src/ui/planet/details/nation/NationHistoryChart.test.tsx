import type React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { HistoryNote } from "@/model/history/state"
import { YEAR_MS } from "@/model/history/state"

interface MockLineProps {
	data: {
		labels: string[]
		datasets: unknown[]
	}
	options: {
		plugins: {
			legend: {
				labels: {
					filter: (item: { text: string }) => boolean
				}
			}
			tooltip: {
				callbacks: {
					label: (context: {
						dataset: { label?: string }
						datasetIndex: number
						parsed: { y: number }
						raw?: unknown
					}) => string
					footer: (items: Array<{ dataIndex: number }>) => string
				}
			}
		}
		scales: {
			y: {
				ticks: {
					callback: (value: string | number) => string | number
				}
			}
		}
		onClick: (_event: unknown, elements: Array<{ index: number }>) => void
	}
	plugins: Array<{
		afterDatasetsDraw: (chart: {
			ctx: {
				save: () => void
				setLineDash: (value: number[]) => void
				beginPath: () => void
				moveTo: (x: number, y: number) => void
				lineTo: (x: number, y: number) => void
				stroke: () => void
				fill: () => void
				restore: () => void
				lineWidth: number
				strokeStyle: string
				fillStyle: string
			}
			chartArea: { top: number; bottom: number }
			scales: { x: { getPixelForValue: (value: number) => number } }
			data: { labels: string[] }
		}) => void
	}>
}

let lastLineProps: MockLineProps | undefined

vi.mock("react-chartjs-2", () => ({
	Line: (props: MockLineProps) => {
		lastLineProps = props
		return <div data-chart="history" />
	},
}))

import {
	EventCards,
	NationHistoryChart,
	renderDescription,
} from "./NationHistoryChart"

function makeEvent(
	tag: string,
	time: number,
	data: HistoryNote["data"],
): HistoryNote {
	return { tag, time, data }
}

describe("NationHistoryChart", () => {
	beforeEach(() => {
		lastLineProps = undefined
	})

	it("shows a placeholder while history is still sparse", () => {
		const markup = renderToStaticMarkup(
			<NationHistoryChart
				history={[{ timeMs: 0, size: 2, wealth: 5, optimalWealth: 6 }]}
				windowedEvents={[]}
				allPastEvents={[]}
				viewingNation={1}
				selectedTimeMs={0}
				currentTimeMs={0}
				onTimeSelect={vi.fn()}
			/>,
		)

		expect(markup).toContain("Tracking history")
		expect(lastLineProps).toBeUndefined()
	})

	it("builds chart callbacks and renders event cards for populated histories", () => {
		const onTimeSelect = vi.fn()
		const onNationClick = vi.fn()
		const history = [
			{ timeMs: 0, size: 3, wealth: 10, optimalWealth: 12 },
			{ timeMs: YEAR_MS, size: 4, wealth: 14, optimalWealth: 16 },
		]
		const event = makeEvent("battle", YEAR_MS, {
			attacker: 1,
			defender: 2,
			winner: 1,
			war: 3,
			province: 4,
		})

		const markup = renderToStaticMarkup(
			<NationHistoryChart
				history={history}
				windowedEvents={[event]}
				allPastEvents={[event]}
				viewingNation={1}
				selectedTimeMs={YEAR_MS}
				currentTimeMs={YEAR_MS}
				onTimeSelect={onTimeSelect}
				onNationClick={onNationClick}
			/>,
		)

		expect(markup).toContain('data-chart="history"')
		expect(markup).toContain("Year 1 · 1 event")
		expect(markup).toContain("Battle")
		expect(markup).toContain("Victory")
		expect(markup).toContain("Y0-Y1")
		expect(markup).toContain("Events:")
		expect(lastLineProps?.data.labels).toEqual(["Y0", "Y1"])
		expect(lastLineProps?.data.datasets).toHaveLength(3)
		expect(
			lastLineProps?.options.plugins.legend.labels.filter({ text: "battle" }),
		).toBe(true)
		expect(
			lastLineProps?.options.plugins.legend.labels.filter({
				text: "Current Wealth",
			}),
		).toBe(false)
		expect(
			lastLineProps?.options.plugins.tooltip.callbacks.label({
				dataset: { label: "Current Wealth" },
				datasetIndex: 0,
				parsed: { y: 14 },
			}),
		).toBe("  Wealth: 14.0")
		expect(
			lastLineProps?.options.plugins.tooltip.callbacks.label({
				dataset: { label: "Optimal Wealth" },
				datasetIndex: 1,
				parsed: { y: 16 },
			}),
		).toBe("  Optimal: 16.0")
		expect(
			lastLineProps?.options.plugins.tooltip.callbacks.label({
				dataset: { label: "battle" },
				datasetIndex: 2,
				parsed: { y: 14 },
				raw: 1,
			}),
		).toBe("  BATTLE")
		expect(lastLineProps?.options.plugins.tooltip.callbacks.footer([])).toBe("")
		expect(
			lastLineProps?.options.plugins.tooltip.callbacks.footer([
				{ dataIndex: 1 },
			]),
		).toBe("Size: 4 provinces")
		expect(lastLineProps?.options.scales.y.ticks.callback(1500)).toBe("2k")
		expect(lastLineProps?.options.scales.y.ticks.callback("steady")).toBe(
			"steady",
		)

		lastLineProps?.options.onClick({}, [{ index: 1 }])
		expect(onTimeSelect).toHaveBeenCalledWith(YEAR_MS)

		const ctx = {
			save: vi.fn(),
			setLineDash: vi.fn(),
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
			fill: vi.fn(),
			restore: vi.fn(),
			lineWidth: 0,
			strokeStyle: "",
			fillStyle: "",
		}
		lastLineProps?.plugins[0].afterDatasetsDraw({
			ctx,
			chartArea: { top: 0, bottom: 20 },
			scales: { x: { getPixelForValue: () => 12 } },
			data: { labels: ["Y0", "Y1"] },
		})
		expect(ctx.stroke).toHaveBeenCalled()
		expect(ctx.fill).toHaveBeenCalled()
	})

	it("renders clickable descriptions and event-card interactions", () => {
		const onNationClick = vi.fn()
		const onProvinceClick = vi.fn()
		const onTimeSelect = vi.fn()
		const event = makeEvent("war started", YEAR_MS, {
			attacker: 1,
			defender: 7,
			war: 8,
		})

		const parts = renderDescription("#1 declared war on #7.", {
			onNationClick,
		})
		expect(parts).toHaveLength(4)
		const attackerButton = parts[0] as React.ReactElement<{
			onClick?: (event: { stopPropagation: () => void }) => void
		}>
		const defenderButton = parts[2] as React.ReactElement<{
			onClick?: (event: { stopPropagation: () => void }) => void
		}>
		attackerButton.props.onClick?.({ stopPropagation: vi.fn() })
		defenderButton.props.onClick?.({ stopPropagation: vi.fn() })
		expect(onNationClick).toHaveBeenCalledWith(1)
		expect(onNationClick).toHaveBeenCalledWith(7)

		const provinceParts = renderDescription(
			"#1 defeated #7 in a major battle (province #4).",
			{
				onNationClick,
				onProvinceClick,
				getProvinceName: (provinceId) => `Province ${provinceId}`,
				getProvinceColor: () => "#0ea5e9",
			},
		)
		const provinceButton = provinceParts[4] as React.ReactElement<{
			onClick?: (event: { stopPropagation: () => void }) => void
		}>
		provinceButton.props.onClick?.({ stopPropagation: vi.fn() })
		expect(onProvinceClick).toHaveBeenCalledWith(4)

		const emptyMarkup = renderToStaticMarkup(
			<EventCards
				events={[]}
				year={2}
				ctx={{ pastEvents: [], viewingNation: 1 }}
				onTimeSelect={onTimeSelect}
			/>,
		)
		expect(emptyMarkup).toContain("No events this year")

		const tree = EventCards({
			events: [event],
			year: 1,
			ctx: { pastEvents: [event], viewingNation: 1 },
			onTimeSelect,
			onNationClick,
		}) as React.ReactElement<{
			children?: React.ReactNode
		}>
		const cards = (
			tree.props.children as React.ReactElement[]
		)[1] as React.ReactElement<{
			children?: React.ReactNode
		}>
		const card = (
			cards.props.children as React.ReactElement[]
		)[0] as React.ReactElement<{
			onClick?: () => void
			onKeyDown?: (event: { key: string; preventDefault: () => void }) => void
		}>
		card.props.onClick?.()
		card.props.onKeyDown?.({ key: "Enter", preventDefault: vi.fn() })
		card.props.onKeyDown?.({ key: " ", preventDefault: vi.fn() })
		card.props.onKeyDown?.({ key: "Escape", preventDefault: vi.fn() })

		expect(onTimeSelect).toHaveBeenCalledTimes(3)
	})

	it("renders dynasty labels with swatches and no click handler", () => {
		const onNationClick = vi.fn()
		const parts = renderDescription("Dynasty #4 spread from #2 to #5.", {
			onNationClick,
			getDynastyName: (dynastyId) =>
				dynastyId === 4 ? "House Aurelian" : `Dynasty #${dynastyId}`,
		})

		expect(parts).toHaveLength(6)
		const dynastyChip = parts[0] as React.ReactElement
		expect(dynastyChip.type).toBe("span")
		const dynastyMarkup = renderToStaticMarkup(<>{dynastyChip}</>)
		expect(dynastyMarkup).toContain("House Aurelian")
		expect(dynastyMarkup).toContain("rgb(")

		const sourceButton = parts[2] as React.ReactElement<{
			onClick?: (event: { stopPropagation: () => void }) => void
		}>
		sourceButton.props.onClick?.({ stopPropagation: vi.fn() })
		expect(onNationClick).toHaveBeenCalledWith(2)
	})

	it("covers non-clickable descriptions and remaining chart callback fallbacks", () => {
		expect(renderDescription("#4 signed peace.")).toEqual([
			"#4",
			" signed peace.",
		])

		const onTimeSelect = vi.fn()
		const history = [
			{ timeMs: 0, size: 1, wealth: 2, optimalWealth: 3 },
			{ timeMs: YEAR_MS, size: 2, wealth: 4, optimalWealth: 5 },
		]
		renderToStaticMarkup(
			<NationHistoryChart
				history={history}
				windowedEvents={[
					makeEvent("succession", YEAR_MS, {
						nation: 3,
						leader: 1,
						successor: 2,
					}),
				]}
				allPastEvents={[]}
				viewingNation={3}
				selectedTimeMs={YEAR_MS}
				currentTimeMs={YEAR_MS}
				onTimeSelect={onTimeSelect}
				getDynastyName={(dynastyId) => `House ${dynastyId}`}
			/>,
		)

		expect(
			lastLineProps?.options.plugins.tooltip.callbacks.label({
				dataset: { label: "custom" },
				datasetIndex: 2,
				parsed: { y: 9 },
				raw: null,
			}),
		).toBe("")
		expect(
			lastLineProps?.options.plugins.tooltip.callbacks.label({
				dataset: { label: "Auxiliary" },
				datasetIndex: 1,
				parsed: { y: 9 },
			}),
		).toBe("  Auxiliary: 9.0")
		expect(
			lastLineProps?.options.plugins.tooltip.callbacks.footer([
				{ dataIndex: 9 },
			]),
		).toBe("")

		lastLineProps?.options.onClick({}, [])
		expect(onTimeSelect).not.toHaveBeenCalled()

		const ctx = {
			save: vi.fn(),
			setLineDash: vi.fn(),
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
			fill: vi.fn(),
			restore: vi.fn(),
			lineWidth: 0,
			strokeStyle: "",
			fillStyle: "",
		}
		lastLineProps?.plugins[0].afterDatasetsDraw({
			ctx,
			chartArea: { top: 0, bottom: 20 },
			scales: { x: { getPixelForValue: () => Number.NaN } },
			data: { labels: [] },
		})
		expect(ctx.stroke).not.toHaveBeenCalled()
	})

	it("renders real nation names with swatches inside history descriptions", () => {
		const markup = renderToStaticMarkup(
			<>
				{renderDescription("#1 declared war on #7.", {
					getNationName: (nationId) =>
						nationId === 1 ? "Aurelian March" : "Sable Coast",
					getNationColor: (nationId) =>
						nationId === 1 ? "#123456" : "#654321",
				})}
			</>,
		)

		expect(markup).toContain("Aurelian March")
		expect(markup).toContain("Sable Coast")
		expect(markup).toContain("#123456")
		expect(markup).toContain("#654321")
		expect(markup).not.toContain("&gt;#1&lt;")
		expect(markup).not.toContain("&gt;#7&lt;")
	})

	it("renders dynasty names with swatches inside history descriptions", () => {
		const markup = renderToStaticMarkup(
			<>
				{renderDescription("Dynasty #4 spread from #1 to #2.", {
					onNationClick: vi.fn(),
					getNationName: (nationId) => `Nation ${nationId}`,
					getNationColor: () => "#123456",
					getDynastyName: (dynastyId) => `House ${dynastyId}`,
				})}
			</>,
		)

		expect(markup).toContain("House 4")
		expect(markup).toContain("Nation 1")
		expect(markup).toContain("Nation 2")
		expect(markup).not.toContain(">Dynasty #4<")
	})

	it("renders province names with swatches inside history descriptions", () => {
		const markup = renderToStaticMarkup(
			<>
				{renderDescription("Battle in province #4.", {
					onProvinceClick: vi.fn(),
					getProvinceName: (provinceId) => `Province ${provinceId}`,
					getProvinceColor: () => "#0ea5e9",
				})}
			</>,
		)

		expect(markup).toContain("Province 4")
		expect(markup).toContain("#0ea5e9")
		expect(markup).not.toContain(">province #4<")
	})

	it("renders province spans and raw province ids in fallback modes", () => {
		const namedMarkup = renderToStaticMarkup(
			<>
				{renderDescription("Battle in province #4.", {
					getProvinceName: (provinceId) => `Province ${provinceId}`,
					getProvinceColor: () => "#0ea5e9",
				})}
			</>,
		)

		expect(namedMarkup).toContain("Province 4")
		expect(renderDescription("Battle in province #4.")).toEqual([
			"Battle in ",
			"province #4",
			".",
		])
	})

	it("deduplicates per-point event types and skips events outside the visible history", () => {
		renderToStaticMarkup(
			<NationHistoryChart
				history={[
					{ timeMs: 0, size: 2, wealth: 3, optimalWealth: 4 },
					{ timeMs: YEAR_MS, size: 3, wealth: 6, optimalWealth: 7 },
				]}
				windowedEvents={[
					makeEvent("battle", YEAR_MS, {
						attacker: 1,
						defender: 2,
						winner: 1,
						war: 1,
						province: 2,
					}),
					makeEvent("battle", YEAR_MS, {
						attacker: 1,
						defender: 2,
						winner: 1,
						war: 1,
						province: 2,
					}),
					makeEvent("succession", YEAR_MS, {
						nation: 1,
						leader: 2,
						successor: 3,
					}),
					makeEvent("rebellion", 5 * YEAR_MS, {
						overlord: 1,
						subject: 4,
					}),
				]}
				allPastEvents={[]}
				viewingNation={1}
				selectedTimeMs={YEAR_MS}
				currentTimeMs={YEAR_MS}
				onTimeSelect={vi.fn()}
			/>,
		)

		expect(lastLineProps?.data.datasets).toHaveLength(5)
		expect(lastLineProps?.data.datasets[2]).toMatchObject({
			label: "battle",
		})
		expect(lastLineProps?.data.datasets[3]).toMatchObject({
			label: "succession",
		})
	})
})

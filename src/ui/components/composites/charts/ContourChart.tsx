import { contours } from "d3-contour"
import React from "react"
import { ContinuousLegend } from "@/ui/components/primitives/charts/ContinuousLegend"

interface ContourChartProps {
	matrix: readonly (readonly number[])[]
	rowValues: readonly number[]
	columnValues: readonly number[]
	columnLabels: readonly string[]
	colorForValue: (value: number) => string
	rowTickLabel?: (rowValue: number, rowIndex: number) => string
	tooltipLabel?: (params: {
		rowValue: number
		columnValue: number
		value: number
		rowIndex: number
		columnIndex: number
	}) => string
	legendTitle?: string
	xAxisTitle?: string
	yAxisTitle?: string
	yTickEvery?: number
	fullHeight?: boolean
	showLegend?: boolean
	showXAxis?: boolean
	formatLegendValue?: (value: number) => string
}

const VIEW = 1000
const X_TICK_TARGET = 8
// Filled colour bands: enough that the stepped fill reads as a smooth gradient.
const BAND_COUNT = 28

function fallbackRowLabel(rowValue: number): string {
	return `${rowValue.toFixed(0)}°`
}

function multiPolygonPath(
	polygons: number[][][][],
	toX: (n: number) => number,
	toY: (n: number) => number,
): string {
	let d = ""
	for (const polygon of polygons) {
		for (const ring of polygon) {
			for (let i = 0; i < ring.length; i++) {
				d += `${i ? "L" : "M"}${toX(ring[i][0]).toFixed(1)},${toY(ring[i][1]).toFixed(1)}`
			}
			d += "Z"
		}
	}
	return d
}

export const ContourChart: React.FC<ContourChartProps> = ({
	matrix,
	rowValues,
	columnValues,
	columnLabels,
	colorForValue,
	rowTickLabel = (rowValue) => fallbackRowLabel(rowValue),
	tooltipLabel,
	legendTitle,
	xAxisTitle,
	yAxisTitle,
	yTickEvery = 1,
	fullHeight = false,
	showLegend = true,
	showXAxis = true,
	formatLegendValue,
}) => {
	const plotRef = React.useRef<HTMLDivElement>(null)
	const tooltipRef = React.useRef<HTMLDivElement>(null)
	const [hover, setHover] = React.useState<{
		x: number
		y: number
		text: string
	} | null>(null)
	const [tooltipPos, setTooltipPos] = React.useState<{
		left: number
		top: number
	}>({ left: 0, top: 0 })

	const rows = rowValues.length
	const cols = columnValues.length

	const field = React.useMemo(
		() =>
			rowValues.map((_, r) =>
				columnValues.map((columnValue) => matrix[r][columnValue]),
			),
		[matrix, rowValues, columnValues],
	)

	let min = Infinity
	let max = -Infinity
	for (const row of field) {
		for (const value of row) {
			if (value < min) min = value
			if (value > max) max = value
		}
	}
	if (!Number.isFinite(min) || !Number.isFinite(max)) {
		min = 0
		max = 0
	}

	const { bands, backdrop } = React.useMemo(() => {
		if (!(max > min)) {
			return {
				bands: [] as { value: number; d: string; fill: string }[],
				backdrop: colorForValue(min),
			}
		}
		// d3-contour places grid value i at coordinate i + 0.5 and encloses the
		// field in [0, cols] x [0, rows].
		const toX = (x: number) => Math.max(0, Math.min(1, x / cols)) * VIEW
		const toY = (y: number) => (1 - Math.max(0, Math.min(1, y / rows))) * VIEW

		const flat: number[] = new Array(rows * cols)
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < cols; c++) flat[c + r * cols] = field[r][c]

		const bandStep = (max - min) / BAND_COUNT
		const bandGen = contours()
			.size([cols, rows])
			.smooth(true)
			.thresholds(
				Array.from({ length: BAND_COUNT }, (_, i) => min + i * bandStep),
			)
		const bands = bandGen(flat).map((feature) => ({
			value: feature.value,
			d: multiPolygonPath(feature.coordinates, toX, toY),
			fill: colorForValue(feature.value + bandStep / 2),
		}))

		return { bands, backdrop: colorForValue(min + bandStep / 2) }
	}, [field, min, max, rows, cols, colorForValue])

	const yTicks = rowValues
		.map((rowValue, index) => ({ rowValue, index }))
		.filter(({ index }) => index % Math.max(1, yTickEvery) === 0)
	const xTickStep = Math.max(1, Math.round(cols / X_TICK_TARGET))
	const xTicks = columnLabels
		.map((label, index) => ({ label, index }))
		.filter(({ index }) => index % xTickStep === 0)

	const handleMove = (event: React.MouseEvent<HTMLDivElement>) => {
		if (!tooltipLabel || !plotRef.current) return
		const rect = plotRef.current.getBoundingClientRect()
		const x = event.clientX - rect.left
		const y = event.clientY - rect.top
		const fx = x / rect.width
		const fy = y / rect.height
		const c = Math.min(cols - 1, Math.max(0, Math.floor(fx * cols)))
		const r = Math.min(rows - 1, Math.max(0, Math.floor((1 - fy) * rows)))
		setHover({
			x,
			y,
			text: tooltipLabel({
				rowValue: rowValues[r],
				columnValue: columnValues[c],
				value: field[r][c],
				rowIndex: r,
				columnIndex: c,
			}),
		})
	}

	// Position the tooltip in pixels against the plot box so it never clips a
	// chart edge: centred on the cursor but clamped fully inside horizontally,
	// and flipped below the cursor when there isn't room above.
	React.useLayoutEffect(() => {
		if (!hover || !plotRef.current || !tooltipRef.current) return
		const plot = plotRef.current.getBoundingClientRect()
		const tip = tooltipRef.current.getBoundingClientRect()
		const margin = 4
		const gap = 8
		const left = Math.max(
			margin,
			Math.min(hover.x - tip.width / 2, plot.width - tip.width - margin),
		)
		const above = hover.y - tip.height - gap
		const top =
			above >= margin
				? above
				: Math.max(
						margin,
						Math.min(hover.y + gap, plot.height - tip.height - margin),
					)
		setTooltipPos({ left, top })
	}, [hover])

	return (
		<div className={fullHeight ? "flex h-full min-h-0 flex-col" : "mt-4"}>
			<div
				className="flex min-h-0"
				style={fullHeight ? { flex: 1 } : { height: 400 }}
			>
				<div className="relative w-7 shrink-0">
					{yAxisTitle && (
						<span className="-rotate-90 absolute top-1/2 left-0 origin-left whitespace-nowrap font-mono text-[9px] text-slate-500 tracking-tighter">
							{yAxisTitle}
						</span>
					)}
					{yTicks.map(({ rowValue, index }) => (
						<span
							key={index}
							className="-translate-y-1/2 absolute right-1 font-mono text-[7px] text-slate-500"
							style={{ top: `${(1 - (index + 0.5) / rows) * 100}%` }}
						>
							{rowTickLabel(rowValue, index)}
						</span>
					))}
				</div>
				<div
					ref={plotRef}
					className="relative min-w-0 flex-1"
					onMouseMove={handleMove}
					onMouseLeave={() => setHover(null)}
				>
					<div className="absolute inset-0 overflow-hidden border border-slate-200">
						<svg
							className="absolute inset-0 h-full w-full"
							viewBox={`0 0 ${VIEW} ${VIEW}`}
							preserveAspectRatio="none"
							role="img"
							aria-label={legendTitle ?? "Contour chart"}
						>
							<rect x={0} y={0} width={VIEW} height={VIEW} fill={backdrop} />
							<g>
								{bands.map((band) => (
									<path
										key={band.value}
										d={band.d}
										fill={band.fill}
										stroke={band.fill}
										strokeWidth={1}
										vectorEffect="non-scaling-stroke"
									/>
								))}
							</g>
						</svg>
					</div>
					{hover && (
						<div
							ref={tooltipRef}
							className="pointer-events-none absolute z-10 whitespace-nowrap rounded bg-slate-900/90 px-1.5 py-0.5 font-mono text-[9px] text-white"
							style={{ left: tooltipPos.left, top: tooltipPos.top }}
						>
							{hover.text}
						</div>
					)}
				</div>
			</div>
			{showXAxis && (
				<div className="relative ml-7 h-3">
					{xAxisTitle && (
						<span className="-translate-x-1/2 absolute top-2.5 left-1/2 font-mono font-bold text-[9px] text-slate-500">
							{xAxisTitle}
						</span>
					)}
					{xTicks.map(({ label, index }) => (
						<span
							key={index}
							className="-translate-x-1/2 absolute top-0 font-mono text-[7px] text-slate-500"
							style={{ left: `${((index + 0.5) / cols) * 100}%` }}
						>
							{label}
						</span>
					))}
				</div>
			)}
			{showLegend && (
				<ContinuousLegend
					min={min}
					max={max}
					title={legendTitle}
					colorForValue={colorForValue}
					formatValue={formatLegendValue}
				/>
			)}
		</div>
	)
}

import type { ChartDataset, Plugin } from "chart.js"
import type { TargetBand } from "@/bench/targets/types"
import { uiChartPalette } from "@/ui/components/tokens"

const BAND_WIDTH = 0.8

export function targetBandPlugin(bands: (TargetBand | null)[]): Plugin<"line"> {
	return {
		id: "targetBand",
		beforeDatasetsDraw(chart) {
			const { ctx, scales } = chart
			const x = scales.x
			const y = scales.y
			const step = bands.length > 0 ? (x.right - x.left) / bands.length : 0
			const width = step * BAND_WIDTH
			ctx.save()
			ctx.fillStyle = uiChartPalette.bench.targetBand
			ctx.strokeStyle = uiChartPalette.bench.targetBandStroke
			ctx.lineWidth = 1
			for (const [index, band] of bands.entries()) {
				if (!band) continue
				const left = x.getPixelForValue(index) - width / 2
				const top = y.getPixelForValue(band.max)
				const bottom = y.getPixelForValue(band.min)
				ctx.fillRect(left, top, width, bottom - top)
				ctx.beginPath()
				ctx.moveTo(left, top)
				ctx.lineTo(left + width, top)
				ctx.moveTo(left, bottom)
				ctx.lineTo(left + width, bottom)
				ctx.stroke()
			}
			ctx.restore()
		},
	}
}

export function targetBandDatasets(
	bands: (TargetBand | null)[],
): ChartDataset<"line">[] {
	return (["min", "max"] as const).map((edge) => ({
		label: `historical ${edge}`,
		data: bands.map((band) => band?.[edge] ?? null),
		showLine: false,
		pointRadius: 0,
		pointHoverRadius: 0,
		borderColor: uiChartPalette.bench.targetBandStroke,
		backgroundColor: uiChartPalette.bench.targetBandStroke,
	}))
}

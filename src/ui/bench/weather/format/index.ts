import { formatBenchValue } from "@/ui/bench/format"
import type { WeatherBenchCellCompareParams } from "@/ui/bench/weather/types"

function percent(value: number | null): string {
	return formatBenchValue({
		value: value === null ? null : value * 100,
		unit: "%",
	})
}
function count(value: number | null): string {
	return value === null
		? "—"
		: value.toLocaleString("en-US", { maximumFractionDigits: 0 })
}
function hours(value: number | null): string {
	return value === null
		? "—"
		: `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} h`
}

function numeric(cell: string): number | null {
	const text = cell.replace(/,/g, "").replace(/^−/, "-")
	return /^[<≥≤+-]?\s*\d/.test(text)
		? Number.parseFloat(text.replace(/^[<≥≤+]\s*/, ""))
		: null
}
function compare({ a, b, direction }: WeatherBenchCellCompareParams): number {
	const x = numeric(a),
		y = numeric(b)
	if (x === null && y === null) return a.localeCompare(b) * direction
	if (x === null) return 1
	if (y === null) return -1
	return (x - y) * direction
}

export const WEATHER_BENCH_FORMAT = { percent, count, hours, compare }

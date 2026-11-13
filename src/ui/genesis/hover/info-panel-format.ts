import {
	dtrColor,
	humidityColor,
	miseryColor,
} from "@/ui/genesis/shared/colors"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"

export function tempColor(v: number): string {
	if (v < -20) return "#6366f1"
	if (v < -5) return "#818cf8"
	if (v < 0) return "#93c5fd"
	if (v < 10) return "#67e8f9"
	if (v < 20) return "#fbbf24"
	if (v < 30) return "#f97316"
	return "#ef4444"
}

export function rainColor(v: number): string {
	if (v < 10) return "#a16207"
	if (v < 30) return "#65a30d"
	if (v < 80) return "#059669"
	if (v < 150) return "#0891b2"
	return "#2563eb"
}

export function flowColor(v: number): string {
	if (v < 1) return "#64748b"
	if (v < 10) return "#7dd3fc"
	if (v < 100) return "#38bdf8"
	if (v < 1000) return "#0284c7"
	return "#1d4ed8"
}

export function currentImpactColor(v: number): string {
	return v >= 0 ? "#f59e0b" : "#38bdf8"
}

export function petColor(v: number): string {
	if (v < 20) return "#38bdf8"
	if (v < 50) return "#67e8f9"
	if (v < 100) return "#fbbf24"
	if (v < 150) return "#f97316"
	return "#ef4444"
}

export function aetColor(v: number): string {
	if (v < 10) return "#a16207"
	if (v < 30) return "#65a30d"
	if (v < 60) return "#059669"
	if (v < 100) return "#0891b2"
	return "#2563eb"
}

export function gddColor(v: number): string {
	if (v < 50) return "#64748b"
	if (v < 150) return "#84cc16"
	if (v < 300) return "#22c55e"
	if (v < 500) return "#f59e0b"
	return "#ef4444"
}

export function gintColor(v: number): string {
	if (v < 5) return "#64748b"
	if (v < 10) return "#67e8f9"
	if (v < 15) return "#fbbf24"
	return "#f97316"
}

export function dtrChartColor(v: number): string {
	return rgbToCss(dtrColor(v))
}

export function humidityChartColor(v: number): string {
	return rgbToCss(humidityColor(v))
}

export function miseryChartColor(v: number): string {
	return rgbToCss(miseryColor(v))
}

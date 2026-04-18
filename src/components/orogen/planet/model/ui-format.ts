export function rgbToCss([r, g, b]: [number, number, number]): string {
	return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

export function formatTemperatureC(value: number, digits = 1): string {
	return `${value.toFixed(digits)} °C`
}

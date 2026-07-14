/** Deterministic hash-based color for ids with no explicit reference color
 * (most EU4 cultures/governments have none). Shared by the map-mode renderer
 * (earth-history-region-colors.ts) and the hover panel so a culture/religion/
 * government swatch always matches its map tile. */
export function hashColorForKey(key: string): [number, number, number] {
	let h = 0
	for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
	const hue = (h % 360) / 360
	return hslToRgb(hue, 0.55, 0.5)
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const c = (1 - Math.abs(2 * l - 1)) * s
	const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
	const m = l - c / 2
	let r = 0
	let g = 0
	let b = 0
	const seg = Math.floor(h * 6)
	if (seg === 0) {
		r = c
		g = x
	} else if (seg === 1) {
		r = x
		g = c
	} else if (seg === 2) {
		g = c
		b = x
	} else if (seg === 3) {
		g = x
		b = c
	} else if (seg === 4) {
		r = x
		b = c
	} else {
		r = c
		b = x
	}
	return [r + m, g + m, b + m]
}

export function rgb01ToCss([r, g, b]: [number, number, number]): string {
	return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`
}

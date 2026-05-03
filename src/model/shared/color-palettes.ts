type RgbColor = [number, number, number]

function hexToRgb(hex: string): RgbColor {
	const normalized = hex.replace("#", "")
	return [
		parseInt(normalized.slice(0, 2), 16) / 255,
		parseInt(normalized.slice(2, 4), 16) / 255,
		parseInt(normalized.slice(4, 6), 16) / 255,
	]
}

function palette(...stops: string[]): readonly RgbColor[] {
	return stops.map(hexToRgb)
}

export const BUPU_STOPS = palette(
	"#f7fcfd",
	"#e0ecf4",
	"#bfd3e6",
	"#9ebcda",
	"#8c96c6",
	"#8c6bb1",
	"#88419d",
	"#810f7c",
	"#4d004b",
)

export const ORANGES_STOPS = palette(
	"#fff5eb",
	"#fee6ce",
	"#fdd0a2",
	"#fdae6b",
	"#fd8d3c",
	"#f16913",
	"#d94801",
	"#a63603",
	"#7f2704",
)

export const PURPLES_STOPS = palette(
	"#fcfbfd",
	"#efedf5",
	"#dadaeb",
	"#bcbddc",
	"#9e9ac8",
	"#807dba",
	"#6a51a3",
	"#54278f",
	"#3f007d",
)

export const YL_OR_RD_STOPS = palette(
	"#ffffcc",
	"#ffeda0",
	"#fed976",
	"#feb24c",
	"#fd8d3c",
	"#fc4e2a",
	"#e31a1c",
	"#bd0026",
	"#800026",
)

export const PLASMA_STOPS = palette(
	"#0d0887",
	"#41049d",
	"#6a00a8",
	"#8f0da4",
	"#b12a90",
	"#cc4778",
	"#e16462",
	"#f2844b",
	"#fca636",
	"#fcce25",
	"#f0f921",
)

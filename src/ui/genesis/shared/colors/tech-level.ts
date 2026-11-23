import { COLOR_INTERPOLATION } from "@/model/shared/color/color-interpolation"

const TECH_LEVEL_MAX = 7.8

const TECH_LEVEL_STOPS = [
	"#9e0142",
	"#d53e4f",
	"#f46d43",
	"#fdae61",
	"#fee08b",
	"#ffffbf",
	"#e6f598",
	"#abdda4",
	"#66c2a5",
	"#3288bd",
	"#5e4fa2",
].map((css) => COLOR_INTERPOLATION.cssColorToRgb(css))

export function techLevelColor(techLevel: number): [number, number, number] {
	const [r, g, b] = COLOR_INTERPOLATION.sampleBasisColorStops({
		stops: TECH_LEVEL_STOPS,
		t: techLevel / TECH_LEVEL_MAX,
	})
	return [r, g, b]
}

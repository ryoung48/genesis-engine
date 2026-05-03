import { rgbToCss, sampleColorStops } from "@/model/shared/color-interpolation"
import { BUPU_STOPS } from "@/model/shared/color-palettes"

export const DEV_BUCKETS = [
	"0.00-0.05",
	"0.05-0.10",
	"0.10-0.20",
	"0.20-0.35",
	"0.35-0.55",
	"0.55-0.80",
	"0.80+",
] as const

export const DEV_COLORS = DEV_BUCKETS.map((_, index) =>
	rgbToCss(
		sampleColorStops(
			BUPU_STOPS,
			0.2 + (index / (DEV_BUCKETS.length - 1)) * 0.8,
		),
	),
)

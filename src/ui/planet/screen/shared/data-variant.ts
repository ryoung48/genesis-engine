import type { ColorMode } from "../../colors"

export type DataVariant = "generated" | "observed" | "diff"

const VARIANT_FAMILIES: Partial<
	Record<ColorMode, Partial<Record<DataVariant, ColorMode>>>
> = {
	temperature: {
		generated: "temperature",
		observed: "realTemperature",
		diff: "temperatureDiff",
	},
	dtr: { generated: "dtr", observed: "realDtr", diff: "dtrDiff" },
	precipitation: {
		generated: "precipitation",
		observed: "realPrecipitation",
		diff: "precipitationDiff",
	},
	humidity: {
		generated: "humidity",
		observed: "realHumidity",
		diff: "humidityDiff",
	},
	pastaClimate: { generated: "pastaClimate", observed: "realPastaClimate" },
	koppenClimate: { generated: "koppenClimate", observed: "realKoppenClimate" },
	climate: { generated: "climate", observed: "eu5Climate" },
	topography: { generated: "topography", observed: "eu5Topography" },
	vegetation: { generated: "vegetation", observed: "eu5Vegetation" },
}

export function getBaseMapMode(mode: ColorMode): ColorMode {
	for (const [base, family] of Object.entries(VARIANT_FAMILIES)) {
		for (const value of Object.values(family)) {
			if (value === mode) return base as ColorMode
		}
	}
	return mode
}

export function getDataVariant(mode: ColorMode): DataVariant {
	for (const family of Object.values(VARIANT_FAMILIES)) {
		for (const [variant, value] of Object.entries(family)) {
			if (value === mode) return variant as DataVariant
		}
	}
	return "generated"
}

export function getAvailableVariants(mode: ColorMode): DataVariant[] {
	const family = VARIANT_FAMILIES[getBaseMapMode(mode)]
	if (!family) return ["generated"]
	return (["generated", "observed", "diff"] as const).filter((v) => family[v])
}

export function applyDataVariant(
	mode: ColorMode,
	variant: DataVariant,
): ColorMode {
	const base = getBaseMapMode(mode)
	const family = VARIANT_FAMILIES[base]
	if (!family) return mode
	return family[variant] ?? family.generated ?? base
}

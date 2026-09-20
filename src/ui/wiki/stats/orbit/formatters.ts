import type {
	AtmosphereProfile,
	BiosphereProfile,
} from "@/model/celestial/orbit-body/types"
import {
	formatTemperature,
	type UnitSystem,
} from "@/ui/genesis/shared/ui-format"

export function formatHours(
	hours: number,
	options: {
		dayPrecision?: number
		hourPrecision?: number
	} = {},
): string {
	if (!Number.isFinite(hours)) return "Infinite"
	const days = hours / 24
	const years = days / 365
	if (years >= 100) return `${(years / 100).toFixed(1)} c`
	if (years >= 1) return `${years.toFixed(2)} y`
	if (days >= 1) return `${days.toFixed(options.dayPrecision ?? 1)} d`
	return `${hours.toFixed(options.hourPrecision ?? 1)} h`
}

export function formatDays(days: number): string {
	return formatHours(days * 24)
}

export function formatLocalCalendarValue(
	orbitalPeriodDays: number,
	solarDayHours: number | null,
	/** A moon's own orbital period around its planet (the "month"), in
	 * days -- when set (a moon's own card), this replaces the "Year"
	 * segment entirely (built from orbitalPeriodDays here, which for a
	 * moon's card is its PARENT's orbital period around the star -- a
	 * secondary, less locally-relevant fact from the moon's surface, not
	 * shown). Omitted for a planet's own card, which has no separate
	 * "month" concept and shows "Year" instead. */
	moonOrbitalPeriodDays?: number,
): string {
	const solarDay =
		solarDayHours === null
			? "-"
			: formatHours(solarDayHours, { dayPrecision: 2, hourPrecision: 2 })
	if (moonOrbitalPeriodDays !== undefined) {
		return `Month ${formatDays(moonOrbitalPeriodDays)} · Day ${solarDay}`
	}
	return `Year ${formatDays(orbitalPeriodDays)} · Day ${solarDay}`
}

export function formatClassificationLabel(classification: string): string {
	return classification
		.split(" ")
		.map((word) =>
			word
				.split("-")
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join("-"),
		)
		.join(" ")
}

export function formatAtmosphereLabelParts(
	atmosphere: AtmosphereProfile | null | undefined,
): { base: string; qualifier?: string } {
	if (!atmosphere) return { base: "Vacuum" }
	const parts = formatAtmosphereSuffixParts(atmosphere)
	return {
		base: `${formatPressureBar(atmosphere.pressureBar)} · ${parts.base}`,
		qualifier: parts.qualifier,
	}
}

export function formatAtmosphereLabel(
	atmosphere: AtmosphereProfile | null | undefined,
): string {
	const parts = formatAtmosphereLabelParts(atmosphere)
	return parts.qualifier ? `${parts.base} (${parts.qualifier})` : parts.base
}

export function buildPressureAtmosphereProfile(
	pressureBar: number,
): AtmosphereProfile {
	if (pressureBar < 0.001) {
		return { code: 0, pressureBar, type: "vacuum", breathable: false }
	}
	if (pressureBar < 0.1) {
		return { code: 1, pressureBar, type: "trace", breathable: false }
	}
	if (pressureBar < 10) {
		return {
			code: 6,
			pressureBar,
			type: "breathable",
			breathable: true,
		}
	}
	if (pressureBar < 100) {
		return {
			code: 13,
			pressureBar,
			type: "exotic",
			breathable: false,
		}
	}
	if (pressureBar < 1000) {
		return {
			code: 16,
			pressureBar,
			type: "gas",
			subtype: "helium",
			breathable: false,
		}
	}
	return {
		code: 17,
		pressureBar,
		type: "gas",
		subtype: "hydrogen",
		breathable: false,
	}
}

export function formatAtmosphereSuffixParts(atmosphere: AtmosphereProfile): {
	base: string
	qualifier?: string
} {
	if (atmosphere.type === "vacuum") return { base: "Vacuum" }
	if (atmosphere.type === "trace") return { base: "Trace" }
	// Code 14 ("Low"/E) and 15 ("Unusual"/F) are otherwise-breathable
	// profiles distinguished only by their code -- see galaxy-gen's code-13
	// branch. Name them explicitly rather than showing a bare "Breathable".
	if (atmosphere.code === 14) return { base: "Low" }
	if (atmosphere.code === 15)
		return {
			base: atmosphere.unusual ? `Unusual (${atmosphere.unusual})` : "Unusual",
		}
	if (atmosphere.type === "breathable")
		return atmosphere.tainted
			? { base: "Breathable", qualifier: "Tainted" }
			: { base: "Breathable" }
	if (atmosphere.type === "corrosive") return { base: "Corrosive" }
	if (atmosphere.type === "insidious") return { base: "Insidious" }
	if (atmosphere.type === "gas" && atmosphere.subtype === "helium")
		return { base: "Helium" }
	if (atmosphere.type === "gas" && atmosphere.subtype === "hydrogen")
		return { base: "Hydrogen" }
	return atmosphere.tainted
		? { base: "Exotic", qualifier: "Irritant" }
		: { base: "Exotic" }
}

export function formatAtmosphereSuffix(atmosphere: AtmosphereProfile): string {
	const parts = formatAtmosphereSuffixParts(atmosphere)
	return parts.qualifier ? `${parts.base} (${parts.qualifier})` : parts.base
}

export function formatAtmosphereHazard(
	atmosphere: AtmosphereProfile | null | undefined,
): string | undefined {
	if (!atmosphere?.tainted) return undefined
	if (!atmosphere.hazards?.length) return undefined
	return atmosphere.hazards
		.map((hazard) =>
			"occasionallyCorrosive" in hazard
				? `Occasionally corrosive gas mix (severity ${hazard.severity}, persistence ${hazard.persistence})`
				: formatClassificationLabel(hazard.kind),
		)
		.join(", ")
}

export function formatPressureBar(pressureBar: number): string {
	if (pressureBar >= 100) return `${pressureBar.toFixed(0)} bar`
	if (pressureBar >= 10) return `${pressureBar.toFixed(1)} bar`
	if (pressureBar >= 1) return `${pressureBar.toFixed(2)} bar`
	if (pressureBar >= 0.1) return `${pressureBar.toFixed(2)} bar`
	if (pressureBar >= 0.01) return `${pressureBar.toFixed(3)} bar`
	return `${pressureBar.toFixed(4)} bar`
}

const HYDROSPHERE_DESCRIPTIONS: Record<number, string> = {
	0: "Arid",
	1: "Sparse Seas",
	2: "Small Oceans",
	3: "Moderate Oceans",
	4: "Large Oceans",
	5: "Even Land/Sea",
	6: "Ocean-Dominated",
	7: "Mostly Ocean",
	8: "Ocean World",
	9: "No Continents",
	10: "Total Coverage",
	11: "Deep Ocean World",
	12: "Molten Surface",
	13: "Gas Giant Core",
}

export function formatHydrosphereValuePrefix(landCoverage: number): string {
	return `${Math.round((1 - landCoverage) * 100)}%`
}

// Kept as a separate " · <description>" suffix (rather than one combined
// string) so the stat row can put it in `value` alongside a `valuePrefix` of
// just the percent -- EditableStatValue then underlines/hovers only the
// percent (its clickable editor target), leaving this description as plain
// trailing text, the same split "Temperature"'s row below uses.
export function formatHydrosphereValueSuffix(hydrosphereCode?: number): string {
	const description =
		hydrosphereCode === undefined
			? undefined
			: HYDROSPHERE_DESCRIPTIONS[hydrosphereCode]
	return description ? ` · ${description}` : ""
}

// Mirrors BIOSPHERE_LABEL in galaxy-body-distributions.ts (galaxy-gen's
// BIOSPHERE.labels) -- kept as its own copy since this module has no reason
// to depend on the galaxy stats-distribution module.
const BIOSPHERE_CODE_LABEL: Record<number, string> = {
	0: "Sterile",
	1: "Prebiotic Chemistry",
	2: "Simple Microbes",
	3: "Complex Microbes",
	4: "Multicellular Beginnings",
	5: "Small Macroscopic Life",
	6: "Large Macroscopic Life",
	7: "Complex Ecosystems",
	8: "Social Species",
	9: "Proto-Sapience",
	10: "Full Sapience",
	11: "Bio-Engineered Life",
}

const BIOSPHERE_LABEL_SUFFIX: Record<
	NonNullable<BiosphereProfile["label"]>,
	string
> = {
	remnants: "Remnants",
	engineered: "Engineered",
	miscible: "Miscible",
	hybrid: "Hybrid",
	immiscible: "Immiscible",
}

export function formatBiosphereLabel(
	biosphere: BiosphereProfile | null | undefined,
): string {
	if (!biosphere || biosphere.code <= 0) return "Sterile"
	const base = BIOSPHERE_CODE_LABEL[biosphere.code] ?? `Code ${biosphere.code}`
	const suffix = biosphere.label
		? BIOSPHERE_LABEL_SUFFIX[biosphere.label]
		: undefined
	return suffix ? `${base} · ${suffix}` : base
}

// Split form of formatBiosphereLabel used where only the main code label
// (not the remnants/engineered/etc. suffix) should carry the trace tooltip.
export function formatBiosphereLabelParts(
	biosphere: BiosphereProfile | null | undefined,
): { base: string; suffix?: string } {
	if (!biosphere || biosphere.code <= 0) return { base: "Sterile" }
	const base = BIOSPHERE_CODE_LABEL[biosphere.code] ?? `Code ${biosphere.code}`
	const suffix = biosphere.label
		? BIOSPHERE_LABEL_SUFFIX[biosphere.label]
		: undefined
	return { base, suffix }
}

// Habitability has no code->label table like biosphere's (it's a signed
// modifier sum, not a dice-table result) -- just the signed score itself.
export function formatHabitabilityValue(
	habitability: { code: number } | null | undefined,
): string {
	if (!habitability) return "—"
	return habitability.code > 0
		? `+${habitability.code}`
		: `${habitability.code}`
}

// Ported from galaxy-gen's getHabitabilityCategory (components/statistics/
// Habitability.tsx), minus its "(N)" threshold suffix.
export function habitabilityCategoryLabel(code: number): string {
	if (code <= 0) return "Hostile"
	if (code <= 2) return "Barely Habitable"
	if (code <= 4) return "Marginally Survivable"
	if (code <= 6) return "Regionally Habitable"
	if (code <= 8) return "Suitable"
	return "Garden World"
}

export function describeTemperatureK(kelvin: number): string {
	return kelvin <= 223
		? "Frozen"
		: kelvin <= 273.15
			? "Cold"
			: kelvin <= 303.15
				? "Temperate"
				: kelvin <= 353.15
					? "Hot"
					: "Burning"
}

// Mirrors TEMPERATURE_COLORS in galaxy-body-distributions.ts, keyed to the
// same Frozen/Cold/Temperate/Hot/(Scorching->Burning) buckets as
// describeTemperatureK above.
export function temperatureSwatchColor(kelvin: number): string {
	switch (describeTemperatureK(kelvin)) {
		case "Frozen":
			return "#a8d8f0"
		case "Cold":
			return "#6bb6de"
		case "Temperate":
			return "#8fcf7f"
		case "Hot":
			return "#f7a463"
		default:
			return "#e0524f"
	}
}

export function formatAvgTempValue(
	avgTempK: number,
	unitSystem: UnitSystem,
): string {
	return formatTemperature(avgTempK - 273.15, unitSystem, 1, {
		compact: true,
	})
}

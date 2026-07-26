import type { AtmosphereProfile } from "@/model/celestial/orbit-body/types"
import {
	formatTemperature,
	type UnitSystem,
} from "../../../planet/screen/shared/ui-format"

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

export function formatAtmosphereLabel(
	atmosphere: AtmosphereProfile | null | undefined,
): string {
	if (!atmosphere) return "Vacuum"
	return `${formatPressureBar(atmosphere.pressureBar)} · ${formatAtmosphereSuffix(atmosphere)}`
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

export function formatAtmosphereSuffix(atmosphere: AtmosphereProfile): string {
	if (atmosphere.type === "vacuum") return "Vacuum"
	if (atmosphere.type === "trace") return "Trace"
	if (atmosphere.type === "breathable") return "Breathable"
	if (atmosphere.type === "corrosive") return "Corrosive"
	if (atmosphere.type === "insidious") return "Insidious"
	if (atmosphere.type === "gas" && atmosphere.subtype === "helium")
		return "Helium"
	if (atmosphere.type === "gas" && atmosphere.subtype === "hydrogen")
		return "Hydrogen"
	return "Exotic"
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

export function formatAvgTempValue(
	avgTempK: number,
	unitSystem: UnitSystem,
): string {
	return formatTemperature(avgTempK - 273.15, unitSystem, 1, {
		compact: true,
	})
}

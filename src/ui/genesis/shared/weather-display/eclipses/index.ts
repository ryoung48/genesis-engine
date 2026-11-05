import { ECLIPSES } from "@/model/celestial/eclipses"
import type {
	EclipseKind,
	PlanetEclipse,
} from "@/model/celestial/eclipses/types"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import { WEATHER_ECLIPSES } from "@/model/climate/weather/local/sky/eclipses"
import { formatClockTimeDisplay } from "@/ui/genesis/shared/clock"
import type {
	EclipseCombinedRowParams,
	EclipsePlanetParams,
	EclipseRowParams,
	EclipseRowsParams,
	EclipseTimeParams,
} from "@/ui/genesis/shared/weather-display/eclipses/types"
import type { WeatherSkyRow } from "@/ui/genesis/shared/weather-display/types"

const labels: Record<EclipseKind, string> = {
	"solar-partial": "Partial solar eclipse",
	"solar-annular": "Annular solar eclipse",
	"solar-total": "Total solar eclipse",
	"lunar-penumbral": "Penumbral lunar eclipse",
	"lunar-partial": "Partial lunar eclipse",
	"lunar-total": "Total lunar eclipse",
	"shadow-penumbral": "Penumbral moon shadow",
	"shadow-partial": "Partial moon shadow",
	"shadow-total": "Total moon shadow",
	"occultation-partial": "Partial occultation",
	"occultation-annular": "Annular occultation",
	"occultation-total": "Total occultation",
}

function describe(event: PlanetEclipse): string {
	const category = ECLIPSES.category(event.kind)
	const bodies =
		category === "shadow"
			? `${event.occluderLabel}'s shadow on ${event.moonLabel}`
			: category === "occultation"
				? `${event.occluderLabel} occults ${event.moonLabel}`
				: event.moonLabel
	return `${labels[event.kind]} · ${bodies}`
}

function when({
	maximumS,
	localHour,
	dayOffset: day,
	instant,
}: EclipseTimeParams): string {
	const year = Math.floor(maximumS / instant.yearSeconds)
	const date = Math.floor(
		(maximumS - year * instant.yearSeconds) / instant.rotationSeconds,
	)
	return localHour === null
		? `Year ${year}, Day ${date} · No day cycle`
		: `${formatClockTimeDisplay(localHour, (instant.solarDaySeconds ?? instant.rotationSeconds) / 3600, true)}${dayOffset(day)}`
}

function dayOffset(day: number): string {
	return day === 0
		? ""
		: day === 1
			? " tomorrow"
			: ` ${day > 0 ? "+" : ""}${day} d`
}

function row({ event, instant, current }: EclipseRowParams): WeatherSkyRow {
	const solar = ECLIPSES.category(event.kind) === "solar"
	const maximum = when({ ...event, instant })
	return {
		key: `eclipse-${event.moonIdx}-${event.occluderIdx}-${event.kind}-${event.ingressS}`,
		name: current ? "Eclipse in progress" : "Next eclipse",
		detail: `${describe(event)}${current && event.instantaneousCoverage !== null ? ` · ${Math.round(event.instantaneousCoverage * 100)}% covered` : ""}`,
		icon: solar ? "weather-sunny" : "moon-full",
		moon: null,
		tone: solar ? "sun" : "night",
		items: [
			{
				label: "Visible maximum",
				value: maximum,
				icon: "weather-sunny",
			},
			{
				label: "Visible duration",
				value: `${(event.durationS / 3600).toFixed(2)} h${event.durationClipped ? " (clipped)" : ""}`,
				icon: "weather-night",
			},
			...(event.coverage !== null
				? [
						{
							label: "Coverage",
							value: `${Math.round(event.coverage * 100)}%`,
							icon: "weather-sunny" as const,
						},
					]
				: []),
		],
	}
}

function combinedRow({
	group,
	instant,
}: EclipseCombinedRowParams): WeatherSkyRow {
	return {
		key: `eclipse-combined-${group.current}-${group.maximumS}`,
		name: group.current
			? "Combined eclipse in progress"
			: "Next combined eclipse",
		detail: `${group.total ? "Total" : "Partial"} combined solar eclipse · ${group.moonLabels.join(" + ")}${group.instantaneousCoverage !== null ? ` · ${Math.round(group.instantaneousCoverage * 100)}% covered` : ""}`,
		icon: "weather-sunny",
		moon: null,
		tone: "sun",
		items: [
			{
				label: "Visible maximum",
				value: when({ ...group, instant }),
				icon: "weather-sunny",
			},
			{
				label: "Combined coverage",
				value: `${Math.round(group.coverage * 100)}%`,
				icon: "weather-sunny",
			},
		],
	}
}

function rows({ result, instant }: EclipseRowsParams): WeatherSkyRow[] {
	const seen = new Set<string>()
	const rows = [true, false].flatMap((current) => [
		...(current ? result.current : result.next).flatMap((event) => {
			const display = row({ event, current, instant })
			if (seen.has(display.key)) return []
			seen.add(display.key)
			return [display]
		}),
		...result.combined
			.filter((group) => group.current === current)
			.map((group) => combinedRow({ group, instant })),
	])
	const none = !rows.length
	if (result.unavailable.length)
		rows.push({
			key: "eclipse-unavailable",
			name: "Eclipses",
			detail: `Unavailable for ${result.unavailable.join(", ")}`,
			icon: "weather-sunny",
			moon: null,
			tone: "night",
			items: [],
		})
	if (result.status === "unavailable" || none)
		rows.push({
			key: "eclipse-status",
			name: "Eclipses",
			detail:
				result.status === "unavailable"
					? "Unavailable"
					: `None in the next ${WEATHER_ECLIPSES.horizonYears} years`,
			icon: "weather-sunny",
			moon: null,
			tone: "night",
			items: [],
		})
	return rows
}

function planet({ params }: EclipsePlanetParams): string | null {
	const instant = WEATHER_CLOCK.resolve({
		params,
		elapsedYears: 0,
		manual: null,
	})
	const { status, event } = WEATHER_ECLIPSES.next({ params, startS: 0 })
	if (status === "unavailable") return "Eclipse geometry unavailable"
	if (!event) return null
	const year = Math.floor(event.maximumS / instant.yearSeconds)
	const day = Math.floor(
		(event.maximumS - year * instant.yearSeconds) / instant.rotationSeconds,
	)
	return `${year === 0 ? "" : `Year ${year}, `}Day ${day} · ${describe(event)}`
}

export const ECLIPSE_DISPLAY = { rows, planet, dayOffset }

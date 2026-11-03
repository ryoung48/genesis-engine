import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type { CloudGenus } from "@/model/climate/weather/local/clouds/types"
import { WEATHER_COMFORT } from "@/model/climate/weather/local/comfort"
import { WEATHER_DESCRIPTION } from "@/model/climate/weather/local/description"
import { WEATHER_SKY } from "@/model/climate/weather/local/sky"
import type {
	MoonPhase,
	SkyCycle,
} from "@/model/climate/weather/local/sky/types"
import type { LocalWeatherValues } from "@/model/climate/weather/local/types"
import { WEATHER_VOCABULARY } from "@/model/climate/weather/local/vocabulary"
import type { WeatherPhenomenon } from "@/model/climate/weather/local/vocabulary/types"
import { TEXT } from "@/model/shared/text"
import type { WeatherIconName } from "@/ui/components/primitives/icons/types"
import { formatClockTimeDisplay } from "@/ui/genesis/shared/clock"
import { monthLabels } from "@/ui/genesis/shared/constants"
import {
	formatPrecipitation,
	formatRainRate,
	formatTemperature,
	formatWindSpeed,
	windDirectionLabel,
} from "@/ui/genesis/shared/ui-format"
import type {
	PresentHourlyParams,
	PresentMonthlyParams,
	PresentSkyParams,
	PresentWeatherParams,
	WeatherHourlyDisplay,
	WeatherMonthlySeries,
	WeatherMoonPhaseDisplay,
	WeatherSkyClockParams,
	WeatherSkyDisplay,
	WeatherSkyRow,
	WeatherTile,
	WeatherTone,
} from "@/ui/genesis/shared/weather-display/types"

const cloudLabels: Record<CloudGenus, string> = {
	cirrus: "Cirrus clouds",
	altostratus: "Altostratus clouds",
	altocumulus: "Altocumulus clouds",
	stratus: "Stratus clouds",
	nimbostratus: "Nimbostratus clouds",
	cumulus: "Cumulus clouds",
	cumulonimbus: "Cumulonimbus clouds",
}

const phenomenonIcons: Record<WeatherPhenomenon, WeatherIconName> = {
	"clear skies": "weather-sunny",
	cloudy: "weather-cloudy",
	dew: "water",
	"thin mist": "weather-hazy",
	mist: "weather-hazy",
	fog: "weather-fog",
	rime: "weather-fog",
	"ice fog": "weather-fog",
	drizzle: "weather-rainy",
	"spattering rain": "weather-rainy",
	"rain shower": "weather-partly-rainy",
	"pelting rain": "weather-pouring",
	"quiet downpour": "weather-pouring",
	thunderstorm: "weather-lightning-rainy",
	sleet: "weather-snowy-rainy",
	"cold surface": "snowflake-thermometer",
	"thin frost": "snowflake",
	frost: "snowflake",
	dusting: "weather-partly-snowy",
	"tiny flakes": "weather-partly-snowy",
	"ice crystals": "weather-partly-snowy",
	"snow flurry": "weather-partly-snowy",
	snowfall: "weather-snowy",
	blizzard: "weather-snowy-heavy",
	"sand storm": "weather-dust",
	"dust storm": "weather-dust",
}
const iconTones: Record<WeatherIconName, WeatherTone> = {
	"weather-sunny": "sun",
	"weather-night": "night",
	"weather-partly-cloudy": "sun",
	"weather-night-partly-cloudy": "night",
	"weather-cloudy": "cloud",
	"weather-fog": "fog",
	"weather-hazy": "fog",
	"weather-rainy": "rain",
	"weather-partly-rainy": "rain",
	"weather-pouring": "rain",
	"weather-lightning-rainy": "storm",
	"weather-snowy-rainy": "snow",
	"weather-snowy": "snow",
	"weather-partly-snowy": "snow",
	"weather-snowy-heavy": "snow",
	"weather-dust": "dust",
	"weather-windy": "wind",
	"weather-sunset-up": "sun",
	"weather-sunset-down": "sun",
	windsock: "wind",
	water: "rain",
	snowflake: "snow",
	"snowflake-thermometer": "snow",
	thermometer: "cloud",
	umbrella: "rain",
	cloud: "cloud",
	"sun-angle": "sun",
	"moon-new": "night",
	"moon-waxing-crescent": "night",
	"moon-first-quarter": "night",
	"moon-waxing-gibbous": "night",
	"moon-full": "night",
	"moon-waning-gibbous": "night",
	"moon-last-quarter": "night",
	"moon-waning-crescent": "night",
	"weather-moonset-up": "night",
	"weather-moonset-down": "night",
}

function conditionIcon(values: LocalWeatherValues): WeatherIconName {
	const kind = values.dominant ?? "clear skies"
	if (kind === "clear skies")
		return values.daylight ? "weather-sunny" : "weather-night"
	if (kind !== "cloudy") return phenomenonIcons[kind]
	if (values.system === "windy") return "weather-windy"
	if (values.cloudDescription === "haze") return "weather-hazy"
	if (values.cloudCover !== null && values.cloudCover < 0.7)
		return values.daylight
			? "weather-partly-cloudy"
			: "weather-night-partly-cloudy"
	return "weather-cloudy"
}
function timeIcon(label: string): WeatherIconName {
	return label === "Dawn"
		? "weather-sunset-up"
		: label === "Dusk"
			? "weather-sunset-down"
			: label === "Night" || label === "Polar night" || label === "Dark"
				? "weather-night"
				: "weather-sunny"
}

function conditionLabel(kind: string): string {
	if (kind.startsWith("system:")) return TEXT.capitalize(kind.slice(7))
	return TEXT.capitalize(kind)
}
function cloudLabel(kind: string): string {
	return kind === "clear"
		? "Clear skies"
		: kind === "unavailable"
			? "Unavailable"
			: Object.hasOwn(cloudLabels, kind)
				? cloudLabels[kind as CloudGenus]
				: kind
}
function cloudDescription(values: LocalWeatherValues): string {
	const category = WEATHER_VOCABULARY.cloud(values)
	return category ? TEXT.capitalize(category) : "Unavailable"
}

function seasonDescription(snapshot: PresentWeatherParams["snapshot"]): string {
	const { instant, values } = snapshot
	if (!values) return "Unavailable"
	return WEATHER_CLOCK.season({ instant, latitudeDeg: values.latitudeDeg })
}

function timeOfDayDescription(
	snapshot: PresentWeatherParams["snapshot"],
): string {
	const { instant, values } = snapshot
	if (!values) return "Unavailable"
	if (
		instant.locked ||
		instant.solarDaySeconds === null ||
		values.localHour === null
	)
		return values.daylight ? "Illuminated" : "Dark"
	const phase = (values.localHour * 3600) / instant.solarDaySeconds
	const latitude = (values.latitudeDeg * Math.PI) / 180
	const declination = Math.asin(Math.max(-1, Math.min(1, instant.sun[2])))
	const crossing = -Math.tan(latitude) * Math.tan(declination)
	if (crossing < -1) return "Polar day"
	if (crossing > 1) return "Polar night"
	if (values.solarElevationDeg >= -6 && values.solarElevationDeg <= 0)
		return phase < 0.5 ? "Dawn" : "Dusk"
	return values.daylight ? (phase < 0.5 ? "Morning" : "Afternoon") : "Night"
}

function present({ snapshot, unitSystem, dateLabel }: PresentWeatherParams) {
	const values = snapshot.values
	if (!values) return null
	const conditions = WEATHER_VOCABULARY.describeAll(values)
		.map((label, index) => (index === 0 ? TEXT.capitalize(label) : label))
		.join(" and ")

	const coverage = values.cloudCover
	const sky = WEATHER_DESCRIPTION.skyLabel(WEATHER_DESCRIPTION.sky(coverage))
	const localTime =
		values.localHour === null
			? values.daylight
				? "Illuminated"
				: "Dark"
			: `${formatClockTimeDisplay(values.localHour, (snapshot.instant.solarDaySeconds ?? 86400) / 3600, true)} local solar time · ${timeOfDayDescription(snapshot)}`
	const departure = WEATHER_DESCRIPTION.departure(values)
	const anomaly =
		departure === "warmerThanUsual"
			? "warmer than usual"
			: departure === "colderThanUsual"
				? "colder than usual"
				: null

	const timeOfDay =
		values.localHour === null
			? values.daylight
				? "Illuminated"
				: "Dark"
			: timeOfDayDescription(snapshot)
	const icon = conditionIcon(values)
	const display = {
		icon,
		tone: iconTones[icon],
		temperatureValue: formatTemperature(values.temperatureC, unitSystem),
		temperatureLabel: WEATHER_DESCRIPTION.temperature(values.temperatureC),
		anomaly:
			departure === "warmerThanUsual"
				? ("warm" as const)
				: departure === "colderThanUsual"
					? ("cold" as const)
					: null,
		anomalyLabel: anomaly,
		conditions: conditions || "Unavailable",
		temperature: `${WEATHER_DESCRIPTION.temperature(values.temperatureC)}${anomaly ? ` (${anomaly})` : ""} · ${formatTemperature(values.temperatureC, unitSystem)}`,
		wind: `${WEATHER_DESCRIPTION.wind(values.windSpeedMs)} · ${values.windDirectionDeg === null ? "" : `${windDirectionLabel(values.windU, values.windV)} `}${formatWindSpeed({ value: values.windSpeedMs, unitSystem })}`,
		gusts: formatWindSpeed({ value: values.gustMs, unitSystem }),
		rain: formatRainRate({ value: values.rainRateMmH, unitSystem }),
		sky: `${sky}${coverage === null ? "" : ` · ${Math.round(coverage * 100)}%`}`,
		clouds: cloudDescription(values),
		time: `${dateLabel} · ${localTime}`,
	}
	const relativeHumidity = WEATHER_COMFORT.relativeHumidity({
		temperatureC: values.temperatureC,
		dewPointC: values.dewPointC,
	})
	const tiles: WeatherTile[] = [
		{
			label: "Feels like",
			value: formatTemperature(
				WEATHER_COMFORT.apparentTemperature({
					temperatureC: values.temperatureC,
					relativeHumidity,
					windSpeedMs: values.windSpeedMs,
				}),
				unitSystem,
			),
			icon: "thermometer",
			help: "Heat index at or above 27 °C, wind chill at or below 10 °C with wind over 1.3 m/s, otherwise the air temperature (US National Weather Service formulas).",
			wide: false,
		},
		{
			label: "Humidity",
			value:
				relativeHumidity === null || values.dewPointC === null
					? "Unavailable"
					: `${Math.round(relativeHumidity)}% · dew point ${formatTemperature(values.dewPointC, unitSystem)}`,
			icon: "water",
			help: "Relative humidity from the temperature and dew point.",
			wide: false,
		},
		{
			label: "Wind",
			value: display.wind,
			icon: "weather-windy",
			help: null,
			wide: false,
		},
		{
			label: "Gusts",
			value: display.gusts,
			icon: "windsock",
			help: null,
			wide: false,
		},
		{
			label: "Precipitation",
			value: display.rain,
			icon: "umbrella",
			help: "Liquid-water equivalent rate, including snow, ice pellets and hail; this is not snow depth.",
			wide: false,
		},
		{
			label: "Sky",
			value: display.sky,
			icon: "cloud",
			help: null,
			wide: false,
		},
		{
			label: "Clouds",
			value: display.clouds,
			icon: "weather-cloudy",
			help: "Representative estimated cloud type for this province. Sky coverage is shown separately.",
			wide: false,
		},
		{
			label: "Season",
			value: seasonDescription(snapshot),
			icon: "sun-angle",
			help: "Astronomical season for the representative location and hemisphere, not a wet/dry-season classification.",
			wide: false,
		},
		{
			label: "Local time",
			value: localTime,
			icon: timeIcon(timeOfDay),
			help: null,
			wide: true,
		},
	]
	return {
		...display,
		tiles,
	}
}

function hourly({
	outlook,
	unitSystem,
	solarDaySeconds,
}: PresentHourlyParams): WeatherHourlyDisplay {
	const bare = (text: string) => text.replace(/ [^ ]+$/, "")
	return {
		precipitationUnit: formatRainRate({ value: 0, unitSystem }).replace(
			/^[^ ]+ /,
			"",
		),
		cells: outlook.hourly.map((hour) => {
			const icon = conditionIcon(hour.values)
			const rate = hour.values.rainRateMmH
			return {
				key: hour.hoursAhead,
				label:
					hour.hoursAhead === 0
						? "Now"
						: hour.values.localHour === null
							? `+${hour.hoursAhead}h`
							: formatClockTimeDisplay(
									Math.floor(hour.values.localHour),
									(solarDaySeconds ?? 86400) / 3600,
									true,
								).replace(":00 ", " "),
				icon,
				tone: iconTones[icon],
				temperatureC: hour.values.temperatureC,
				temperature: formatTemperature(hour.values.temperatureC, unitSystem, 0),
				precipitationMmH: rate,
				precipitation:
					rate < 0.05
						? ""
						: bare(
								formatPrecipitation(
									rate,
									unitSystem,
									unitSystem === "imperial" ? 2 : 1,
								),
							),
				precipitationTone:
					hour.values.precipitation.snow + hour.values.precipitation.ice > 0.5
						? "snow"
						: "rain",
			}
		}),
	}
}

function monthly({
	outlook,
	phase,
}: PresentMonthlyParams): WeatherMonthlySeries {
	return {
		labels: monthLabels.slice(1, 13).map((label) => label[0]),
		names: monthLabels.slice(1, 13),
		temperatureC: outlook.monthly.map((month) => month.temperatureC),
		rainMm: outlook.monthly.map((month) => month.rainMm),
		windSpeedMs: outlook.monthly.map((month) => month.windSpeedMs),
		activeIndex: Math.min(11, Math.floor(phase * 12)),
	}
}

const moonPhases: Record<MoonPhase, WeatherMoonPhaseDisplay> = {
	new: { label: "New moon", icon: "moon-new" },
	waxingCrescent: { label: "Waxing crescent", icon: "moon-waxing-crescent" },
	firstQuarter: { label: "First quarter", icon: "moon-first-quarter" },
	waxingGibbous: { label: "Waxing gibbous", icon: "moon-waxing-gibbous" },
	full: { label: "Full moon", icon: "moon-full" },
	waningGibbous: { label: "Waning gibbous", icon: "moon-waning-gibbous" },
	lastQuarter: { label: "Last quarter", icon: "moon-last-quarter" },
	waningCrescent: { label: "Waning crescent", icon: "moon-waning-crescent" },
}
const cycleLabels: Record<Exclude<SkyCycle, "cycle">, string> = {
	alwaysUp: "Up all day",
	neverUp: "Below horizon",
	locked: "No day cycle",
}

function sky({ snapshot, moons }: PresentSkyParams): WeatherSkyDisplay | null {
	const values = snapshot.values
	if (!values) return null
	const input = { instant: snapshot.instant, latitudeDeg: values.latitudeDeg }
	const dayHours = (snapshot.instant.solarDaySeconds ?? 86400) / 3600
	const clock = ({ hour, cycle }: WeatherSkyClockParams) =>
		cycle === "cycle" && hour !== null
			? formatClockTimeDisplay(hour, dayHours, true)
			: cycle === "cycle"
				? "—"
				: cycleLabels[cycle]
	const duration = (hours: number | null) =>
		hours === null ? "—" : `${hours.toFixed(1)} h`
	const sun = WEATHER_SKY.sun(input)
	const polar =
		sun.cycle === "alwaysUp"
			? "Polar day"
			: sun.cycle === "neverUp"
				? "Polar night"
				: null
	const sunRow: WeatherSkyRow = {
		key: "sun",
		name: "Sun",
		detail: polar,
		icon: "weather-sunny",
		tone: "sun",
		items: [
			{
				label: "Sunrise",
				value: polar ? "—" : clock({ hour: sun.riseHour, cycle: sun.cycle }),
				icon: "weather-sunset-up",
			},
			{
				label: "Sunset",
				value: polar ? "—" : clock({ hour: sun.setHour, cycle: sun.cycle }),
				icon: "weather-sunset-down",
			},
			{
				label: "Daylight",
				value: duration(sun.daylightHours),
				icon: "weather-sunny",
			},
		],
	}
	return {
		rows: [
			sunRow,
			...WEATHER_SKY.moons({ ...input, moons }).map(
				(moon): WeatherSkyRow => ({
					key: `moon-${moon.label}`,
					name: moon.label,
					detail: `${moonPhases[moon.phase].label} · ${Math.round(moon.illumination * 100)}%`,
					icon: moonPhases[moon.phase].icon,
					tone: "night",
					items: [
						{
							label: "Moonrise",
							value: clock({ hour: moon.riseHour, cycle: moon.cycle }),
							icon: "weather-moonset-up",
						},
						{
							label: "Moonset",
							value: clock({ hour: moon.setHour, cycle: moon.cycle }),
							icon: "weather-moonset-down",
						},
						{
							label: "Moonlight (moon above the horizon)",
							value: duration(moon.upHours),
							icon: "weather-night",
						},
					],
				}),
			),
		],
	}
}

export const WEATHER_DISPLAY = {
	present,
	sky,
	hourly,
	monthly,
	conditionLabel,
	cloudLabel,
}

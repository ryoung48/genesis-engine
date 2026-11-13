import { TIDAL_CONTRIBUTORS } from "@/model/climate/ocean/tides/tidal-schedule/contributors"
import { APPARENT_TEMP } from "@/model/climate/temperature/apparent-temp"
import { WEATHER_CLOCK } from "@/model/climate/weather/local/clock"
import type { CloudGenus } from "@/model/climate/weather/local/clouds/types"
import { WEATHER_COMFORT } from "@/model/climate/weather/local/comfort"
import { WEATHER_DESCRIPTION } from "@/model/climate/weather/local/description"
import { WEATHER_MARINE } from "@/model/climate/weather/local/marine"
import type { MarineTideEvent } from "@/model/climate/weather/local/marine/tide/types"
import type { MarineSeaState } from "@/model/climate/weather/local/marine/waves/types"
import { WEATHER_SKY } from "@/model/climate/weather/local/sky"
import { WEATHER_ECLIPSES } from "@/model/climate/weather/local/sky/eclipses"
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
	compassLabel,
	formatDurationHours,
	formatHeight,
	formatPrecipitation,
	formatRainRate,
	formatTemperature,
	formatWindSpeed,
	windDirectionLabel,
} from "@/ui/genesis/shared/ui-format"
import { ECLIPSE_DISPLAY } from "@/ui/genesis/shared/weather-display/eclipses"
import type {
	PresentHourlyParams,
	PresentMonthlyParams,
	PresentSeaParams,
	PresentSkyParams,
	PresentWeatherParams,
	WeatherHourlyDisplay,
	WeatherMonthlySeries,
	WeatherMoonPhaseDisplay,
	WeatherSeaDisplay,
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
	stratocumulus: "Stratocumulus clouds",
	stratus: "Stratus clouds",
	nimbostratus: "Nimbostratus clouds",
	cumulus: "Cumulus clouds",
	cumulonimbus: "Cumulonimbus clouds",
}

const phenomenonIcons: Record<WeatherPhenomenon, WeatherIconName> = {
	"clear skies": "weather-sunny",
	cloudy: "weather-cloudy",
	dew: "water",
	frost: "snowflake",
	mist: "weather-hazy",
	haze: "weather-hazy",
	fog: "weather-fog",
	"freezing fog": "weather-fog",
	"ice fog": "weather-fog",
	"ice crystals": "snowflake",
	drizzle: "weather-partly-rainy",
	"freezing drizzle": "weather-snowy-rainy",
	"light rain": "weather-rainy",
	"moderate rain": "weather-rainy",
	"heavy rain": "weather-pouring",
	"light showers": "weather-partly-rainy",
	"rain showers": "weather-rainy",
	"freezing rain": "weather-snowy-rainy",
	"rain and snow": "weather-snowy-rainy",
	thunderstorm: "weather-lightning-rainy",
	hail: "weather-lightning-rainy",
	tornado: "weather-tornado",
	thundersnow: "weather-lightning-rainy",
	"light snow": "weather-partly-snowy",
	"moderate snow": "weather-snowy",
	"heavy snow": "weather-snowy-heavy",
	"snow showers": "weather-partly-snowy",
	"heavy snow showers": "weather-snowy-heavy",
	"drifting snow": "weather-windy",
	blizzard: "weather-snowy-heavy",
	"blowing sand": "weather-dust",
	"blowing dust": "weather-dust",
	"sand storm": "weather-dust",
	"dust storm": "weather-dust",
	"tropical storm": "weather-pouring",
	hurricane: "weather-pouring",
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
	"weather-tornado": "storm",
	"weather-windy": "wind",
	"weather-sunset-up": "sun",
	"weather-sunset-down": "sun",
	fire: "sun",
	water: "rain",
	snowflake: "snow",
	cloud: "cloud",
	"sun-angle": "sun",
	flower: "sun",
	"leaf-maple": "dust",
	"moon-new": "night",
	"moon-waxing-crescent": "night",
	"moon-first-quarter": "night",
	"moon-waxing-gibbous": "night",
	"moon-full": "night",
	"moon-waning-gibbous": "night",
	"moon-last-quarter": "night",
	"moon-waning-crescent": "night",
	"lunar-eclipse": "night",
	"solar-eclipse": "sun",
	"weather-moonset-up": "night",
	"weather-moonset-down": "night",
	"arrow-up": "sea",
	"arrow-down": "sea",
	waves: "sea",
	tide: "sea",
}

function conditionIcon(values: LocalWeatherValues): WeatherIconName {
	const kind = values.dominant ?? "clear skies"
	if (kind === "clear skies")
		return values.daylight ? "weather-sunny" : "weather-night"
	if (kind !== "cloudy") return phenomenonIcons[kind]
	if (values.system === "windy") return "weather-windy"
	if (values.cloudCover !== null && values.cloudCover < 0.7)
		return values.daylight
			? "weather-partly-cloudy"
			: "weather-night-partly-cloudy"
	return "weather-cloudy"
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
function skyDescription(values: LocalWeatherValues): string {
	const coverage = values.cloudCover
	const sky = WEATHER_DESCRIPTION.skyLabel(WEATHER_DESCRIPTION.sky(coverage))
	return coverage === null ? sky : `${sky} · ${Math.round(coverage * 100)}%`
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

function conditionDescription(values: LocalWeatherValues): string {
	return (
		WEATHER_VOCABULARY.describeAll(values)
			.map((label, index) => (index === 0 ? TEXT.capitalize(label) : label))
			.join(" and ") || "Unavailable"
	)
}

function present({ snapshot, unitSystem, dateLabel }: PresentWeatherParams) {
	const values = snapshot.values
	if (!values) return null
	const conditions = conditionDescription(values)

	const localTime =
		values.localHour === null
			? values.daylight
				? "Illuminated"
				: "Dark"
			: `${formatClockTimeDisplay(values.localHour, (snapshot.instant.solarDaySeconds ?? 86400) / 3600, true)} · ${timeOfDayDescription(snapshot)}`
	const departure = WEATHER_DESCRIPTION.departure(values)
	const anomaly =
		departure === "warmerThanUsual"
			? "warmer than usual"
			: departure === "colderThanUsual"
				? "colder than usual"
				: null

	const icon = conditionIcon(values)
	const season = seasonDescription(snapshot)
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
		conditions,
		temperature: `${WEATHER_DESCRIPTION.temperature(values.temperatureC)}${anomaly ? ` (${anomaly})` : ""} · ${formatTemperature(values.temperatureC, unitSystem)}`,
		wind: `${WEATHER_DESCRIPTION.wind(values.windSpeedMs)} · ${values.windDirectionDeg === null ? "" : `${windDirectionLabel(values.windU, values.windV)} `}${formatWindSpeed({ value: values.windSpeedMs, unitSystem })}`,
		gusts: formatWindSpeed({ value: values.gustMs, unitSystem }),
		rain: formatRainRate({ value: values.rainRateMmH, unitSystem }),
		sky: skyDescription(values),
		clouds: cloudDescription(values),
		time: `${dateLabel} · ${season} · ${localTime}`,
	}
	const relativeHumidity = WEATHER_COMFORT.relativeHumidity({
		temperatureC: values.temperatureC,
		dewPointC: values.dewPointC,
	})
	const feelsLikeC =
		relativeHumidity === null
			? null
			: APPARENT_TEMP.apparentTemperatureC({
					tempC: values.temperatureC,
					rhPercent: relativeHumidity,
					windSpeedMs: values.windSpeedMs,
				})
	const tiles: WeatherTile[] = [
		{
			label: "Feels like",
			value:
				feelsLikeC === null
					? "Unavailable"
					: formatTemperature(feelsLikeC, unitSystem),
			icon: feelsLikeC !== null && feelsLikeC < 9 ? "snowflake" : "fire",
			help: "Universal Thermal Climate Index (UTCI) in shade, based on air temperature, humidity, and wind speed.",
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
			icon: "weather-windy",
			help: null,
			wide: false,
		},
		{
			label: "Precipitation",
			value: display.rain,
			icon: "weather-rainy",
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
	const unit = (text: string) => text.replace(/^[^ ]+ /, "")
	return {
		windUnit: unit(formatWindSpeed({ value: 0, unitSystem })),
		precipitationUnit: unit(formatRainRate({ value: 0, unitSystem })),
		cells: outlook.hourly.map((hour) => {
			const icon = conditionIcon(hour.values)
			const rate = hour.values.rainRateMmH
			return {
				key: hour.hoursAhead,
				conditions: conditionDescription(hour.values),
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
				windSpeed: bare(
					formatWindSpeed({ value: hour.values.windSpeedMs, unitSystem }),
				),
				windSpeedMs: hour.values.windSpeedMs,
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
		daylightHours: outlook.monthly.map((month) => month.daylightHours),
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

function sky({
	snapshot,
	moons,
	params,
	xyz,
}: PresentSkyParams): WeatherSkyDisplay | null {
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
		moon: null,
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
				value: formatDurationHours(sun.daylightHours),
				icon: "weather-sunny",
			},
		],
	}
	return {
		rows: [
			sunRow,
			...WEATHER_SKY.moons({
				...input,
				params,
				moons: TIDAL_CONTRIBUTORS.prepare({ params, moons }).moons,
			}).map(
				(moon): WeatherSkyRow => ({
					key: `moon-${moon.label}`,
					name: moon.label,
					detail: `${moonPhases[moon.phase].label} · ${Math.round(moon.illumination * 100)}%`,
					icon: moonPhases[moon.phase].icon,
					moon: {
						illumination: moon.illumination,
						waxing: moon.waxing,
					},
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
							value: formatDurationHours(moon.upHours),
							icon: "weather-night",
						},
					],
				}),
			),
		],
		eclipses: xyz
			? ECLIPSE_DISPLAY.rows({
					result: WEATHER_ECLIPSES.local({
						params,
						xyz,
						instant: snapshot.instant,
					}),
					instant: snapshot.instant,
				})
			: [],
	}
}

const seaStateLabels: Record<MarineSeaState, string> = {
	calm: "Calm",
	smooth: "Smooth",
	slight: "Slight",
	moderate: "Moderate",
	rough: "Rough",
	veryRough: "Very rough",
	high: "High",
	veryHigh: "Very high",
	phenomenal: "Phenomenal",
	iceCovered: "Ice-covered",
}
const directionArrows = { rising: "↑", falling: "↓", steady: "→" }

function sea({
	snapshot,
	moons,
	params,
	unitSystem,
}: PresentSeaParams): WeatherSeaDisplay | null {
	const marine = snapshot.marine
	if (!marine) return null
	const height = (value: number) => formatHeight({ value, unitSystem })
	const signed = (value: number) => `${value > 0 ? "+" : ""}${height(value)}`
	const dayHours = (snapshot.instant.solarDaySeconds ?? 86400) / 3600
	const eventValue = (event: MarineTideEvent | null) => {
		if (!event) return { value: "—", detail: null }
		const time =
			event.localHour === null
				? "—"
				: formatClockTimeDisplay(event.localHour, dayHours, true)
		return {
			value: `${time}${ECLIPSE_DISPLAY.dayOffset(event.dayOffset)}`,
			detail: signed(event.levelM),
		}
	}
	const tide = WEATHER_MARINE.tide({
		instant: snapshot.instant,
		moons,
		shore: marine.shore,
		params,
	})
	const tideRows: WeatherSkyRow[] = tide
		? [
				{
					key: "tide",
					name: "Tides",
					detail: `${signed(tide.levelM)} ${directionArrows[tide.direction]}`,
					detailHelp:
						"The current water level is relative to mean sea level, and the arrow shows whether it is rising or falling.",
					icon: "tide",
					tone: "sea",
					moon: null,
					items: [
						{
							label: "Next high tide (local time and height)",
							...eventValue(tide.high),
							icon: "arrow-up",
						},
						{
							label: "Next low tide (local time and height)",
							...eventValue(tide.low),
							icon: "arrow-down",
						},
					],
				},
			]
		: [
				{
					key: "tide",
					name: "Tides",
					detail: "No tidal cycle",
					icon: "tide",
					tone: "sea",
					moon: null,
					items: [],
				},
			]
	const waves = marine.waves
	const frozen = waves?.state === "iceCovered"
	return {
		rows: [
			...tideRows,
			{
				key: "waves",
				name: "Waves",
				detail:
					waves && !frozen && waves.fromDeg !== null
						? `From ${compassLabel(waves.fromDeg)}`
						: null,
				icon: "waves",
				tone: "sea",
				moon: null,
				items: [
					{
						label: "Significant wave height and sea state",
						value: !waves
							? "Unavailable"
							: frozen
								? seaStateLabels.iceCovered
								: `${height(waves.heightM)} · ${seaStateLabels[waves.state]}`,
						icon: "waves",
					},
				],
			},
		],
	}
}

export const WEATHER_DISPLAY = {
	present,
	sky,
	sea,
	hourly,
	monthly,
	conditionLabel,
	cloudLabel,
}

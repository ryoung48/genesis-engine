import type { MoonBody } from "@/model/celestial/moons/types"
import type { WeatherOutlook } from "@/model/climate/weather/local/outlook/types"
import type { SkyCycle } from "@/model/climate/weather/local/sky/types"
import type { WeatherSnapshot } from "@/model/climate/weather/local/types"
import type { GenesisParams } from "@/model/pipelines/types"
import type {
	MoonIconPhase,
	WeatherIconName,
} from "@/ui/components/primitives/icons/types"
import type { uiTokens } from "@/ui/components/tokens"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"

export interface PresentWeatherParams {
	snapshot: WeatherSnapshot
	unitSystem: UnitSystem
	dateLabel: string
}

export interface WeatherSummaryProps {
	snapshot: WeatherSnapshot | null
	outlook: WeatherOutlook | null
	moons: MoonBody[]
	params: GenesisParams | null
	xyz: [number, number, number] | null
	unitSystem: UnitSystem
	dateLabel: string
	loading: boolean
	error: string | null
	annual: boolean
	onSelectDate: () => void
}

export type WeatherTone = keyof typeof uiTokens.weather.tone

export interface WeatherTile {
	label: string
	value: string
	icon: WeatherIconName
	help: string | null
	wide: boolean
}

export type WeatherTab = "current" | "hourly" | "monthly"

export interface PresentHourlyParams {
	outlook: WeatherOutlook
	unitSystem: UnitSystem
	solarDaySeconds: number | null
}

export interface WeatherHourCell {
	key: number
	label: string
	conditions: string
	icon: WeatherIconName
	tone: WeatherTone
	temperatureC: number
	temperature: string
	windSpeed: string
	windSpeedMs: number
	precipitationMmH: number
	precipitation: string
	precipitationTone: WeatherTone
}

export interface WeatherHourlyDisplay {
	cells: WeatherHourCell[]
	windUnit: string
	precipitationUnit: string
}

export interface PresentMonthlyParams {
	outlook: WeatherOutlook
	phase: number
}

export interface WeatherMonthlySeries {
	labels: string[]
	names: string[]
	temperatureC: number[]
	rainMm: number[]
	windSpeedMs: number[]
	activeIndex: number
}

export interface WeatherHourlyProps {
	display: WeatherHourlyDisplay
}

export interface WeatherHourlyBar {
	key: number
	value: number
	label: string
	tooltip: string
	tone: WeatherTone
	color: string | null
}

export interface WeatherHourlyBarsProps {
	items: WeatherHourlyBar[]
	minimumScale: number
}

export interface WeatherMonthlyProps {
	series: WeatherMonthlySeries
	unitSystem: UnitSystem
}

export interface PresentSkyParams {
	snapshot: WeatherSnapshot
	moons: MoonBody[]
	params: GenesisParams
	xyz: [number, number, number] | null
}

export interface WeatherSkyItem {
	label: string
	value: string
	icon: WeatherIconName
}

export interface WeatherSkyRow {
	key: string
	name: string
	detail: string | null
	icon: WeatherIconName
	moon: MoonIconPhase | null
	tone: WeatherTone
	items: WeatherSkyItem[]
}

export interface WeatherSkyDisplay {
	rows: WeatherSkyRow[]
}

export interface PresentSeaParams {
	snapshot: WeatherSnapshot
	moons: MoonBody[]
	params: GenesisParams
	unitSystem: UnitSystem
}

export interface WeatherSeaDisplay {
	rows: WeatherSkyRow[]
}

export interface WeatherSkyRowsProps {
	label: string
	rows: WeatherSkyRow[]
}

export interface WeatherMoonPhaseDisplay {
	label: string
	icon: WeatherIconName
}

export interface WeatherSkyClockParams {
	hour: number | null
	cycle: SkyCycle
}

export interface WeatherTileProps {
	tile: WeatherTile
}

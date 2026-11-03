import type { WeatherOutlook } from "@/model/climate/weather/local/outlook/types"
import type { WeatherSnapshot } from "@/model/climate/weather/local/types"
import type { WeatherIconName } from "@/ui/components/primitives/icons/types"
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
	icon: WeatherIconName
	tone: WeatherTone
	temperatureC: number
	temperature: string
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
	cells: WeatherHourCell[]
}

export interface WeatherMonthlyProps {
	series: WeatherMonthlySeries
	unitSystem: UnitSystem
}

import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import type { WeatherSummaryProps } from "@/ui/genesis/shared/weather-display/types"

export interface ProvinceWikiNation {
	id: number
	name: string
	color: string | null
}

export interface ProvinceWikiData {
	province: number
	title: string
	planetTitle: string
	sourceId: number | null
	stats: StatEntry[]
	societyStats: StatEntry[]
	owner: ProvinceWikiNation | null
	controller: ProvinceWikiNation | null
	societyAvailable: boolean
	onBack: () => void
	onFocus: () => void
	onSelectNation: (id: number) => void
}

export interface ProvinceWikiPageProps {
	province: ProvinceWikiData
	weather: WeatherSummaryProps
}

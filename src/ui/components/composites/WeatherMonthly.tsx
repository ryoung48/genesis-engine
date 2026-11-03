import { SeriesBars } from "@/ui/components/primitives/charts/SeriesBars"
import { uiTokens } from "@/ui/components/tokens"
import { rainColor, tempColor } from "@/ui/genesis/hover/info-panel-format"
import { windSpeedColorCss } from "@/ui/genesis/hover/info-panel-labels"
import {
	formatPrecipitation,
	formatTemperature,
	formatWindSpeed,
} from "@/ui/genesis/shared/ui-format"
import type { WeatherMonthlyProps } from "@/ui/genesis/shared/weather-display/types"

const bare = (text: string) => text.replace(/ [^ ]+$/, "")
const mean = (values: number[]) =>
	values.reduce((sum, value) => sum + value, 0) / values.length

export function WeatherMonthly({ series, unitSystem }: WeatherMonthlyProps) {
	const temperature = (value: number) => formatTemperature(value, unitSystem, 0)
	const rain = (value: number) => formatPrecipitation(value, unitSystem, 0)
	const wind = (value: number) => formatWindSpeed({ value, unitSystem })
	return (
		<div className={uiTokens.weather.monthly} aria-label="Monthly climate">
			{[
				{
					label: "Temperature",
					values: series.temperatureC,
					color: tempColor,
					format: temperature,
					summary: `AVG ${temperature(mean(series.temperatureC))}`,
				},
				{
					label: "Rain",
					values: series.rainMm,
					color: rainColor,
					format: rain,
					summary: `ANN ${rain(series.rainMm.reduce((sum, value) => sum + value, 0))}`,
				},
				{
					label: "Wind",
					values: series.windSpeedMs,
					color: windSpeedColorCss,
					format: wind,
					summary: `AVG ${wind(mean(series.windSpeedMs))}`,
				},
			].map((chart) => (
				<SeriesBars
					key={chart.label}
					values={chart.values}
					labels={series.labels}
					label={chart.label}
					colorForValue={(value) => chart.color(value)}
					activeIndex={series.activeIndex}
					summary={chart.summary}
					formatValue={(value) => bare(chart.format(value))}
					tooltipLabel={({ index, value }) =>
						`${series.names[index]}: ${chart.format(value)}`
					}
					showValues
					surface="panel"
				/>
			))}
		</div>
	)
}

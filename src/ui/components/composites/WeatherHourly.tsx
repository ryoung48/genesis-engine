import { useId } from "react"
import { cx } from "@/ui/components/lib"
import { WeatherIcon } from "@/ui/components/primitives/icons/WeatherIcon"
import { uiTokens } from "@/ui/components/tokens"
import { tempColor } from "@/ui/genesis/hover/info-panel-format"
import { windSpeedColorCss } from "@/ui/genesis/hover/info-panel-labels"
import type {
	WeatherHourlyBarsProps,
	WeatherHourlyProps,
} from "@/ui/genesis/shared/weather-display/types"

const styles = uiTokens.weather
const { cellPx, heightPx, padPx } = styles.sparklineGeometry

function WeatherHourlyBars({ items, minimumScale }: WeatherHourlyBarsProps) {
	const maximum =
		Math.max(minimumScale, ...items.map((item) => item.value)) || 1
	const geometry = styles.hourBarsGeometry
	return (
		<div className={styles.hourlyRow}>
			{items.map((item) => (
				<div key={item.key} className={styles.hourCell} title={item.tooltip}>
					<div
						className={styles.hourBarTrack}
						style={{ height: geometry.heightPx }}
					>
						{item.value > 0 && (
							<div
								className={cx(
									styles.hourBar,
									item.color === null && styles.tone[item.tone],
								)}
								style={{
									height: Math.max(
										geometry.minimumVisiblePx,
										(item.value / maximum) * geometry.heightPx,
									),
									backgroundColor: item.color ?? undefined,
								}}
							/>
						)}
					</div>
					<span className={styles.hourMetricValue}>{item.label}</span>
				</div>
			))}
		</div>
	)
}

export function WeatherHourly({ display }: WeatherHourlyProps) {
	const { cells, windUnit, precipitationUnit } = display
	const gradient = useId()
	const temperatures = cells.map((cell) => cell.temperatureC)
	const low = Math.min(...temperatures)
	const span = Math.max(...temperatures) - low || 1
	const points = cells.map((cell, index) => ({
		x: index * cellPx + cellPx / 2,
		y: padPx + (1 - (cell.temperatureC - low) / span) * (heightPx - 2 * padPx),
	}))
	return (
		<div className={cx(styles.panel, styles.hourlyScroll)}>
			<div className={styles.hourlyTrack} aria-label="Hourly weather">
				<div className={styles.hourlyRow}>
					{cells.map((cell) => (
						<div
							key={cell.key}
							className={styles.hourCell}
							title={`${cell.label}: ${cell.conditions}`}
						>
							<span className={styles.hourLabel}>{cell.label}</span>
							<WeatherIcon
								name={cell.icon}
								className={cx(styles.hourIcon, styles.tone[cell.tone])}
							/>
							<span className={styles.hourConditions}>{cell.conditions}</span>
						</div>
					))}
				</div>
				<svg
					className={styles.sparkline}
					width={cells.length * cellPx}
					height={heightPx}
					aria-hidden="true"
				>
					<defs>
						<linearGradient
							id={gradient}
							gradientUnits="userSpaceOnUse"
							x1={points[0]?.x ?? 0}
							x2={points[points.length - 1]?.x ?? 0}
							y1={0}
							y2={0}
						>
							{cells.map((cell, index) => (
								<stop
									key={cell.key}
									offset={cells.length > 1 ? index / (cells.length - 1) : 0}
									stopColor={tempColor(cell.temperatureC)}
								/>
							))}
						</linearGradient>
					</defs>
					<polyline
						points={points.map((point) => `${point.x},${point.y}`).join(" ")}
						fill="none"
						stroke={`url(#${gradient})`}
						strokeWidth={2}
						strokeLinejoin="round"
					/>
					{points.map((point, index) => (
						<circle
							key={cells[index].key}
							cx={point.x}
							cy={point.y}
							r={2}
							fill={tempColor(cells[index].temperatureC)}
						/>
					))}
				</svg>
				<div className={styles.hourlyRow}>
					{cells.map((cell) => (
						<span
							key={cell.key}
							className={cx(styles.hourCell, styles.hourTemperature)}
						>
							{cell.temperature}
						</span>
					))}
				</div>
				<div className={styles.hourMetricCaption}>Wind · {windUnit}</div>
				<WeatherHourlyBars
					minimumScale={0}
					items={cells.map((cell) => ({
						key: cell.key,
						value: cell.windSpeedMs,
						label: cell.windSpeed,
						tooltip: `${cell.label}: Wind ${cell.windSpeed} ${windUnit}`,
						tone: "wind",
						color: windSpeedColorCss(cell.windSpeedMs),
					}))}
				/>
				<div className={styles.hourMetricCaption}>
					Precipitation · {precipitationUnit}
				</div>
				<WeatherHourlyBars
					minimumScale={styles.precipitationScaleMmH}
					items={cells.map((cell) => ({
						key: cell.key,
						value: cell.precipitationMmH,
						label: cell.precipitation || "–",
						tooltip: `${cell.label}: Precipitation ${cell.precipitation || "0"} ${precipitationUnit}`,
						tone: cell.precipitationTone,
						color: null as string | null,
					}))}
				/>
			</div>
		</div>
	)
}

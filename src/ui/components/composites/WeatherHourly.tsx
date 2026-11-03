import { cx } from "@/ui/components/lib"
import { WeatherIcon } from "@/ui/components/primitives/icons/WeatherIcon"
import { uiTokens } from "@/ui/components/tokens"
import type { WeatherHourlyProps } from "@/ui/genesis/shared/weather-display/types"

const styles = uiTokens.weather
const { cellPx, heightPx, padPx } = styles.sparklineGeometry

export function WeatherHourly({ cells }: WeatherHourlyProps) {
	const temperatures = cells.map((cell) => cell.temperatureC)
	const low = Math.min(...temperatures)
	const span = Math.max(...temperatures) - low || 1
	const points = cells.map((cell, index) => ({
		x: index * cellPx + cellPx / 2,
		y: padPx + (1 - (cell.temperatureC - low) / span) * (heightPx - 2 * padPx),
	}))
	return (
		<div className={cx(styles.panel, styles.hourlyScroll)}>
			<div className={styles.hourlyTrack} aria-label="Hourly temperature">
				<div className={styles.hourlyRow}>
					{cells.map((cell) => (
						<div key={cell.key} className={styles.hourCell}>
							<span className={styles.hourLabel}>{cell.label}</span>
							<WeatherIcon
								name={cell.icon}
								className={cx(styles.hourIcon, styles.tone[cell.tone])}
							/>
						</div>
					))}
				</div>
				<svg
					className={styles.sparkline}
					width={cells.length * cellPx}
					height={heightPx}
					aria-hidden="true"
				>
					<polyline
						points={points.map((point) => `${point.x},${point.y}`).join(" ")}
						fill="none"
						stroke="currentColor"
						strokeWidth={1.5}
						strokeLinejoin="round"
					/>
					{points.map((point, index) => (
						<circle
							key={cells[index].key}
							cx={point.x}
							cy={point.y}
							r={2}
							fill="currentColor"
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
			</div>
		</div>
	)
}

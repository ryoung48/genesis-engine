import { useId } from "react"
import { cx } from "@/ui/components/lib"
import { WeatherIcon } from "@/ui/components/primitives/icons/WeatherIcon"
import { uiTokens } from "@/ui/components/tokens"
import { tempColor } from "@/ui/genesis/hover/info-panel-format"
import type { WeatherHourlyProps } from "@/ui/genesis/shared/weather-display/types"

const styles = uiTokens.weather
const { cellPx, heightPx, padPx } = styles.sparklineGeometry
const { barPx, precipitationScaleMmH } = styles.precipitationGeometry

export function WeatherHourly({ display }: WeatherHourlyProps) {
	const { cells, precipitationUnit } = display
	const wettest = Math.max(
		precipitationScaleMmH,
		...cells.map((cell) => cell.precipitationMmH),
	)
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
				<div className={styles.precipitationCaption}>
					Precipitation · {precipitationUnit}
				</div>
				<div className={styles.hourlyRow}>
					{cells.map((cell) => (
						<div key={cell.key} className={styles.hourCell}>
							<div
								className={styles.precipitationTrack}
								style={{ height: barPx }}
							>
								{cell.precipitationMmH > 0 && (
									<div
										className={cx(
											styles.precipitationBar,
											styles.tone[cell.precipitationTone],
										)}
										style={{
											height: Math.max(
												2,
												(cell.precipitationMmH / wettest) * barPx,
											),
										}}
									/>
								)}
							</div>
							<span className={styles.precipitationValue}>
								{cell.precipitation || "–"}
							</span>
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

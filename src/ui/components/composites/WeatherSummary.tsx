import { useState } from "react"
import { WeatherHourly } from "@/ui/components/composites/WeatherHourly"
import { WeatherMonthly } from "@/ui/components/composites/WeatherMonthly"
import { cx } from "@/ui/components/lib"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { WeatherIcon } from "@/ui/components/primitives/icons/WeatherIcon"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Tooltip as UITooltip } from "@/ui/components/primitives/Tooltip"
import { uiTokens } from "@/ui/components/tokens"
import { WEATHER_DISPLAY } from "@/ui/genesis/shared/weather-display"
import type {
	WeatherSummaryProps,
	WeatherTab,
} from "@/ui/genesis/shared/weather-display/types"

const styles = uiTokens.weather
const tabs: { value: WeatherTab; label: string }[] = [
	{ value: "current", label: "Current" },
	{ value: "hourly", label: "Hourly" },
	{ value: "monthly", label: "Monthly" },
]

export function WeatherSummary({
	snapshot,
	outlook,
	unitSystem,
	dateLabel,
	loading,
	error,
	annual,
	onSelectDate,
}: WeatherSummaryProps) {
	const [tab, setTab] = useState<WeatherTab>("current")
	if (annual)
		return (
			<div>
				<InlineTextButton onClick={onSelectDate}>
					Select a date for local weather
				</InlineTextButton>
			</div>
		)
	const display = snapshot
		? WEATHER_DISPLAY.present({ snapshot, unitSystem, dateLabel })
		: null
	if (!display)
		return (
			<div role="status" className={uiTokens.wiki.note}>
				{error ??
					(loading
						? "Loading weather…"
						: (snapshot?.reason ?? "Weather unavailable"))}
			</div>
		)
	return (
		<div className={styles.card} aria-label="Province weather">
			<SegmentedControl
				options={tabs}
				value={tab}
				onChange={setTab}
				size="xs"
				fullWidth
			/>
			{tab === "hourly" &&
				(outlook?.hourly.length ? (
					<WeatherHourly
						cells={WEATHER_DISPLAY.hourly({
							outlook,
							unitSystem,
							solarDaySeconds: snapshot?.instant.solarDaySeconds ?? null,
						})}
					/>
				) : (
					<div className={uiTokens.wiki.note}>Hourly weather unavailable</div>
				))}
			{tab === "monthly" &&
				(outlook?.monthly.length === 12 && snapshot ? (
					<WeatherMonthly
						series={WEATHER_DISPLAY.monthly({
							outlook,
							phase: snapshot.instant.phase,
						})}
						unitSystem={unitSystem}
					/>
				) : (
					<div className={uiTokens.wiki.note}>Monthly climate unavailable</div>
				))}
			{tab === "current" && (
				<>
					<div className={styles.hero}>
						<WeatherIcon
							name={display.icon}
							className={cx(styles.heroIcon, styles.tone[display.tone])}
						/>
						<div className={styles.heroText}>
							<div className={styles.heroCondition}>{display.conditions}</div>
							<div className={styles.heroMeta}>
								<span>{display.temperatureLabel}</span>
								{display.anomaly && (
									<UITooltip
										content="Compared with the seasonal temperature and expected daily cycle at this location and time."
										position="top"
										align="start"
									>
										<span
											className={cx(
												styles.anomaly,
												styles.anomalyTone[display.anomaly],
											)}
										>
											{display.anomalyLabel}
										</span>
									</UITooltip>
								)}
							</div>
						</div>
						<div className={styles.heroTemperature}>
							{display.temperatureValue}
						</div>
					</div>
					<div className={styles.tiles}>
						{display.tiles.map((tile) => (
							<div
								key={tile.label}
								className={cx(styles.tile, tile.wide && styles.tileWide)}
							>
								<WeatherIcon name={tile.icon} className={styles.tileIcon} />
								<div className={styles.tileText}>
									<div className={styles.tileLabel}>
										{tile.help ? (
											<UITooltip
												content={tile.help}
												position="top"
												align="start"
											>
												<span className={styles.tileHelp}>{tile.label}</span>
											</UITooltip>
										) : (
											tile.label
										)}
									</div>
									<div className={styles.tileValue}>{tile.value}</div>
								</div>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	)
}

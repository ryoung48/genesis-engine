import { useState } from "react"
import { WeatherHourly } from "@/ui/components/composites/WeatherHourly"
import { WeatherMonthly } from "@/ui/components/composites/WeatherMonthly"
import { cx } from "@/ui/components/lib"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { MoonIcon } from "@/ui/components/primitives/icons/MoonIcon"
import { WeatherIcon } from "@/ui/components/primitives/icons/WeatherIcon"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Tooltip as UITooltip } from "@/ui/components/primitives/Tooltip"
import { uiTokens } from "@/ui/components/tokens"
import { WEATHER_DISPLAY } from "@/ui/genesis/shared/weather-display"
import type {
	WeatherSkyRowsProps,
	WeatherSummaryProps,
	WeatherTab,
	WeatherTileProps,
} from "@/ui/genesis/shared/weather-display/types"

const styles = uiTokens.weather
const tabs: { value: WeatherTab; label: string }[] = [
	{ value: "current", label: "Current" },
	{ value: "hourly", label: "Hourly" },
	{ value: "monthly", label: "Monthly" },
]

function WeatherTileCard({ tile }: WeatherTileProps) {
	return (
		<div className={cx(styles.tile, tile.wide && styles.tileWide)}>
			<WeatherIcon name={tile.icon} className={styles.tileIcon} />
			<div className={styles.tileText}>
				<div className={styles.tileLabel}>
					{tile.help ? (
						<UITooltip content={tile.help} position="top" align="start">
							<span className={styles.tileHelp}>{tile.label}</span>
						</UITooltip>
					) : (
						tile.label
					)}
				</div>
				<div className={styles.tileValue}>{tile.value}</div>
			</div>
		</div>
	)
}

function WeatherSkyRows({ label, rows }: WeatherSkyRowsProps) {
	return (
		<div className={styles.sky} aria-label={label}>
			{rows.map((row) => (
				<div key={row.key} className={styles.skyRow}>
					{row.moon ? (
						<MoonIcon
							{...row.moon}
							className={cx(styles.skyIcon, styles.tone[row.tone])}
						/>
					) : (
						<WeatherIcon
							name={row.icon}
							className={cx(styles.skyIcon, styles.tone[row.tone])}
						/>
					)}
					<div className={styles.skyName}>
						<span>{row.name}</span>
						{row.detail &&
							(row.detailHelp ? (
								<UITooltip
									content={row.detailHelp}
									position="top"
									align="start"
								>
									<span className={cx(styles.skyDetail, styles.skyDetailHelp)}>
										{row.detail}
									</span>
								</UITooltip>
							) : (
								<span className={styles.skyDetail}>{row.detail}</span>
							))}
					</div>
					<div className={styles.skyItems}>
						{row.items.map((item) => (
							<UITooltip
								key={item.label}
								content={item.label}
								position="top"
								align="center"
							>
								<span
									className={cx(
										styles.skyItem,
										item.detail && styles.skyItemStacked,
									)}
								>
									<WeatherIcon
										name={item.icon}
										className={styles.skyItemIcon}
									/>
									<span>
										<span>{item.value}</span>
										{item.detail && (
											<span className={styles.skyItemDetail}>
												{item.detail}
											</span>
										)}
									</span>
								</span>
							</UITooltip>
						))}
					</div>
				</div>
			))}
		</div>
	)
}

export function WeatherSummary({
	snapshot,
	outlook,
	moons,
	params,
	xyz,
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
	const sky =
		snapshot && params
			? WEATHER_DISPLAY.sky({ snapshot, moons, params, xyz })
			: null
	const seaDisplay =
		snapshot && params
			? WEATHER_DISPLAY.sea({ snapshot, moons, params, unitSystem })
			: null
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
						display={WEATHER_DISPLAY.hourly({
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
							<WeatherTileCard key={tile.label} tile={tile} />
						))}
					</div>
					{sky && <WeatherSkyRows label="Sun and moon" rows={sky.rows} />}
					{sky && sky.eclipses.length > 0 && (
						<WeatherSkyRows label="Eclipses" rows={sky.eclipses} />
					)}
					{seaDisplay && <WeatherSkyRows label="Sea" rows={seaDisplay.rows} />}
				</>
			)}
		</div>
	)
}

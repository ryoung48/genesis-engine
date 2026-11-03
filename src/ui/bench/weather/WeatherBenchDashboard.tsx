import { useState } from "react"
import { BENCH_API } from "@/bench/api"
import { TEXT } from "@/model/shared/text"
import { BenchNavigation } from "@/ui/bench/BenchNavigation"
import { StackedBarChart } from "@/ui/bench/StackedBarChart"
import { WEATHER_BENCH_ENVIRONMENT } from "@/ui/bench/weather/environment"
import type { WeatherBenchTab } from "@/ui/bench/weather/types"
import { useWeatherBench } from "@/ui/bench/weather/useWeatherBench"
import { WEATHER_BENCH_VIEW } from "@/ui/bench/weather/view"
import { WeatherPanel } from "@/ui/bench/weather/WeatherPanel"
import { WeatherTable } from "@/ui/bench/weather/WeatherTable"
import { cx } from "@/ui/components/lib"
import { Button } from "@/ui/components/primitives/Button"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Surface } from "@/ui/components/primitives/Surface"
import { uiChartPalette, uiTokens } from "@/ui/components/tokens"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
import { WEATHER_DISPLAY } from "@/ui/genesis/shared/weather-display"

export function WeatherBenchDashboard() {
	const bench = useWeatherBench()

	const [tab, setTab] = useState<WeatherBenchTab>("overview")
	const [phenomenon, setPhenomenon] = useState("all")
	const [kind, setKind] = useState("thunderstorm")
	const [scope, setScope] = useState("all")
	const [unitSystem, setUnitSystem] = useState<UnitSystem>("metric")

	const current = bench.data?.current ?? null,
		baseline = bench.data?.baseline ?? null

	const selectedScope = current?.gates[scope] ? scope : "all"
	const inputClass = cx(uiTokens.generator.input, uiTokens.type.value)
	const note = cx(uiTokens.type.valueSm, uiTokens.text.muted)

	const filterEnvironment =
		phenomenon === "all"
			? WEATHER_BENCH_ENVIRONMENT.global
			: WEATHER_BENCH_ENVIRONMENT.condition

	const failed = current?.checks.filter((check) => check.passed === false) ?? []
	const checked = current?.checks.filter((check) => check.passed !== null) ?? []
	const environmentRecorded =
		!!current?.environment &&
		Object.keys(current.environment.byPhenomenon).length > 0
	const envInput = current && {
		current,
		baseline,
		kind: phenomenon,
		unitSystem,
	}

	return (
		<div className={cx(uiTokens.bench.page, uiTokens.surface.canvas)}>
			<main className={uiTokens.bench.content}>
				<BenchNavigation />
				<header className={uiTokens.bench.header}>
					<div className={uiTokens.bench.heading}>
						<h1 className={uiTokens.type.hero}>Weather bench</h1>
						{current && (
							<p className={note}>
								{current.run.model ? `${current.run.model} · ` : ""}seed{" "}
								{current.run.seed} · {current.run.siteCount} sites ·{" "}
								{current.run.years} years · {current.run.stepHours} h steps
							</p>
						)}
					</div>
					<Button onClick={bench.refresh} disabled={bench.loading}>
						{bench.loading ? "Loading…" : "Refresh"}
					</Button>
				</header>
				<section
					aria-label="Report selection"
					className={uiTokens.bench.controls}
				>
					<label className={uiTokens.bench.field}>
						<span className={uiTokens.type.label}>Run</span>
						<select
							className={inputClass}
							value={bench.selection.currentId}
							onChange={(event) => bench.selectCurrent(event.target.value)}
							disabled={!bench.runs.length}
						>
							{bench.runs.map((run) => (
								<option key={run.id} value={run.id}>
									{WEATHER_BENCH_VIEW.runLabel(run)}
								</option>
							))}
						</select>
					</label>
					<label className={uiTokens.bench.field}>
						<span className={uiTokens.type.label}>Baseline</span>
						<select
							className={inputClass}
							value={bench.selection.baselineId}
							onChange={(event) => bench.selectBaseline(event.target.value)}
						>
							<option value="">None</option>
							{bench.baselines.map((run) => (
								<option key={run.id} value={run.id}>
									{WEATHER_BENCH_VIEW.runLabel(run)}
								</option>
							))}
						</select>
					</label>
					<label className={uiTokens.bench.field}>
						<span className={uiTokens.type.label}>Units</span>
						<select
							className={inputClass}
							value={unitSystem}
							onChange={(event) =>
								setUnitSystem(event.target.value as UnitSystem)
							}
						>
							<option value="metric">Metric</option>
							<option value="imperial">Imperial</option>
						</select>
					</label>
				</section>
				{bench.error && (
					<EmptyState
						message={`Unable to load weather reports: ${bench.error}`}
					/>
				)}
				{!bench.error && bench.loading && !current && (
					<div role="status">
						<EmptyState message="Loading weather reports…" />
					</div>
				)}
				{!bench.error && !bench.loading && !current && (
					<EmptyState message="No completed weather distribution reports were found. Run the local weather diagnostic, then refresh." />
				)}
				{!bench.error && current && envInput && (
					<>
						<SegmentedControl<WeatherBenchTab>
							value={tab}
							onChange={setTab}
							options={[
								{ value: "overview", label: "Overview" },
								{ value: "environment", label: "Environment" },
								{ value: "diagnostics", label: "Diagnostics" },
							]}
						/>
						{tab === "overview" && (
							<>
								<section
									className={uiTokens.bench.metrics}
									aria-label="Weather bench metrics"
								>
									{WEATHER_BENCH_VIEW.metrics({ current, unitSystem }).map(
										(metric) => (
											<Surface
												key={metric.label}
												padding="md"
												borderTone="default"
											>
												<div className={uiTokens.type.label}>
													{metric.label}
												</div>
												<div className={uiTokens.type.title}>
													{metric.value}
												</div>
											</Surface>
										),
									)}
								</section>
								<div
									className={cx(uiTokens.bench.checks, uiTokens.type.valueSm)}
								>
									<span
										className={
											failed.length
												? uiChartPalette.bench.worse
												: uiChartPalette.bench.better
										}
									>
										{checked.length - failed.length}/{checked.length} checks
										pass
									</span>
									{failed.map((check) => (
										<span
											key={check.label}
											className={uiChartPalette.bench.worse}
										>
											Failed: {check.label}
										</span>
									))}
									<a
										className={uiTokens.text.primary}
										href={`${BENCH_API.weather}/${encodeURIComponent(current.run.id)}`}
										target="_blank"
										rel="noreferrer"
									>
										Report JSON ↗
									</a>
								</div>
								<WeatherPanel
									title="Weather regimes"
									description="Share of sampled time per broad regime."
								>
									<WeatherTable
										table={WEATHER_BENCH_VIEW.systems({ current, baseline })}
									/>
								</WeatherPanel>
								{environmentRecorded ? (
									<WeatherPanel
										title="Weather phenomena"
										description="One primary phenomenon per sample; shares total 100%."
									>
										<WeatherTable
											table={WEATHER_BENCH_ENVIRONMENT.phenomena({
												current,
												baseline,
											})}
										/>
									</WeatherPanel>
								) : (
									<EmptyState message="Phenomenon and cloud breakdowns were not recorded in this run." />
								)}
							</>
						)}
						{tab === "environment" &&
							(environmentRecorded && current.environment ? (
								<>
									<label className={uiTokens.bench.filter}>
										<span className={uiTokens.type.label}>Weather filter</span>
										<select
											className={inputClass}
											value={phenomenon}
											onChange={(event) => setPhenomenon(event.target.value)}
										>
											<option value="all">All weather</option>
											{Object.keys(current.environment.byPhenomenon).map(
												(value) => (
													<option key={value} value={value}>
														{TEXT.capitalize(value)}
													</option>
												),
											)}
										</select>
									</label>
									<WeatherPanel
										title="Clouds"
										description="Representative sky category per sample."
									>
										<WeatherTable
											table={WEATHER_BENCH_ENVIRONMENT.clouds({
												...envInput,
												scope: phenomenon === "all" ? "overall" : "condition",
											})}
										/>
									</WeatherPanel>
									<WeatherPanel
										title="Wind"
										description="Sustained wind bands and sampled extremes."
									>
										{[
											{
												id: "bands",
												table: WEATHER_BENCH_ENVIRONMENT.bands({
													...envInput,
													dimension: "wind",
												}),
											},
											{
												id: "moments",
												table: WEATHER_BENCH_ENVIRONMENT.moments({
													...envInput,
													dimension: "wind",
												}),
											},
										].map(({ id, table }) => (
											<WeatherTable key={id} table={filterEnvironment(table)} />
										))}
									</WeatherPanel>
									<WeatherPanel
										title="Temperature"
										description={`Descriptive bands, departures beyond ±${WEATHER_BENCH_ENVIRONMENT.threshold(envInput)} of local normal, and sampled extremes.`}
									>
										{[
											{
												id: "bands",
												table: WEATHER_BENCH_ENVIRONMENT.bands({
													...envInput,
													dimension: "temperature",
												}),
											},
											{
												id: "departures",
												table: WEATHER_BENCH_ENVIRONMENT.departures(envInput),
											},
											{
												id: "moments",
												table: WEATHER_BENCH_ENVIRONMENT.moments({
													...envInput,
													dimension: "temperature",
												}),
											},
										].map(({ id, table }) => (
											<WeatherTable key={id} table={filterEnvironment(table)} />
										))}
									</WeatherPanel>
								</>
							) : (
								<EmptyState message="Environment breakdowns were not recorded in this run." />
							))}
						{tab === "diagnostics" && (
							<>
								<WeatherPanel
									title="Phenomenon occurrence"
									description="Share of sampled time, run starts and persistence."
								>
									<WeatherTable
										table={WEATHER_BENCH_VIEW.conditions({ current, baseline })}
									/>
								</WeatherPanel>
								<label className={uiTokens.bench.filter}>
									<span className={uiTokens.type.label}>Condition detail</span>
									<select
										className={inputClass}
										value={kind}
										onChange={(event) => setKind(event.target.value)}
									>
										{current.conditions.map((condition) => (
											<option key={condition.kind} value={condition.kind}>
												{WEATHER_DISPLAY.conditionLabel(condition.kind)}
											</option>
										))}
									</select>
								</label>
								<section
									className={uiTokens.bench.charts}
									aria-label="Occurrence breakdowns"
								>
									{[
										{ dimension: "climate", title: "By climate" },
										{ dimension: "season", title: "By season" },
										{ dimension: "localTime", title: "By local solar time" },
									].map((section) => {
										const view = WEATHER_BENCH_VIEW.breakdown({
											current,
											baseline,
											kind,
											dimension: section.dimension,
										})
										return (
											<WeatherPanel
												key={section.dimension}
												title={section.title}
												description="Share of sampled time."
											>
												<div className={uiTokens.bench.chart}>
													<StackedBarChart
														labels={view.chart.labels}
														series={view.chart.series}
														unit="%"
													/>
												</div>
												<WeatherTable table={view.table} />
											</WeatherPanel>
										)
									})}
								</section>
								<section
									className={uiTokens.bench.pair}
									aria-label="Sampled event duration distributions"
								>
									{[
										{ mode: "runs" as const, title: "Run lengths" },
										{ mode: "gaps" as const, title: "Gaps between runs" },
									].map((section) => {
										const chart = WEATHER_BENCH_VIEW.histogram({
											current,
											baseline,
											kind,
											mode: section.mode,
										})
										return (
											<WeatherPanel
												key={section.mode}
												title={section.title}
												description="Censored runs excluded."
											>
												<div className={uiTokens.bench.chart}>
													<StackedBarChart
														labels={chart.labels}
														series={chart.series}
														unit="count"
													/>
												</div>
											</WeatherPanel>
										)
									})}
								</section>
								<WeatherPanel
									title="Temporal clustering"
									description="One sampling step apart."
								>
									<WeatherTable
										table={WEATHER_BENCH_VIEW.temporal({
											current,
											baseline,
											kind,
										})}
									/>
								</WeatherPanel>
								<WeatherPanel
									title="Decision checks"
									description="Outcome and numeric consistency, not atmospheric probabilities."
								>
									<label className={uiTokens.bench.filter}>
										<span className={uiTokens.type.label}>Scope</span>
										<select
											className={inputClass}
											value={selectedScope}
											onChange={(event) => setScope(event.target.value)}
										>
											{Object.keys(current.gates).map((value) => (
												<option key={value} value={value}>
													{value === "all" ? "All climates" : value}
												</option>
											))}
										</select>
									</label>
									{current.gates[selectedScope]?.[kind]?.length ? (
										<WeatherTable
											table={WEATHER_BENCH_VIEW.gates({
												current,
												kind,
												scope: selectedScope,
											})}
										/>
									) : (
										<EmptyState message="No decision checks were recorded for this selection." />
									)}
								</WeatherPanel>
								<WeatherPanel
									title="Nearest-site clustering"
									description="Jaccard overlap between neighboring sites."
								>
									<WeatherTable
										table={WEATHER_BENCH_VIEW.spatial({
											current,
											baseline,
											kind,
											unitSystem,
										})}
									/>
								</WeatherPanel>
							</>
						)}
					</>
				)}
			</main>
		</div>
	)
}

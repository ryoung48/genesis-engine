import React, { useState } from "react"
import type {
	BenchMetric,
	BenchRunDetail,
	BenchRunSummary,
} from "@/bench/types"
import { BoxWhiskerChart } from "@/ui/bench/BoxWhiskerChart"
import { ComboChart } from "@/ui/bench/ComboChart"
import {
	ARMY_BOX_CHART,
	type BoxChartDef,
	COMBO_CHARTS,
	type ComboChartDef,
	type DistributionChartDef,
	DRILLDOWN_FAMILIES,
	familyLabel,
	governmentSubtypeDef,
	NAVY_BOX_CHART,
	SIZE_CHART,
	TIES_CHART,
} from "@/ui/bench/chartDefs"
import {
	benchDeltaPercent,
	benchDeltaTone,
	formatBenchDelta,
	formatBenchValue,
	formatDeltaPercent,
} from "@/ui/bench/format"
import { StackedBarChart } from "@/ui/bench/StackedBarChart"
import {
	boxSpecs,
	distributionSpecs,
	eventSpecs,
	familySpecs,
	levelSpecs,
	outcomeSpecs,
	populationSpecs,
	resolveSeries,
} from "@/ui/bench/series"
import type { DrilldownFamily, SeriesSpec } from "@/ui/bench/types"
import { useBenchDashboard } from "@/ui/bench/useBenchDashboard"
import { cx } from "@/ui/components/lib"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { Surface } from "@/ui/components/primitives/Surface"
import { uiChartPalette, uiTokens } from "@/ui/components/tokens"

const TONE_CLASS = {
	better: uiChartPalette.bench.better,
	worse: uiChartPalette.bench.worse,
	neutral: uiTokens.text.muted,
} as const

const SELECT_CLASS = `${uiTokens.type.value} rounded-md border border-slate-200 bg-white px-2 py-1 disabled:opacity-40`

const KPI_KEYS = ["wall", "peakMemory", "generation"]

function runLabel(run: BenchRunSummary): string {
	const date = new Date(run.startedAt).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	})
	return `${date} · ${run.title} · ${run.years}y`
}

function comboSpecs(params: {
	def: ComboChartDef
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}): {
	bars: SeriesSpec[]
	lines: SeriesSpec[]
} {
	const { def, current, baseline } = params
	const runs = baseline ? [current, baseline] : [current]
	return {
		bars: def.bars
			.filter((bar) =>
				runs.some((run) => run.windows.some((w) => (bar.value(w) ?? 0) !== 0)),
			)
			.map((bar) => ({
				label: bar.label,
				color: bar.color,
				values: (run) => run.windows.map(bar.value),
			})),
		lines: [
			{
				label: "p50",
				color: uiChartPalette.total,
				values: (run) => run.windows.map(def.p50),
			},
			{
				label: "p90",
				color: uiChartPalette.bench.secondary,
				values: (run) => run.windows.map(def.p90),
			},
		],
	}
}

const RunSelect: React.FC<{
	label: string
	value: string
	runs: BenchRunSummary[]
	allowNone: boolean
	disabled: boolean
	onChange: (id: string) => void
}> = ({ label, value, runs, allowNone, disabled, onChange }) => (
	<label className="flex flex-col gap-1">
		<span className={cx(uiTokens.type.label, uiTokens.text.muted)}>
			{label}
		</span>
		<select
			className={SELECT_CLASS}
			value={value}
			disabled={disabled}
			onChange={(e) => onChange(e.target.value)}
		>
			{allowNone && <option value="">None</option>}
			{runs.map((run) => (
				<option key={run.id} value={run.id}>
					{runLabel(run)}
				</option>
			))}
		</select>
	</label>
)

const KpiCard: React.FC<{
	metric: BenchMetric
	baseline: BenchMetric | null
}> = ({ metric, baseline }) => {
	const deltaPercent = benchDeltaPercent({
		current: metric.value,
		baseline: baseline?.value ?? null,
	})
	const delta =
		baseline && metric.value !== null && baseline.value !== null
			? metric.value - baseline.value
			: null
	return (
		<Surface padding="md" borderTone="default" className="border">
			<div className={cx(uiTokens.type.label, uiTokens.text.muted)}>
				{metric.label}
			</div>
			<div className="mt-1 flex items-baseline justify-between gap-2">
				<span className="font-mono text-xl font-semibold text-slate-900">
					{baseline
						? formatBenchDelta({ value: delta, unit: metric.unit })
						: formatBenchValue({ value: metric.value, unit: metric.unit })}
				</span>
				{baseline && (
					<span
						className={cx(
							uiTokens.type.valueSm,
							TONE_CLASS[benchDeltaTone({ metric, deltaPercent })],
						)}
					>
						{formatDeltaPercent(deltaPercent)}
					</span>
				)}
			</div>
		</Surface>
	)
}

const ChartCard: React.FC<{
	title: string
	children: React.ReactNode
}> = ({ title, children }) => (
	<Surface padding="md" borderTone="default" className="border">
		<div className={cx(uiTokens.type.control, uiTokens.text.muted)}>
			{title}
		</div>
		<div className="mt-2 h-48">{children}</div>
	</Surface>
)

const GovernmentCard: React.FC<{
	current: BenchRunDetail
	baseline: BenchRunDetail | null
	family: DrilldownFamily | null
	onFamily: (family: DrilldownFamily | null) => void
}> = ({ current, baseline, family, onFamily }) => {
	const specs = family
		? distributionSpecs({
				def: governmentSubtypeDef(family),
				current,
				baseline,
			})
		: familySpecs({ current, baseline })
	return (
		<Surface padding="md" borderTone="default" className="border">
			<div className="flex items-center justify-between gap-2">
				<div className={cx(uiTokens.type.control, uiTokens.text.muted)}>
					{family
						? `Sovereigns by government: ${familyLabel(family)}`
						: "Sovereigns by government (click a band for subtypes)"}
				</div>
				{family && (
					<button
						type="button"
						className={cx(
							uiTokens.type.controlSm,
							uiTokens.border.default,
							uiTokens.surface.panel,
							"rounded-md border px-2 py-1",
						)}
						onClick={() => onFamily(null)}
					>
						← All governments
					</button>
				)}
			</div>
			<div className="mt-2 h-48">
				<StackedBarChart
					labels={current.windows.map((w) => w.label)}
					unit="count"
					series={resolveSeries({ specs, current, baseline })}
					onBandClick={
						family ? undefined : (label) => onFamily(familyForLabel(label))
					}
				/>
			</div>
		</Surface>
	)
}

const familyForLabel = (label: string): DrilldownFamily | null =>
	DRILLDOWN_FAMILIES.find((family) => familyLabel(family) === label) ?? null

const VictoryCard: React.FC<{
	def: ComboChartDef
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}> = ({ def, current, baseline }) => {
	const [drill, setDrill] = useState<string | null>(null)
	const drilldown = def.drilldowns.find((item) => item.label === drill) ?? null
	const specs = comboSpecs({ def, current, baseline })
	const labels = current.windows.map((w) => w.label)
	return (
		<Surface padding="md" borderTone="default" className="border">
			<div className="flex items-center justify-between gap-2">
				<div className={cx(uiTokens.type.control, uiTokens.text.muted)}>
					{drilldown ? `${drilldown.label}: outcomes` : def.title}
				</div>
				{drilldown && (
					<button
						type="button"
						className={cx(
							uiTokens.type.controlSm,
							uiTokens.border.default,
							uiTokens.surface.panel,
							"rounded-md border px-2 py-1",
						)}
						onClick={() => setDrill(null)}
					>
						← Back
					</button>
				)}
			</div>
			<div className="mt-2 h-48">
				{drilldown ? (
					<StackedBarChart
						labels={labels}
						unit="count"
						series={resolveSeries({
							specs: outcomeSpecs({
								current,
								baseline,
								outcomes: drilldown.outcomes,
							}),
							current,
							baseline,
						})}
					/>
				) : (
					<ComboChart
						labels={labels}
						barUnit="count"
						lineUnit="ratio"
						bars={resolveSeries({ specs: specs.bars, current, baseline })}
						lines={resolveSeries({ specs: specs.lines, current, baseline })}
						onBandClick={(label) => {
							if (def.drilldowns.some((item) => item.label === label))
								setDrill(label)
						}}
					/>
				)}
			</div>
		</Surface>
	)
}

const DistributionCard: React.FC<{
	def: DistributionChartDef
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}> = ({ def, current, baseline }) => (
	<ChartCard title={def.title}>
		<StackedBarChart
			labels={current.windows.map((w) => w.label)}
			unit="count"
			series={resolveSeries({
				specs: distributionSpecs({ def, current, baseline }),
				current,
				baseline,
			})}
		/>
	</ChartCard>
)

const BoxCard: React.FC<{
	def: BoxChartDef
	current: BenchRunDetail
	baseline: BenchRunDetail | null
}> = ({ def, current, baseline }) => (
	<ChartCard title={def.title}>
		<BoxWhiskerChart
			labels={current.windows.map((w) => w.label)}
			unit={def.unit}
			series={resolveSeries({
				specs: boxSpecs(def),
				current,
				baseline,
			})}
		/>
	</ChartCard>
)

export const BenchDashboard: React.FC = () => {
	const [diff, setDiff] = useState(false)
	const [governmentFamily, setGovernmentFamily] =
		useState<DrilldownFamily | null>(null)
	const bench = useBenchDashboard(diff)
	const { current, baseline } = bench

	return (
		<div className="h-full overflow-y-auto bg-slate-50">
			<div className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
				<header className="flex flex-col gap-4">
					<div>
						<h1 className={uiTokens.type.title}>History bench</h1>
						{current && (
							<p className={cx(uiTokens.type.valueSm, uiTokens.text.muted)}>
								{current.seeds.length} seeds · {current.era} ·{" "}
								{current.points.toLocaleString("en-US")} points ·{" "}
								{current.run.years} years · rev {current.revision}
								{!current.complete && (
									<span
										role="status"
										aria-label="Report running"
										className="ml-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 align-middle"
									/>
								)}
							</p>
						)}
					</div>
					<div className="flex items-end gap-3">
						<RunSelect
							label="Run"
							value={bench.currentId}
							runs={bench.runs}
							allowNone={false}
							disabled={false}
							onChange={bench.selectCurrent}
						/>
						<RunSelect
							label="Baseline"
							value={bench.baselineId}
							runs={bench.runs.filter((run) => run.id !== bench.currentId)}
							allowNone
							disabled={!diff}
							onChange={bench.selectBaseline}
						/>
						<label className="flex items-center gap-2 pb-1.5">
							<input
								type="checkbox"
								checked={diff}
								onChange={(e) => setDiff(e.target.checked)}
							/>
							<span className={cx(uiTokens.type.control, uiTokens.text.muted)}>
								Diff
							</span>
						</label>
					</div>
				</header>

				{bench.error && (
					<EmptyState
						message={`Failed to load: ${bench.error}`}
						minHeight={120}
					/>
				)}
				{!bench.error && !current && (
					<EmptyState
						message={
							bench.loading
								? "Loading bench reports…"
								: "No reports in stats/history"
						}
						minHeight={120}
					/>
				)}

				{current && (
					<>
						<section className="grid grid-cols-3 gap-3">
							{KPI_KEYS.flatMap((key) => {
								const metric = current.metrics.find((m) => m.key === key)
								if (!metric) return []
								return [
									<KpiCard
										key={key}
										metric={metric}
										baseline={
											baseline?.metrics.find((m) => m.key === key) ?? null
										}
									/>,
								]
							})}
						</section>

						<section className="grid gap-3 md:grid-cols-2">
							<ChartCard title="Tick cost per year by event type (ms, 100-year mean)">
								<StackedBarChart
									labels={current.events.map((e) => e.label)}
									unit="ms"
									series={resolveSeries({
										specs: eventSpecs({ current, baseline }),
										current,
										baseline,
									})}
								/>
							</ChartCard>
							<DistributionCard
								def={SIZE_CHART}
								current={current}
								baseline={baseline}
							/>
							<GovernmentCard
								current={current}
								baseline={baseline}
								family={governmentFamily}
								onFamily={setGovernmentFamily}
							/>
							<DistributionCard
								def={TIES_CHART}
								current={current}
								baseline={baseline}
							/>
							{COMBO_CHARTS.map((def) => (
								<VictoryCard
									key={def.title}
									def={def}
									current={current}
									baseline={baseline}
								/>
							))}
							<BoxCard
								def={ARMY_BOX_CHART}
								current={current}
								baseline={baseline}
							/>
							<BoxCard
								def={NAVY_BOX_CHART}
								current={current}
								baseline={baseline}
							/>
						</section>

						<section className="grid gap-3 md:grid-cols-2">
							<ChartCard title="World population: states and stateless, largest city">
								<ComboChart
									barUnit="people"
									lineUnit="people"
									labels={current.windows.map((w) => w.label)}
									bars={resolveSeries({
										specs: populationSpecs().bars,
										current,
										baseline,
									})}
									lines={resolveSeries({
										specs: populationSpecs().lines,
										current,
										baseline,
									})}
								/>
							</ChartCard>
							<ChartCard title="Development and knowledge: provinces per bucket (development left, knowledge right)">
								<StackedBarChart
									labels={current.windows.map((w) => w.label)}
									unit="count"
									series={resolveSeries({
										specs: levelSpecs({ current, baseline }),
										current,
										baseline,
									})}
								/>
							</ChartCard>
						</section>
					</>
				)}
			</div>
		</div>
	)
}

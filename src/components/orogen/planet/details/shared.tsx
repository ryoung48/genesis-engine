import React from "react"
import type { PlanetStat } from "../planet-stats"

export interface NationDetailsData {
	id: number
	provinceCount: number
	totalPopulation: number
	color: string | null
	neighbors: Array<{
		id: number
		color: string | null
		relation: string
		threat: number | null
	}>
	activeWars: Array<{
		id: number
		opponentId: number
		opponentColor: string | null
		role: string
		rebel: boolean
	}>
}

export interface DistributionBucket {
	label: string
	count: number
	color: string
}

export interface DetailsDrawerBaseProps {
	planetStats: PlanetStat[]
	worldPopulation: number | null
	activeWarCount: number | null
	averageDevelopment: number | null
	nationAverageDevelopment: number | null
	developmentDistribution: DistributionBucket[]
	nationDevelopmentDistribution: DistributionBucket[]
	nationSizeDistribution: DistributionBucket[]
	conflictDistribution: DistributionBucket[]
	relationDistribution: DistributionBucket[]
	climateDistribution: DistributionBucket[]
	vegetationDistribution: DistributionBucket[]
	topographyDistribution: DistributionBucket[]
}

export function formatPopulation(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0"
	if (value >= 1_000_000_000) {
		return `${(value / 1_000_000_000).toFixed(value >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")}B`
	}
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`
	}
	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1).replace(/\.0$/, "")}K`
	}
	return Math.round(value).toLocaleString()
}

export function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
				{label}
			</span>
			<span className="text-right font-mono text-[11px] text-slate-950">
				{value}
			</span>
		</div>
	)
}

export function SwatchDetailRow({
	label,
	value,
	color,
}: {
	label: string
	value: string
	color: string | null
}) {
	return (
		<div className="flex items-baseline justify-between gap-2">
			<span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
				{label}
			</span>
			<span className="inline-flex items-center gap-1.5 text-right font-mono text-[11px] text-slate-950">
				{color ? (
					<span
						className="h-2 w-2 rounded-sm border border-slate-300"
						style={{ backgroundColor: color }}
					/>
				) : null}
				<span>{value}</span>
			</span>
		</div>
	)
}

export function AccordionSection({
	title,
	open,
	onToggle,
	children,
}: {
	title: string
	open: boolean
	onToggle: () => void
	children: React.ReactNode
}) {
	return (
		<section className="rounded-xl border border-slate-200 bg-slate-50/90">
			<button
				type="button"
				onClick={onToggle}
				className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
			>
				<span className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">
					{title}
				</span>
				<span
					className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
				>
					▾
				</span>
			</button>
			{open ? (
				<div className="border-t border-slate-200 px-3 py-2">{children}</div>
			) : null}
		</section>
	)
}

export function DistributionChart({
	title,
	buckets,
}: {
	title: string
	buckets: DistributionBucket[]
}) {
	const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

	if (totalCount === 0) {
		return null
	}

	return (
		<div className="rounded-lg border border-slate-200 bg-white/90 px-2.5 py-2">
			<div className="mb-1.5 flex items-baseline justify-between gap-2">
				<span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
					{title}
				</span>
				<span className="font-mono text-[8px] text-slate-400">
					{totalCount.toLocaleString()}
				</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-slate-100">
				{buckets
					.filter((bucket) => bucket.count > 0)
					.map((bucket) => (
						<div
							key={bucket.label}
							className="inline-block h-full align-top transition-all"
							style={{
								width: `${(bucket.count / totalCount) * 100}%`,
								backgroundColor: bucket.color,
							}}
							title={`${bucket.label}: ${bucket.count.toLocaleString()}`}
						/>
					))}
			</div>
			<div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
				{buckets
					.filter((bucket) => bucket.count > 0)
					.map((bucket) => {
						const share = (bucket.count / totalCount) * 100
						return (
							<div key={bucket.label} className="flex items-center gap-1.5">
								<span
									className="h-1.5 w-1.5 rounded-full"
									style={{ backgroundColor: bucket.color }}
								/>
								<span className="font-mono text-[8px] text-slate-500">
									{bucket.label} ({bucket.count.toLocaleString()},{" "}
									{share.toFixed(1)}%)
								</span>
							</div>
						)
					})}
			</div>
		</div>
	)
}

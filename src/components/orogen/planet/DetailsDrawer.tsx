import React, { useEffect, useState } from "react"

interface NationDetails {
	id: number
	provinceCount: number
	totalPopulation: number
}

interface DistributionBucket {
	label: string
	count: number
	color: string
}

interface DetailsDrawerProps {
	open: boolean
	onToggle: () => void
	nation: NationDetails | null
	nationCount: number | null
	nationSizeDistribution: DistributionBucket[]
	climateDistribution: DistributionBucket[]
	vegetationDistribution: DistributionBucket[]
	topographyDistribution: DistributionBucket[]
}

function formatPopulation(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0"
	return Math.round(value).toLocaleString()
}

function DetailRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
				{label}
			</span>
			<span className="text-right font-mono text-[12px] text-slate-950">
				{value}
			</span>
		</div>
	)
}

export const DetailsDrawer: React.FC<DetailsDrawerProps> = ({
	open,
	onToggle,
	nation,
	nationCount,
	nationSizeDistribution,
	climateDistribution,
	vegetationDistribution,
	topographyDistribution,
}) => {
	const [tab, setTab] = useState<"world" | "nation">("world")

	useEffect(() => {
		if (open) {
			setTab("world")
		}
	}, [open])

	if (!open) {
		return null
	}

	return (
		<div className="w-full xl:w-[360px] xl:max-w-[30vw] shrink-0 h-auto xl:h-full flex flex-col px-4 py-4 lg:px-5 lg:py-5 border-t xl:border-t-0 xl:border-l border-slate-200 bg-white/95 backdrop-blur-sm">
			<div className="flex items-center gap-3 mb-5">
				<div className="w-7 h-7 bg-slate-900 rounded-md flex items-center justify-center">
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						className="text-white"
					>
						<path
							d="M4 5h16M4 12h16M4 19h10"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				</div>
				<span className="font-bold text-sm tracking-tight">DETAILS</span>
				<button
					onClick={onToggle}
					className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
					title="Hide details"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
				<div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1">
					{(
						[
							["world", "World"],
							["nation", "Nation"],
						] as const
					).map(([nextTab, label]) => (
						<button
							key={nextTab}
							onClick={() => setTab(nextTab)}
							className={`rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all ${
								tab === nextTab
									? "bg-white text-slate-900 shadow-sm"
									: "text-slate-500 hover:text-slate-700"
							}`}
						>
							{label}
						</button>
					))}
				</div>

				{tab === "world" && (
					<>
						<DetailRow
							label="Total Nations"
							value={nationCount != null ? nationCount.toLocaleString() : "N/A"}
						/>
						<DistributionChart
							title="Nation Size"
							buckets={nationSizeDistribution}
						/>
						<DistributionChart title="Climate" buckets={climateDistribution} />
						<DistributionChart
							title="Vegetation"
							buckets={vegetationDistribution}
						/>
						<DistributionChart
							title="Topography"
							buckets={topographyDistribution}
						/>
					</>
				)}

				{tab === "nation" && (
					<>
						<details
							open
							className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3"
						>
							<summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
								Political
							</summary>
							<div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
								<DetailRow
									label="Nation ID"
									value={nation ? `#${nation.id}` : "N/A"}
								/>
								<DetailRow
									label="Provinces"
									value={nation ? nation.provinceCount.toLocaleString() : "N/A"}
								/>
							</div>
						</details>

						<details
							open
							className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3"
						>
							<summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
								Demographics
							</summary>
							<div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
								<DetailRow
									label="Population"
									value={
										nation ? formatPopulation(nation.totalPopulation) : "N/A"
									}
								/>
							</div>
						</details>
					</>
				)}
			</div>
		</div>
	)
}

function DistributionChart({
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
		<div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3">
			<div className="mb-2 flex items-baseline justify-between gap-3">
				<span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
					{title}
				</span>
				<span className="font-mono text-[9px] text-slate-400">
					{totalCount.toLocaleString()}
				</span>
			</div>
			<div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
				{buckets
					.filter((bucket) => bucket.count > 0)
					.map((bucket) => (
						<div
							key={bucket.label}
							className="h-full inline-block align-top transition-all"
							style={{
								width: `${(bucket.count / totalCount) * 100}%`,
								backgroundColor: bucket.color,
							}}
							title={`${bucket.label}: ${bucket.count.toLocaleString()}`}
						/>
					))}
			</div>
			<div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
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
								<span className="font-mono text-[9px] text-slate-500">
									{bucket.label} ({bucket.count.toLocaleString()},{" "}
									{share.toFixed(1)}
									%)
								</span>
							</div>
						)
					})}
			</div>
		</div>
	)
}

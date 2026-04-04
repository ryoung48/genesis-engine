import React, { useEffect, useState } from "react"

interface NationDetails {
	id: number
	provinceCount: number
	totalPopulation: number
}

interface DetailsDrawerProps {
	open: boolean
	onToggle: () => void
	nation: NationDetails | null
	nationCount: number | null
	nationSizeDistribution: Array<{ label: string; count: number }>
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
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-white">
						<path d="M4 5h16M4 12h16M4 19h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
					</svg>
				</div>
				<span className="font-bold text-sm tracking-tight">DETAILS</span>
				<button
					onClick={onToggle}
					className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-slate-100 hover:text-slate-600"
					title="Hide details"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
				<div className="inline-flex w-fit rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1">
					{([
						["world", "World"],
						["nation", "Nation"],
					] as const).map(([nextTab, label]) => (
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
						<DistributionChart buckets={nationSizeDistribution} />
					</>
				)}

				{tab === "nation" && (
					<>
						<details open className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
							<summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
								Political
							</summary>
							<div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
								<DetailRow label="Nation ID" value={nation ? `#${nation.id}` : "N/A"} />
								<DetailRow
									label="Provinces"
									value={nation ? nation.provinceCount.toLocaleString() : "N/A"}
								/>
							</div>
						</details>

						<details open className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3">
							<summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
								Demographics
							</summary>
							<div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
								<DetailRow
									label="Population"
									value={nation ? formatPopulation(nation.totalPopulation) : "N/A"}
								/>
							</div>
						</details>
					</>
				)}
			</div>
		</div>
	)
}

function DistributionChart({ buckets }: { buckets: Array<{ label: string; count: number }> }) {
	const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1)

	return (
		<div className="rounded-xl border border-slate-200 bg-white/80 px-3 py-3">
			<div className="flex h-32 items-end gap-2">
				{buckets.map((bucket) => (
					<div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
						<span className="font-mono text-[10px] text-slate-400">
							{bucket.count}
						</span>
						<div className="flex h-20 w-full items-end rounded-sm bg-slate-100 px-1">
							<div
								className="w-full rounded-t-sm bg-slate-900 transition-all"
								style={{ height: `${Math.max((bucket.count / maxCount) * 100, bucket.count > 0 ? 8 : 0)}%` }}
							/>
						</div>
						<span className="font-mono text-[9px] uppercase tracking-[0.12em] text-slate-500">
							{bucket.label}
						</span>
					</div>
				))}
			</div>
		</div>
	)
}

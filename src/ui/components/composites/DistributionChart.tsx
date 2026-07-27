import React, { useState } from "react"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { uiTokens } from "@/ui/components/tokens"

export interface DistributionChartBucket {
	label: string
	count: number
	color: string
}

interface DistributionChartProps {
	title: string
	buckets: readonly DistributionChartBucket[]
	/** "compact" collapses the whole chart to a single unboxed row (label,
	 * bar, total) -- identity moves to per-segment hover tooltips. */
	variant?: "default" | "compact"
	showTotal?: boolean
}

export const DistributionChart: React.FC<DistributionChartProps> = ({
	title,
	buckets,
	variant = "default",
	showTotal = true,
}) => {
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
	const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

	if (totalCount === 0) {
		return null
	}

	const visibleBuckets = buckets.filter((bucket) => bucket.count > 0)
	const hovered = hoveredIndex !== null ? visibleBuckets[hoveredIndex] : null
	// Segment midpoints for tooltip anchoring, clamped so the tooltip stays
	// inside the chart near the bar's ends.
	let cumulativeShare = 0
	const midpoints = visibleBuckets.map((bucket) => {
		const share = (bucket.count / totalCount) * 100
		const midpoint = cumulativeShare + share / 2
		cumulativeShare += share
		return Math.min(85, Math.max(15, midpoint))
	})

	if (variant === "compact") {
		return (
			<div className="flex items-center gap-2">
				<span
					className="w-[72px] shrink-0 truncate text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500"
					title={title}
				>
					{title}
				</span>
				<div className="relative min-w-0 flex-1">
					<div
						className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-slate-100"
						onPointerLeave={() => setHoveredIndex(null)}
					>
						{visibleBuckets.map((bucket, index) => (
							<div
								key={bucket.label}
								className="h-full min-w-0"
								style={{
									flexBasis: `${(bucket.count / totalCount) * 100}%`,
									backgroundColor: bucket.color,
									filter:
										hoveredIndex === index ? "brightness(1.15)" : undefined,
								}}
								onPointerEnter={() => setHoveredIndex(index)}
							/>
						))}
					</div>
					{hovered && hoveredIndex !== null ? (
						<div
							className="pointer-events-none absolute top-full z-10 mt-1 -translate-x-1/2 whitespace-nowrap rounded-sm bg-slate-900/95 px-1.5 py-0.5 font-mono text-[9px] text-white shadow-sm"
							style={{ left: `${midpoints[hoveredIndex]}%` }}
						>
							<span className="font-semibold">
								{((hovered.count / totalCount) * 100).toFixed(1)}%
							</span>
							<span className="text-slate-300"> {hovered.label}</span>
						</div>
					) : null}
				</div>
				{showTotal ? (
					<span className="w-12 shrink-0 text-right font-mono text-[8px] text-slate-400">
						{totalCount.toLocaleString()}
					</span>
				) : null}
			</div>
		)
	}

	return (
		<Surface
			tone="panelAccent"
			borderTone="default"
			radius="md"
			padding="sm"
			className="px-2.5 py-2"
		>
			<div className="mb-1.5 flex items-baseline justify-between gap-2">
				<span className={`${uiTokens.type.label} font-semibold text-slate-500`}>
					{title}
				</span>
				<span className="font-mono text-[8px] text-slate-400">
					{totalCount.toLocaleString()}
				</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-slate-100">
				{visibleBuckets.map((bucket) => (
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
				{visibleBuckets.map((bucket) => {
					const share = (bucket.count / totalCount) * 100
					return (
						<div key={bucket.label} className="flex items-center gap-1.5">
							<Swatch
								color={bucket.color}
								shape="round"
								className="h-1.5 w-1.5 border-0"
							/>
							<span className="font-mono text-[8px] text-slate-500">
								{bucket.label} ({bucket.count.toLocaleString()},{" "}
								{share.toFixed(1)}%)
							</span>
						</div>
					)
				})}
			</div>
		</Surface>
	)
}

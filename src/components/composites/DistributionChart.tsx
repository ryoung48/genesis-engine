import React from "react"
import { Surface } from "../primitives/Surface"
import { Swatch } from "../primitives/Swatch"
import { uiTokens } from "../tokens"

export interface DistributionChartBucket {
	label: string
	count: number
	color: string
}

interface DistributionChartProps {
	title: string
	buckets: readonly DistributionChartBucket[]
}

export const DistributionChart: React.FC<DistributionChartProps> = ({
	title,
	buckets,
}) => {
	const totalCount = buckets.reduce((sum, bucket) => sum + bucket.count, 0)

	if (totalCount === 0) {
		return null
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

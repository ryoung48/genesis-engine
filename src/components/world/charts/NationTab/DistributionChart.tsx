import React from "react"

export interface DistributionData {
	label: string
	count: number
	color: string
}

export const DistributionChart: React.FC<{
	title: string
	data: DistributionData[]
}> = ({ title, data }) => {
	const total = data.reduce((acc, d) => acc + d.count, 0)
	if (total === 0) return null

	return (
		<div className="mb-3">
			<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
				{title}
			</div>
			<div className="flex h-2.5 rounded-none overflow-hidden bg-gray-100">
				{data.map((d, i) => (
					<div
						key={i}
						style={{
							width: `${(d.count / total) * 100}%`,
							backgroundColor: d.color,
						}}
						title={`${d.label}: ${d.count}`}
					/>
				))}
			</div>
			<div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
				{data.map((d, i) => (
					<div key={i} className="flex items-center gap-1">
						<div
							className="w-1.5 h-1.5 rounded-none"
							style={{ backgroundColor: d.color }}
						/>
						<span className="text-[9px] text-gray-500 whitespace-nowrap">
							{d.label} ({d.count})
						</span>
					</div>
				))}
			</div>
		</div>
	)
}

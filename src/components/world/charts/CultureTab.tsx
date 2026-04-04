import React from "react"
import { ETHOS_WEIGHTS } from "@/model/actors/culture/ethos"
import { TRADITIONS } from "@/model/actors/culture/traditions"

interface CultureTabProps {
	selectedCulture: number
}

const CATEGORY_COLORS: Record<string, string> = {
	realm: "#6366f1",
	warfare: "#ef4444",
	social: "#10b981",
	ritual: "#f59e0b",
}

export const CultureTab: React.FC<CultureTabProps> = ({ selectedCulture }) => {
	const culture = window.world.cultures?.[selectedCulture]
	if (!culture) {
		return (
			<div className="text-[10px] text-gray-400 text-center py-6">
				Culture not found
			</div>
		)
	}

	const heritage = window.world.heritages?.[culture.heritage]
	const ethosInfo = ETHOS_WEIGHTS.find((e) => e.ethos === culture.ethos)

	// Resolve tradition objects from keys
	const traditionObjects = culture.traditions
		.map((key) => TRADITIONS.find((t) => t.key === key))
		.filter(Boolean) as (typeof TRADITIONS)[number][]

	return (
		<div className="h-full overflow-y-auto">
			{/* Header */}
			<div className="flex items-center gap-2 mb-3 px-1">
				<div
					className="w-3 h-3 border border-black/10 flex-shrink-0"
					style={{ backgroundColor: culture.color }}
				/>
				<div className="flex-1 min-w-0">
					<div className="text-sm font-bold text-gray-900">
						{culture.name || `Culture ${culture.idx}`}
					</div>
					{heritage && (
						<div className="text-[9px] text-gray-400 font-mono">
							{heritage.name || `Heritage ${heritage.idx}`}
						</div>
					)}
				</div>
			</div>

			{/* Stats */}
			<div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-4 px-1">
				<div className="flex gap-1.5 items-baseline">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
						Provinces
					</div>
					<div className="text-sm font-bold text-gray-900 leading-none">
						{culture.provinces.size}
					</div>
				</div>
				<div className="flex gap-1.5 items-baseline">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
						Neighbors
					</div>
					<div className="text-sm font-bold text-gray-900 leading-none">
						{culture.neighbors.size}
					</div>
				</div>
				<div className="flex gap-1.5 items-baseline">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
						Traditions
					</div>
					<div className="text-sm font-bold text-gray-900 leading-none">
						{culture.traditions.length}
					</div>
				</div>
			</div>

			{/* Ethos */}
			{ethosInfo && (
				<div className="mb-4 px-1">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
						Ethos
					</div>
					<div className="bg-gray-50 border border-gray-200 px-2.5 py-2">
						<div className="text-[11px] font-bold text-gray-800 mb-1">
							{ethosInfo.name}
						</div>
						<div className="text-[9px] text-gray-500 leading-relaxed">
							{ethosInfo.description}
						</div>
					</div>
				</div>
			)}

			{/* Traditions */}
			{traditionObjects.length > 0 && (
				<div className="px-1">
					<div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
						Traditions
					</div>
					<div className="space-y-1.5">
						{traditionObjects.map((tradition) => (
							<div
								key={tradition.key}
								className="bg-gray-50 border border-gray-200 px-2.5 py-2"
							>
								<div className="flex items-center gap-1.5 mb-1">
									<div className="text-[11px] font-bold text-gray-800">
										{tradition.name}
									</div>
									<span
										className="text-[8px] font-mono uppercase tracking-wider px-1 py-px border"
										style={{
											color: CATEGORY_COLORS[tradition.category] || "#888",
											borderColor:
												CATEGORY_COLORS[tradition.category] || "#888",
											backgroundColor: `${CATEGORY_COLORS[tradition.category] || "#888"}10`,
										}}
									>
										{tradition.category}
									</span>
								</div>
								<div className="text-[9px] text-gray-500 leading-relaxed">
									{tradition.description}
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	)
}

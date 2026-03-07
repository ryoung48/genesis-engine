import React from "react"
import { NAMES } from "@/model/actors/language/names"
import { World } from "@/model/types"

declare global {
	interface Window {
		world: World
	}
}

interface NationLinkProps {
	id: number
	color?: string
	onZoomToProvince?: (idx: number) => void
	onNationSelect?: (idx: number) => void
	className?: string
}

export const NationLink: React.FC<NationLinkProps> = ({
	id,
	color,
	onZoomToProvince,
	onNationSelect,
	className = "",
}) => {
	// Fallback color if not provided (though usually it should be)
	const resolvedColor = color || window.world?.provinces[id]?.color || "#ccc"

	return (
		<button
			className={`group inline-flex items-center gap-1 text-black hover:text-blue-600 underline decoration-indigo-300 decoration-dotted underline-offset-2 cursor-pointer transition-colors px-0.5 ${className}`}
			onClick={(e) => {
				e.stopPropagation()
				onZoomToProvince?.(id)
				onNationSelect?.(id)
			}}
			title={`Click to fly to ${NAMES.nation(id)}`}
		>
			<span
				className="w-1.5 h-1.5 rounded-full flex-shrink-0"
				style={{ backgroundColor: resolvedColor }}
			/>
			<span>{NAMES.nation(id)}</span>
		</button>
	)
}

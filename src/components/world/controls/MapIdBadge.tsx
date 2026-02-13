import React, { useState } from "react"

interface MapIdBadgeProps {
	mapId: string
}

export const MapIdBadge: React.FC<MapIdBadgeProps> = ({ mapId }) => {
	const [copied, setCopied] = useState(false)

	const handleCopyId = () => {
		if (window.world?.id) {
			navigator.clipboard.writeText(window.world.id)
			setCopied(true)
			setTimeout(() => setCopied(false), 2000)
		}
	}

	return (
		<div
			onClick={handleCopyId}
			className="flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer group relative"
			title="Click to copy Map ID"
		>
			<span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
				ID
			</span>
			<span className="font-mono text-[10px] font-bold text-slate-900">
				{mapId || "---"}
			</span>
			{copied && (
				<div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-mono font-bold px-2 py-1 whitespace-nowrap">
					COPIED
				</div>
			)}
		</div>
	)
}

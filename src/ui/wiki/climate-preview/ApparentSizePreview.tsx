import { uiTokens } from "@/ui/components/tokens"

export interface ApparentSizeEntry {
	label: string
	arcminutes: number
	color: string
}

interface ApparentSizePreviewProps {
	entries: ApparentSizeEntry[]
}

/** Shows the relative angular diameters of the bodies visible from the
 * selected planet or moon at their average orbital distances. */
export function ApparentSizePreview({ entries }: ApparentSizePreviewProps) {
	if (entries.length === 0) return null
	const maximumArcminutes = Math.max(
		...entries.map((entry) => entry.arcminutes),
		1,
	)
	return (
		<div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/20">
			<div className="flex items-baseline justify-between gap-2">
				<span className={uiTokens.type.control}>Apparent Size</span>
				<span className="font-mono text-[9px] text-slate-400">
					Average orbital distance
				</span>
			</div>
			<div className="mt-2 flex items-end gap-3 overflow-x-auto pb-1">
				{entries.map((entry) => {
					const radius = Math.max(
						5,
						(entry.arcminutes / maximumArcminutes) * 34,
					)
					const sizeLabel =
						entry.arcminutes >= 1
							? `${entry.arcminutes.toFixed(1)}′`
							: `${(entry.arcminutes * 60).toFixed(0)}″`
					return (
						<div
							key={entry.label}
							className="flex min-w-12 flex-col items-center gap-0.5"
						>
							<svg
								viewBox="0 0 80 80"
								className="size-12"
								aria-label={`${entry.label}: ${sizeLabel}`}
							>
								<circle cx="40" cy="40" r={radius} fill={entry.color} />
							</svg>
							<span className="max-w-16 truncate text-center text-[9px] font-medium text-slate-600">
								{entry.label}
							</span>
							<span className="font-mono text-[9px] text-slate-400">
								{sizeLabel}
							</span>
						</div>
					)
				})}
			</div>
		</div>
	)
}

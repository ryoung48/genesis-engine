import React from "react"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import type { ColorMode } from "@/ui/planet/colors"
import { getBaseMapMode } from "@/ui/planet/screen/shared/data-variant"
import type {
	NationMapMode,
	PopulationMapMode,
} from "@/ui/planet/screen/shared/map-modes"
import type { LabelMode } from "./types"

export interface LabelsSectionProps {
	labelsExpanded: boolean
	setLabelsExpanded: (v: boolean | ((prev: boolean) => boolean)) => void
	colorMode: ColorMode
	populationMode: PopulationMapMode
	nationMode: NationMapMode
	labelMode: LabelMode
	setLabelMode: (v: LabelMode) => void
}

export const LabelsSection: React.FC<LabelsSectionProps> = ({
	labelsExpanded,
	setLabelsExpanded,
	colorMode,
	populationMode,
	nationMode,
	labelMode,
	setLabelMode,
}) => {
	return (
		<div>
			<button
				type="button"
				onClick={() => setLabelsExpanded((v) => !v)}
				className="flex items-center justify-between w-full text-[11px] font-medium text-slate-200 hover:text-slate-100 transition-colors"
			>
				<span>Labels</span>
				<ChevronIcon
					direction={labelsExpanded ? "up" : "down"}
					className="h-3 w-3 text-slate-400"
				/>
			</button>
			{labelsExpanded && (
				<div className="mt-1.5 space-y-1.5">
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>
							{getBaseMapMode(colorMode) === "population" &&
							populationMode === "culture"
								? "Culture"
								: getBaseMapMode(colorMode) === "population" &&
										(populationMode === "heritage" ||
											populationMode === "religion")
									? "Heritage"
									: nationMode === "dynasty"
										? "Dynasty"
										: "Nations"}
						</span>
						<input
							type="checkbox"
							checked={
								labelMode.nations ||
								labelMode.dynasty ||
								labelMode.culture ||
								labelMode.heritage
							}
							onChange={(e) => {
								const isPopMode = getBaseMapMode(colorMode) === "population"
								const isDynasty = nationMode === "dynasty"
								setLabelMode({
									...labelMode,
									nations: e.target.checked && !isPopMode && !isDynasty,
									dynasty: e.target.checked && !isPopMode && isDynasty,
									culture:
										e.target.checked &&
										isPopMode &&
										populationMode === "culture",
									heritage:
										e.target.checked &&
										isPopMode &&
										(populationMode === "heritage" ||
											populationMode === "religion"),
								})
							}}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Settlements</span>
						<input
							type="checkbox"
							checked={labelMode.settlements}
							onChange={(e) =>
								setLabelMode({
									...labelMode,
									settlements: e.target.checked,
								})
							}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
					<label className="flex items-center justify-between gap-3 text-[11px] font-medium text-slate-300">
						<span>Script</span>
						<input
							type="checkbox"
							checked={labelMode.script}
							onChange={(e) =>
								setLabelMode({
									...labelMode,
									script: e.target.checked,
								})
							}
							className="h-4 w-4 rounded border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
						/>
					</label>
				</div>
			)}
		</div>
	)
}

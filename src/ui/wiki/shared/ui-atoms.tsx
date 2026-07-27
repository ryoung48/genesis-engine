import React from "react"
import {
	EditableStatValue,
	type StatEntry,
} from "@/ui/components/composites/EditableStatValue"
import { CrosshairsGpsIcon } from "@/ui/components/primitives/icons/CrosshairsGpsIcon"
import { Tooltip as UITooltip } from "@/ui/components/primitives/Tooltip"
import type { SliderDef } from "@/ui/planet/screen/generation/sliders"

export function GpsFocusButton({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={(event) => {
				event.preventDefault()
				onClick()
			}}
			className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
			aria-label="Focus on this body"
		>
			<CrosshairsGpsIcon className="h-3 w-3" />
		</button>
	)
}

export function renderStatGrid(stats: StatEntry[]) {
	return stats.map((stat) => (
		<React.Fragment key={stat.label}>
			{stat.help ? (
				<UITooltip content={stat.help} position="top" align="start">
					<span className="cursor-help border-b border-dotted border-slate-300 text-[9px] text-slate-400">
						{stat.label}
					</span>
				</UITooltip>
			) : (
				<span className="text-[9px] text-slate-400">{stat.label}</span>
			)}
			<div className="flex">
				{stat.valueHelp && stat.valueHelpTarget !== "prefix" ? (
					<UITooltip content={stat.valueHelp} position="top" align="center">
						<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
							<EditableStatValue stat={stat} />
						</span>
					</UITooltip>
				) : stat.valueHelp &&
					stat.valueHelpTarget === "prefix" &&
					!stat.editor &&
					stat.valuePrefix ? (
					<span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700">
						<UITooltip content={stat.valueHelp} position="top" align="center">
							<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
								{stat.valuePrefix}
							</span>
						</UITooltip>
						<span>{stat.value}</span>
						{stat.valueAction}
					</span>
				) : (
					<EditableStatValue stat={stat} />
				)}
			</div>
		</React.Fragment>
	))
}

export function renderMiniSlider(
	slider: SliderDef,
	label = slider.label,
	value = slider.display,
) {
	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center justify-between gap-3">
				<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
					{label}
				</span>
				<span className="font-mono text-[10px] text-slate-400">{value}</span>
			</div>
			<input
				type="range"
				min={slider.min}
				max={slider.max}
				step={slider.step}
				value={slider.value}
				onChange={(e) => slider.set(parseFloat(e.target.value))}
				className="h-1 w-full cursor-pointer rounded-lg accent-slate-900"
			/>
		</div>
	)
}

export function DataSectionSummary() {
	return (
		<summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500">
			<span>Climate</span>
			<svg
				width="12"
				height="12"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="text-slate-400 transition-transform group-open:rotate-180"
			>
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</summary>
	)
}

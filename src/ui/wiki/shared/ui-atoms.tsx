import React from "react"
import {
	EditableStatValue,
	type StatEntry,
	TrailingHelpIcon,
} from "@/ui/components/composites/EditableStatValue"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import { CrosshairsGpsIcon } from "@/ui/components/primitives/icons/CrosshairsGpsIcon"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { Tooltip as UITooltip } from "@/ui/components/primitives/Tooltip"
import { uiTokens } from "@/ui/components/tokens"

export function GpsFocusButton({ onClick }: { onClick: () => void }) {
	return (
		<IconButton
			tone="borderless"
			size="xs"
			onClick={(event) => {
				event.preventDefault()
				onClick()
			}}
			aria-label="Focus on this body"
		>
			<CrosshairsGpsIcon className="h-3 w-3" />
		</IconButton>
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
				{stat.valueHelp &&
				stat.valueHelpTarget !== "prefix" &&
				stat.valueHelpTarget !== "suffix" ? (
					<span className="inline-flex items-center gap-1">
						{stat.swatchColor ? <Swatch color={stat.swatchColor} /> : null}
						<UITooltip content={stat.valueHelp} position="top" align="center">
							<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
								<EditableStatValue stat={{ ...stat, swatchColor: null }} />
							</span>
						</UITooltip>
					</span>
				) : stat.valueHelp && !stat.editor && stat.valuePrefix ? (
					<span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700">
						{stat.swatchColor ? <Swatch color={stat.swatchColor} /> : null}
						{stat.valueHelpTarget === "prefix" ? (
							<UITooltip content={stat.valueHelp} position="top" align="center">
								<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
									{stat.valuePrefix}
								</span>
							</UITooltip>
						) : (
							<span>{stat.valuePrefix}</span>
						)}
						{stat.valueHelpTarget === "suffix" ? (
							<UITooltip content={stat.valueHelp} position="top" align="center">
								<span className="inline-flex cursor-help items-center border-b border-dotted border-slate-300">
									{stat.value}
								</span>
							</UITooltip>
						) : (
							<span>{stat.value}</span>
						)}
						{stat.valueAction}
						{stat.trailingHelp ? (
							<TrailingHelpIcon content={stat.trailingHelp} />
						) : null}
					</span>
				) : (
					<EditableStatValue stat={stat} />
				)}
			</div>
		</React.Fragment>
	))
}

// Rendered as a native <summary> (not DisclosureButton) because it lives
// inside a <details> element and relies on the browser's built-in
// open/close toggle -- but it reuses the shared ChevronIcon (see B1/A3) so
// no chevron SVG is hand-rolled here.
export function DataSectionSummary() {
	return (
		<summary
			className={`flex cursor-pointer list-none items-center justify-between gap-2 ${uiTokens.type.controlSm} text-slate-500`}
		>
			<span>Climate</span>
			<ChevronIcon
				width={12}
				height={12}
				className="text-slate-400 transition-transform group-open:rotate-180"
			/>
		</summary>
	)
}

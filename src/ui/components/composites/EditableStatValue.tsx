import { type ReactNode, useState } from "react"
import { Popover } from "@/ui/components/composites/Popover"
import { Slider } from "@/ui/components/primitives/Slider"

interface StatEditor {
	label: string
	value: number
	min: number
	max: number
	step: number
	display: string
	set: (value: number) => void
	content?: ReactNode
}

export interface StatEntry {
	label: string
	value: string
	valuePrefix?: string
	help?: string
	/** Tooltip on the value itself (rather than the label) -- e.g. a
	 * per-source contribution breakdown for a summed stat. */
	valueHelp?: ReactNode
	valueHelpTarget?: "all" | "prefix"
	editor?: StatEditor
	valueAction?: ReactNode
}

// Units that stay glued to the number, underlined as part of the clickable
// target rather than split out as plain trailing text -- unlike "12.00 R⊕"
// or "1.234 AU", "102.0°" and "45%" read as a single unbroken value.
const ATTACHED_UNITS = new Set(["°", "%"])

// Splits a formatted stat string like "12.00 R⊕" or "102.0°" into its
// leading numeric portion and trailing unit text, so an editable stat's
// underline lands on just the number -- the unit reads as plain static text
// next to it rather than being part of the clickable target. Requires the
// unit (if any) to be whitespace-separated from the number -- a non-numeric
// value that merely starts with a digit (e.g. "1:1 tidal lock") has no such
// gap, so the whole regex fails to match and the entire string falls
// through as one unsplit "numeric" (i.e. clickable/underlined) target,
// rather than silently chopping off just its leading digit.
function splitNumericAndUnit(text: string): { numeric: string; unit: string } {
	const match = text.match(/^(-?[\d.]+)(?:\s+(.*))?$/)
	if (!match) return { numeric: text, unit: "" }
	const [, numeric, unit = ""] = match
	if (ATTACHED_UNITS.has(unit))
		return { numeric: `${numeric}${unit}`, unit: "" }
	return { numeric, unit }
}

export function EditableStatValue({ stat }: { stat: StatEntry }) {
	const [visible, setVisible] = useState(false)
	const editor = stat.editor
	const valueNode = (
		<>
			{stat.valuePrefix && <>{stat.valuePrefix} </>}
			{stat.value}
			{stat.valueAction}
		</>
	)

	if (!editor) {
		return (
			<span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700">
				{valueNode}
			</span>
		)
	}

	const { numeric, unit } = splitNumericAndUnit(stat.valuePrefix ?? stat.value)

	return (
		<span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700">
			<Popover
				open={visible}
				onDismiss={() => setVisible(false)}
				panelClassName="bottom-full left-1/2 mb-2 -translate-x-1/2"
				trigger={
					<>
						<span
							onClick={() => setVisible((v) => !v)}
							className="inline-block cursor-pointer text-[9px] font-mono text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
						>
							{numeric}
						</span>
						{unit && <span className="ml-1">{unit}</span>}
					</>
				}
			>
				{editor.content ?? (
					<div className="w-36 px-1 pt-0.5 pb-2">
						<Slider
							label={editor.label}
							value={editor.display.replace("× Earth", "×")}
							min={editor.min}
							max={editor.max}
							step={editor.step}
							inputValue={editor.value}
							onChange={editor.set}
						/>
					</div>
				)}
			</Popover>
			{stat.valuePrefix && <span>{stat.value}</span>}
			{stat.valueAction}
		</span>
	)
}

import { type ReactNode, useEffect, useRef, useState } from "react"

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
// next to it rather than being part of the clickable target.
function splitNumericAndUnit(text: string): { numeric: string; unit: string } {
	const match = text.match(/^(-?[\d.]+)\s*(.*)$/)
	if (!match) return { numeric: text, unit: "" }
	const [, numeric, unit] = match
	if (ATTACHED_UNITS.has(unit))
		return { numeric: `${numeric}${unit}`, unit: "" }
	return { numeric, unit }
}

export function EditableStatValue({ stat }: { stat: StatEntry }) {
	const [visible, setVisible] = useState(false)
	const containerRef = useRef<HTMLSpanElement>(null)
	const editor = stat.editor
	const valueNode = (
		<>
			{stat.valuePrefix && <>{stat.valuePrefix} </>}
			{stat.value}
			{stat.valueAction}
		</>
	)

	useEffect(() => {
		if (!editor || !visible) return
		const handlePointerDown = (event: PointerEvent) => {
			if (!containerRef.current?.contains(event.target as Node)) {
				setVisible(false)
			}
		}
		document.addEventListener("pointerdown", handlePointerDown)
		return () => document.removeEventListener("pointerdown", handlePointerDown)
	}, [editor, visible])

	if (!editor) {
		return (
			<span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700">
				{valueNode}
			</span>
		)
	}

	const { numeric, unit } = splitNumericAndUnit(stat.valuePrefix ?? stat.value)

	return (
		<span
			ref={containerRef}
			className="relative inline-flex items-center gap-1 text-[9px] font-mono text-slate-700"
		>
			<span className="relative inline-flex items-center gap-1">
				<span
					onClick={() => setVisible((v) => !v)}
					className="inline-block cursor-pointer text-[9px] font-mono text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
				>
					{numeric}
				</span>
				{unit && <span>{unit}</span>}
				{visible ? (
					<div className="absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white shadow-lg">
						{editor.content ?? (
							<div className="flex w-36 flex-col px-1 pt-0.5 pb-2">
								<div className="flex items-center justify-between gap-3">
									<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
										{editor.label}
									</span>
									<span className="font-mono text-[10px] text-slate-400">
										{editor.display.replace("× Earth", "×")}
									</span>
								</div>
								<input
									type="range"
									min={editor.min}
									max={editor.max}
									step={editor.step}
									value={editor.value}
									onChange={(e) => editor.set(parseFloat(e.target.value))}
									className="mt-3 h-1 w-full cursor-pointer rounded-lg accent-slate-900"
								/>
							</div>
						)}
					</div>
				) : null}
			</span>
			{stat.valuePrefix && <span>{stat.value}</span>}
			{stat.valueAction}
		</span>
	)
}

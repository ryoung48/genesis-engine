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
	valueHelp?: string
	editor?: StatEditor
	valueAction?: ReactNode
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

	return (
		<span
			ref={containerRef}
			className="relative inline-flex items-center gap-1 text-[9px] font-mono text-slate-700"
		>
			<span className="relative inline-flex">
				<span
					onClick={() => setVisible((v) => !v)}
					className="inline-block cursor-pointer text-[9px] font-mono text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
				>
					{stat.valuePrefix ?? stat.value}
				</span>
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

import Tippy from "@tippyjs/react"
import "tippy.js/dist/tippy.css"
import "tippy.js/themes/light-border.css"
import { type ReactNode, useState } from "react"

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
	editor?: StatEditor
	valueAction?: ReactNode
}

export function EditableStatValue({ stat }: { stat: StatEntry }) {
	const [visible, setVisible] = useState(false)
	const editor = stat.editor

	if (!editor) {
		return (
			<span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700">
				{stat.valuePrefix && <>{stat.valuePrefix} </>}
				{stat.value}
				{stat.valueAction}
			</span>
		)
	}

	return (
		<span className="inline-flex items-center gap-1 text-[9px] font-mono text-slate-700">
			{stat.valuePrefix && <>{stat.valuePrefix} </>}
			<Tippy
				visible={visible}
				onClickOutside={() => setVisible(false)}
				interactive
				placement="top"
				theme="light-border"
				content={
					editor.content ?? (
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
					)
				}
			>
				<span
					onClick={() => setVisible((v) => !v)}
					className="inline-block cursor-pointer text-[9px] font-mono text-slate-700 underline decoration-dotted underline-offset-2 hover:text-slate-900"
				>
					{stat.value}
				</span>
			</Tippy>
			{stat.valueAction}
		</span>
	)
}

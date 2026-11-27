import { useEffect, useRef, useState } from "react"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"
import type { SwatchDropdownOption, SwatchDropdownProps } from "./types"

function OptionLabel<T extends string>({
	option,
}: {
	option: SwatchDropdownOption<T>
}) {
	return (
		<span className="flex items-center gap-1.5">
			<span className="flex w-2 justify-center">
				<Swatch color={option.rgb ? rgbToCss(option.rgb) : null} />
			</span>
			{option.label}
		</span>
	)
}

export function SwatchDropdown<T extends string>({
	label,
	options,
	value,
	onChange,
}: SwatchDropdownProps<T>) {
	const [open, setOpen] = useState(false)
	const root = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!open) return
		const close = (event: MouseEvent) => {
			if (!root.current?.contains(event.target as Node)) setOpen(false)
		}
		document.addEventListener("mousedown", close)
		return () => document.removeEventListener("mousedown", close)
	}, [open])
	const current = options.find((option) => option.value === value)
	return (
		<div ref={root} className="relative text-[11px] leading-4 text-slate-200">
			<button
				type="button"
				aria-label={label}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="flex w-full items-center justify-between rounded border border-slate-700 bg-slate-900 px-1 py-0 text-left"
				onClick={() => setOpen(!open)}
			>
				{current ? <OptionLabel option={current} /> : null}
				<span aria-hidden>▾</span>
			</button>
			{open ? (
				<ul
					role="listbox"
					className="absolute z-20 mt-0.5 max-h-48 w-full overflow-y-auto rounded border border-slate-700 bg-slate-900"
				>
					{options.map((option) => (
						<li
							key={option.value}
							role="option"
							aria-selected={option.value === value}
							className={`cursor-pointer px-1 py-0 hover:bg-slate-700 ${option.value === value ? "bg-slate-800" : ""}`}
							onClick={() => {
								onChange(option.value)
								setOpen(false)
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									onChange(option.value)
									setOpen(false)
								}
							}}
						>
							<OptionLabel option={option} />
						</li>
					))}
				</ul>
			) : null}
		</div>
	)
}

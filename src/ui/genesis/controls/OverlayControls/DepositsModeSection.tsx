import React, { useEffect, useMemo, useRef, useState } from "react"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { DEPOSITS_VIEW } from "@/ui/genesis/shared/deposits-view"
import type {
	DepositsView,
	DepositsViewOption,
} from "@/ui/genesis/shared/deposits-view/types"
import { rgbToCss } from "@/ui/genesis/shared/ui-format"

export interface DepositsModeSectionProps {
	hasDeposits: boolean
	depositsView: DepositsView
	setDepositsView: (v: DepositsView) => void
}

const OptionLabel: React.FC<{ option: DepositsViewOption }> = ({ option }) => (
	<span className="flex items-center gap-1.5">
		<span className="flex w-2 justify-center">
			<Swatch color={option.rgb ? rgbToCss(option.rgb) : null} />
		</span>
		{option.label}
	</span>
)

export const DepositsModeSection: React.FC<DepositsModeSectionProps> = ({
	hasDeposits,
	depositsView,
	setDepositsView,
}) => {
	const options = useMemo(() => DEPOSITS_VIEW.options(), [])
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
	if (!hasDeposits) return null
	const current = options.find((option) => option.value === depositsView)
	return (
		<div ref={root} className="relative text-[11px] leading-4 text-slate-200">
			<button
				type="button"
				aria-label="Deposits"
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
							aria-selected={option.value === depositsView}
							className={`cursor-pointer px-1 py-0 hover:bg-slate-700 ${option.value === depositsView ? "bg-slate-800" : ""}`}
							onClick={() => {
								setDepositsView(option.value)
								setOpen(false)
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									setDepositsView(option.value)
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

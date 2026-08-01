import React from "react"
import { cx } from "@/ui/components/lib"
import { uiTokens } from "@/ui/components/tokens"

interface SliderProps {
	label: React.ReactNode
	value: React.ReactNode
	min: number
	max: number
	step: number
	inputValue: number
	onChange: (value: number) => void
	className?: string
}

/** Label + mono value row above an `<input type="range">` -- the canonical
 * mini-slider used by every stat editor popover and slider row. */
export const Slider: React.FC<SliderProps> = ({
	label,
	value,
	min,
	max,
	step,
	inputValue,
	onChange,
	className,
}) => (
	<div className={cx("flex flex-col gap-1", className)}>
		<div className="flex items-center justify-between gap-3">
			<span className={`${uiTokens.type.labelSm} text-slate-500`}>{label}</span>
			<span className="font-mono text-[10px] text-slate-400">{value}</span>
		</div>
		<input
			type="range"
			min={min}
			max={max}
			step={step}
			value={inputValue}
			onChange={(e) => onChange(parseFloat(e.target.value))}
			className="h-1 w-full cursor-pointer rounded-lg accent-slate-900"
		/>
	</div>
)

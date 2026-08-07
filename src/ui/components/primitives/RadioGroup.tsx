import React, { useId } from "react"
import { cx } from "@/ui/components/lib"
import { uiTokens } from "@/ui/components/tokens"

interface RadioOption<T extends string> {
	value: T
	label: React.ReactNode
	/** [JUSTIFICATION] Some choices depend on data that may not be available. */
	disabled?: boolean
}

interface RadioGroupProps<T extends string> {
	label: string
	orientation: "horizontal" | "vertical"
	options: ReadonlyArray<RadioOption<T>>
	value: T
	onChange: (value: T) => void
}

/** Presents one mutually exclusive choice as native radio inputs. */
export function RadioGroup<T extends string>({
	label,
	orientation,
	options,
	value,
	onChange,
}: RadioGroupProps<T>) {
	const name = useId()
	return (
		<fieldset
			className={
				orientation === "horizontal"
					? "flex flex-wrap gap-x-3 gap-y-1"
					: "space-y-1"
			}
		>
			<legend className="sr-only">{label}</legend>
			{options.map((option) => (
				<label
					key={option.value}
					className={cx(
						"flex items-center gap-2",
						option.disabled
							? "cursor-not-allowed opacity-50"
							: "cursor-pointer",
						uiTokens.type.controlTextSm,
						uiTokens.text.inverseMuted,
					)}
				>
					<input
						type="radio"
						name={name}
						checked={option.value === value}
						disabled={option.disabled}
						onChange={() => onChange(option.value)}
						className="h-3 w-3 border-white/20 bg-slate-900 text-slate-100 focus:ring-slate-100/20"
					/>
					<span>{option.label}</span>
				</label>
			))}
		</fieldset>
	)
}

import { cx, uiTokens } from "@/components"

const BUTTON_CLASS = cx(
	uiTokens.radius.md,
	"px-2 py-1 transition-all",
	uiTokens.type.control,
)
const ACTIVE_CLASS = "bg-white/15 text-white shadow-sm"
const INACTIVE_CLASS = "text-slate-400 hover:text-slate-200"

export function ModeButtonGroup<T extends string>({
	options,
	value,
	isActive,
	onChange,
	buttonClassName,
}: {
	options: ReadonlyArray<readonly [T, string]>
	value: T
	isActive?: (mode: T) => boolean
	onChange: (mode: T) => void
	buttonClassName?: string
}) {
	return (
		<>
			{options.map(([mode, label]) => {
				const active = isActive ? isActive(mode) : value === mode
				return (
					<button
						key={mode}
						onClick={() => onChange(mode)}
						className={`${BUTTON_CLASS} ${active ? ACTIVE_CLASS : INACTIVE_CLASS} ${buttonClassName ?? ""}`}
					>
						{label}
					</button>
				)
			})}
		</>
	)
}

export function BinaryToggle({
	value,
	onChange,
	trueLabel = "Annual",
	falseLabel = "Monthly",
	className,
}: {
	value: boolean
	onChange: (v: boolean) => void
	trueLabel?: string
	falseLabel?: string
	className?: string
}) {
	return (
		<>
			{([true, false] as const).map((opt) => (
				<button
					key={opt ? "true" : "false"}
					onClick={() => onChange(opt)}
					className={`${BUTTON_CLASS} ${value === opt ? ACTIVE_CLASS : INACTIVE_CLASS} ${className ?? ""}`}
				>
					{opt ? trueLabel : falseLabel}
				</button>
			))}
		</>
	)
}

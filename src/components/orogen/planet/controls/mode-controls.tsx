const BUTTON_CLASS =
	"rounded-lg px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] transition-all"
const ACTIVE_CLASS = "bg-white/15 text-white shadow-sm"
const INACTIVE_CLASS = "text-slate-400 hover:text-slate-200"

export function ModeButtonGroup<T extends string>({
	options,
	value,
	isActive,
	onChange,
}: {
	options: ReadonlyArray<[T, string]>
	value: T
	isActive?: (mode: T) => boolean
	onChange: (mode: T) => void
}) {
	return (
		<>
			{options.map(([mode, label]) => {
				const active = isActive ? isActive(mode) : value === mode
				return (
					<button
						key={mode}
						onClick={() => onChange(mode)}
						className={`${BUTTON_CLASS} ${active ? ACTIVE_CLASS : INACTIVE_CLASS}`}
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
}: {
	value: boolean
	onChange: (v: boolean) => void
	trueLabel?: string
	falseLabel?: string
}) {
	return (
		<>
			{([true, false] as const).map((opt) => (
				<button
					key={opt ? "true" : "false"}
					onClick={() => onChange(opt)}
					className={`${BUTTON_CLASS} ${value === opt ? ACTIVE_CLASS : INACTIVE_CLASS}`}
				>
					{opt ? trueLabel : falseLabel}
				</button>
			))}
		</>
	)
}

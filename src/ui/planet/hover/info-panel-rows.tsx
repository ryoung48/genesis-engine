import { Fragment } from "react"
import { LabeledValueRow } from "@/ui/components/primitives/LabeledValueRow"
import { Swatch } from "@/ui/components/primitives/Swatch"

export function Row({ label, value }: { label: string; value: string }) {
	return <LabeledValueRow label={label} value={value} tone="overlay" />
}

export function SwatchRow({
	label,
	value,
	color,
	striped = false,
	stripeBackground = "rgba(15, 23, 42, 0.85)",
}: {
	label: string
	value: string
	color: string | null
	striped?: boolean
	stripeBackground?: string
}) {
	return (
		<LabeledValueRow
			label={label}
			tone="overlay"
			value={
				<span className="flex items-center gap-1.5 font-mono text-[10px] text-slate-100">
					<Swatch
						color={color}
						striped={striped}
						stripeBackground={stripeBackground}
						className="border-white/15"
					/>
					<span>{value}</span>
				</span>
			}
		/>
	)
}

export function MultiSwatchRow({
	label,
	values,
}: {
	label: string
	values: Array<{ label: string; color: string | null }>
}) {
	return (
		<LabeledValueRow
			label={label}
			tone="overlay"
			value={
				<span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 font-mono text-[10px] text-slate-100">
					{values.map((value, index) => (
						<Fragment key={`${value.label}-${index}`}>
							<span className="inline-flex items-center gap-1.5">
								<Swatch color={value.color} className="border-white/15" />
								<span>{value.label}</span>
							</span>
							{index < values.length - 1 && (
								<span className="text-slate-500">,</span>
							)}
						</Fragment>
					))}
				</span>
			}
		/>
	)
}

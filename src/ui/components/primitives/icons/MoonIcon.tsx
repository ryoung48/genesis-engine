import type { MoonIconProps } from "@/ui/components/primitives/icons/types"

export function MoonIcon({ illumination, waxing, ...props }: MoonIconProps) {
	const fraction = Math.max(0, Math.min(1, illumination))
	const terminatorRadius = Math.abs(1 - 2 * fraction) * 10
	const terminator =
		fraction === 0.5
			? "L12 2"
			: `A${terminatorRadius} 10 0 0 ${fraction < 0.5 ? 0 : 1} 12 2`
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
			<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" />
			{fraction > 0 && (
				<path
					d={`M12 2A10 10 0 0 1 12 22${terminator}Z`}
					transform={waxing ? undefined : "translate(24 0) scale(-1 1)"}
				/>
			)}
		</svg>
	)
}

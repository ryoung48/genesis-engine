import React from "react"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Swatch } from "@/ui/components/primitives/Swatch"

interface EntityChipProps {
	name: string
	color: string | null
	onClick?: () => void
	/** Marks an associate/non-genuine mention (e.g. a nation merely holding
	 * enclave territory of an organization) with a striped swatch instead of
	 * a solid one. */
	striped?: boolean
	/** Visually de-emphasizes a chip that isn't currently active/relevant
	 * (e.g. a war participant who hasn't joined yet at the selected date). */
	dimmed?: boolean
	title?: string
	trailing?: React.ReactNode
}

/** Swatch + name chip, optionally clickable -- the shared shape behind every
 * nation/culture/religion/org/war "link" rendered across the wiki pages and
 * timeline text. */
export const EntityChip: React.FC<EntityChipProps> = ({
	name,
	color,
	onClick,
	striped,
	dimmed,
	title,
	trailing,
}) => {
	const content = (
		<>
			<Swatch
				color={color}
				striped={striped}
				stripeBackground="transparent"
				className="shrink-0"
			/>
			<span>{name}</span>
			{trailing}
		</>
	)
	const className = `inline-flex items-center gap-1 align-baseline${dimmed ? " opacity-40" : ""}`
	if (!onClick) {
		return (
			<span className={className} title={title}>
				{content}
			</span>
		)
	}
	return (
		<InlineTextButton
			onClick={onClick}
			className={className}
			title={title}
			type="button"
		>
			{content}
		</InlineTextButton>
	)
}

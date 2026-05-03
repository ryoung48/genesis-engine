import React from "react"
import { cx } from "../lib"

type SwatchShape = "square" | "round"
type SwatchSize = "sm" | "md"

const shapeClassName: Record<SwatchShape, string> = {
	square: "rounded-sm",
	round: "rounded-full",
}

const sizeClassName: Record<SwatchSize, string> = {
	sm: "h-2 w-2",
	md: "h-2.5 w-2.5",
}

interface SwatchProps extends React.HTMLAttributes<HTMLSpanElement> {
	color: string | null
	striped?: boolean
	stripeBackground?: string
	shape?: SwatchShape
	size?: SwatchSize
}

export const Swatch: React.FC<SwatchProps> = ({
	color,
	striped = false,
	stripeBackground = "rgba(15, 23, 42, 0.85)",
	shape = "square",
	size = "sm",
	className,
	style,
	...props
}) =>
	color ? (
		<span
			className={cx(
				"border",
				sizeClassName[size],
				shapeClassName[shape],
				className,
			)}
			style={{
				borderColor: striped
					? "rgba(255,255,255,0.15)"
					: "rgba(203, 213, 225, 0.8)",
				...(striped
					? {
							backgroundImage: `repeating-linear-gradient(135deg, ${color} 0 2px, ${stripeBackground} 2px 4px)`,
						}
					: { backgroundColor: color }),
				...style,
			}}
			{...props}
		/>
	) : null

import React from "react"

interface ChevronIconProps extends React.SVGProps<SVGSVGElement> {
	direction?: "up" | "down"
}

export const ChevronIcon: React.FC<ChevronIconProps> = ({
	direction = "down",
	...props
}) => (
	<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
		{direction === "up" ? (
			<path d="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z" />
		) : (
			<path d="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z" />
		)}
	</svg>
)

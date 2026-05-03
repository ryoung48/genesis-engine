import React from "react"

export const CopyIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
		<path
			d="M9 9.75A1.75 1.75 0 0 1 10.75 8h7.5A1.75 1.75 0 0 1 20 9.75v8.5A1.75 1.75 0 0 1 18.25 20h-7.5A1.75 1.75 0 0 1 9 18.25z"
			stroke="currentColor"
			strokeWidth="1.75"
		/>
		<path
			d="M15 8V5.75A1.75 1.75 0 0 0 13.25 4h-7.5A1.75 1.75 0 0 0 4 5.75v8.5A1.75 1.75 0 0 0 5.75 16H9"
			stroke="currentColor"
			strokeWidth="1.75"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
	</svg>
)

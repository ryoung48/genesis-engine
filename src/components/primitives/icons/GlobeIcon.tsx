import React from "react"

export const GlobeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
	<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
		<circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
		<path
			d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
			stroke="currentColor"
			strokeWidth="1.5"
		/>
	</svg>
)

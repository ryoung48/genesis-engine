import React from "react"
import { cx } from "@/ui/components/lib"
import { Surface } from "@/ui/components/primitives/Surface"

interface FloatingPanelProps extends React.HTMLAttributes<HTMLDivElement> {
	interactive?: boolean
	padding?: "none" | "sm" | "md" | "lg"
	tone?: "overlay" | "overlaySubtle"
}

export const FloatingPanel: React.FC<FloatingPanelProps> = ({
	interactive = true,
	padding = "md",
	tone = "overlay",
	className,
	...props
}) => (
	<Surface
		tone={tone}
		borderTone={tone === "overlay" ? "inverse" : "inverseStrong"}
		radius="xl"
		shadow="lg"
		blur="md"
		padding={padding}
		className={cx(interactive ? "pointer-events-auto" : "", className)}
		{...props}
	/>
)

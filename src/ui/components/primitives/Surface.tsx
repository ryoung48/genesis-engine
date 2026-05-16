import React from "react"
import { cx } from "../lib"
import {
	type UiBlur,
	type UiBorderTone,
	type UiRadius,
	type UiShadow,
	type UiSurfaceTone,
	uiTokens,
} from "../tokens"

type SurfacePadding = "none" | "sm" | "md" | "lg"

const paddingClassName: Record<SurfacePadding, string> = {
	none: "",
	sm: "px-2.5 py-2",
	md: "px-3 py-3",
	lg: "px-4 py-4",
}

interface SurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
	tone?: UiSurfaceTone
	borderTone?: UiBorderTone
	radius?: UiRadius
	shadow?: UiShadow
	blur?: UiBlur
	padding?: SurfacePadding
}

export const Surface: React.FC<SurfaceProps> = ({
	tone = "panel",
	borderTone,
	radius = "md",
	shadow,
	blur,
	padding = "none",
	className,
	...props
}) => (
	<div
		className={cx(
			uiTokens.surface[tone],
			borderTone ? `border ${uiTokens.border[borderTone]}` : "",
			uiTokens.radius[radius],
			shadow ? uiTokens.shadow[shadow] : "",
			blur ? uiTokens.blur[blur] : "",
			paddingClassName[padding],
			className,
		)}
		{...props}
	/>
)

import React from "react"

export const InlineTextButton: React.FC<
	React.ButtonHTMLAttributes<HTMLButtonElement>
> = ({ className, type = "button", ...props }) => (
	<button
		type={type}
		className={`cursor-pointer underline underline-offset-2 transition-colors hover:text-slate-900 ${className ?? ""}`.trim()}
		{...props}
	/>
)

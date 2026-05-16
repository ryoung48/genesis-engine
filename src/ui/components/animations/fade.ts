import { cx } from "../lib"

export function fadeVisibilityClassName(
	visible: boolean,
	className?: string,
): string {
	return cx(
		"transition-opacity duration-150 ease-out",
		visible ? "opacity-100" : "pointer-events-none opacity-0",
		className,
	)
}

export function fadeBackdropClassName(
	visible: boolean,
	className?: string,
): string {
	return fadeVisibilityClassName(
		visible,
		cx("bg-slate-950/20", visible ? "pointer-events-auto" : "", className),
	)
}

import React, { useRef } from "react"
import { useDismissOnOutsideClick } from "@/ui/components/hooks/useDismissOnOutsideClick"
import { cx } from "@/ui/components/lib"

interface PopoverProps {
	open: boolean
	onDismiss: () => void
	children: React.ReactNode
	/** Anchor wrapper class -- the popover positions itself absolutely inside
	 * this relatively-positioned container. */
	anchorClassName?: string
	/** Classes for the floating panel itself (position within the anchor). */
	panelClassName?: string
	trigger: React.ReactNode
}

/** Small anchored popover shell -- trigger + absolutely positioned panel
 * that dismisses on outside click. Used by the seed editor and editable
 * stat-value popovers. */
export const Popover: React.FC<PopoverProps> = ({
	open,
	onDismiss,
	children,
	anchorClassName,
	panelClassName,
	trigger,
}) => {
	const ref = useRef<HTMLDivElement>(null)
	useDismissOnOutsideClick(ref, open, onDismiss)
	return (
		<div
			ref={ref}
			className={cx("relative inline-flex items-center", anchorClassName)}
		>
			{trigger}
			{open ? (
				<div
					className={cx(
						"absolute z-30 rounded-md border border-slate-200 bg-white shadow-lg",
						panelClassName ?? "top-full right-0 mt-2",
					)}
				>
					{children}
				</div>
			) : null}
		</div>
	)
}

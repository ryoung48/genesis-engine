import { type ReactNode, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface FloatingTooltipProps {
	content: ReactNode
	children: ReactNode
}

const MARGIN = 6

/** Hover tooltip rendered into a document.body portal instead of an
 * absolutely-positioned sibling -- a stats panel is a scrollable container
 * (overflow-y-auto), which clips any absolute content that pokes past its
 * own box on either edge. A portal escapes that clipping entirely rather
 * than trying to guess a safe direction, and it never needs its own scroll:
 * position is computed from the trigger's actual bounding rect, preferring
 * above the trigger (matching every other stat-grid tooltip, which opens
 * upward) and falling back below only when there is no room above, with
 * horizontal clamping to whichever side actually has room in the current
 * viewport. */
export function FloatingTooltip({ content, children }: FloatingTooltipProps) {
	const [visible, setVisible] = useState(false)
	const triggerRef = useRef<HTMLSpanElement>(null)
	const panelRef = useRef<HTMLDivElement>(null)
	const [style, setStyle] = useState<{
		top: number
		left: number
	} | null>(null)

	useLayoutEffect(() => {
		if (!visible) return
		const trigger = triggerRef.current
		const panel = panelRef.current
		if (!trigger || !panel) return
		const triggerRect = trigger.getBoundingClientRect()
		const panelRect = panel.getBoundingClientRect()

		const openUp = triggerRect.top >= panelRect.height + MARGIN
		const top = openUp
			? triggerRect.top - panelRect.height - MARGIN
			: triggerRect.bottom + MARGIN

		let left = triggerRect.right - panelRect.width
		left = Math.max(
			MARGIN,
			Math.min(left, window.innerWidth - panelRect.width - MARGIN),
		)

		setStyle({ top, left })
	}, [visible])

	return (
		<span
			ref={triggerRef}
			className="relative inline-flex items-center"
			onMouseEnter={() => setVisible(true)}
			onMouseLeave={() => setVisible(false)}
		>
			{children}
			{visible
				? createPortal(
						<div
							ref={panelRef}
							style={{
								position: "fixed",
								top: style?.top ?? -9999,
								left: style?.left ?? -9999,
								visibility: style ? "visible" : "hidden",
							}}
							className="pointer-events-none z-50 w-max max-w-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] normal-case leading-[1.35] text-slate-500 shadow-lg"
						>
							{content}
						</div>,
						document.body,
					)
				: null}
		</span>
	)
}

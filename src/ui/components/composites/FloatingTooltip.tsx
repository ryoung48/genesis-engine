import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

interface FloatingTooltipProps {
	content: ReactNode
	children: ReactNode
}

const MARGIN = 6

export function FloatingTooltip({ content, children }: FloatingTooltipProps) {
	const tooltipId = useId()
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
			aria-describedby={visible ? tooltipId : undefined}
			onFocus={(event) => {
				event.target.setAttribute("aria-describedby", tooltipId)
				setVisible(true)
			}}
			onBlur={(event) => {
				event.target.removeAttribute("aria-describedby")
				setVisible(false)
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					if (event.target instanceof HTMLElement)
						event.target.removeAttribute("aria-describedby")
					setVisible(false)
				}
			}}
			onMouseEnter={() => setVisible(true)}
			onMouseLeave={(event) => {
				if (!event.currentTarget.contains(document.activeElement))
					setVisible(false)
			}}
		>
			{children}
			{visible
				? createPortal(
						<div
							ref={panelRef}
							id={tooltipId}
							role="tooltip"
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

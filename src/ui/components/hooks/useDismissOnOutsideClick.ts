import { useEffect, type RefObject } from "react"

/** Calls `onDismiss` when a pointerdown lands outside `ref`'s element, but
 * only while `active` is true -- shared by every popover/editor that closes
 * on outside click (seed editor, stat-value editor, ...). */
export function useDismissOnOutsideClick(
	ref: RefObject<HTMLElement | null>,
	active: boolean,
	onDismiss: () => void,
) {
	useEffect(() => {
		if (!active) return
		const handlePointerDown = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) {
				onDismiss()
			}
		}
		document.addEventListener("pointerdown", handlePointerDown)
		return () => document.removeEventListener("pointerdown", handlePointerDown)
	}, [ref, active, onDismiss])
}

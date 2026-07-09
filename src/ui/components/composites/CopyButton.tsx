import React from "react"
import { IconButton } from "../primitives/IconButton"
import { CheckIcon } from "../primitives/icons/CheckIcon"
import { CopyIcon } from "../primitives/icons/CopyIcon"
import { Tooltip } from "../primitives/Tooltip"

interface CopyButtonProps
	extends Omit<
		React.ComponentProps<typeof IconButton>,
		"children" | "onClick"
	> {
	text: string
	idleLabel?: React.ReactNode
	copiedLabel?: React.ReactNode
	resetDelayMs?: number
	onCopied?: () => void
	onCopyError?: (error: unknown) => void
}

export const CopyButton: React.FC<CopyButtonProps> = ({
	text,
	idleLabel = "Copy",
	copiedLabel = "Copied",
	resetDelayMs = 1200,
	onCopied,
	onCopyError,
	disabled,
	...buttonProps
}) => {
	const [copied, setCopied] = React.useState(false)
	const timeoutRef = React.useRef<number | null>(null)

	React.useEffect(() => {
		return () => {
			if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
		}
	}, [])

	const handleClick = React.useCallback(async () => {
		if (disabled) return
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			onCopied?.()
			if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
			timeoutRef.current = window.setTimeout(() => {
				setCopied(false)
				timeoutRef.current = null
			}, resetDelayMs)
		} catch (error) {
			onCopyError?.(error)
		}
	}, [disabled, onCopied, onCopyError, resetDelayMs, text])

	return (
		<Tooltip content={copied ? copiedLabel : idleLabel} position="top">
			<IconButton
				aria-label={typeof idleLabel === "string" ? idleLabel : "Copy"}
				disabled={disabled}
				onClick={() => {
					void handleClick()
				}}
				{...buttonProps}
			>
				{copied ? (
					<CheckIcon className="h-3.5 w-3.5 text-emerald-300" />
				) : (
					<CopyIcon className="h-3.5 w-3.5" />
				)}
			</IconButton>
		</Tooltip>
	)
}

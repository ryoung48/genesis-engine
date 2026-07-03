import React from "react"
import { cx } from "../lib"
import { IconButton } from "../primitives/IconButton"
import { Surface } from "../primitives/Surface"
import { uiTokens } from "../tokens"

interface DrawerShellProps
	extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
	title: React.ReactNode
	icon?: React.ReactNode
	onClose?: () => void
	closeTitle?: string
}

export const DrawerShell: React.FC<DrawerShellProps> = ({
	title,
	icon,
	onClose,
	closeTitle = "Close panel",
	className,
	children,
	...props
}) => (
	<Surface
		tone="panel"
		className={cx(
			"flex h-auto w-full shrink-0 flex-col border-t border-slate-200 px-3 py-3 backdrop-blur-sm xl:h-full xl:w-[340px] xl:max-w-[28vw] xl:border-t-0 xl:border-l",
			className,
		)}
		{...props}
	>
		{title ? (
			<div className="mb-3 flex items-center gap-2">
				{icon ? (
					<div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-900 text-white">
						{icon}
					</div>
				) : null}
				<span
					className={cx(uiTokens.type.controlWide, "text-xs text-slate-900")}
				>
					{title}
				</span>
				{onClose ? (
					<IconButton
						tone="panel"
						size="sm"
						shape="rounded"
						onClick={onClose}
						title={closeTitle}
						className="ml-auto h-6 w-6 border-0 bg-transparent text-slate-300 shadow-none backdrop-blur-none hover:bg-slate-100 hover:text-slate-600"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</IconButton>
				) : null}
			</div>
		) : null}
		{children}
	</Surface>
)

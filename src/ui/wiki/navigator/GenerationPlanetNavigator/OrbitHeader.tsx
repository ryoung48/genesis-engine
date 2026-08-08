import React from "react"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { EarthIcon } from "@/ui/components/primitives/icons/EarthIcon"
import { GpsFocusButton } from "@/ui/wiki/shared/ui-atoms"

export function OrbitHeader({
	title,
	typeLabel,
	breadcrumbs,
	seedInput,
	onFocus,
	onClose,
	headerAction,
	showSeedControls,
	onSeedInputChange,
	onSeedApply,
	onSeedRandomize,
	onSeedSetEarth,
}: {
	title: string
	typeLabel: string
	breadcrumbs: Array<{
		label: string
		onClick: () => void
	}>
	seedInput: string
	onFocus?: () => void
	onClose?: () => void
	headerAction?: React.ReactNode
	/** Only the main world's subtitle row exposes seed/dice/earth controls --
	 * its seed drives the whole system's seed. The star and every
	 * sibling/moon show neither this, just focus. */
	showSeedControls: boolean
	onSeedInputChange: (value: string) => void
	onSeedApply: () => void
	onSeedRandomize: () => void
	onSeedSetEarth: () => void
}) {
	return (
		<WikiPageHeader
			title={title}
			action={
				<>
					{headerAction}
					{onClose ? (
						<IconButton
							tone="borderless"
							size="xs"
							onClick={onClose}
							title="Hide generation panel"
							aria-label="Hide generation panel"
						>
							<svg
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
							>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</IconButton>
					) : null}
				</>
			}
			meta={
				<>
					<span>{typeLabel}</span>
					{breadcrumbs.length > 0 ? (
						<>
							<span>·</span>
							<div className="flex flex-wrap items-center gap-2">
								{breadcrumbs.map((crumb, index) => (
									<React.Fragment key={`${crumb.label}-${index}`}>
										{index > 0 ? <span>/</span> : null}
										<InlineTextButton
											onClick={crumb.onClick}
											className="text-slate-500"
										>
											{crumb.label}
										</InlineTextButton>
									</React.Fragment>
								))}
							</div>
						</>
					) : null}
				</>
			}
			metaAction={
				<div className="flex items-center gap-1.5">
					{showSeedControls ? (
						<>
							<input
								type="text"
								value={seedInput}
								onChange={(event) => onSeedInputChange(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault()
										event.currentTarget.blur()
									}
								}}
								onBlur={onSeedApply}
								aria-label="Procedural seed"
								title="Procedural seed"
								className="mr-1 w-20 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-700 outline-none transition-colors focus:border-slate-400"
							/>
							<IconButton
								tone="borderless"
								size="xs"
								onClick={onSeedRandomize}
								title="Randomize seed"
								aria-label="Randomize seed"
							>
								<DiceMultipleOutlineIcon className="h-4 w-4" />
							</IconButton>
							<IconButton
								tone="borderless"
								size="xs"
								onClick={onSeedSetEarth}
								title="Set seed to Earth (Sol system)"
								aria-label="Set seed to Earth (Sol system)"
							>
								<EarthIcon className="h-4 w-4" />
							</IconButton>
						</>
					) : null}
					{onFocus ? <GpsFocusButton onClick={onFocus} /> : null}
				</div>
			}
		/>
	)
}

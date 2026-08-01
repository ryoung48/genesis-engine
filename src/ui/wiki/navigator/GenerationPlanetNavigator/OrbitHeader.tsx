import React, { useState } from "react"
import { Popover } from "@/ui/components/composites/Popover"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { Button } from "@/ui/components/primitives/Button"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { RefreshIcon } from "@/ui/components/primitives/icons/RefreshIcon"
import { SproutIcon } from "@/ui/components/primitives/icons/SproutIcon"
import { uiTokens } from "@/ui/components/tokens"
import { GpsFocusButton } from "@/ui/wiki/shared/ui-atoms"

export function OrbitHeader({
	title,
	typeLabel,
	breadcrumbs,
	seedInput,
	seedDisplay,
	onFocus,
	onReset,
	onClose,
	headerAction,
	onSeedInputChange,
	onSeedApply,
	onSeedRandomize,
	showForceMainWorld,
	forceMainWorld,
	setForceMainWorld,
}: {
	title: string
	typeLabel: string
	breadcrumbs: Array<{
		label: string
		onClick: () => void
	}>
	seedInput: string
	seedDisplay: string
	onFocus?: () => void
	onReset?: () => void
	onClose?: () => void
	headerAction?: React.ReactNode
	onSeedInputChange: (value: string) => void
	onSeedApply: () => void
	onSeedRandomize: () => void
	/** Only the star's own seed popup exposes the "Force Main World"
	 * checkbox -- meaningless for a sibling/moon's own seed. */
	showForceMainWorld?: boolean
	forceMainWorld?: boolean
	setForceMainWorld?: (v: boolean) => void
}) {
	const [seedEditorVisible, setSeedEditorVisible] = useState(false)

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
				<>
					{onReset ? (
						<IconButton
							tone="borderless"
							size="sm"
							onClick={onReset}
							title="Reset to defaults"
							aria-label="Reset to defaults"
						>
							<RefreshIcon className="h-3.5 w-3.5" />
						</IconButton>
					) : null}
					<Popover
						open={seedEditorVisible}
						onDismiss={() => setSeedEditorVisible(false)}
						panelClassName="top-full right-0 mt-2"
						trigger={
							<IconButton
								tone="borderless"
								size="sm"
								onClick={() => setSeedEditorVisible((current) => !current)}
								title={`Seed: ${seedDisplay}`}
								aria-label={`Seed: ${seedDisplay}`}
							>
								<SproutIcon className="h-3.5 w-3.5" />
							</IconButton>
						}
					>
						<div className="flex w-36 flex-col gap-2 px-1 pt-0.5 pb-2">
							<span className={`${uiTokens.type.labelSm} text-slate-500`}>
								Procedural Seed
							</span>
							<input
								autoFocus
								type="text"
								value={seedInput}
								onChange={(event) => onSeedInputChange(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault()
										onSeedApply()
										setSeedEditorVisible(false)
									}
								}}
								aria-label="Procedural seed"
								className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-700 outline-none transition-colors focus:border-slate-400"
							/>
							{showForceMainWorld && setForceMainWorld ? (
								<label className="flex items-center justify-between gap-2 text-[9px] font-medium text-slate-500">
									<span>Force Main World</span>
									<input
										type="checkbox"
										checked={forceMainWorld ?? true}
										onChange={(event) =>
											setForceMainWorld(event.target.checked)
										}
										className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
									/>
								</label>
							) : null}
							<div className="flex items-center gap-1.5">
								<IconButton
									tone="panel"
									size="sm"
									shape="rounded"
									onMouseDown={(event) => event.preventDefault()}
									onClick={onSeedRandomize}
									aria-label="Randomize seed"
									className="shrink-0 shadow-none backdrop-blur-none"
								>
									<DiceMultipleOutlineIcon className="h-3.5 w-3.5" />
								</IconButton>
								<Button
									tone="panel"
									selected
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => {
										onSeedApply()
										setSeedEditorVisible(false)
									}}
									aria-label="Generate"
									title="Generate"
									className="flex-1 py-1.5"
								>
									Generate
								</Button>
							</div>
						</div>
					</Popover>
					{onFocus ? <GpsFocusButton onClick={onFocus} /> : null}
				</>
			}
		/>
	)
}

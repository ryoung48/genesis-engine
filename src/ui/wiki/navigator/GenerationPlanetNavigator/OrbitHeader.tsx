import React from "react"
import { WikiPageHeader } from "@/ui/components/composites/WikiPageHeader"
import { IconButton } from "@/ui/components/primitives/IconButton"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { ChevronIcon } from "@/ui/components/primitives/icons/ChevronIcon"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { EarthIcon } from "@/ui/components/primitives/icons/EarthIcon"
import { uiTokens } from "@/ui/components/tokens"
import type { RecentSeed } from "@/ui/wiki/navigator/GenerationPlanetNavigator/types"
import { GpsFocusButton } from "@/ui/wiki/shared/ui-atoms"

export function OrbitHeader({
	title,
	typeLabel,
	breadcrumbs,
	seedInput,
	recentSeeds,
	onFocus,
	onClose,
	headerAction,
	showSeedControls,
	onSeedInputChange,
	onSeedApply,
	onRecentSeedSelect,
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
	recentSeeds: RecentSeed[]
	onFocus?: () => void
	onClose?: () => void
	headerAction?: React.ReactNode
	showSeedControls: boolean
	onSeedInputChange: (value: string) => void
	onSeedApply: (value: string) => void
	onRecentSeedSelect: (seed: RecentSeed) => void
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
							<div
								className={`mr-1 inline-flex rounded-md border border-slate-200 bg-white font-mono text-slate-700 focus-within:border-slate-400 ${uiTokens.type.caption}`}
								onBlur={(event) => {
									if (!event.currentTarget.contains(event.relatedTarget)) {
										onSeedApply(seedInput)
									}
								}}
							>
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
									aria-label="Procedural seed"
									title="Procedural seed"
									className="w-20 bg-transparent px-1.5 py-0.5 outline-none"
								/>
								<span className="relative grid place-items-center rounded-r-md border-l border-slate-200 px-1 has-enabled:hover:bg-slate-100 has-disabled:opacity-50 focus-within:bg-slate-100">
									<ChevronIcon className="h-4 w-4" />
									<select
										aria-label="Recent seeds"
										title={
											recentSeeds.length
												? "Recent seeds"
												: "No recent seeds yet"
										}
										disabled={recentSeeds.length === 0}
										value=""
										className="recent-seeds-picker absolute inset-0 h-full w-full cursor-pointer disabled:cursor-default"
										onChange={(event) => {
											const entry = recentSeeds.find(
												(seed) =>
													String(seed.numeric) === event.currentTarget.value,
											)
											if (entry) onRecentSeedSelect(entry)
										}}
									>
										<option value="" disabled>
											Recent seeds
										</option>
										{recentSeeds.map((entry) => (
											<option key={entry.numeric} value={entry.numeric}>
												{entry.label}
											</option>
										))}
									</select>
								</span>
							</div>
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

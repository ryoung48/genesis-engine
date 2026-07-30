import React, { useEffect, useRef, useState } from "react"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { RefreshIcon } from "@/ui/components/primitives/icons/RefreshIcon"
import { SproutIcon } from "@/ui/components/primitives/icons/SproutIcon"
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
	const seedEditorRef = useRef<HTMLDivElement>(null)
	useEffect(() => {
		if (!seedEditorVisible) return
		const handlePointerDown = (event: PointerEvent) => {
			if (!seedEditorRef.current?.contains(event.target as Node)) {
				setSeedEditorVisible(false)
			}
		}
		document.addEventListener("pointerdown", handlePointerDown)
		return () => document.removeEventListener("pointerdown", handlePointerDown)
	}, [seedEditorVisible])

	return (
		<div className="border-b border-slate-200 pb-3">
			<div className="flex items-start gap-3">
				<div className="min-w-0 flex-1">
					<div className="flex items-start gap-2">
						<h1
							className="min-w-0 flex-1 text-[30px] leading-snug text-slate-950"
							style={{ fontFamily: "var(--font-jedar)" }}
						>
							{title}
						</h1>
						<div className="flex items-center gap-1 pt-1">
							{headerAction}
							{onClose ? (
								<button
									type="button"
									onClick={onClose}
									title="Hide generation panel"
									className="flex h-3.5 w-3.5 items-center justify-center text-slate-400 transition-colors hover:text-slate-700"
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
								</button>
							) : null}
						</div>
					</div>
					<div className="mt-0.5 flex items-center justify-between gap-3">
						<div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
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
						</div>
						<div className="flex shrink-0 items-center gap-1.5">
							{onReset ? (
								<button
									type="button"
									onClick={onReset}
									title="Reset to defaults"
									aria-label="Reset to defaults"
									className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-700"
								>
									<RefreshIcon className="h-3.5 w-3.5" />
								</button>
							) : null}
							<div ref={seedEditorRef} className="relative flex items-center">
								{seedEditorVisible ? (
									<div className="absolute top-full right-0 z-30 mt-2 rounded-md border border-slate-200 bg-white shadow-lg">
										<div className="flex w-36 flex-col gap-2 px-1 pt-0.5 pb-2">
											<span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
												Procedural Seed
											</span>
											<input
												autoFocus
												type="text"
												value={seedInput}
												onChange={(event) =>
													onSeedInputChange(event.target.value)
												}
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
												<button
													type="button"
													onMouseDown={(event) => event.preventDefault()}
													onClick={onSeedRandomize}
													aria-label="Randomize seed"
													className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
												>
													<DiceMultipleOutlineIcon className="h-3.5 w-3.5" />
												</button>
												<button
													type="button"
													onMouseDown={(event) => event.preventDefault()}
													onClick={() => {
														onSeedApply()
														setSeedEditorVisible(false)
													}}
													aria-label="Generate"
													title="Generate"
													className="flex-1 rounded-md border border-slate-900 bg-slate-900 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-white transition-all hover:bg-slate-800 hover:border-slate-800"
												>
													Generate
												</button>
											</div>
										</div>
									</div>
								) : null}
								<button
									type="button"
									onClick={() => setSeedEditorVisible((current) => !current)}
									title={`Seed: ${seedDisplay}`}
									aria-label={`Seed: ${seedDisplay}`}
									className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-700"
								>
									<SproutIcon className="h-3.5 w-3.5" />
								</button>
							</div>
							{onFocus ? <GpsFocusButton onClick={onFocus} /> : null}
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}

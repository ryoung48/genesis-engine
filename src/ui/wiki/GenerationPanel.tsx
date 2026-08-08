import React, { useMemo, useState } from "react"
import type { MoonBody } from "@/model/celestial/moons/types"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { SystemBody } from "@/model/celestial/system/types"
import type {
	SurfaceTidesBreakdown,
	TidalSchedule,
} from "@/model/climate/ocean/tides/tidal-schedule/types"
import type { StageTiming } from "@/model/pipelines/types"
import { ERAS } from "@/model/society/eras"
import type { SocietyEra } from "@/model/society/types"
import { Button } from "@/ui/components/primitives/Button"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { ToggleChip } from "@/ui/components/primitives/ToggleChip"
import { uiTokens } from "@/ui/components/tokens"
import { SocietyRunesPanel } from "@/ui/genesis/controls/SocietyRunesPanel"
import {
	DEFAULT_WORLD_SECTIONS,
	toggleSection,
	type WorldSection,
} from "@/ui/genesis/details/drawer-state"
import type { DetailsDrawerBaseProps } from "@/ui/genesis/details/shared"
import { WorldDetails } from "@/ui/genesis/details/world/WorldDetails"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import type { SliderDef } from "@/ui/genesis/generation/sliders"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
import { DrillDownBreadcrumbHeader } from "@/ui/wiki/DrillDownBreadcrumbHeader"
import {
	type NationWikiData,
	NationWikiPage,
} from "@/ui/wiki/nation/NationWikiPage"
import { GenerationPlanetNavigator } from "@/ui/wiki/navigator/GenerationPlanetNavigator/GenerationPlanetNavigator"
import {
	type OrganizationWikiData,
	OrganizationWikiPage,
} from "@/ui/wiki/organization/OrganizationWikiPage"
import { buildSurfaceStats } from "@/ui/wiki/stats/orbit/surface-stats"
import { GenerationTimingChart } from "@/ui/wiki/timing/GenerationTimingChart"
import {
	formatTimingSeconds,
	getComputeRoutesTimingSummary,
	getGenerationTimingSummary,
	getPostTimingSummary,
} from "@/ui/wiki/timing/timing-summary"
import { type WarWikiData, WarWikiPage } from "@/ui/wiki/war/WarWikiPage"

interface GenerationPanelProps {
	worldTab: "planet" | "society"
	setWorldTab: (tab: "planet" | "society") => void
	resetWorldDefaults: () => void
	setTideLock: (v: TideLock | null) => void
	setObliquity: (v: number) => void
	seed: number
	starName?: string
	showRealSolNames: boolean
	setSeed: (v: number) => void
	forceMainWorld: boolean
	setForceMainWorld: (v: boolean) => void
	tidalSchedulePreview?: TidalSchedule
	surfaceTidesM?: SurfaceTidesBreakdown
	orbitBodies?: SystemBody[]
	/** Full sorted system body list (orbits + main world), used to resolve a
	 * body's index for onFocusBody. */
	systemBodies?: SystemBody[]
	/** Focuses the 3D solar-system view's camera on a body. -1 = the star. */
	onFocusBody?: (bodyIndex: number, moonIndex?: number) => void
	currentFocus?: {
		bodyIndex: number
		moonIndex?: number
	} | null
	onUpdateSystemBody?: (
		bodyIndex: number,
		updater: (body: SystemBody) => SystemBody,
	) => void
	daysPerYear: number
	setHoursPerDay: (v: number) => void
	planetRadiusKm: number
	generatedMoons: MoonBody[]
	planetSliders: SliderDef[]
	terrainSliders: SliderDef[]
	spectralClass: string
	setSpectralClass: (v: string) => void
	starSubtype: number
	setStarSubtype: (v: number) => void
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	obliquity: number
	era: SocietyEra
	setEra: (v: SocietyEra) => void
	generating: boolean
	generationLabel: string
	generationProgress: number
	generationTimings?: StageTiming[] | null
	landCoverage: number
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	handleGenerate: () => void
	onClose?: () => void
	/** World Details -- folded in here (rather than a separate right-side
	 * panel) so all generated-world info lives in one place alongside the
	 * generation controls that produced it. See WorldDetails' own doc for
	 * why only "planetary" needs no extra gating. */
	worldDetails: DetailsDrawerBaseProps & {
		hasGeneratedWorld: boolean
	}
	/** When set (a nation has been selected on the map), this wiki page
	 * replaces the star/orbit navigator + world details entirely -- clicking
	 * its breadcrumb back to the planet name clears the selection. */
	nationWiki: NationWikiData | null
	/** When set (an organization has been selected via a nation's
	 * "Organizations" row or the map), this wiki page replaces the
	 * star/orbit navigator + world details, same as nationWiki above --
	 * mutually exclusive with it (see GenesisView's selection state). */
	organizationWiki: OrganizationWikiData | null
	/** When set (a war has been selected via a nation's timeline), this wiki
	 * page replaces the star/orbit navigator + world details, same as
	 * nationWiki/organizationWiki above -- mutually exclusive with both (see
	 * GenesisView's selection state). */
	warWiki: WarWikiData | null
}

export const GenerationPanel: React.FC<GenerationPanelProps> = ({
	worldTab,
	setWorldTab,
	resetWorldDefaults,
	setTideLock,
	setObliquity,
	seed,
	starName,
	showRealSolNames,
	forceMainWorld,
	setForceMainWorld,
	setSeed,
	tidalSchedulePreview,
	surfaceTidesM,
	orbitBodies,
	systemBodies,
	onFocusBody,
	currentFocus,
	onUpdateSystemBody,
	daysPerYear,
	setHoursPerDay,
	planetRadiusKm,
	generatedMoons,
	planetSliders,
	terrainSliders,
	spectralClass,
	setSpectralClass,
	starSubtype,
	setStarSubtype,
	orbitalDistanceAU,
	eccentricity,
	perihelion,
	obliquity,
	era,
	setEra,
	generating,
	generationLabel,
	generationProgress,
	generationTimings,
	landCoverage,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	handleGenerate,
	onClose,
	worldDetails,
	nationWiki,
	organizationWiki,
	warWiki,
}) => {
	const [societySubtab, setSocietySubtab] = useState<"era" | "runes">("era")
	const [showGenerationTimings, setShowGenerationTimings] = useState(false)
	const [openWorldSections, setOpenWorldSections] = useState<
		ReadonlySet<WorldSection>
	>(DEFAULT_WORLD_SECTIONS)
	// Portal target for GenerationPlanetNavigator's Preview section, placed
	// below WorldDetails (see the JSX below) so Preview renders after every
	// other section instead of directly under the orbit header where that
	// component would otherwise put it inline. Starts null until the ref
	// callback fires after mount.
	const [previewSlot, setPreviewSlot] = useState<HTMLDivElement | null>(null)
	void generatedMoons
	void obliquity
	void worldTab
	void setWorldTab
	void resetWorldDefaults
	void onClose
	type DrillDownState =
		| null
		| "post"
		| "computeRoutes"
		| {
				kind: "other"
				parent: "pipeline" | "post" | "computeRoutes"
		  }
	const [timingDrillDown, setTimingDrillDown] = useState<DrillDownState>(null)
	const generationTimingSummary = useMemo(
		() => getGenerationTimingSummary(generationTimings),
		[generationTimings],
	)
	const postTimingSummary = useMemo(
		() => getPostTimingSummary(generationTimings),
		[generationTimings],
	)
	const computeRoutesTimingSummary = useMemo(
		() => getComputeRoutesTimingSummary(generationTimings),
		[generationTimings],
	)
	const dayLengthSlider = planetSliders.find(
		(slider) => slider.label === "Day Length",
	)
	const radiusSlider = planetSliders.find((slider) => slider.label === "Radius")
	const orbitalDistanceSlider = planetSliders.find(
		(slider) => slider.label === "Orbital Distance",
	)
	const pressureSlider = planetSliders.find(
		(slider) => slider.label === "Pressure",
	)
	const eccentricitySlider = planetSliders.find(
		(slider) => slider.label === "Eccentricity",
	)
	const perihelionSlider = planetSliders.find(
		(slider) => slider.label === "Perihelion",
	)
	const axialTiltSlider = planetSliders.find(
		(slider) => slider.label === "Axial Tilt",
	)
	const axialTiltDisplay = axialTiltSlider?.display ?? "0.0°"
	const spinSlider = planetSliders.find((slider) => slider.label === "Spin")
	const isRetrograde = spinSlider?.value === 1
	const onToggleSpin =
		spinSlider && !spinSlider.disabled
			? () => spinSlider.set(isRetrograde ? 0 : 1)
			: undefined
	const substellarLonSlider = planetSliders.find(
		(slider) => slider.label === "Substellar Lon",
	)
	const surfaceStats = buildSurfaceStats(planetSliders, terrainSliders)

	const generateContent = (
		<div className="space-y-2.5 pt-1.5">
			<Button
				tone="panel"
				selected
				onClick={handleGenerate}
				disabled={generating}
				aria-label={generating ? "Generating" : "Generate"}
				title={generating ? "Generating..." : "Generate"}
				className="w-full px-2.5 py-1.5"
			>
				Generate
			</Button>

			{generating ? (
				<div className="space-y-1">
					<div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400">
						<span>{generationLabel}</span>
						<span>{Math.round(generationProgress)}%</span>
					</div>
					<div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
						<div
							className="h-full rounded-full bg-slate-900 transition-all duration-200"
							style={{
								width: `${Math.max(0, Math.min(100, generationProgress))}%`,
							}}
						/>
					</div>
				</div>
			) : null}

			{generationTimingSummary && (
				<div className="pt-1">
					<div className="rounded-xl border border-slate-200 bg-white/90 px-3 py-2 shadow-sm shadow-slate-200/20">
						<DisclosureButton
							label="Timing"
							expanded={showGenerationTimings}
							trailing={
								<span className="font-mono text-[10px] text-slate-400">
									{formatTimingSeconds(generationTimingSummary.totalMs)}
								</span>
							}
							onClick={() => {
								setShowGenerationTimings((current) => !current)
								if (showGenerationTimings) setTimingDrillDown(null)
							}}
						/>
						{showGenerationTimings && (
							<div className="mt-3 space-y-3">
								{timingDrillDown === "post" && postTimingSummary ? (
									<div className="space-y-2">
										<DrillDownBreadcrumbHeader
											title="Post breakdown"
											trailingValue={formatTimingSeconds(
												postTimingSummary.totalMs,
											)}
											onBack={() => setTimingDrillDown(null)}
										/>
										<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
											<GenerationTimingChart
												entries={postTimingSummary.entries}
												onBarClick={(label) => {
													if (label === "Other")
														setTimingDrillDown({
															kind: "other",
															parent: "post",
														})
												}}
											/>
										</div>
									</div>
								) : timingDrillDown === "computeRoutes" &&
									computeRoutesTimingSummary ? (
									<div className="space-y-2">
										<DrillDownBreadcrumbHeader
											title="Compute routes breakdown"
											trailingValue={formatTimingSeconds(
												computeRoutesTimingSummary.totalMs,
											)}
											onBack={() => setTimingDrillDown(null)}
										/>
										<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
											<GenerationTimingChart
												entries={computeRoutesTimingSummary.entries}
												onBarClick={(label) => {
													if (label === "Other")
														setTimingDrillDown({
															kind: "other",
															parent: "computeRoutes",
														})
												}}
											/>
										</div>
									</div>
								) : typeof timingDrillDown === "object" &&
									timingDrillDown?.kind === "other" ? (
									<div className="space-y-2">
										<DrillDownBreadcrumbHeader
											title="Other items"
											trailingValue={formatTimingSeconds(
												timingDrillDown.parent === "pipeline"
													? (generationTimingSummary?.totalMs ?? 0)
													: timingDrillDown.parent === "post"
														? (postTimingSummary?.totalMs ?? 0)
														: (computeRoutesTimingSummary?.totalMs ?? 0),
											)}
											onBack={() => {
												const parent = timingDrillDown.parent
												if (parent === "pipeline") setTimingDrillDown(null)
												else setTimingDrillDown(parent)
											}}
										/>
										<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
											<GenerationTimingChart
												entries={
													timingDrillDown.parent === "pipeline"
														? (generationTimingSummary?.otherEntries ?? [])
														: timingDrillDown.parent === "post"
															? (postTimingSummary?.otherEntries ?? [])
															: (computeRoutesTimingSummary?.otherEntries ?? [])
												}
											/>
										</div>
									</div>
								) : (
									<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
										<div className="mb-2 flex items-center justify-between px-1">
											<div
												className={`${uiTokens.type.controlWide} text-slate-500`}
											>
												Pipeline
											</div>
											<span className="font-mono text-[10px] text-slate-400">
												{formatTimingSeconds(generationTimingSummary.totalMs)}
											</span>
										</div>
										<GenerationTimingChart
											entries={generationTimingSummary.entries}
											onBarClick={(label) => {
												if (label === "post-pipeline" && postTimingSummary)
													setTimingDrillDown("post")
												else if (
													label === "computeRoutes" &&
													computeRoutesTimingSummary
												)
													setTimingDrillDown("computeRoutes")
												else if (
													label === "Other" &&
													generationTimingSummary.otherEntries.length > 0
												)
													setTimingDrillDown({
														kind: "other",
														parent: "pipeline",
													})
											}}
										/>
									</div>
								)}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)

	return (
		<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
			<div className="flex-1 min-h-0 overflow-y-auto space-y-3">
				<div className="rounded-2xl bg-slate-50 px-3 py-3 space-y-3">
					{nationWiki ? (
						<NationWikiPage nation={nationWiki} />
					) : organizationWiki ? (
						<OrganizationWikiPage organization={organizationWiki} />
					) : warWiki ? (
						<WarWikiPage war={warWiki} />
					) : (
						<>
							<GenerationPlanetNavigator
								orbitBodies={orbitBodies}
								systemBodies={systemBodies}
								onFocusBody={onFocusBody}
								currentFocus={currentFocus}
								onUpdateSystemBody={onUpdateSystemBody}
								surfaceTidesM={surfaceTidesM}
								setTideLock={setTideLock}
								setHoursPerDay={setHoursPerDay}
								radiusSlider={radiusSlider}
								orbitalDistanceSlider={orbitalDistanceSlider}
								dayLengthSlider={dayLengthSlider}
								substellarLonSlider={substellarLonSlider}
								pressureSlider={pressureSlider}
								eccentricitySlider={eccentricitySlider}
								perihelionSlider={perihelionSlider}
								axialTiltSlider={axialTiltSlider}
								isRetrograde={isRetrograde}
								onToggleSpin={onToggleSpin}
								planetRadiusKm={planetRadiusKm}
								seed={seed}
								starName={starName}
								forceMainWorld={forceMainWorld}
								setForceMainWorld={setForceMainWorld}
								daysPerYear={daysPerYear}
								surfaceStats={surfaceStats}
								orbitalDistanceAU={orbitalDistanceAU}
								eccentricity={eccentricity}
								perihelion={perihelion}
								axialTiltDisplay={axialTiltDisplay}
								landCoverage={landCoverage}
								showRealSolNames={showRealSolNames && seed === SOL_DATA.solSeed}
								spectralClass={spectralClass}
								setSpectralClass={setSpectralClass}
								starSubtype={starSubtype}
								setStarSubtype={setStarSubtype}
								setSeed={setSeed}
								setObliquity={setObliquity}
								tidalSchedulePreview={tidalSchedulePreview}
								generationPreviewTab={generationPreviewTab}
								onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
								unitSystem={unitSystem}
								onClose={onClose}
								generateContent={generateContent}
								generating={generating}
								previewContainer={previewSlot}
							/>

							<WorldDetails
								{...worldDetails}
								openSections={openWorldSections}
								onSectionToggle={(section) =>
									setOpenWorldSections((prev) => toggleSection(prev, section))
								}
							/>

							<div ref={setPreviewSlot} />
						</>
					)}
				</div>

				<div className="hidden" aria-hidden="true">
					<div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
						<div className="flex items-center justify-between gap-2">
							<p
								className={`${uiTokens.type.controlLoose} text-slate-400 px-0.5`}
							>
								Society
							</p>
							<SegmentedControl
								options={[
									{ value: "era", label: "Era" },
									{ value: "runes", label: "Runes" },
								]}
								value={societySubtab}
								onChange={setSocietySubtab}
							/>
						</div>
						{societySubtab === "era" ? (
							<>
								<p
									className={`${uiTokens.type.controlLoose} text-slate-400 px-0.5`}
								>
									Era Preset
								</p>
								<div className="grid grid-cols-2 gap-1.5">
									{ERAS.eraOrder.map((eraId) => {
										const cfg = ERAS.eraConfigs[eraId]
										const pop = cfg.targetPopulation
										const popLabel =
											pop >= 1e9
												? `${(pop / 1e9).toFixed(1)}B`
												: pop >= 1e6
													? `${Math.round(pop / 1e6)}M`
													: `${Math.round(pop / 1e3)}K`
										const active = era === eraId
										return (
											<ToggleChip
												key={eraId}
												active={active}
												onClick={() => setEra(eraId)}
											>
												<div
													className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${active ? "text-white" : "text-slate-700"}`}
												>
													{cfg.label}
												</div>
												<div
													className={`mt-0.5 font-mono text-[9px] ${active ? "text-slate-300" : "text-slate-400"}`}
												>
													~{popLabel} pop
												</div>
											</ToggleChip>
										)
									})}
								</div>
								{(() => {
									const cfg = ERAS.eraConfigs[era]
									return (
										<div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 space-y-1">
											<div className="flex justify-between text-[10px]">
												<span className="text-slate-500">Settled land</span>
												<span className="font-mono text-slate-700">
													{cfg.settlementFraction >= 1.0
														? "100%"
														: `${Math.round(cfg.settlementFraction * 100)}%`}
												</span>
											</div>
											<div className="flex justify-between text-[10px]">
												<span className="text-slate-500">Under states</span>
												<span className="font-mono text-slate-700">
													{!cfg.hasNations
														? "none"
														: cfg.statehoodFraction >= 1.0
															? "all settled"
															: `${Math.round(cfg.statehoodFraction * 100)}% of settled`}
												</span>
											</div>
										</div>
									)
								})()}
								<p className="text-[9px] text-slate-400 px-0.5 leading-relaxed">
									Applies on next Generate. White = settled stateless, gray =
									unsettled, on the nations map.
								</p>
							</>
						) : (
							<SocietyRunesPanel />
						)}
					</div>
				</div>
			</div>
		</div>
	)
}

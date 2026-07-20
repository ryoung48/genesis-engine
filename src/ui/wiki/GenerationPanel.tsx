import React, { useMemo, useState } from "react"
import type { StageTiming } from "@/model"
import type { MoonBody } from "@/model/celestial/moons/moon-types"
import type { SystemBody } from "@/model/celestial/system/generate-system-bodies"
import { SOL_SEED } from "@/model/celestial/system/sol-system"
import type { SurfaceTidesBreakdown } from "@/model/climate/tidal-schedule"
import { ERA_CONFIGS, ERA_ORDER, type SocietyEra } from "@/model/society/eras"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { SegmentedControl } from "@/ui/components/primitives/SegmentedControl"
import { Surface } from "@/ui/components/primitives/Surface"
import { SocietyRunesPanel } from "../planet/controls/SocietyRunesPanel"
import {
	DEFAULT_WORLD_SECTIONS,
	toggleSection,
	type WorldSection,
} from "../planet/details/drawer-state"
import { WorldDetails } from "../planet/details/world/WorldDetails"
import type { GenerationPreviewTab } from "../planet/screen/generation/generation-preview"
import type { SliderDef } from "../planet/screen/generation/sliders"
import type { UnitSystem } from "../planet/screen/shared/ui-format"
import { type NationWikiData, NationWikiPage } from "./nation/NationWikiPage"
import { GenerationPlanetNavigator } from "./navigator/GenerationPlanetNavigator"
import {
	type OrganizationWikiData,
	OrganizationWikiPage,
} from "./organization/OrganizationWikiPage"
import { buildSurfaceStats } from "./stats/orbit/surface-stats"
import { GenerationTimingChart } from "./timing/GenerationTimingChart"
import {
	formatTimingSeconds,
	getComputeRoutesTimingSummary,
	getGenerationTimingSummary,
	getHistoryTimingSummary,
	getPostTimingSummary,
} from "./timing/timing-summary"
import { type WarWikiData, WarWikiPage } from "./war/WarWikiPage"

interface GenerationPanelProps {
	worldTab: "planet" | "society"
	setWorldTab: (tab: "planet" | "society") => void
	resetWorldDefaults: () => void
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setObliquity: (v: number) => void
	restSeed: number
	starName?: string
	showRealSolNames: boolean
	setRestSeed: (v: number) => void
	forceMainWorld: boolean
	setForceMainWorld: (v: boolean) => void
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
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
	onUpdateSystemMoon?: (
		bodyIndex: number,
		moonIndex: number,
		updater: (moon: MoonBody, parentBody: SystemBody) => MoonBody,
	) => void
	/** Rebuilds one body (and everything nested inside it, e.g. its own
	 * moons) back to its freshly-generated defaults for the current seed,
	 * without touching any other body -- or, called with no bodyIndex,
	 * rebuilds the whole system. */
	onRebuildSystemBody?: (bodyIndex?: number) => void
	/** Resets a single moon back to its freshly-generated defaults for the
	 * current seed, without touching its parent body or any sibling moon. */
	onResetSystemMoon?: (bodyIndex: number, moonIndex: number) => void
	daysPerYear: number
	hoursPerDay: number
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
	seedInput: string
	setSeedInput: (v: string) => void
	onApplySeed: () => void
	seedError: boolean
	onRandomizeSeed: () => void
	generating: boolean
	generationLabel: string
	generationProgress: number
	generationTimings?: StageTiming[] | null
	landCoverage: number
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	handleGenerate: () => void
	handleEarthImport: () => void
	onClose?: () => void
	/** World Details -- folded in here (rather than a separate right-side
	 * panel) so all generated-world info lives in one place alongside the
	 * generation controls that produced it. See WorldDetails' own doc for
	 * why only "planetary" needs no extra gating. */
	worldDetails: import("@/ui/planet/details/shared").DetailsDrawerBaseProps & {
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
	tideLock,
	setTideLock,
	setObliquity,
	restSeed,
	starName,
	showRealSolNames,
	forceMainWorld,
	setForceMainWorld,
	setRestSeed,
	tidalSchedulePreview,
	surfaceTidesM,
	orbitBodies,
	systemBodies,
	onFocusBody,
	currentFocus,
	onUpdateSystemBody,
	onUpdateSystemMoon,
	onRebuildSystemBody,
	onResetSystemMoon,
	daysPerYear,
	hoursPerDay,
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
	seedInput,
	setSeedInput,
	onApplySeed,
	seedError,
	onRandomizeSeed,
	generating,
	generationLabel,
	generationProgress,
	generationTimings,
	landCoverage,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	handleGenerate,
	handleEarthImport,
	onClose,
	worldDetails,
	nationWiki,
	organizationWiki,
	warWiki,
}) => {
	const [societySubtab, setSocietySubtab] = useState<"era" | "runes">("era")
	const [showGenerationTimings, setShowGenerationTimings] = useState(false)
	const [generateExpanded, setGenerateExpanded] = useState(true)
	const [openWorldSections, setOpenWorldSections] = useState<
		ReadonlySet<WorldSection>
	>(DEFAULT_WORLD_SECTIONS)
	void generatedMoons
	void obliquity
	void worldTab
	void setWorldTab
	void resetWorldDefaults
	void onClose
	type DrillDownState =
		| null
		| "post"
		| "history"
		| "computeRoutes"
		| {
				kind: "other"
				parent: "pipeline" | "post" | "history" | "computeRoutes"
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
	const historyTimingSummary = useMemo(
		() => getHistoryTimingSummary(generationTimings),
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
	const selectedOrbitBody =
		currentFocus &&
		currentFocus.bodyIndex >= 0 &&
		currentFocus.moonIndex === undefined
			? systemBodies?.[currentFocus.bodyIndex]
			: null
	const showMainWorldGenerationControls = !!selectedOrbitBody?.isMainWorld

	return (
		<div className="w-full xl:w-[460px] xl:max-w-[36vw] shrink-0 h-auto xl:h-full flex flex-col border-b xl:border-b-0 xl:border-r border-slate-200 bg-white/95 backdrop-blur-sm">
			<div className="flex-1 min-h-0 overflow-y-auto space-y-3">
				<div className="rounded-[20px] bg-slate-50 px-3 py-3 space-y-3">
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
								onUpdateSystemMoon={onUpdateSystemMoon}
								onRebuildSystemBody={onRebuildSystemBody}
								onResetSystemMoon={onResetSystemMoon}
								surfaceTidesM={surfaceTidesM}
								tideLock={tideLock}
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
								restSeed={restSeed}
								starName={starName}
								forceMainWorld={forceMainWorld}
								setForceMainWorld={setForceMainWorld}
								hoursPerDay={hoursPerDay}
								daysPerYear={daysPerYear}
								surfaceStats={surfaceStats}
								orbitalDistanceAU={orbitalDistanceAU}
								eccentricity={eccentricity}
								perihelion={perihelion}
								axialTiltDisplay={axialTiltDisplay}
								landCoverage={landCoverage}
								showRealSolNames={showRealSolNames && restSeed === SOL_SEED}
								spectralClass={spectralClass}
								setSpectralClass={setSpectralClass}
								starSubtype={starSubtype}
								setStarSubtype={setStarSubtype}
								setRestSeed={setRestSeed}
								setObliquity={setObliquity}
								tidalSchedulePreview={tidalSchedulePreview}
								generationPreviewTab={generationPreviewTab}
								onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
								unitSystem={unitSystem}
								onClose={onClose}
							/>

							<WorldDetails
								{...worldDetails}
								openSections={openWorldSections}
								onSectionToggle={(section) =>
									setOpenWorldSections((prev) => toggleSection(prev, section))
								}
							/>
						</>
					)}

					{showMainWorldGenerationControls &&
					!nationWiki &&
					!organizationWiki &&
					!warWiki ? (
						<Surface
							tone="panel"
							borderTone="default"
							radius="xl"
							className="px-3 py-3"
						>
							<div className="space-y-1.5">
								<button
									type="button"
									onClick={() => setGenerateExpanded((current) => !current)}
									className="flex w-full items-center justify-between gap-3 text-left"
								>
									<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
										Generate
									</span>
									<svg
										width="12"
										height="12"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
										className={`text-slate-400 transition-transform ${generateExpanded ? "rotate-180" : ""}`}
									>
										<polyline points="6 9 12 15 18 9" />
									</svg>
								</button>
								{generateExpanded ? (
									<div className="space-y-2.5 pt-1.5">
										<div className="space-y-2">
											<div className="flex items-stretch gap-1.5">
												<div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5">
													<div className="flex items-center gap-1.5">
														<span className="font-mono text-[10px] text-slate-400 uppercase tracking-[0.2em]">
															Seed
														</span>
														<input
															type="text"
															value={seedInput}
															onChange={(e) => setSeedInput(e.target.value)}
															onBlur={onApplySeed}
															onKeyDown={(e) => {
																if (e.key === "Enter") {
																	e.preventDefault()
																	onApplySeed()
																}
															}}
															disabled={generating}
															placeholder="World seed"
															className={`min-w-0 flex-1 bg-transparent border-none font-mono text-[11px] focus:ring-0 focus:outline-none placeholder:text-slate-300 disabled:opacity-50 ${
																seedError ? "text-red-500" : "text-slate-700"
															}`}
														/>
														<button
															type="button"
															onClick={onRandomizeSeed}
															disabled={generating}
															aria-label="Generate new seed"
															className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
															title="New seed"
														>
															<DiceMultipleOutlineIcon className="h-4 w-4" />
														</button>
														<button
															type="button"
															onClick={handleEarthImport}
															disabled={generating}
															aria-label="Load Earth seed"
															className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
															title="Load Earth"
														>
															<svg
																className="h-4 w-4"
																viewBox="0 0 24 24"
																fill="currentColor"
																aria-hidden="true"
															>
																<title>earth</title>
																<path d="M17.9,17.39C17.64,16.59 16.89,16 16,16H15V13A1,1 0 0,0 14,12H8V10H10A1,1 0 0,0 11,9V7H13A2,2 0 0,0 15,5V4.59C17.93,5.77 20,8.64 20,12C20,14.08 19.2,15.97 17.9,17.39M11,19.93C7.05,19.44 4,16.08 4,12C4,11.38 4.08,10.78 4.21,10.21L9,15V16A2,2 0 0,0 11,18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" />
															</svg>
														</button>
														<button
															type="button"
															onClick={handleGenerate}
															disabled={generating}
															aria-label={
																generating ? "Generating" : "Generate"
															}
															className="rounded-md border border-slate-900 bg-slate-900 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-white transition-all hover:bg-slate-800 hover:border-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
															title={generating ? "Generating..." : "Generate"}
														>
															Generate
														</button>
													</div>
												</div>
											</div>
											{seedError && (
												<p className="mt-1 border-t border-slate-200 pt-2 text-[11px] font-medium text-red-500">
													Invalid seed
												</p>
											)}
										</div>

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
													<button
														type="button"
														onClick={() => {
															setShowGenerationTimings((current) => !current)
															if (showGenerationTimings)
																setTimingDrillDown(null)
														}}
														className="flex w-full items-center justify-between gap-3 text-left"
													>
														<div>
															<div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
																Timing
															</div>
														</div>
														<div className="flex items-center gap-2">
															<span className="font-mono text-[10px] text-slate-400">
																{formatTimingSeconds(
																	generationTimingSummary.totalMs,
																)}
															</span>
															<svg
																width="12"
																height="12"
																viewBox="0 0 24 24"
																fill="none"
																stroke="currentColor"
																strokeWidth="2"
																strokeLinecap="round"
																strokeLinejoin="round"
																className={`text-slate-400 transition-transform ${showGenerationTimings ? "rotate-180" : ""}`}
															>
																<polyline points="6 9 12 15 18 9" />
															</svg>
														</div>
													</button>
													{showGenerationTimings && (
														<div className="mt-3 space-y-3">
															{timingDrillDown === "post" &&
															postTimingSummary ? (
																<div className="space-y-2">
																	<div className="flex items-center gap-2">
																		<button
																			type="button"
																			onClick={() => setTimingDrillDown(null)}
																			className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
																		>
																			<svg
																				width="10"
																				height="10"
																				viewBox="0 0 24 24"
																				fill="none"
																				stroke="currentColor"
																				strokeWidth="2"
																				strokeLinecap="round"
																				strokeLinejoin="round"
																			>
																				<polyline points="15 18 9 12 15 6" />
																			</svg>
																			Back
																		</button>
																		<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
																			Post breakdown
																		</div>
																		<span className="ml-auto font-mono text-[10px] text-slate-400">
																			{formatTimingSeconds(
																				postTimingSummary.totalMs,
																			)}
																		</span>
																	</div>
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
															) : timingDrillDown === "history" &&
																historyTimingSummary ? (
																<div className="space-y-2">
																	<div className="flex items-center gap-2">
																		<button
																			type="button"
																			onClick={() => setTimingDrillDown(null)}
																			className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
																		>
																			<svg
																				width="10"
																				height="10"
																				viewBox="0 0 24 24"
																				fill="none"
																				stroke="currentColor"
																				strokeWidth="2"
																				strokeLinecap="round"
																				strokeLinejoin="round"
																			>
																				<polyline points="15 18 9 12 15 6" />
																			</svg>
																			Back
																		</button>
																		<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
																			History breakdown
																		</div>
																		<span className="ml-auto font-mono text-[10px] text-slate-400">
																			{formatTimingSeconds(
																				historyTimingSummary.totalMs,
																			)}
																		</span>
																	</div>
																	<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
																		<GenerationTimingChart
																			entries={historyTimingSummary.entries}
																			onBarClick={(label) => {
																				if (
																					label === "computeRoutes" &&
																					computeRoutesTimingSummary
																				)
																					setTimingDrillDown("computeRoutes")
																				else if (label === "Other")
																					setTimingDrillDown({
																						kind: "other",
																						parent: "history",
																					})
																			}}
																		/>
																	</div>
																</div>
															) : timingDrillDown === "computeRoutes" &&
																computeRoutesTimingSummary ? (
																<div className="space-y-2">
																	<div className="flex items-center gap-2">
																		<button
																			type="button"
																			onClick={() =>
																				setTimingDrillDown("history")
																			}
																			className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
																		>
																			<svg
																				width="10"
																				height="10"
																				viewBox="0 0 24 24"
																				fill="none"
																				stroke="currentColor"
																				strokeWidth="2"
																				strokeLinecap="round"
																				strokeLinejoin="round"
																			>
																				<polyline points="15 18 9 12 15 6" />
																			</svg>
																			Back
																		</button>
																		<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
																			Compute routes breakdown
																		</div>
																		<span className="ml-auto font-mono text-[10px] text-slate-400">
																			{formatTimingSeconds(
																				computeRoutesTimingSummary.totalMs,
																			)}
																		</span>
																	</div>
																	<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
																		<GenerationTimingChart
																			entries={
																				computeRoutesTimingSummary.entries
																			}
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
																	<div className="flex items-center gap-2">
																		<button
																			type="button"
																			onClick={() => {
																				const parent = timingDrillDown.parent
																				if (parent === "pipeline")
																					setTimingDrillDown(null)
																				else setTimingDrillDown(parent)
																			}}
																			className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 transition-all hover:border-slate-300 hover:text-slate-700"
																		>
																			<svg
																				width="10"
																				height="10"
																				viewBox="0 0 24 24"
																				fill="none"
																				stroke="currentColor"
																				strokeWidth="2"
																				strokeLinecap="round"
																				strokeLinejoin="round"
																			>
																				<polyline points="15 18 9 12 15 6" />
																			</svg>
																			Back
																		</button>
																		<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
																			Other items
																		</div>
																		<span className="ml-auto font-mono text-[10px] text-slate-400">
																			{formatTimingSeconds(
																				timingDrillDown.parent === "pipeline"
																					? (generationTimingSummary?.totalMs ??
																							0)
																					: timingDrillDown.parent === "post"
																						? (postTimingSummary?.totalMs ?? 0)
																						: timingDrillDown.parent ===
																								"history"
																							? (historyTimingSummary?.totalMs ??
																								0)
																							: (computeRoutesTimingSummary?.totalMs ??
																								0),
																			)}
																		</span>
																	</div>
																	<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
																		<GenerationTimingChart
																			entries={
																				timingDrillDown.parent === "pipeline"
																					? (generationTimingSummary?.otherEntries ??
																						[])
																					: timingDrillDown.parent === "post"
																						? (postTimingSummary?.otherEntries ??
																							[])
																						: timingDrillDown.parent ===
																								"history"
																							? (historyTimingSummary?.otherEntries ??
																								[])
																							: (computeRoutesTimingSummary?.otherEntries ??
																								[])
																			}
																		/>
																	</div>
																</div>
															) : (
																<div className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-2">
																	<div className="mb-2 flex items-center justify-between px-1">
																		<div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
																			Pipeline
																		</div>
																		<span className="font-mono text-[10px] text-slate-400">
																			{formatTimingSeconds(
																				generationTimingSummary.totalMs,
																			)}
																		</span>
																	</div>
																	<GenerationTimingChart
																		entries={generationTimingSummary.entries}
																		onBarClick={(label) => {
																			if (
																				label === "post-pipeline" &&
																				postTimingSummary
																			)
																				setTimingDrillDown("post")
																			else if (
																				label === "initHistory" &&
																				historyTimingSummary
																			)
																				setTimingDrillDown("history")
																			else if (
																				label === "Other" &&
																				generationTimingSummary.otherEntries
																					.length > 0
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
								) : null}
							</div>
						</Surface>
					) : null}
				</div>

				<div className="hidden" aria-hidden="true">
					<div className="rounded-[20px] border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
						<div className="flex items-center justify-between gap-2">
							<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 px-0.5">
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
								<p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 px-0.5">
									Era Preset
								</p>
								<div className="grid grid-cols-2 gap-1.5">
									{ERA_ORDER.map((eraId) => {
										const cfg = ERA_CONFIGS[eraId]
										const pop = cfg.targetPopulation
										const popLabel =
											pop >= 1e9
												? `${(pop / 1e9).toFixed(1)}B`
												: pop >= 1e6
													? `${Math.round(pop / 1e6)}M`
													: `${Math.round(pop / 1e3)}K`
										const active = era === eraId
										return (
											<button
												key={eraId}
												type="button"
												onClick={() => setEra(eraId)}
												className={`rounded-lg border px-2.5 py-2 text-left transition-all ${
													active
														? "border-slate-900 bg-slate-900 text-white"
														: "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
												}`}
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
											</button>
										)
									})}
								</div>
								{(() => {
									const cfg = ERA_CONFIGS[era]
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

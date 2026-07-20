import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	computeSolarDayHours,
	inferRetrogradeRotationFromAxialTiltDeg,
} from "@/model/celestial/day-length"
import type { MoonBody } from "@/model/celestial/moons/moon-types"
import {
	derivePlanetMassKg,
	moonSemiMajorAxisM,
	resolveMoonOrbitHoursPerDay,
} from "@/model/celestial/moons/orbital-mechanics"
import {
	getStarLuminositySol,
	getStarMassSol,
	isValidSpectralClass,
	type MainSequenceClass,
} from "@/model/celestial/star/star-types"
import type { SystemBody } from "@/model/celestial/system/generate-system-bodies"
import {
	SOL_LUNA_DEFAULT,
	SOL_MAIN_WORLD_NAME,
	SOL_SEED,
	SOL_STAR_NAME,
} from "@/model/celestial/system/sol-system"
import {
	computeMoonSurfaceTidesM,
	computeSurfaceTidesM,
	type SurfaceTidesBreakdown,
} from "@/model/climate/tidal-schedule"
import { seedStringToNumber } from "@/model/shared/rng"
import {
	makeRandomSeedLabel,
	normalizeSeedLabel,
	resolveSeedLabel,
} from "@/model/shared/seed-label"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { DiceMultipleOutlineIcon } from "@/ui/components/primitives/icons/DiceMultipleOutlineIcon"
import { MinusBoxIcon } from "@/ui/components/primitives/icons/MinusBoxIcon"
import { PlusBoxIcon } from "@/ui/components/primitives/icons/PlusBoxIcon"
import { RefreshIcon } from "@/ui/components/primitives/icons/RefreshIcon"
import { SproutIcon } from "@/ui/components/primitives/icons/SproutIcon"
import { Surface } from "@/ui/components/primitives/Surface"
import type { GenerationPreviewTab } from "../../planet/screen/generation/generation-preview"
import type { SliderDef } from "../../planet/screen/generation/sliders"
import type { UnitSystem } from "../../planet/screen/shared/ui-format"
import {
	isApproxSolarLocked,
	LazyPlanetDetailTabs,
	useAvgTempKPreview,
} from "../climate-preview/PlanetDetailTabs"
import { GpsFocusButton, renderStatGrid } from "../shared/ui-atoms"
import {
	buildMoonPreviewDataProps,
	buildOrbitBodyStats,
	buildOrbitMoonStats,
} from "../stats/orbit/body-stat-cards"
import {
	appendSizeToTitle,
	getMoonSeedBaseName,
	getSystemBodyKindLabel,
	resolveMoonTitle,
	resolveOrbitBodyTitle,
} from "../stats/orbit/body-titles"
import {
	buildTideLockStat,
	resolveBodyTideLockSiderealDayHours,
	resolveMoonTideLockSiderealDayHours,
} from "../stats/orbit/tide-lock-stats"
import { buildStarStats } from "../stats/star/star-stats"

interface LabeledOrbitBody {
	body: SystemBody
	title: string
}

// Numbers orbits per group once, independent of where each card ends up
// rendered — the main world's own card is interleaved among these by AU,
// which would otherwise reset the counters if numbering were computed
// separately per render group.
function labelOrbitBodies(
	bodies: SystemBody[],
	showRealSolNames: boolean,
): LabeledOrbitBody[] {
	const groupCounters: Record<SystemBody["group"], number> = {
		"asteroid belt": 0,
		dwarf: 0,
		terrestrial: 0,
		helian: 0,
		jovian: 0,
	}
	return bodies.map((body) => {
		groupCounters[body.group] += 1
		return {
			body,
			title: resolveOrbitBodyTitle(
				body,
				groupCounters[body.group],
				showRealSolNames,
			),
		}
	})
}

type OrbitSelection =
	| { kind: "star" }
	| { kind: "orbit"; bodyIndex: number }
	| { kind: "orbit-moon"; bodyIndex: number; moonIndex: number }

interface OrbitChildCardModel {
	key: string
	title: string
	subtitle: string
	onClick: () => void
}

interface OrbitNavigatorViewModel {
	title: string
	typeLabel: string
	breadcrumbs: Array<{
		label: string
		onClick: () => void
	}>
	childrenLabel: string
	dataContent?: React.ReactNode
	onFocus?: () => void
	onReset?: () => void
	headerAction?: React.ReactNode
	stats: StatEntry[]
	children: OrbitChildCardModel[]
	emptyChildrenLabel: string
}

function OrbitHeader({
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

function OrbitChildCard({
	title,
	subtitle,
	onClick,
	insertRowsVisible,
	onToggleInsertRows,
}: Omit<OrbitChildCardModel, "key"> & {
	insertRowsVisible: boolean
	onToggleInsertRows: () => void
}) {
	return (
		<div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 transition-all hover:border-slate-300 hover:bg-slate-50">
			<button
				type="button"
				onClick={onClick}
				className="min-w-0 flex-1 text-left"
			>
				<div className="text-[12px] leading-tight text-slate-950">{title}</div>
			</button>
			<div className="ml-auto flex shrink-0 items-center">
				<div className="mr-1.5 text-[8px] uppercase tracking-[0.12em] text-slate-400">
					{subtitle}
				</div>
				<button
					type="button"
					onClick={onToggleInsertRows}
					aria-label={
						insertRowsVisible
							? `Hide insert rows for ${title}`
							: `Show insert rows for ${title}`
					}
					aria-pressed={insertRowsVisible}
					className={`flex h-5 w-5 items-center justify-center rounded-l-md rounded-r-none border transition-colors ${
						insertRowsVisible
							? "border-slate-300 bg-slate-100 text-slate-700"
							: "border-slate-200 text-slate-400 hover:text-slate-700"
					}`}
				>
					<PlusBoxIcon className="h-3.5 w-3.5" />
				</button>
				<button
					type="button"
					aria-label={`Hide orbit ${title}`}
					className="flex h-5 w-5 items-center justify-center rounded-r-md rounded-l-none border border-l-0 border-slate-200 text-slate-300"
				>
					<MinusBoxIcon className="h-3.5 w-3.5" />
				</button>
			</div>
		</div>
	)
}

function OrbitInsertPlaceholder() {
	return (
		<div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-2.5 py-1 text-center text-[9px] uppercase tracking-[0.16em] text-slate-400">
			... + ...
		</div>
	)
}

export function GenerationPlanetNavigator({
	orbitBodies,
	systemBodies,
	onFocusBody,
	currentFocus,
	onUpdateSystemBody,
	onUpdateSystemMoon,
	onRebuildSystemBody,
	onResetSystemMoon,
	surfaceTidesM,
	tideLock,
	setTideLock,
	setHoursPerDay,
	radiusSlider,
	orbitalDistanceSlider,
	dayLengthSlider,
	substellarLonSlider,
	pressureSlider,
	eccentricitySlider,
	perihelionSlider,
	axialTiltSlider,
	onToggleSpin,
	planetRadiusKm,
	restSeed,
	starName,
	forceMainWorld,
	setForceMainWorld,
	hoursPerDay,
	surfaceStats,
	showRealSolNames,
	spectralClass,
	setSpectralClass,
	starSubtype,
	setStarSubtype,
	setRestSeed,
	setObliquity,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	onClose,
}: {
	orbitBodies?: SystemBody[]
	systemBodies?: SystemBody[]
	onFocusBody?: (bodyIndex: number, moonIndex?: number) => void
	currentFocus?: {
		bodyIndex: number
		moonIndex?: number
	} | null
	onUpdateSystemBody?: (
		bodyIndex: number,
		updater: (body: SystemBody) => SystemBody,
	) => void
	onRebuildSystemBody?: (bodyIndex?: number) => void
	onResetSystemMoon?: (bodyIndex: number, moonIndex: number) => void
	onUpdateSystemMoon?: (
		bodyIndex: number,
		moonIndex: number,
		updater: (moon: MoonBody, parentBody: SystemBody) => MoonBody,
	) => void
	surfaceTidesM?: SurfaceTidesBreakdown
	tideLock: import("@/model/celestial/moons/moon-types").TideLock | null
	setTideLock: (
		v: import("@/model/celestial/moons/moon-types").TideLock | null,
	) => void
	setHoursPerDay: (v: number) => void
	radiusSlider?: SliderDef
	orbitalDistanceSlider?: SliderDef
	dayLengthSlider?: SliderDef
	substellarLonSlider?: SliderDef
	pressureSlider?: SliderDef
	eccentricitySlider?: SliderDef
	perihelionSlider?: SliderDef
	axialTiltSlider?: SliderDef
	isRetrograde: boolean
	onToggleSpin?: () => void
	planetRadiusKm: number
	restSeed: number
	forceMainWorld: boolean
	setForceMainWorld: (v: boolean) => void
	starName?: string
	hoursPerDay: number
	daysPerYear: number
	surfaceStats: StatEntry[]
	orbitalDistanceAU: number
	eccentricity: number
	perihelion: number
	axialTiltDisplay: string
	landCoverage: number
	showRealSolNames: boolean
	spectralClass: string
	setSpectralClass: (v: string) => void
	starSubtype: number
	setStarSubtype: (v: number) => void
	setRestSeed: (v: number) => void
	setObliquity: (v: number) => void
	tidalSchedulePreview?: import("@/model/climate/tidal-schedule").TidalSchedule
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	onClose?: () => void
}) {
	// The solar-lock UI button that used setObliquity was removed; kept as a
	// prop for now since GenesisView still threads it through.
	void setObliquity
	const [selection, setSelection] = useState<OrbitSelection>({
		kind: "star",
	})
	// Runs the same climate simulation the "Preview" section uses, but
	// unconditionally -- independent of whether that section is expanded --
	// so the stats card's Temperature row populates as soon as a body is
	// selected and recomputes whenever a relevant stat changes.
	const probeBody =
		selection.kind === "orbit" || selection.kind === "orbit-moon"
			? systemBodies?.[selection.bodyIndex]
			: undefined
	const probeMoon =
		selection.kind === "orbit-moon"
			? probeBody?.moons[selection.moonIndex]
			: undefined
	const probeConfig = useMemo(() => {
		if (probeMoon && probeBody) {
			const parentYearHours =
				probeBody.orbitalPeriodDays * probeBody.siderealDayHours
			const climateHoursPerDay =
				computeSolarDayHours({
					siderealDayHours: probeMoon.siderealDayHours,
					orbitalPeriodDays: parentYearHours / 24,
					retrograde: inferRetrogradeRotationFromAxialTiltDeg(
						probeMoon.axialTiltDeg,
					),
				}) ?? probeMoon.siderealDayHours
			const climateDaysPerYear =
				climateHoursPerDay > 0 ? parentYearHours / climateHoursPerDay : 0
			return {
				isSolarLocked: probeMoon.tideLock?.type === "solar",
				obliquity: probeMoon.axialTiltDeg,
				eccentricity: probeBody.eccentricity,
				perihelion: probeBody.longitudeOfPerihelionDeg,
				spectralClass,
				starSubtype,
				orbitalDistanceAU: probeBody.orbitalDistanceAU,
				hoursPerDay: climateHoursPerDay,
				daysPerYear: climateDaysPerYear,
				landCoverage: probeMoon.landCoverage,
				planetRadiusKm: probeMoon.diameterKm / 2,
				pressureBar: probeMoon.atmosphere?.pressureBar ?? 0,
				albedo: probeMoon.albedo,
				greenhouseFactor: probeMoon.greenhouseFactor,
				internalHeatTempK: undefined,
				seismologyTotalHeatingK: probeMoon.seismology?.totalHeating,
				substellarLon: probeMoon.substellarLon ?? 0,
			}
		}
		if (probeBody) {
			return {
				isSolarLocked: isApproxSolarLocked(
					probeBody.siderealDayHours,
					probeBody.orbitalPeriodDays,
				),
				obliquity: probeBody.axialTiltDeg,
				eccentricity: probeBody.eccentricity,
				perihelion: probeBody.longitudeOfPerihelionDeg,
				spectralClass,
				starSubtype,
				orbitalDistanceAU: probeBody.orbitalDistanceAU,
				hoursPerDay: probeBody.siderealDayHours,
				daysPerYear: probeBody.orbitalPeriodDays,
				landCoverage: probeBody.landCoverage,
				planetRadiusKm: probeBody.diameterKm / 2,
				pressureBar: probeBody.atmosphere?.pressureBar ?? 0,
				albedo: probeBody.albedo,
				greenhouseFactor: probeBody.greenhouseFactor,
				internalHeatTempK: probeBody.internalHeatTempK,
				// Excluded for jovians -- their real internalHeatTempK is
				// individually fitted against Jupiter/Saturn/Uranus/Neptune's actual
				// temperatures, and system-seismology.ts's residual-heating formula
				// (tuned for rocky/icy geologic stress, not gas-giant internal heat)
				// produces values so large for a jovian's huge sizeClass that no
				// greenhouseFactor can compensate -- see ebm/index.ts's
				// EBMConfig.seismologyTotalHeatingK doc.
				seismologyTotalHeatingK:
					probeBody.group === "jovian"
						? undefined
						: probeBody.seismology?.totalHeating,
				substellarLon: probeBody.substellarLon ?? 0,
			}
		}
		return {
			isSolarLocked: false,
			obliquity: 0,
			eccentricity: 0,
			perihelion: 0,
			spectralClass,
			starSubtype,
			orbitalDistanceAU: 1,
			hoursPerDay: 24,
			daysPerYear: 365,
			landCoverage: 0.3,
			planetRadiusKm: 6371,
			pressureBar: 1,
			albedo: undefined,
			greenhouseFactor: undefined,
			internalHeatTempK: undefined,
			seismologyTotalHeatingK: undefined,
			substellarLon: 0,
		}
	}, [probeBody, probeMoon, spectralClass, starSubtype])
	const probedAvgTempK = useAvgTempKPreview(probeConfig)
	const avgTempK =
		selection.kind === "orbit" || selection.kind === "orbit-moon"
			? probedAvgTempK
			: undefined
	useEffect(() => {
		if (!currentFocus) return
		if (currentFocus.bodyIndex < 0) {
			setSelection({ kind: "star" })
			return
		}
		if (currentFocus.moonIndex !== undefined) {
			setSelection({
				kind: "orbit-moon",
				bodyIndex: currentFocus.bodyIndex,
				moonIndex: currentFocus.moonIndex,
			})
			return
		}
		setSelection({
			kind: "orbit",
			bodyIndex: currentFocus.bodyIndex,
		})
	}, [currentFocus])
	const [childrenExpanded, setChildrenExpanded] = useState(false)
	const [orbitInsertRowsByKey, setOrbitInsertRowsByKey] = useState<
		Record<string, boolean>
	>({})
	const [dataExpanded, setDataExpanded] = useState(false)
	const [seedOverrides, setSeedOverrides] = useState<Record<string, string>>({})
	const [rootSeedLabel, setRootSeedLabel] = useState(
		restSeed === SOL_SEED ? "sol" : restSeed.toString(36).padStart(6, "0"),
	)
	const [seedInput, setSeedInput] = useState(rootSeedLabel)
	const lastAppliedRootSeedRef = useRef<{
		numeric: number
		label: string
	} | null>(null)
	const starClass: MainSequenceClass = isValidSpectralClass(spectralClass)
		? spectralClass
		: "G"
	// showRealSolNames itself is already Sol-gated by the caller (real Sol
	// names should only ever show behind that toggle) -- but a procedurally
	// generated system's body/moon/star names aren't "real" spoilers to hide,
	// so they should always render once generated. namesEnabled is the
	// general "show whatever name this body/moon carries" gate;
	// showRealSolNames stays reserved for the handful of hardcoded Sol
	// fallbacks (SOL_STAR_NAME, SOL_MAIN_WORLD_NAME, SOL_LUNA_DEFAULT.name)
	// below.
	const namesEnabled = restSeed === SOL_SEED ? showRealSolNames : true
	const starTitle = showRealSolNames
		? SOL_STAR_NAME
		: (starName ?? "Primary Star")
	const labeledOrbits = useMemo(
		() => labelOrbitBodies(orbitBodies ?? [], namesEnabled),
		[orbitBodies, namesEnabled],
	)
	const starMassSol = getStarMassSol(starClass, starSubtype)
	const starLuminositySol = getStarLuminositySol(starClass, starSubtype)
	const selectionKey = useCallback((target: OrbitSelection): string => {
		if (target.kind === "star") return "star"
		if (target.kind === "orbit") return `orbit:${target.bodyIndex}`
		return `orbit-moon:${target.bodyIndex}:${target.moonIndex}`
	}, [])
	const getDefaultSeedLabel = useCallback(
		(target: OrbitSelection): string => {
			if (target.kind === "star") return rootSeedLabel
			if (target.kind === "orbit") {
				const body = systemBodies?.[target.bodyIndex]
				return normalizeSeedLabel(body?.seed ?? `orbit-${target.bodyIndex + 1}`)
			}
			const body = systemBodies?.[target.bodyIndex]
			const moon = body?.moons[target.moonIndex]
			return normalizeSeedLabel(
				getMoonSeedBaseName({
					moon,
					moonIndex: target.moonIndex,
					showRealSolNames,
				}),
			)
		},
		[rootSeedLabel, showRealSolNames, systemBodies],
	)
	const getSeedLabel = useCallback(
		(target: OrbitSelection): string =>
			seedOverrides[selectionKey(target)] ?? getDefaultSeedLabel(target),
		[getDefaultSeedLabel, seedOverrides, selectionKey],
	)
	const getDerivedSeedNumber = useCallback(
		(target: OrbitSelection): number => {
			const label = getSeedLabel(target)
			if (target.kind === "star") {
				return label === "sol" ? SOL_SEED : seedStringToNumber(label)
			}
			let parent: OrbitSelection
			if (target.kind === "orbit") {
				parent = { kind: "star" }
			} else {
				parent = { kind: "orbit", bodyIndex: target.bodyIndex }
			}
			const parentLabel = getSeedLabel(parent)
			return seedStringToNumber(`${parentLabel}/${label}`)
		},
		[getSeedLabel],
	)
	const seedDisplay = getSeedLabel(selection)
	useEffect(() => {
		const lastApplied = lastAppliedRootSeedRef.current
		if (
			lastApplied &&
			lastApplied.numeric === restSeed &&
			lastApplied.label === rootSeedLabel
		) {
			return
		}
		setRootSeedLabel(
			restSeed === SOL_SEED ? "sol" : restSeed.toString(36).padStart(6, "0"),
		)
	}, [restSeed, rootSeedLabel])
	useEffect(() => {
		setSeedInput(seedDisplay)
	}, [seedDisplay])
	const planetMassKg = derivePlanetMassKg(planetRadiusKm)
	const moonOrbitHoursPerDay = resolveMoonOrbitHoursPerDay(
		hoursPerDay,
		tideLock,
	)
	const focusSelection = useCallback(
		(nextSelection: OrbitSelection) => {
			if (!onFocusBody) return
			if (nextSelection.kind === "star") {
				onFocusBody(-1)
				return
			}
			if (nextSelection.kind === "orbit") {
				onFocusBody(nextSelection.bodyIndex)
				return
			}
			onFocusBody(nextSelection.bodyIndex, nextSelection.moonIndex)
		},
		[onFocusBody],
	)

	const selectAndFocus = useCallback(
		(nextSelection: OrbitSelection) => {
			setSelection(nextSelection)
			focusSelection(nextSelection)
		},
		[focusSelection],
	)
	const applySeedInput = useCallback(() => {
		const normalized = normalizeSeedLabel(seedInput)
		if (seedInput.trim() === "") {
			setSeedInput(seedDisplay)
			return
		}
		if (selection.kind === "star") {
			const numericSeed =
				normalized === "sol"
					? SOL_SEED
					: (resolveSeedLabel(normalized) ?? seedStringToNumber(normalized))
			lastAppliedRootSeedRef.current = {
				numeric: numericSeed,
				label: normalized,
			}
			setRootSeedLabel(normalized)
			setRestSeed(numericSeed)
			setSeedInput(normalized)
			return
		}
		setSeedOverrides((current) => ({
			...current,
			[selectionKey(selection)]: normalized,
		}))
		setSeedInput(normalized)
	}, [seedDisplay, seedInput, selection, selectionKey, setRestSeed])
	// Only stages a fresh random label into the text field -- it does NOT
	// apply/regenerate. Applying is exclusively the Generate button's job (or
	// Enter), so a dice click never fires off a regeneration by itself.
	const randomizeSeed = useCallback(() => {
		setSeedInput(makeRandomSeedLabel())
	}, [])
	const getMainWorldMoonOrbitDistance = useCallback(
		(moon: MoonBody) =>
			moon.semiMajorAxisPlanetDiameters ??
			moonSemiMajorAxisM(moon, planetMassKg, moonOrbitHoursPerDay) /
				(planetRadiusKm * 2000),
		[moonOrbitHoursPerDay, planetMassKg, planetRadiusKm],
	)
	const getBodyMoonOrbitDistance = useCallback(
		(body: SystemBody, moon: MoonBody) =>
			moon.semiMajorAxisPlanetDiameters ??
			moonSemiMajorAxisM(moon, body.massKg, body.siderealDayHours) /
				(body.diameterKm * 1000),
		[],
	)

	const viewModel = useMemo<OrbitNavigatorViewModel>(() => {
		if (selection.kind === "star") {
			const starChildren = (systemBodies ?? [])
				.map((body, bodyIndex) => ({
					key: `orbit-${body.idx}-${bodyIndex}`,
					au: body.orbitalDistanceAU,
					title:
						body.isMainWorld && !body.name
							? appendSizeToTitle(
									showRealSolNames ? SOL_MAIN_WORLD_NAME : "Terrestrial Planet",
									body.sizeClass,
								)
							: (labeledOrbits.find((entry) => entry.body === body)?.title ??
								resolveOrbitBodyTitle(body, bodyIndex + 1, namesEnabled)),
					subtitle: getSystemBodyKindLabel(body),
					onClick: () => selectAndFocus({ kind: "orbit", bodyIndex }),
				}))
				.sort((a, b) => a.au - b.au)
			return {
				title: starTitle,
				typeLabel: "Star",
				breadcrumbs: [],
				childrenLabel: "Orbits",
				onFocus: onFocusBody
					? () => focusSelection({ kind: "star" })
					: undefined,
				onReset: onRebuildSystemBody ? () => onRebuildSystemBody() : undefined,
				stats: buildStarStats({
					starClass,
					starSubtype,
					restSeed: getDerivedSeedNumber({ kind: "star" }),
					// Sol is always a real G2V star -- its type isn't editable.
					setSpectralClass:
						restSeed === SOL_SEED ? undefined : setSpectralClass,
					setStarSubtype: restSeed === SOL_SEED ? undefined : setStarSubtype,
				}),
				children: starChildren.filter((entry) => entry.title),
				emptyChildrenLabel: "No child orbits.",
			}
		}

		if (selection.kind === "orbit") {
			const body = systemBodies?.[selection.bodyIndex]
			if (!body)
				return {
					title: "Orbit",
					typeLabel: "Planet",
					breadcrumbs: [],
					childrenLabel: "Moons",
					stats: [],
					children: [],
					emptyChildrenLabel: "No child orbits.",
				}
			const isMainWorld = body.isMainWorld
			const bodySurfaceTidesM =
				body.group === "asteroid belt"
					? undefined
					: isMainWorld
						? surfaceTidesM
						: computeSurfaceTidesM(
								body.moons,
								{ diameterKm: body.diameterKm, tideLock: body.tideLock },
								{
									// This body's own rotation, not the main world's
									// hoursPerDay slider -- matches the moon-level card's
									// parentHoursPerDay convention below.
									hoursPerDay: body.siderealDayHours,
									spectralClass,
									starSubtype,
									orbitalDistanceAU: body.orbitalDistanceAU,
									eccentricity: body.eccentricity,
									starName:
										showRealSolNames && restSeed === SOL_SEED
											? SOL_STAR_NAME
											: undefined,
								},
							)
			const bodyTitle =
				isMainWorld && !body.name
					? appendSizeToTitle(
							showRealSolNames ? SOL_MAIN_WORLD_NAME : "Terrestrial Planet",
							body.sizeClass,
						)
					: (labeledOrbits.find((entry) => entry.body === body)?.title ??
						resolveOrbitBodyTitle(body, selection.bodyIndex + 1, namesEnabled))
			const orbitMoons = body.moons
			return {
				title: bodyTitle,
				typeLabel: "Planet",
				breadcrumbs: [
					{
						label: starTitle,
						onClick: () => selectAndFocus({ kind: "star" }),
					},
				],
				childrenLabel: "Moons",
				onFocus: onFocusBody ? () => focusSelection(selection) : undefined,
				onReset: onRebuildSystemBody
					? () => onRebuildSystemBody(selection.bodyIndex)
					: undefined,
				// The main world's own physical fields (radius/orbital distance/day
				// length/eccentricity/periapsis/axial tilt) are still owned by the
				// top-level slider state (the 3D scene and terrain pipeline read
				// them directly there), so an edit from this generic stats card has
				// to be routed back into the matching slider rather than just
				// patching the SystemBody array -- everything else about this call
				// (which stats show, how they're edited) is identical to any other
				// orbit body's card.
				stats: buildOrbitBodyStats({
					body,
					starMassSol,
					starLuminositySol,
					avgTempK,
					unitSystem,
					surfaceTidesM: bodySurfaceTidesM,
					tideLockStat: buildTideLockStat({
						tideLock: body.tideLock,
						tideLockStatus: body.tideLockStatus,
						retrograde: inferRetrogradeRotationFromAxialTiltDeg(
							body.axialTiltDeg,
						),
						starTitle,
						onSelectStar: () => selectAndFocus({ kind: "star" }),
						siblingMoons: orbitMoons,
						onSelectSiblingMoon: (moonIndex) =>
							selectAndFocus({
								kind: "orbit-moon",
								bodyIndex: selection.bodyIndex,
								moonIndex,
							}),
						onSetLock: isMainWorld
							? (lock) => {
									setTideLock(lock)
									const siderealDayHours = resolveBodyTideLockSiderealDayHours(
										lock,
										body,
									)
									if (siderealDayHours !== undefined)
										setHoursPerDay(siderealDayHours)
								}
							: onUpdateSystemBody
								? (lock) =>
										onUpdateSystemBody(selection.bodyIndex, (current) => {
											const siderealDayHours =
												resolveBodyTideLockSiderealDayHours(lock, current)
											return {
												...current,
												tideLock: lock,
												...(siderealDayHours !== undefined
													? { siderealDayHours }
													: {}),
											}
										})
								: undefined,
						resolveSiblingMoonLabel: (moon, moonIndex) =>
							resolveMoonTitle(
								moon,
								moonIndex + 1,
								namesEnabled,
								isMainWorld && moonIndex === 0 && restSeed === SOL_SEED
									? SOL_LUNA_DEFAULT.name
									: undefined,
							),
					}),
					isMainWorld,
					pressureSlider: isMainWorld ? pressureSlider : undefined,
					landCoverageEditor: isMainWorld ? surfaceStats[0]?.editor : undefined,
					substellarLonSlider: isMainWorld ? substellarLonSlider : undefined,
					onToggleSpin: isMainWorld ? onToggleSpin : undefined,
					onUpdateBody: isMainWorld
						? (updater) => {
								const updated = updater(body)
								if (updated.diameterKm !== body.diameterKm)
									radiusSlider?.set(updated.diameterKm / 2)
								if (updated.orbitalDistanceAU !== body.orbitalDistanceAU)
									orbitalDistanceSlider?.set(updated.orbitalDistanceAU)
								if (updated.siderealDayHours !== body.siderealDayHours)
									dayLengthSlider?.set(updated.siderealDayHours)
								if (updated.eccentricity !== body.eccentricity)
									eccentricitySlider?.set(updated.eccentricity)
								if (
									updated.longitudeOfPerihelionDeg !==
									body.longitudeOfPerihelionDeg
								)
									perihelionSlider?.set(updated.longitudeOfPerihelionDeg)
								if (updated.axialTiltDeg !== body.axialTiltDeg)
									axialTiltSlider?.set(updated.axialTiltDeg)
								if (
									updated.inclinationDeg !== body.inclinationDeg ||
									updated.longitudeOfAscendingNodeDeg !==
										body.longitudeOfAscendingNodeDeg
								)
									onUpdateSystemBody?.(selection.bodyIndex, () => updated)
							}
						: onUpdateSystemBody && selection.bodyIndex >= 0
							? (updater) => onUpdateSystemBody(selection.bodyIndex, updater)
							: undefined,
				}),
				dataContent:
					body.group === "asteroid belt" ? undefined : (
						<LazyPlanetDetailTabs
							inline
							seed={getDerivedSeedNumber(selection)}
							moons={orbitMoons}
							daysPerYear={body.orbitalPeriodDays}
							hoursPerDay={body.siderealDayHours}
							planetRadiusKm={body.diameterKm / 2}
							isSolarLocked={isApproxSolarLocked(
								body.siderealDayHours,
								body.orbitalPeriodDays,
							)}
							spectralClass={spectralClass}
							starSubtype={starSubtype}
							orbitalDistanceAU={body.orbitalDistanceAU}
							eccentricity={body.eccentricity}
							perihelion={body.longitudeOfPerihelionDeg}
							obliquity={body.axialTiltDeg}
							substellarLon={body.substellarLon ?? 0}
							landCoverage={body.landCoverage}
							atmosphere={body.atmosphere}
							albedo={body.albedo}
							greenhouseFactor={body.greenhouseFactor}
							internalHeatTempK={body.internalHeatTempK}
							seismologyTotalHeatingK={
								body.group === "jovian"
									? undefined
									: body.seismology?.totalHeating
							}
							generationPreviewTab={generationPreviewTab}
							onSelectGenerationPreviewTab={onSelectGenerationPreviewTab}
							unitSystem={unitSystem}
						/>
					),
				children:
					body.group === "asteroid belt"
						? []
						: orbitMoons
								.map((moon, moonIndex) => ({
									key: `orbit-moon-${body.idx}-${moon.idx ?? moonIndex}`,
									order: isMainWorld
										? getMainWorldMoonOrbitDistance(moon)
										: getBodyMoonOrbitDistance(body, moon),
									title: resolveMoonTitle(
										moon,
										moonIndex + 1,
										namesEnabled,
										isMainWorld && moonIndex === 0 && restSeed === SOL_SEED
											? SOL_LUNA_DEFAULT.name
											: undefined,
									),
									subtitle: "Moon",
									onClick: () =>
										selectAndFocus({
											kind: "orbit-moon",
											bodyIndex: selection.bodyIndex,
											moonIndex,
										}),
								}))
								.sort((a, b) => a.order - b.order),
				emptyChildrenLabel:
					body.group === "asteroid belt"
						? "No moons"
						: orbitMoons.length === 0
							? "Computing moon parameters…"
							: orbitMoons.length === 0
								? "No child orbits."
								: "Computing moon parameters…",
			}
		}

		if (selection.kind === "orbit-moon") {
			const body = systemBodies?.[selection.bodyIndex]
			const sourceMoons = body?.moons
			const moon = sourceMoons?.[selection.moonIndex]
			if (!body || !moon) {
				return {
					title: "Orbit",
					typeLabel: "Moon",
					breadcrumbs: [],
					childrenLabel: "Orbits",
					stats: [],
					children: [],
					emptyChildrenLabel: "No child orbits.",
				}
			}
			const isMainWorld = body.isMainWorld
			const parentMassKg = body.massKg
			const parentDiameterKm = body.diameterKm
			const parentMoons = body.moons
			const parentHoursPerDay = body.siderealDayHours
			const parentOrbitalPeriodDays = body.orbitalPeriodDays
			const parentOrbitalDistanceAU = body.orbitalDistanceAU
			const parentEccentricity = body.eccentricity
			const parentPerihelionDeg = body.longitudeOfPerihelionDeg
			const pd = isMainWorld
				? (moon.semiMajorAxisPlanetDiameters ??
					moonSemiMajorAxisM(moon, planetMassKg, moonOrbitHoursPerDay) /
						(planetRadiusKm * 2000))
				: getBodyMoonOrbitDistance(body, moon)
			const parentTitle =
				isMainWorld && !body.name
					? appendSizeToTitle(
							showRealSolNames ? SOL_MAIN_WORLD_NAME : "Terrestrial Planet",
							body.sizeClass,
						)
					: (labeledOrbits.find((entry) => entry.body === body)?.title ??
						resolveOrbitBodyTitle(body, selection.bodyIndex + 1, namesEnabled))
			return {
				title: resolveMoonTitle(
					moon,
					selection.moonIndex + 1,
					namesEnabled,
					isMainWorld && selection.moonIndex === 0 && restSeed === SOL_SEED
						? SOL_LUNA_DEFAULT.name
						: undefined,
				),
				typeLabel: "Moon",
				breadcrumbs: [
					{
						label: starTitle,
						onClick: () => selectAndFocus({ kind: "star" }),
					},
					{
						label: parentTitle,
						onClick: () =>
							selectAndFocus({
								kind: "orbit",
								bodyIndex: selection.bodyIndex,
							}),
					},
				],
				childrenLabel: "Orbits",
				onFocus: onFocusBody ? () => focusSelection(selection) : undefined,
				onReset: onResetSystemMoon
					? () => onResetSystemMoon(selection.bodyIndex, selection.moonIndex)
					: undefined,
				stats: buildOrbitMoonStats({
					moon,
					avgTempK,
					unitSystem,
					tideLockStat: buildTideLockStat({
						tideLock: moon.tideLock,
						tideLockStatus: moon.tideLockStatus,
						retrograde: inferRetrogradeRotationFromAxialTiltDeg(
							moon.axialTiltDeg,
						),
						starTitle,
						onSelectStar: () => selectAndFocus({ kind: "star" }),
						parentTitle,
						parentTarget: body.idx,
						onSelectParent: () =>
							selectAndFocus({
								kind: "orbit",
								bodyIndex: selection.bodyIndex,
							}),
						onSetLock:
							onUpdateSystemMoon && selection.bodyIndex >= 0
								? (lock) =>
										onUpdateSystemMoon(
											selection.bodyIndex,
											selection.moonIndex,
											(current) => {
												const siderealDayHours =
													resolveMoonTideLockSiderealDayHours(lock, current)
												return {
													...current,
													tideLock: lock,
													...(siderealDayHours !== undefined
														? { siderealDayHours }
														: {}),
												}
											},
										)
								: undefined,
						siblingMoons: parentMoons,
						onSelectSiblingMoon: (moonIndex) =>
							selectAndFocus({
								kind: "orbit-moon",
								bodyIndex: selection.bodyIndex,
								moonIndex,
							}),
						resolveSiblingMoonLabel: (siblingMoon, moonIndex) =>
							resolveMoonTitle(
								siblingMoon,
								moonIndex + 1,
								namesEnabled,
								isMainWorld && moonIndex === 0 && restSeed === SOL_SEED
									? SOL_LUNA_DEFAULT.name
									: undefined,
							),
					}),
					surfaceTidesM: computeMoonSurfaceTidesM(
						moon,
						{
							name:
								showRealSolNames && isMainWorld
									? SOL_MAIN_WORLD_NAME
									: showRealSolNames
										? body.name
										: undefined,
							massKg: parentMassKg,
							diameterKm: parentDiameterKm,
							moons: parentMoons,
						},
						{
							hoursPerDay: parentHoursPerDay,
							spectralClass,
							starSubtype,
							orbitalDistanceAU: parentOrbitalDistanceAU,
							eccentricity: parentEccentricity,
							starName:
								showRealSolNames && restSeed === SOL_SEED
									? SOL_STAR_NAME
									: undefined,
						},
					),
					pdOverride: pd,
					parentOrbitalPeriodDays,
					onUpdateMoon:
						onUpdateSystemMoon && selection.bodyIndex >= 0
							? (updater) =>
									onUpdateSystemMoon(
										selection.bodyIndex,
										selection.moonIndex,
										updater,
									)
							: undefined,
				}),
				dataContent: (
					<LazyPlanetDetailTabs
						{...buildMoonPreviewDataProps({
							seed: getDerivedSeedNumber(selection),
							moon,
							parent: {
								idx: body.idx,
								massKg: parentMassKg,
								diameterKm: parentDiameterKm,
								moons: parentMoons,
							},
							parentHoursPerDay,
							parentOrbitalPeriodDays,
							parentOrbitalDistanceAU,
							parentEccentricity,
							parentPerihelionDeg,
							spectralClass,
							starSubtype,
							generationPreviewTab,
							onSelectGenerationPreviewTab,
							unitSystem,
						})}
					/>
				),
				children: [],
				emptyChildrenLabel: "No child orbits.",
			}
		}
	}, [
		axialTiltSlider,
		dayLengthSlider,
		eccentricitySlider,
		labeledOrbits,
		getBodyMoonOrbitDistance,
		getDerivedSeedNumber,
		getMainWorldMoonOrbitDistance,
		generationPreviewTab,
		moonOrbitHoursPerDay,
		onFocusBody,
		onSelectGenerationPreviewTab,
		onToggleSpin,
		onUpdateSystemBody,
		onUpdateSystemMoon,
		onRebuildSystemBody,
		onResetSystemMoon,
		orbitalDistanceSlider,
		perihelionSlider,
		planetMassKg,
		planetRadiusKm,
		pressureSlider,
		radiusSlider,
		restSeed,
		selection,
		setHoursPerDay,
		setSpectralClass,
		setStarSubtype,
		showRealSolNames,
		spectralClass,
		starLuminositySol,
		starMassSol,
		starClass,
		starSubtype,
		starTitle,
		surfaceStats,
		surfaceTidesM,
		systemBodies,
		substellarLonSlider,
		unitSystem,
		focusSelection,
		selectAndFocus,
		setTideLock,
		namesEnabled,
		avgTempK,
	])

	return (
		<div className="space-y-3 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<OrbitHeader
					title={viewModel.title}
					typeLabel={viewModel.typeLabel}
					breadcrumbs={viewModel.breadcrumbs}
					seedInput={seedInput}
					seedDisplay={seedDisplay}
					onFocus={viewModel.onFocus}
					onReset={viewModel.onReset}
					onClose={onClose}
					headerAction={viewModel.headerAction}
					onSeedInputChange={setSeedInput}
					onSeedApply={applySeedInput}
					onSeedRandomize={randomizeSeed}
					showForceMainWorld={selection.kind === "star"}
					forceMainWorld={forceMainWorld}
					setForceMainWorld={setForceMainWorld}
				/>
				<div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
					{viewModel.stats.length > 0 ? (
						renderStatGrid(viewModel.stats)
					) : (
						<div className="col-span-2 text-[11px] text-slate-400">
							No editable stats available.
						</div>
					)}
				</div>
			</Surface>

			{selection.kind === "star" ||
			(selection.kind === "orbit" &&
				systemBodies?.[selection.bodyIndex]?.group !== "asteroid belt") ? (
				<Surface
					tone="panel"
					borderTone="default"
					radius="xl"
					className="border-t border-slate-200 px-3 py-3"
				>
					<div className="space-y-1.5">
						<button
							type="button"
							onClick={() => setChildrenExpanded((current) => !current)}
							className="flex w-full items-center justify-between gap-3 text-left"
						>
							<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
								{viewModel.childrenLabel} ({viewModel.children.length})
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
								className={`text-slate-400 transition-transform ${childrenExpanded ? "rotate-180" : ""}`}
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
						{childrenExpanded ? (
							<>
								{viewModel.children.length > 0 ? (
									<div className="space-y-1.5">
										{viewModel.children.map((child) => {
											const { key, ...cardProps } = child
											return (
												<React.Fragment key={key}>
													{orbitInsertRowsByKey[key] ? (
														<OrbitInsertPlaceholder />
													) : null}
													<OrbitChildCard
														{...cardProps}
														insertRowsVisible={!!orbitInsertRowsByKey[key]}
														onToggleInsertRows={() =>
															setOrbitInsertRowsByKey((current) => ({
																...current,
																[key]: !current[key],
															}))
														}
													/>
													{orbitInsertRowsByKey[key] ? (
														<OrbitInsertPlaceholder />
													) : null}
												</React.Fragment>
											)
										})}
									</div>
								) : (
									<OrbitInsertPlaceholder />
								)}
							</>
						) : null}
					</div>
				</Surface>
			) : null}

			{viewModel.dataContent ? (
				<Surface
					tone="panel"
					borderTone="default"
					radius="xl"
					className="border-t border-slate-200 px-3 py-3"
				>
					<div className="space-y-1.5">
						<button
							type="button"
							onClick={() => setDataExpanded((current) => !current)}
							className="flex w-full items-center justify-between gap-3 text-left"
						>
							<span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
								Climate
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
								className={`text-slate-400 transition-transform ${dataExpanded ? "rotate-180" : ""}`}
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
						{dataExpanded ? viewModel.dataContent : null}
					</div>
				</Surface>
			) : null}
		</div>
	)
}

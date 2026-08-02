import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { SystemBody } from "@/model/celestial/system/types"
import { TIDAL_SCHEDULE } from "@/model/climate/tidal-schedule"
import type {
	SurfaceTidesBreakdown,
	TidalSchedule,
} from "@/model/climate/tidal-schedule/types"
import { RNG } from "@/model/shared/random/rng"
import { SEED_LABEL } from "@/model/shared/random/seed-label"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Surface } from "@/ui/components/primitives/Surface"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import type { SliderDef } from "@/ui/genesis/generation/sliders"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
import {
	isApproxSolarLocked,
	LazyPlanetDetailTabs,
	useAvgTempKPreview,
} from "@/ui/wiki/climate-preview/PlanetDetailTabs"
import { labelOrbitBodies } from "@/ui/wiki/navigator/GenerationPlanetNavigator/label-orbit-bodies"
import { OrbitHeader } from "@/ui/wiki/navigator/GenerationPlanetNavigator/OrbitHeader"
import { renderStatGrid } from "@/ui/wiki/shared/ui-atoms"
import {
	buildMoonPreviewDataProps,
	buildOrbitBodyStats,
	buildOrbitMoonStats,
} from "@/ui/wiki/stats/orbit/body-stat-cards"
import {
	appendSizeToTitle,
	getMoonKindLabel,
	getMoonSeedBaseName,
	getSystemBodyKindLabel,
	resolveMoonTitle,
	resolveOrbitBodyTitle,
} from "@/ui/wiki/stats/orbit/body-titles"
import {
	buildTideLockStat,
	resolveBodyTideLockSiderealDayHours,
	resolveMoonTideLockSiderealDayHours,
} from "@/ui/wiki/stats/orbit/tide-lock-stats"
import { buildStarStats } from "@/ui/wiki/stats/star/star-stats"

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
	setTideLock: (v: TideLock | null) => void
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
	tidalSchedulePreview?: TidalSchedule
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
				ORBIT_BODY.computeSolarDayHours({
					siderealDayHours: probeMoon.siderealDayHours,
					orbitalPeriodDays: parentYearHours / 24,
					retrograde: ORBIT_BODY.inferRetrogradeRotationFromAxialTiltDeg(
						probeMoon.axialTiltDeg,
					),
				}) ?? probeMoon.siderealDayHours
			const climateDaysPerYear =
				climateHoursPerDay > 0 ? parentYearHours / climateHoursPerDay : 0
			return {
				isSolarLocked: probeMoon.tideLock?.type === "solar",
				obliquity: probeMoon.axialTiltDeg,
				eccentricity: probeBody.eccentricity,
				perihelion:
					probeBody.lsAphelionDeg ?? probeBody.longitudeOfPerihelionDeg,
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
				perihelion:
					probeBody.lsAphelionDeg ?? probeBody.longitudeOfPerihelionDeg,
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
	const [dataExpanded, setDataExpanded] = useState(false)
	const [seedOverrides, setSeedOverrides] = useState<Record<string, string>>({})
	const [rootSeedLabel, setRootSeedLabel] = useState(
		restSeed === SOL_DATA.solSeed
			? "sol"
			: restSeed.toString(36).padStart(6, "0"),
	)
	const [seedInput, setSeedInput] = useState(rootSeedLabel)
	const lastAppliedRootSeedRef = useRef<{
		numeric: number
		label: string
	} | null>(null)
	const starClass: MainSequenceClass = STAR.isValidSpectralClass(spectralClass)
		? spectralClass
		: "G"
	// showRealSolNames itself is already Sol-gated by the caller (real Sol
	// names should only ever show behind that toggle) -- but a procedurally
	// generated system's body/moon/star names aren't "real" spoilers to hide,
	// so they should always render once generated. namesEnabled is the
	// general "show whatever name this body/moon carries" gate;
	// showRealSolNames stays reserved for the handful of hardcoded Sol
	// fallbacks (SOL_STAR_NAME, SOL_MAIN_WORLD_NAME, SOL_SYSTEM.solLunaDefault.name)
	// below.
	const namesEnabled = restSeed === SOL_DATA.solSeed ? showRealSolNames : true
	const starTitle = showRealSolNames
		? SOL_DATA.solStarName
		: (starName ?? "Primary Star")
	const labeledOrbits = useMemo(
		() => labelOrbitBodies(orbitBodies ?? [], namesEnabled),
		[orbitBodies, namesEnabled],
	)
	const starMassSol = STAR.getStarMassSol({
		cls: starClass,
		subtype: starSubtype,
	})
	const starLuminositySol = STAR.getStarLuminositySol({
		cls: starClass,
		subtype: starSubtype,
	})
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
				return SEED_LABEL.normalizeSeedLabel(
					body?.seed ?? `orbit-${target.bodyIndex + 1}`,
				)
			}
			const body = systemBodies?.[target.bodyIndex]
			const moon = body?.moons[target.moonIndex]
			return SEED_LABEL.normalizeSeedLabel(
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
				return label === "sol"
					? SOL_DATA.solSeed
					: RNG.seedStringToNumber(label)
			}
			let parent: OrbitSelection
			if (target.kind === "orbit") {
				parent = { kind: "star" }
			} else {
				parent = { kind: "orbit", bodyIndex: target.bodyIndex }
			}
			const parentLabel = getSeedLabel(parent)
			return RNG.seedStringToNumber(`${parentLabel}/${label}`)
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
			restSeed === SOL_DATA.solSeed
				? "sol"
				: restSeed.toString(36).padStart(6, "0"),
		)
	}, [restSeed, rootSeedLabel])
	useEffect(() => {
		setSeedInput(seedDisplay)
	}, [seedDisplay])
	const planetMassKg = MECHANICS.derivePlanetMassKg(planetRadiusKm)
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
		const normalized = SEED_LABEL.normalizeSeedLabel(seedInput)
		if (seedInput.trim() === "") {
			setSeedInput(seedDisplay)
			return
		}
		if (selection.kind === "star") {
			const numericSeed =
				normalized === "sol"
					? SOL_DATA.solSeed
					: (SEED_LABEL.resolveSeedLabel(normalized) ??
						RNG.seedStringToNumber(normalized))
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
		setSeedInput(SEED_LABEL.makeRandomSeedLabel())
	}, [])
	const getMainWorldMoonOrbitDistance = useCallback(
		(moon: MoonBody) =>
			moon.semiMajorAxisPlanetDiameters ??
			MECHANICS.moonSemiMajorAxisM({ moon, planetMassKg }) /
				(planetRadiusKm * 2000),
		[planetMassKg, planetRadiusKm],
	)
	const getBodyMoonOrbitDistance = useCallback(
		(body: SystemBody, moon: MoonBody) =>
			moon.semiMajorAxisPlanetDiameters ??
			MECHANICS.moonSemiMajorAxisM({ moon, planetMassKg: body.massKg }) /
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
									showRealSolNames
										? SOL_DATA.solMainWorldName
										: "Terrestrial Planet",
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
						restSeed === SOL_DATA.solSeed ? undefined : setSpectralClass,
					setStarSubtype:
						restSeed === SOL_DATA.solSeed ? undefined : setStarSubtype,
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
						: TIDAL_SCHEDULE.computeSurfaceTidesM({
								moons: body.moons,
								planet: {
									diameterKm: body.diameterKm,
									tideLock: body.tideLock,
								},
								params: {
									// This body's own rotation, not the main world's
									// hoursPerDay slider -- matches the moon-level card's
									// parentHoursPerDay convention below.
									hoursPerDay: body.siderealDayHours,
									spectralClass,
									starSubtype,
									orbitalDistanceAU: body.orbitalDistanceAU,
									eccentricity: body.eccentricity,
									starName:
										showRealSolNames && restSeed === SOL_DATA.solSeed
											? SOL_DATA.solStarName
											: undefined,
								},
							})
			const bodyTitle =
				isMainWorld && !body.name
					? appendSizeToTitle(
							showRealSolNames
								? SOL_DATA.solMainWorldName
								: "Terrestrial Planet",
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
						retrograde: ORBIT_BODY.inferRetrogradeRotationFromAxialTiltDeg(
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
								isMainWorld && moonIndex === 0 && restSeed === SOL_DATA.solSeed
									? SOL_SYSTEM.solLunaDefault.name
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
								if (updated.lsAphelionDeg !== body.lsAphelionDeg)
									perihelionSlider?.set(
										updated.lsAphelionDeg ?? updated.longitudeOfPerihelionDeg,
									)
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
							perihelion={body.lsAphelionDeg ?? body.longitudeOfPerihelionDeg}
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
										isMainWorld &&
											moonIndex === 0 &&
											restSeed === SOL_DATA.solSeed
											? SOL_SYSTEM.solLunaDefault.name
											: undefined,
									),
									subtitle: getMoonKindLabel(moon),
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
			const parentPerihelionDeg =
				body.lsAphelionDeg ?? body.longitudeOfPerihelionDeg
			const pd = isMainWorld
				? (moon.semiMajorAxisPlanetDiameters ??
					MECHANICS.moonSemiMajorAxisM({ moon, planetMassKg }) /
						(planetRadiusKm * 2000))
				: getBodyMoonOrbitDistance(body, moon)
			const parentTitle =
				isMainWorld && !body.name
					? appendSizeToTitle(
							showRealSolNames
								? SOL_DATA.solMainWorldName
								: "Terrestrial Planet",
							body.sizeClass,
						)
					: (labeledOrbits.find((entry) => entry.body === body)?.title ??
						resolveOrbitBodyTitle(body, selection.bodyIndex + 1, namesEnabled))
			return {
				title: resolveMoonTitle(
					moon,
					selection.moonIndex + 1,
					namesEnabled,
					isMainWorld &&
						selection.moonIndex === 0 &&
						restSeed === SOL_DATA.solSeed
						? SOL_SYSTEM.solLunaDefault.name
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
						retrograde: ORBIT_BODY.inferRetrogradeRotationFromAxialTiltDeg(
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
								isMainWorld && moonIndex === 0 && restSeed === SOL_DATA.solSeed
									? SOL_SYSTEM.solLunaDefault.name
									: undefined,
							),
					}),
					surfaceTidesM: TIDAL_SCHEDULE.computeMoonSurfaceTidesM({
						moon,
						parent: {
							name:
								showRealSolNames && isMainWorld
									? SOL_DATA.solMainWorldName
									: showRealSolNames
										? body.name
										: undefined,
							massKg: parentMassKg,
							diameterKm: parentDiameterKm,
							moons: parentMoons,
						},
						params: {
							hoursPerDay: parentHoursPerDay,
							spectralClass,
							starSubtype,
							orbitalDistanceAU: parentOrbitalDistanceAU,
							eccentricity: parentEccentricity,
							starName:
								showRealSolNames && restSeed === SOL_DATA.solSeed
									? SOL_DATA.solStarName
									: undefined,
						},
					}),
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
						<EmptyState
							centered={false}
							className="col-span-2 text-[11px]"
							message="No editable stats available."
						/>
					)}
					{viewModel.children.length > 0 ? (
						<>
							<span className="text-[9px] text-slate-400">
								{viewModel.childrenLabel} ({viewModel.children.length})
							</span>
							<div className="flex flex-wrap items-center gap-y-0.5 font-mono text-[9px] text-slate-700">
								{viewModel.children.map((child, index) => (
									<span key={child.key}>
										<InlineTextButton
											onClick={child.onClick}
											className="text-slate-700"
										>
											{child.title}
										</InlineTextButton>
										{index < viewModel.children.length - 1 ? ", " : ""}
									</span>
								))}
							</div>
						</>
					) : null}
				</div>
			</Surface>

			{viewModel.dataContent ? (
				<Surface
					tone="panel"
					borderTone="default"
					radius="xl"
					className="border-t border-slate-200 px-3 py-2"
				>
					<div className="space-y-1">
						<DisclosureButton
							label="Climate"
							expanded={dataExpanded}
							onClick={() => setDataExpanded((current) => !current)}
						/>
						{dataExpanded ? viewModel.dataContent : null}
					</div>
				</Surface>
			) : null}
		</div>
	)
}

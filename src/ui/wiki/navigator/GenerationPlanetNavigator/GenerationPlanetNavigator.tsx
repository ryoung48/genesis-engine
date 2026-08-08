import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { SystemBody } from "@/model/celestial/system/types"
import { TIDAL_FORCE } from "@/model/climate/ocean/tides/tidal-force"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import type {
	SurfaceTidesBreakdown,
	TidalSchedule,
} from "@/model/climate/ocean/tides/tidal-schedule/types"
import { RNG } from "@/model/shared/random/rng"
import { SEED_LABEL } from "@/model/shared/random/seed-label"
import type { StatEntry } from "@/ui/components/composites/EditableStatValue"
import { DisclosureButton } from "@/ui/components/primitives/DisclosureButton"
import { EmptyState } from "@/ui/components/primitives/EmptyState"
import { InlineTextButton } from "@/ui/components/primitives/InlineTextButton"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { uiChartPalette, uiPalette } from "@/ui/components/tokens"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import type { SliderDef } from "@/ui/genesis/generation/sliders"
import { SPECTRAL_CLASS_COLORS } from "@/ui/genesis/generation/star-utils"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
import { classificationSwatchColor } from "@/ui/genesis/solar-system/overlay/constants"
import {
	type ApparentSizeEntry,
	ApparentSizePreview,
} from "@/ui/wiki/climate-preview/ApparentSizePreview"
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
	/** Swatch color for this body's classification (see CLASSIFICATION_COLOR)
	 * -- null when unclassified, in which case no swatch renders. */
	color: string | null
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
	headerAction?: React.ReactNode
	stats: StatEntry[]
	children: OrbitChildCardModel[]
	emptyChildrenLabel: string
}

interface BuildApparentSizeEntriesParams {
	body: SystemBody
	moon?: MoonBody
	spectralClass: MainSequenceClass
	starSubtype: number
	starLabel: string
}

function buildApparentSizeEntries({
	body,
	moon,
	spectralClass,
	starSubtype,
	starLabel,
}: BuildApparentSizeEntriesParams): ApparentSizeEntry[] {
	const toArcminutes = (diameterRad: number) =>
		(diameterRad * 180 * 60) / Math.PI
	const apparentArcminutes = (diameterKm: number, distanceKm: number) =>
		toArcminutes(
			TIDAL_FORCE.apparentDiameterRad({
				bodyDiameterM: diameterKm * 1000,
				distanceM: distanceKm * 1000,
			}),
		)
	const starDiameterKm =
		STAR.getStarDiameterSol({ cls: spectralClass, subtype: starSubtype }) *
		ORBIT_BODY.solarDiameterKm
	const entries: ApparentSizeEntry[] = [
		{
			label: starLabel,
			arcminutes: apparentArcminutes(
				starDiameterKm,
				body.orbitalDistanceAU * ORBIT_BODY.astronomicalUnitM * 0.001,
			),
			color: SPECTRAL_CLASS_COLORS[spectralClass],
		},
	]

	if (moon) {
		const parentDistanceKm =
			(moon.semiMajorAxisPlanetDiameters ?? 0) * body.diameterKm
		if (!(parentDistanceKm > 0)) return entries
		entries.push({
			label: body.name ?? "Parent planet",
			arcminutes: apparentArcminutes(body.diameterKm, parentDistanceKm),
			color: uiPalette.activeDark,
		})
		const selectedMoonIndex = body.moons.indexOf(moon)
		for (let index = 0; index < body.moons.length; index++) {
			if (index === selectedMoonIndex) continue
			const siblingMoon = body.moons[index]!
			const siblingDistanceKm =
				(siblingMoon.semiMajorAxisPlanetDiameters ?? 0) * body.diameterKm
			if (!(siblingDistanceKm > 0)) continue
			// The moons' relative phase is not fixed, so use their RMS separation
			// over an orbit rather than a momentary conjunction/opposition distance.
			const averageSeparationKm = Math.hypot(
				parentDistanceKm,
				siblingDistanceKm,
			)
			entries.push({
				label: siblingMoon.name ?? `Moon ${index + 1}`,
				arcminutes: apparentArcminutes(
					siblingMoon.diameterKm,
					averageSeparationKm,
				),
				color: uiChartPalette.moon[index % uiChartPalette.moon.length],
			})
		}
		return entries
	}

	for (let index = 0; index < body.moons.length; index++) {
		const childMoon = body.moons[index]!
		const distanceKm =
			(childMoon.semiMajorAxisPlanetDiameters ?? 0) * body.diameterKm
		if (!(distanceKm > 0)) continue
		entries.push({
			label: childMoon.name ?? `Moon ${index + 1}`,
			arcminutes: apparentArcminutes(childMoon.diameterKm, distanceKm),
			color: uiChartPalette.moon[index % uiChartPalette.moon.length],
		})
	}
	return entries
}

export function GenerationPlanetNavigator({
	orbitBodies,
	systemBodies,
	onFocusBody,
	currentFocus,
	onUpdateSystemBody,
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
	seed,
	starName,
	setForceMainWorld,
	surfaceStats,
	showRealSolNames,
	spectralClass,
	setSpectralClass,
	starSubtype,
	setStarSubtype,
	setSeed,
	setObliquity,
	generationPreviewTab,
	onSelectGenerationPreviewTab,
	unitSystem,
	onClose,
	generateContent,
	generating,
	previewContainer,
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
	seed: number
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
	setSeed: (v: number) => void
	setObliquity: (v: number) => void
	tidalSchedulePreview?: TidalSchedule
	generationPreviewTab: GenerationPreviewTab
	onSelectGenerationPreviewTab: (tab: GenerationPreviewTab) => void
	unitSystem: UnitSystem
	onClose?: () => void
	/** Rendered below the climate preview, inside the same collapsible
	 * section, only when the currently selected/focused body is the main
	 * world -- the Generate button + progress/timing built by
	 * GenerationPanel. Non-main-world selections show the climate preview
	 * alone (section titled "Climate" instead of "Generate"). */
	generateContent?: React.ReactNode
	/** True while a Generate run is in flight -- used to auto-close the
	 * Preview section the moment it finishes, so re-rolling doesn't leave the
	 * panel sitting open on a section the user just triggered and is done
	 * with. */
	generating?: boolean
	/** DOM node to portal the Preview section into (see GenerationPanel,
	 * which places this after WorldDetails) so it renders below every other
	 * section instead of directly under the orbit header/stats where this
	 * component would otherwise put it inline. Falls back to inline
	 * rendering if unset. */
	previewContainer?: HTMLElement | null
}) {
	// The solar-lock UI button that used setObliquity was removed; kept as a
	// prop for now since GenesisView still threads it through.
	void setObliquity
	const [selection, setSelection] = useState<OrbitSelection>(() => {
		const mainWorldIndex =
			systemBodies?.findIndex((body) => body.isMainWorld) ?? -1
		return mainWorldIndex >= 0
			? { kind: "orbit", bodyIndex: mainWorldIndex }
			: { kind: "star" }
	})
	const selectionKey = useCallback((target: OrbitSelection): string => {
		if (target.kind === "star") return "star"
		if (target.kind === "orbit") return `orbit:${target.bodyIndex}`
		return `orbit-moon:${target.bodyIndex}:${target.moonIndex}`
	}, [])
	const isSelectionMainWorld = (target: OrbitSelection): boolean =>
		target.kind === "orbit" &&
		systemBodies?.[target.bodyIndex]?.isMainWorld === true
	const [dataExpanded, setDataExpanded] = useState(() =>
		isSelectionMainWorld(selection),
	)
	// Tracks whether the "generate" tab currently has focus on whichever body
	// is shown -- only ever true while on the main world, since that's the
	// only card with a "generate" tab to begin with (see onDetailTabChange
	// wired to the main world's LazyPlanetDetailTabs below). Read below to
	// decide whether leaving that body should reset the section at all.
	const [isGenerateTabFocused, setIsGenerateTabFocused] = useState(() =>
		isSelectionMainWorld(selection),
	)
	// The actual `key` handed to the main world's LazyPlanetDetailTabs --
	// separate from dataExpandedForKey below so it can be left unchanged
	// (skipping a remount, preserving whatever tab was showing) on the same
	// transitions that skip the section's expand/collapse reset.
	const [contentKey, setContentKey] = useState(() => selectionKey(selection))
	// A navigation resets Preview only when it leaves the main world's
	// Generate tab. Every other body transition preserves the section's
	// expansion state and active tab, including navigation back to the main
	// world, so browsing on e.g. Observer does not snap back to Climate.
	//
	// Adjusted here during render (React's "adjusting state when a prop
	// changes" pattern) rather than in a useEffect -- an effect fires a frame
	// after commit, so the OLD dataExpanded value would still be "open" for
	// one paint while viewModel.dataContent (below) has already remounted for
	// the NEW selection, producing a visible flash of the new body's default
	// tab before the section snaps shut. Comparing against the last selection
	// we adjusted for (via its key, since OrbitSelection isn't
	// reference-stable) keeps this a one-time sync per navigation instead of
	// firing every render.
	const [dataExpandedForKey, setDataExpandedForKey] = useState(() =>
		selectionKey(selection),
	)
	if (selectionKey(selection) !== dataExpandedForKey) {
		setDataExpandedForKey(selectionKey(selection))
		if (isGenerateTabFocused) {
			setDataExpanded(false)
			setContentKey(selectionKey(selection))
		}
	}
	// Let the render-phase transition above observe the old Generate-tab state
	// exactly once when leaving the main world. Once the destination is a
	// sibling, moon, or star, it can no longer have a Generate tab, so clear
	// the flag before any later body-to-body navigation can reuse it.
	useEffect(() => {
		if (
			selection.kind !== "orbit" ||
			systemBodies?.[selection.bodyIndex]?.isMainWorld !== true
		) {
			setIsGenerateTabFocused(false)
		}
	}, [selection, systemBodies])
	// Closes the Preview section the moment a Generate run finishes (the
	// falling edge of `generating`), regardless of which body is selected --
	// the button was just pressed from inside it, so leaving it open after
	// the result lands just clutters the panel. Effect-based (not the
	// render-phase pattern above) since there's no remount/flash risk here:
	// generation finishing isn't a navigation, so a one-frame-late close
	// just reads as a normal collapse animation.
	const wasGeneratingRef = useRef(generating)
	useEffect(() => {
		if (wasGeneratingRef.current && !generating) setDataExpanded(false)
		wasGeneratingRef.current = generating
	}, [generating])
	// Regenerating the system from the main world's own seed (dice/earth/apply)
	// re-rolls every body, including which slot the main world lands in -- its
	// bodyIndex is not stable across a regeneration. This tracks "the user is
	// looking at the main world" independent of that index, so the effect
	// below can snap `selection` back onto the new main world instead of
	// silently showing whatever sibling ended up at the old index (which
	// looked like "nothing happened except the star's name changed").
	const mainWorldIntentRef = useRef(true)
	// Set by the main-world seed actions (dice/earth/apply) to re-focus the
	// camera on the main world once its regenerated body lands in
	// systemBodies -- unlike mainWorldIntentRef's index-resync (which also
	// has to run on every ordinary stat edit), this only fires for an actual
	// rebuild, not every incremental slider tweak.
	const pendingMainWorldFocusRef = useRef(false)
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
			mainWorldIntentRef.current = false
			setSelection({ kind: "star" })
			return
		}
		if (currentFocus.moonIndex !== undefined) {
			mainWorldIntentRef.current = false
			setSelection({
				kind: "orbit-moon",
				bodyIndex: currentFocus.bodyIndex,
				moonIndex: currentFocus.moonIndex,
			})
			return
		}
		mainWorldIntentRef.current =
			systemBodies?.[currentFocus.bodyIndex]?.isMainWorld === true
		setSelection({
			kind: "orbit",
			bodyIndex: currentFocus.bodyIndex,
		})
	}, [currentFocus, systemBodies])
	const [seedOverrides, setSeedOverrides] = useState<Record<string, string>>({})
	const [rootSeedLabel, setRootSeedLabel] = useState(
		seed === SOL_DATA.solSeed ? "sol" : seed.toString(36).padStart(6, "0"),
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
	const namesEnabled = seed === SOL_DATA.solSeed ? showRealSolNames : true
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
	// The main world's Semi Major Axis editor always spans ±10% of this
	// frozen baseline (a balanced, stable window) rather than recentering on
	// whatever the live value is -- if it recomputed from the current
	// orbitalDistanceAU on every edit, the slider's own bounds would shift
	// under the user's cursor mid-drag, and repeated edits could walk the
	// value arbitrarily far from where it started. Reset only when the
	// system was actually regenerated (seed/star type change), captured via
	// the render-phase "adjust state" pattern used elsewhere in this file.
	// Computed directly from the star's habitable-zone AU (not read off
	// systemBodies) since a forced main world always lands exactly at that
	// deviation-0/HZ-center distance -- systemBodies itself only reflects a
	// spectralClass/starSubtype change one render later (generatedSystemBodies
	// syncs into solarSystem.orbits via an effect, not synchronously), so
	// reading it here would freeze the OLD baseline for one render, leaving
	// the "balanced" window centered on the wrong star's HZ whenever the new
	// one doesn't happen to also sit at ~1 AU.
	const orbitalDistanceGenerationKey = `${seed}:${spectralClass}:${starSubtype}`
	const [orbitalDistanceBaselineKey, setOrbitalDistanceBaselineKey] = useState(
		orbitalDistanceGenerationKey,
	)
	const [orbitalDistanceBaselineAU, setOrbitalDistanceBaselineAU] = useState(
		() => STAR.getHabitableZoneAU(starLuminositySol),
	)
	if (orbitalDistanceGenerationKey !== orbitalDistanceBaselineKey) {
		setOrbitalDistanceBaselineKey(orbitalDistanceGenerationKey)
		setOrbitalDistanceBaselineAU(STAR.getHabitableZoneAU(starLuminositySol))
	}
	// The main world's seed IS the system's seed (editing it regenerates
	// the whole solar system with a forced main world at the habitable-zone
	// center) -- every other body/moon just carries its own derived
	// seedOverrides entry. See GenerationPlanetNavigator subtitle-row seed
	// controls, which are only ever shown for this selection.
	const isMainWorldTarget = useCallback(
		(target: OrbitSelection): boolean =>
			target.kind === "orbit" &&
			systemBodies?.[target.bodyIndex]?.isMainWorld === true,
		[systemBodies],
	)
	const getDefaultSeedLabel = useCallback(
		(target: OrbitSelection): string => {
			if (isMainWorldTarget(target)) return rootSeedLabel
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
		[isMainWorldTarget, rootSeedLabel, showRealSolNames, systemBodies],
	)
	const getSeedLabel = useCallback(
		(target: OrbitSelection): string =>
			seedOverrides[selectionKey(target)] ?? getDefaultSeedLabel(target),
		[getDefaultSeedLabel, seedOverrides, selectionKey],
	)
	const getDerivedSeedNumber = useCallback(
		(target: OrbitSelection): number => {
			const label = getSeedLabel(target)
			if (target.kind === "star" || isMainWorldTarget(target)) {
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
		[getSeedLabel, isMainWorldTarget],
	)
	const seedDisplay = getSeedLabel(selection)
	useEffect(() => {
		const lastApplied = lastAppliedRootSeedRef.current
		if (
			lastApplied &&
			lastApplied.numeric === seed &&
			lastApplied.label === rootSeedLabel
		) {
			return
		}
		setRootSeedLabel(
			seed === SOL_DATA.solSeed ? "sol" : seed.toString(36).padStart(6, "0"),
		)
	}, [seed, rootSeedLabel])
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
			mainWorldIntentRef.current = isMainWorldTarget(nextSelection)
			setSelection(nextSelection)
			focusSelection(nextSelection)
		},
		[focusSelection, isMainWorldTarget],
	)
	// After a main-world-driven regeneration (dice/earth/apply seed), the main
	// world's bodyIndex may have moved -- follow it so the selection keeps
	// pointing at the actual main world instead of whatever sibling now sits
	// at the old index.
	useEffect(() => {
		if (!mainWorldIntentRef.current || selection.kind !== "orbit") return
		const mainWorldIndex =
			systemBodies?.findIndex((body) => body.isMainWorld) ?? -1
		if (mainWorldIndex >= 0 && mainWorldIndex !== selection.bodyIndex) {
			setSelection({ kind: "orbit", bodyIndex: mainWorldIndex })
		}
	}, [systemBodies, selection])
	// Re-focuses the camera on the main world once a dice/earth/apply-seed
	// rebuild's regenerated body shows up in systemBodies -- a rebuild can
	// change its orbital distance (or even which slot it lands in), so the
	// old camera framing may no longer even be pointed at the right spot.
	// Only fires for that rebuild, not every incidental systemBodies change
	// (e.g. an ordinary stat-slider edit), since it's gated on the pending
	// flag those seed actions set.
	useEffect(() => {
		if (!pendingMainWorldFocusRef.current) return
		const mainWorldIndex =
			systemBodies?.findIndex((body) => body.isMainWorld) ?? -1
		if (mainWorldIndex < 0) return
		pendingMainWorldFocusRef.current = false
		focusSelection({ kind: "orbit", bodyIndex: mainWorldIndex })
	}, [systemBodies, focusSelection])
	const applySeedInput = useCallback(() => {
		const normalized = SEED_LABEL.normalizeSeedLabel(seedInput)
		if (seedInput.trim() === "") {
			setSeedInput(seedDisplay)
			return
		}
		if (isMainWorldTarget(selection)) {
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
			setSeed(numericSeed)
			setForceMainWorld(true)
			// The forced main world is a literal Earth clone (see body/index.ts) --
			// its host star should mimic Sol too, not whatever class/subtype the
			// star card was last left on.
			setSpectralClass(STAR.defaultSpectralClass)
			setStarSubtype(STAR.defaultStarSubtype)
			setSeedInput(normalized)
			pendingMainWorldFocusRef.current = true
			return
		}
		setSeedOverrides((current) => ({
			...current,
			[selectionKey(selection)]: normalized,
		}))
		setSeedInput(normalized)
	}, [
		isMainWorldTarget,
		seedDisplay,
		seedInput,
		selection,
		selectionKey,
		setForceMainWorld,
		setSeed,
		setSpectralClass,
		setStarSubtype,
	])
	// Rolls a fresh random label straight into the seed and applies it --
	// same immediate regenerate-on-click behavior as the Earth shortcut. Only
	// ever rendered on the main world's row (like the Earth button), so it
	// always drives seed unconditionally rather than re-checking
	// isMainWorldTarget against a selection that may not have re-rendered yet.
	const randomizeSeed = useCallback(() => {
		const label = SEED_LABEL.makeRandomSeedLabel()
		const numericSeed = RNG.seedStringToNumber(label)
		lastAppliedRootSeedRef.current = { numeric: numericSeed, label }
		setRootSeedLabel(label)
		setSeed(numericSeed)
		setForceMainWorld(true)
		setSpectralClass(STAR.defaultSpectralClass)
		setStarSubtype(STAR.defaultStarSubtype)
		setSeedInput(label)
		pendingMainWorldFocusRef.current = true
	}, [setForceMainWorld, setSeed, setSpectralClass, setStarSubtype])
	// The main world's dedicated "set to Earth" shortcut -- applies
	// SOL_DATA.solSeed immediately (no staging/Generate step needed) so the
	// whole solar system regenerates as the real Sol system.
	const applyEarthSeed = useCallback(() => {
		lastAppliedRootSeedRef.current = { numeric: SOL_DATA.solSeed, label: "sol" }
		setRootSeedLabel("sol")
		setSeed(SOL_DATA.solSeed)
		setSpectralClass(STAR.defaultSpectralClass)
		setStarSubtype(STAR.defaultStarSubtype)
		setForceMainWorld(true)
		setSeedInput("sol")
		pendingMainWorldFocusRef.current = true
	}, [setForceMainWorld, setSeed, setSpectralClass, setStarSubtype])
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
					color: classificationSwatchColor(body.classification),
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
				stats: buildStarStats({
					starClass,
					starSubtype,
					// Sol is always a real G2V star -- its type isn't editable.
					setSpectralClass:
						seed === SOL_DATA.solSeed ? undefined : setSpectralClass,
					setStarSubtype:
						seed === SOL_DATA.solSeed ? undefined : setStarSubtype,
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
										showRealSolNames && seed === SOL_DATA.solSeed
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
					orbitalDistanceBaselineAU: isMainWorld
						? orbitalDistanceBaselineAU
						: undefined,
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
							: undefined,
						resolveSiblingMoonLabel: (moon, moonIndex) =>
							resolveMoonTitle(
								moon,
								moonIndex + 1,
								namesEnabled,
								isMainWorld && moonIndex === 0 && seed === SOL_DATA.solSeed
									? SOL_SYSTEM.solLunaDefault.name
									: undefined,
							),
					}),
					isMainWorld,
					pressureSlider: isMainWorld ? pressureSlider : undefined,
					landCoverageEditor:
						isMainWorld && seed !== SOL_DATA.solSeed
							? surfaceStats[0]?.editor
							: undefined,
					substellarLonSlider: isMainWorld ? substellarLonSlider : undefined,
					onToggleSpin: isMainWorld ? onToggleSpin : undefined,
					onUpdateBody: isMainWorld
						? (updater) => {
								const updated = updater(body)
								if (updated.diameterKm !== body.diameterKm)
									radiusSlider?.set(updated.diameterKm / 2)
								if (updated.orbitalDistanceAU !== body.orbitalDistanceAU) {
									// orbitalDistanceSlider.set expects a habitable-zone
									// FACTOR (its own value is `orbitalDistanceAU / hz`,
									// re-multiplied by hz internally -- see
									// buildPlanetSliders' "Orbital Distance" entry), not raw
									// AU -- this stat card edits raw AU directly, so it has
									// to convert back to that factor before handing it off.
									// Passing the raw AU straight through silently
									// double-applies hz, which only coincidentally looked
									// right for a Sol-like G2 star (hz ≈ 1 AU) and wildly
									// distorts the result for any other star type.
									const hz = STAR.getHabitableZoneAU(starLuminositySol)
									orbitalDistanceSlider?.set(
										hz > 0
											? updated.orbitalDistanceAU / hz
											: updated.orbitalDistanceAU,
									)
								}
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
						: undefined,
				}),
				dataContent:
					body.group === "asteroid belt" ? undefined : (
						<LazyPlanetDetailTabs
							// contentKey only changes on navigations that actually warrant
							// a reset (see the render-phase adjustment above) -- plain
							// planet-to-planet browsing that never touched "generate"
							// keeps the same key, so this instance (and its active tab)
							// carries over instead of remounting to the "climate" default.
							key={contentKey}
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
							generateContent={isMainWorld ? generateContent : undefined}
							observerContent={
								<ApparentSizePreview
									entries={buildApparentSizeEntries({
										body,
										spectralClass: starClass,
										starSubtype,
										starLabel: starTitle,
									})}
								/>
							}
							onDetailTabChange={
								isMainWorld
									? (tab) => setIsGenerateTabFocused(tab === "generate")
									: undefined
							}
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
										isMainWorld && moonIndex === 0 && seed === SOL_DATA.solSeed
											? SOL_SYSTEM.solLunaDefault.name
											: undefined,
									),
									subtitle: getMoonKindLabel(moon),
									color: classificationSwatchColor(moon.classification),
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
					isMainWorld && selection.moonIndex === 0 && seed === SOL_DATA.solSeed
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
				// Moons never carry their own seed/dice/reset controls -- only the
				// main world's subtitle row does (see isMainWorldTarget).
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
								isMainWorld && moonIndex === 0 && seed === SOL_DATA.solSeed
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
								showRealSolNames && seed === SOL_DATA.solSeed
									? SOL_DATA.solStarName
									: undefined,
						},
					}),
					pdOverride: pd,
					parentOrbitalPeriodDays,
				}),
				dataContent: (
					<LazyPlanetDetailTabs
						// Share the conditional key with planet tabs so ordinary
						// moon-to-moon navigation preserves the active Preview tab.
						// It changes only when leaving the main world's Generate tab.
						key={contentKey}
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
						observerContent={
							<ApparentSizePreview
								entries={buildApparentSizeEntries({
									body,
									moon,
									spectralClass: starClass,
									starSubtype,
									starLabel: starTitle,
								})}
							/>
						}
					/>
				),
				children: [],
				emptyChildrenLabel: "No child orbits.",
			}
		}
	}, [
		axialTiltSlider,
		contentKey,
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
		orbitalDistanceBaselineAU,
		orbitalDistanceSlider,
		perihelionSlider,
		planetMassKg,
		planetRadiusKm,
		pressureSlider,
		radiusSlider,
		seed,
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
		generateContent,
	])

	return (
		<div className="space-y-3 overflow-x-hidden">
			<Surface tone="panelMuted" radius="xl" className="px-3 py-3">
				<OrbitHeader
					title={viewModel.title}
					typeLabel={viewModel.typeLabel}
					breadcrumbs={viewModel.breadcrumbs}
					seedInput={seedInput}
					onFocus={viewModel.onFocus}
					onClose={onClose}
					headerAction={viewModel.headerAction}
					showSeedControls={isMainWorldTarget(selection)}
					onSeedInputChange={setSeedInput}
					onSeedApply={applySeedInput}
					onSeedRandomize={randomizeSeed}
					onSeedSetEarth={applyEarthSeed}
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
									<span key={child.key} className="inline-flex items-center">
										{child.color ? (
											<Swatch color={child.color} className="mr-1" />
										) : null}
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

			{viewModel.dataContent
				? (() => {
						const preview = (
							<Surface
								tone="panel"
								borderTone="default"
								radius="xl"
								className="border-t border-slate-200 px-3 py-2"
							>
								<div className="space-y-1">
									<DisclosureButton
										label="Preview"
										expanded={dataExpanded}
										onClick={() => setDataExpanded((current) => !current)}
									/>
									{dataExpanded ? viewModel.dataContent : null}
								</div>
							</Surface>
						)
						return previewContainer
							? createPortal(preview, previewContainer)
							: preview
					})()
				: null}
		</div>
	)
}

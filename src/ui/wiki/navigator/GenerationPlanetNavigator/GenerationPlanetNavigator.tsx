import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { STAR } from "@/model/celestial/star"
import type {
	HostStarAttributes,
	SpectralClass,
} from "@/model/celestial/star/types"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { CompanionStar, SystemBody } from "@/model/celestial/system/types"
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
import { StarIcon } from "@/ui/components/primitives/icons/StarIcon"
import { Surface } from "@/ui/components/primitives/Surface"
import { Swatch } from "@/ui/components/primitives/Swatch"
import { uiChartPalette, uiPalette } from "@/ui/components/tokens"
import type { GenerationPreviewTab } from "@/ui/genesis/generation/generation-preview"
import type { SliderDef } from "@/ui/genesis/generation/sliders"
import { SPECTRAL_CLASS_COLORS } from "@/ui/genesis/generation/star-utils"
import type { UnitSystem } from "@/ui/genesis/shared/ui-format"
import type { OrbitAddress } from "@/ui/genesis/solar-system/overlay"
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

/** This component's own selection state -- see OrbitAddress's own doc for
 * the addressing scheme (starIndex 0 = the system's own primary star,
 * 1-based = a companion; a companion is `{kind: "star", starIndex: N>0}`,
 * the exact same shape the primary uses for N = 0, so there's only ever one
 * "star" branch to handle below instead of a separate special-cased
 * "companion-star" kind). */
type OrbitSelection = OrbitAddress

// Finds wherever the main world currently lives -- a top-level SystemBody,
// or (gas-giant-moon mode) a moon nested inside a sibling's moons array --
// and returns the OrbitSelection that points at it. Falls back to the
// primary star when no main world exists at all (procedural mode).
function findMainWorldSelection(systemBodies?: SystemBody[]): OrbitSelection {
	if (!systemBodies) return { kind: "star", starIndex: 0 }
	const bodyIdx = systemBodies.findIndex((body) => body.isMainWorld)
	if (bodyIdx >= 0) return { kind: "body", starIndex: 0, bodyIdx }
	for (let i = 0; i < systemBodies.length; i++) {
		const moonIdx = systemBodies[i]!.moons.findIndex((moon) => moon.isMainWorld)
		if (moonIdx >= 0) return { kind: "moon", starIndex: 0, bodyIdx: i, moonIdx }
	}
	return { kind: "star", starIndex: 0 }
}

interface OrbitChildCardModel {
	key: string
	title: string
	subtitle: string
	/** Swatch color for this body's classification (see CLASSIFICATION_COLOR)
	 * -- null when unclassified, in which case no swatch renders. */
	color: string | null
	/** "star" renders a small star-shaped icon (tinted by `color`) instead of
	 * the usual square/round classification swatch -- used for companion
	 * stars, which have a spectral-class color but no CLASSIFICATION_COLOR of
	 * their own. Omitted/undefined uses the normal Swatch. */
	icon?: "star"
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
	spectralClass: SpectralClass
	starSubtype: number
	starDiameterSol?: number
	starLabel: string
}

function buildApparentSizeEntries({
	body,
	moon,
	spectralClass,
	starSubtype,
	starDiameterSol,
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
		(starDiameterSol ??
			STAR.getStarDiameterSol({
				cls: spectralClass as (typeof STAR.mainSequenceClasses)[number],
				subtype: starSubtype,
			})) * ORBIT_BODY.solarDiameterKm
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
	companionStars,
	hostStar,
	mainWorldSystemBody,
	updateMainWorldBody,
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
	surfaceStats,
	showRealSolNames,
	spectralClass,
	setSpectralClass,
	starSubtype,
	setStarSubtype,
	setStarAgeGyr,
	starAgeGyr,
	setSeed,
	resetMainWorldToEarth,
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
	onFocusBody?: (address: OrbitAddress) => void
	/** Every companion star bound to this system, each with its own real
	 * generated planets -- see CompanionStar's doc. Shown alongside the
	 * primary's own bodies in the "Orbits" list (a companion is just
	 * `{kind: "star", starIndex: N>0}`, same OrbitSelection shape the
	 * primary uses); not live-edited, so no setSpectralClass/setStarSubtype
	 * equivalent for them. */
	companionStars?: CompanionStar[]
	hostStar?: HostStarAttributes
	currentFocus?: OrbitAddress | null
	/** The main world's SystemBody entry wherever it lives -- see
	 * useSolarSystemBodies' mainWorldSystemBody/moonToMainWorldView. */
	mainWorldSystemBody?: SystemBody | null
	/** Edits the main world wherever it lives (top-level or nested in a gas
	 * giant's moons) -- see useSolarSystemBodies' updateMainWorldBody. */
	updateMainWorldBody?: (updater: (body: SystemBody) => SystemBody) => void
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
	setStarAgeGyr: (v: number) => void
	starAgeGyr: number
	setSeed: (v: number) => void
	/** Full-state reset for the Earth-icon shortcut -- replaces star+orbits
	 * outright so live-edited main-world sliders (axial tilt, pressure, etc)
	 * don't survive a reset onto an already-Sol seed. See
	 * useSolarSystemBodies' resetMainWorldToEarth. Optional: falls back to
	 * the field-by-field seed/spectralClass/starSubtype reset below when a
	 * caller doesn't wire it through. */
	resetMainWorldToEarth?: () => void
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
	const [selection, setSelection] = useState<OrbitSelection>(() =>
		findMainWorldSelection(systemBodies),
	)
	const selectionKey = useCallback((target: OrbitSelection): string => {
		if (target.kind === "star") return `star:${target.starIndex}`
		if (target.kind === "body")
			return `body:${target.starIndex}:${target.bodyIdx}`
		return `moon:${target.starIndex}:${target.bodyIdx}:${target.moonIdx}`
	}, [])
	// A main world can only ever live on the system's own primary star -- a
	// companion never has one (see CompanionStar's doc) -- so this is always
	// false for a starIndex > 0 target.
	const isSelectionMainWorld = useCallback(
		(target: OrbitSelection): boolean => {
			if (target.starIndex !== 0) return false
			if (target.kind === "body")
				return systemBodies?.[target.bodyIdx]?.isMainWorld === true
			if (target.kind === "moon")
				return (
					systemBodies?.[target.bodyIdx]?.moons[target.moonIdx]?.isMainWorld ===
					true
				)
			return false
		},
		[systemBodies],
	)
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
		if (!isSelectionMainWorld(selection)) {
			setIsGenerateTabFocused(false)
		}
	}, [selection, isSelectionMainWorld])
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
	// selected and recomputes whenever a relevant stat changes. A companion's
	// own bodies aren't in `systemBodies` (the primary's own reactive array)
	// -- see getBodiesForStar -- but they're real, already-generated
	// SystemBody data (CompanionStar.orbits), so the same probe/stats
	// machinery applies to them unchanged.
	const getBodiesForStar = useCallback(
		(starIndex: number): SystemBody[] | undefined =>
			starIndex === 0 ? systemBodies : companionStars?.[starIndex - 1]?.orbits,
		[systemBodies, companionStars],
	)
	const probeBody =
		selection.kind === "body" || selection.kind === "moon"
			? getBodiesForStar(selection.starIndex)?.[selection.bodyIdx]
			: undefined
	const probeMoon =
		selection.kind === "moon" ? probeBody?.moons[selection.moonIdx] : undefined
	const probeHostStar =
		selection.starIndex === 0
			? hostStar
			: companionStars?.[selection.starIndex - 1]?.hostStar
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
				starTemperatureK: probeHostStar?.temperatureK,
				starDiameterSol: probeHostStar?.diameterSol,
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
				starTemperatureK: probeHostStar?.temperatureK,
				starDiameterSol: probeHostStar?.diameterSol,
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
			starTemperatureK: probeHostStar?.temperatureK,
			starDiameterSol: probeHostStar?.diameterSol,
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
	}, [probeBody, probeMoon, spectralClass, starSubtype, probeHostStar])
	const probedAvgTempK = useAvgTempKPreview(probeConfig)
	const avgTempK =
		selection.kind === "body" || selection.kind === "moon"
			? probedAvgTempK
			: undefined
	useEffect(() => {
		if (!currentFocus) return
		if (currentFocus.kind === "star" || currentFocus.kind === "moon") {
			mainWorldIntentRef.current = false
			setSelection(currentFocus)
			return
		}
		mainWorldIntentRef.current =
			currentFocus.starIndex === 0 &&
			systemBodies?.[currentFocus.bodyIdx]?.isMainWorld === true
		setSelection(currentFocus)
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
	const starClass: SpectralClass =
		hostStar?.spectralClass ?? (spectralClass as SpectralClass)
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
	const starMassSol =
		hostStar?.massSol ??
		STAR.getStarMassSol({
			cls: starClass as (typeof STAR.mainSequenceClasses)[number],
			subtype: starSubtype,
		})
	const starLuminositySol =
		hostStar?.luminositySol ??
		STAR.getStarLuminositySol({
			cls: starClass as (typeof STAR.mainSequenceClasses)[number],
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
	const isMainWorldTarget = isSelectionMainWorld
	const getDefaultSeedLabel = useCallback(
		(target: OrbitSelection): string => {
			if (isMainWorldTarget(target)) return rootSeedLabel
			if (target.kind === "star")
				return target.starIndex === 0
					? rootSeedLabel
					: `companion-${target.starIndex}`
			if (target.kind === "body") {
				const body = getBodiesForStar(target.starIndex)?.[target.bodyIdx]
				return SEED_LABEL.normalizeSeedLabel(
					body?.seed ?? `orbit-${target.bodyIdx + 1}`,
				)
			}
			const body = getBodiesForStar(target.starIndex)?.[target.bodyIdx]
			const moon = body?.moons[target.moonIdx]
			return SEED_LABEL.normalizeSeedLabel(
				getMoonSeedBaseName({
					moon,
					moonIndex: target.moonIdx,
					showRealSolNames,
				}),
			)
		},
		[isMainWorldTarget, rootSeedLabel, showRealSolNames, getBodiesForStar],
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
			const parent: OrbitSelection =
				target.kind === "body"
					? { kind: "star", starIndex: target.starIndex }
					: {
							kind: "body",
							starIndex: target.starIndex,
							bodyIdx: target.bodyIdx,
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
			onFocusBody?.(nextSelection)
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
		if (!mainWorldIntentRef.current) return
		const next = findMainWorldSelection(systemBodies)
		if (
			next.kind !== "star" &&
			selectionKey(next) !== selectionKey(selection)
		) {
			setSelection(next)
		}
	}, [systemBodies, selection, selectionKey])
	// Re-focuses the camera on the main world once a dice/earth/apply-seed
	// rebuild's regenerated body shows up in systemBodies -- a rebuild can
	// change its orbital distance (or even which slot it lands in), so the
	// old camera framing may no longer even be pointed at the right spot.
	// Only fires for that rebuild, not every incidental systemBodies change
	// (e.g. an ordinary stat-slider edit), since it's gated on the pending
	// flag those seed actions set.
	useEffect(() => {
		if (!pendingMainWorldFocusRef.current) return
		const next = findMainWorldSelection(systemBodies)
		if (next.kind === "star") return
		pendingMainWorldFocusRef.current = false
		focusSelection(next)
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
			// The main world's host star should mimic Sol too, not whatever
			// class/subtype/age the star card was last left on -- mainWorldMode is
			// left as-is (whatever the user last picked) rather than reset here.
			setSpectralClass(STAR.defaultSpectralClass)
			setStarSubtype(STAR.defaultStarSubtype)
			setStarAgeGyr(SOL_DATA.solStarAgeGyr)
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
		setSeed,
		setSpectralClass,
		setStarSubtype,
		setStarAgeGyr,
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
		setSpectralClass(STAR.defaultSpectralClass)
		setStarSubtype(STAR.defaultStarSubtype)
		setStarAgeGyr(SOL_DATA.solStarAgeGyr)
		setSeedInput(label)
		pendingMainWorldFocusRef.current = true
	}, [setSeed, setSpectralClass, setStarSubtype, setStarAgeGyr])
	// The main world's dedicated "set to Earth" shortcut -- applies
	// SOL_DATA.solSeed immediately (no staging/Generate step needed) so the
	// whole solar system regenerates as the real Sol system.
	const applyEarthSeed = useCallback(() => {
		lastAppliedRootSeedRef.current = { numeric: SOL_DATA.solSeed, label: "sol" }
		setRootSeedLabel("sol")
		if (resetMainWorldToEarth) {
			resetMainWorldToEarth()
		} else {
			setSeed(SOL_DATA.solSeed)
			setSpectralClass(STAR.defaultSpectralClass)
			setStarSubtype(STAR.defaultStarSubtype)
			setStarAgeGyr(SOL_DATA.solStarAgeGyr)
		}
		setSeedInput("sol")
		pendingMainWorldFocusRef.current = true
	}, [
		resetMainWorldToEarth,
		setSeed,
		setSpectralClass,
		setStarSubtype,
		setStarAgeGyr,
	])
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
			const starIndex = selection.starIndex
			const isPrimary = starIndex === 0
			const companion = isPrimary ? undefined : companionStars?.[starIndex - 1]
			if (!isPrimary && !companion) {
				return {
					title: "Companion Star",
					typeLabel: "Star",
					breadcrumbs: [
						{
							label: starTitle,
							onClick: () => selectAndFocus({ kind: "star", starIndex: 0 }),
						},
					],
					childrenLabel: "Orbits",
					stats: [],
					children: [],
					emptyChildrenLabel: "No child orbits.",
				}
			}
			const bodies = getBodiesForStar(starIndex) ?? []
			// Ceres/Pallas-style belt-interior bodies (SystemBody.beltOfIdx) live
			// under their own asteroid belt's "Orbits" list instead of this star's
			// -- see the asteroid-belt branch below, which builds their cards from
			// the same `bodies` array.
			const planetChildren = bodies
				.map((body, bodyIdx) => ({ body, bodyIdx }))
				.filter(({ body }) => body.beltOfIdx === undefined)
				.map(({ body, bodyIdx }) => ({
					key: `orbit-${starIndex}-${body.idx}-${bodyIdx}`,
					au: body.orbitalDistanceAU,
					title:
						isPrimary && body.isMainWorld && !body.name
							? appendSizeToTitle(
									showRealSolNames
										? SOL_DATA.solMainWorldName
										: "Terrestrial Planet",
									body.sizeClass,
								)
							: (labeledOrbits.find((entry) => entry.body === body)?.title ??
								resolveOrbitBodyTitle(body, bodyIdx + 1, namesEnabled)),
					subtitle: getSystemBodyKindLabel(body),
					color: classificationSwatchColor(body.classification),
					onClick: () => selectAndFocus({ kind: "body", starIndex, bodyIdx }),
				}))
			// Companion stars are orbiting bodies same as any planet -- listed
			// alongside them (interleaved by AU, not a separate section), each
			// clickable to view that star's own real generated system. See
			// CompanionStar's doc for why "big star orbiting a small one" can't
			// happen here (companions are rolled floored at one class-step
			// cooler than their own parent). A companion never has its own
			// companions (see CompanionStar's doc), so this list is only ever
			// built for the primary.
			const companionChildren = isPrimary
				? (companionStars ?? []).map((childCompanion, companionIndex) => ({
						key: `companion-star-${companionIndex}`,
						au: childCompanion.orbitalDistanceAU,
						title: childCompanion.starName,
						subtitle: "Star",
						color: SPECTRAL_CLASS_COLORS[childCompanion.class],
						icon: "star" as const,
						onClick: () =>
							selectAndFocus({
								kind: "star",
								starIndex: companionIndex + 1,
							}),
					}))
				: []
			const starChildren = [...planetChildren, ...companionChildren].sort(
				(a, b) => a.au - b.au,
			)
			return {
				title: isPrimary ? starTitle : companion!.starName,
				typeLabel: "Star",
				breadcrumbs: isPrimary
					? []
					: [
							{
								label: starTitle,
								onClick: () => selectAndFocus({ kind: "star", starIndex: 0 }),
							},
						],
				childrenLabel: "Orbits",
				onFocus: onFocusBody ? () => focusSelection(selection) : undefined,
				stats: buildStarStats({
					starClass: isPrimary ? starClass : companion!.class,
					starSubtype: isPrimary ? starSubtype : companion!.subtype,
					hostStar: isPrimary ? hostStar : companion!.hostStar,
					// Sol is always a real G2V star -- its type isn't editable.
					// A companion isn't live-edited either (no seed/spectral-class
					// UI targets one).
					setSpectralClass:
						isPrimary && seed !== SOL_DATA.solSeed
							? setSpectralClass
							: undefined,
					setStarSubtype:
						isPrimary && seed !== SOL_DATA.solSeed ? setStarSubtype : undefined,
					setStarAgeGyr:
						isPrimary && seed !== SOL_DATA.solSeed ? setStarAgeGyr : undefined,
					ageGyr: isPrimary ? starAgeGyr : undefined,
					orbitalDistanceAU: isPrimary
						? undefined
						: companion!.orbitalDistanceAU,
					eccentricity: isPrimary ? undefined : companion!.eccentricity,
					inclinationDeg: isPrimary ? undefined : companion!.inclinationDeg,
				}),
				children: starChildren.filter((entry) => entry.title),
				emptyChildrenLabel: "No child orbits.",
			}
		}

		// A companion star's own bodies aren't live-edited (no seed/
		// spectral-class UI targets a companion, and a companion never has a
		// main world of its own -- see CompanionStar's doc), so every edit-only
		// prop below (onUpdateBody, pressureSlider, substellarLonSlider,
		// onToggleSpin, onSetLock, ...) is gated on this.
		const starTitleFor = (starIndex: number) =>
			starIndex === 0
				? starTitle
				: (companionStars?.[starIndex - 1]?.starName ?? "Companion Star")
		// A companion's own physical params (mass/luminosity/climate inputs)
		// come from ITS spectral class, not the primary's -- reusing the
		// primary's spectralClass/starSubtype/starClass/starMassSol/
		// starLuminositySol for a companion's own bodies would silently
		// simulate their climate against the wrong star.
		const starParamsFor = (starIndex: number) => {
			if (starIndex === 0)
				return {
					spectralClass: starClass,
					starSubtype,
					starMassSol,
					starLuminositySol,
					starTemperatureK: hostStar?.temperatureK,
					starDiameterSol: hostStar?.diameterSol,
				}
			const companion = companionStars?.[starIndex - 1]
			const cls = companion?.class ?? starClass
			const subtype = companion?.subtype ?? starSubtype
			return {
				spectralClass: cls,
				starSubtype: subtype,
				starMassSol:
					companion?.hostStar?.massSol ??
					STAR.getStarMassSol({
						cls: cls as (typeof STAR.mainSequenceClasses)[number],
						subtype,
					}),
				starLuminositySol:
					companion?.hostStar?.luminositySol ??
					STAR.getStarLuminositySol({
						cls: cls as (typeof STAR.mainSequenceClasses)[number],
						subtype,
					}),
				starTemperatureK: companion?.hostStar?.temperatureK,
				starDiameterSol: companion?.hostStar?.diameterSol,
			}
		}

		// A gas-giant-moon main world is a MoonBody nested in its parent's
		// moons array, not a top-level SystemBody -- but it's still shown with
		// the exact same rich stats/editors/Generate-tab card as any other main
		// world, via mainWorldSystemBody's SystemBody-shaped projection (see
		// useSolarSystemBodies' moonToMainWorldView).
		const nestedMainWorldSelected =
			selection.kind === "moon" && isSelectionMainWorld(selection)
		if (selection.kind === "body" || nestedMainWorldSelected) {
			const body =
				selection.kind === "body"
					? getBodiesForStar(selection.starIndex)?.[selection.bodyIdx]
					: (mainWorldSystemBody ?? undefined)
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
			const bodyStarParams = starParamsFor(selection.starIndex)
			const parentBody = nestedMainWorldSelected
				? getBodiesForStar(selection.starIndex)?.[selection.bodyIdx]
				: undefined
			// Ceres/Pallas-style belt-interior bodies aren't moons -- they're real
			// planet-class SystemBody entries whose "parent" is an asteroid belt
			// (SystemBody.beltOfIdx). Only ever set on a normal top-level body
			// selection (never the gas-giant-moon main-world path above), so this
			// and parentBody never both apply.
			const bodiesForBeltLookup = getBodiesForStar(selection.starIndex) ?? []
			const beltParentEntry =
				body.beltOfIdx !== undefined
					? bodiesForBeltLookup
							.map((b, bodyIdx) => ({ b, bodyIdx }))
							.find(({ b }) => b.idx === body.beltOfIdx)
					: undefined
			const beltChildren =
				body.group === "asteroid belt"
					? bodiesForBeltLookup
							.map((b, bodyIdx) => ({ b, bodyIdx }))
							.filter(({ b }) => b.beltOfIdx === body.idx)
					: []
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
									spectralClass: bodyStarParams.spectralClass,
									starSubtype: bodyStarParams.starSubtype,
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
						resolveOrbitBodyTitle(body, selection.bodyIdx + 1, namesEnabled))
			const orbitMoons = body.moons
			return {
				title: bodyTitle,
				typeLabel: "Planet",
				breadcrumbs: [
					{
						label: starTitleFor(selection.starIndex),
						onClick: () =>
							selectAndFocus({ kind: "star", starIndex: selection.starIndex }),
					},
					...(parentBody
						? [
								{
									label:
										labeledOrbits.find((entry) => entry.body === parentBody)
											?.title ??
										resolveOrbitBodyTitle(
											parentBody,
											selection.bodyIdx + 1,
											namesEnabled,
										),
									onClick: () =>
										selectAndFocus({
											kind: "body" as const,
											starIndex: selection.starIndex,
											bodyIdx: selection.bodyIdx,
										}),
								},
							]
						: []),
					...(beltParentEntry
						? [
								{
									label:
										labeledOrbits.find(
											(entry) => entry.body === beltParentEntry.b,
										)?.title ??
										resolveOrbitBodyTitle(
											beltParentEntry.b,
											beltParentEntry.bodyIdx + 1,
											namesEnabled,
										),
									onClick: () =>
										selectAndFocus({
											kind: "body" as const,
											starIndex: selection.starIndex,
											bodyIdx: beltParentEntry.bodyIdx,
										}),
								},
							]
						: []),
				],
				childrenLabel: body.group === "asteroid belt" ? "Orbits" : "Moons",
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
					starMassSol: bodyStarParams.starMassSol,
					starLuminositySol: bodyStarParams.starLuminositySol,
					avgTempK,
					unitSystem,
					orbitalDistanceBaselineAU: isMainWorld
						? orbitalDistanceBaselineAU
						: undefined,
					surfaceTidesM: bodySurfaceTidesM,
					tideLockStat: buildTideLockStat({
						tideLock: body.tideLock,
						tideLockStatus: body.tideLockStatus,
						trace: body.tideLockTrace,
						retrograde: ORBIT_BODY.inferRetrogradeRotationFromAxialTiltDeg(
							body.axialTiltDeg,
						),
						starTitle: starTitleFor(selection.starIndex),
						onSelectStar: () =>
							selectAndFocus({ kind: "star", starIndex: selection.starIndex }),
						siblingMoons: orbitMoons,
						onSelectSiblingMoon: (moonIndex) =>
							selectAndFocus({
								kind: "moon",
								starIndex: selection.starIndex,
								bodyIdx: selection.bodyIdx,
								moonIdx: moonIndex,
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
										body.longitudeOfAscendingNodeDeg ||
									updated.greenhouseFactor !== body.greenhouseFactor ||
									updated.albedo !== body.albedo
								)
									updateMainWorldBody?.(() => updated)
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
							planetMassKg={body.massKg}
							isSolarLocked={isApproxSolarLocked(
								body.siderealDayHours,
								body.orbitalPeriodDays,
							)}
							spectralClass={bodyStarParams.spectralClass}
							starSubtype={bodyStarParams.starSubtype}
							starTemperatureK={bodyStarParams.starTemperatureK}
							starDiameterSol={bodyStarParams.starDiameterSol}
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
										spectralClass: bodyStarParams.spectralClass,
										starSubtype: bodyStarParams.starSubtype,
										starDiameterSol: bodyStarParams.starDiameterSol,
										starLabel: starTitleFor(selection.starIndex),
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
						? beltChildren.map(({ b: child, bodyIdx: childBodyIdx }) => ({
								key: `orbit-belt-child-${body.idx}-${child.idx}`,
								title:
									labeledOrbits.find((entry) => entry.body === child)?.title ??
									resolveOrbitBodyTitle(child, childBodyIdx + 1, namesEnabled),
								subtitle: getSystemBodyKindLabel(child),
								color: classificationSwatchColor(child.classification),
								onClick: () =>
									selectAndFocus({
										kind: "body",
										starIndex: selection.starIndex,
										bodyIdx: childBodyIdx,
									}),
							}))
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
											kind: "moon",
											starIndex: selection.starIndex,
											bodyIdx: selection.bodyIdx,
											moonIdx: moonIndex,
										}),
								}))
								.sort((a, b) => a.order - b.order),
				emptyChildrenLabel:
					body.group === "asteroid belt"
						? "No orbiting bodies"
						: orbitMoons.length === 0
							? "Computing moon parameters…"
							: orbitMoons.length === 0
								? "No child orbits."
								: "Computing moon parameters…",
			}
		}

		if (selection.kind === "moon") {
			const body = getBodiesForStar(selection.starIndex)?.[selection.bodyIdx]
			const sourceMoons = body?.moons
			const moon = sourceMoons?.[selection.moonIdx]
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
			const moonStarParams = starParamsFor(selection.starIndex)
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
						resolveOrbitBodyTitle(body, selection.bodyIdx + 1, namesEnabled))
			return {
				title: resolveMoonTitle(
					moon,
					selection.moonIdx + 1,
					namesEnabled,
					isMainWorld && selection.moonIdx === 0 && seed === SOL_DATA.solSeed
						? SOL_SYSTEM.solLunaDefault.name
						: undefined,
				),
				typeLabel: "Moon",
				breadcrumbs: [
					{
						label: starTitleFor(selection.starIndex),
						onClick: () =>
							selectAndFocus({ kind: "star", starIndex: selection.starIndex }),
					},
					{
						label: parentTitle,
						onClick: () =>
							selectAndFocus({
								kind: "body",
								starIndex: selection.starIndex,
								bodyIdx: selection.bodyIdx,
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
					luminositySol: moonStarParams.starLuminositySol,
					orbitalDistanceAU: parentOrbitalDistanceAU,
					tideLockStat: buildTideLockStat({
						tideLock: moon.tideLock,
						tideLockStatus: moon.tideLockStatus,
						trace: moon.tideLockTrace,
						retrograde: ORBIT_BODY.inferRetrogradeRotationFromAxialTiltDeg(
							moon.axialTiltDeg,
						),
						starTitle: starTitleFor(selection.starIndex),
						onSelectStar: () =>
							selectAndFocus({ kind: "star", starIndex: selection.starIndex }),
						parentTitle,
						parentTarget: body.idx,
						onSelectParent: () =>
							selectAndFocus({
								kind: "body",
								starIndex: selection.starIndex,
								bodyIdx: selection.bodyIdx,
							}),
						siblingMoons: parentMoons,
						onSelectSiblingMoon: (moonIndex) =>
							selectAndFocus({
								kind: "moon",
								starIndex: selection.starIndex,
								bodyIdx: selection.bodyIdx,
								moonIdx: moonIndex,
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
							spectralClass: moonStarParams.spectralClass,
							starSubtype: moonStarParams.starSubtype,
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
							spectralClass: moonStarParams.spectralClass,
							starSubtype: moonStarParams.starSubtype,
							generationPreviewTab,
							onSelectGenerationPreviewTab,
							unitSystem,
						})}
						starTemperatureK={moonStarParams.starTemperatureK}
						starDiameterSol={moonStarParams.starDiameterSol}
						observerContent={
							<ApparentSizePreview
								entries={buildApparentSizeEntries({
									body,
									moon,
									spectralClass: moonStarParams.spectralClass,
									starSubtype: moonStarParams.starSubtype,
									starLabel: starTitleFor(selection.starIndex),
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
		getBodiesForStar,
		getBodyMoonOrbitDistance,
		getDerivedSeedNumber,
		getMainWorldMoonOrbitDistance,
		generationPreviewTab,
		onFocusBody,
		onSelectGenerationPreviewTab,
		onToggleSpin,
		mainWorldSystemBody,
		updateMainWorldBody,
		isSelectionMainWorld,
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
		setStarAgeGyr,
		starAgeGyr,
		showRealSolNames,
		starLuminositySol,
		starMassSol,
		starClass,
		starSubtype,
		starTitle,
		surfaceStats,
		surfaceTidesM,
		substellarLonSlider,
		unitSystem,
		focusSelection,
		selectAndFocus,
		setTideLock,
		namesEnabled,
		avgTempK,
		generateContent,
		companionStars,
		hostStar?.diameterSol,
		hostStar?.temperatureK,
		hostStar,
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
										{child.icon === "star" ? (
											child.color ? (
												<StarIcon
													className="mr-1 h-2.5 w-2.5"
													style={{ color: child.color }}
												/>
											) : null
										) : child.color ? (
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

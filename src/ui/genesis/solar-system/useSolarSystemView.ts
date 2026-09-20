import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type { CompanionStar, SystemBody } from "@/model/celestial/system/types"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import { RNG } from "@/model/shared/random/rng"
import { GENERATION_SESSION_STORAGE_KEY } from "@/ui/genesis/generation/defaults"
import { GENERATION_PREVIEW_TABS } from "@/ui/genesis/generation/generation-preview"
import {
	loadGenerationSessionSnapshot,
	saveGenerationSessionSnapshot,
} from "@/ui/genesis/generation/session-persistence"
import { getSatelliteTexture } from "@/ui/genesis/renderer/satellite-texture"
import type {
	CompanionOverlayParams,
	OrbitAddress,
} from "@/ui/genesis/solar-system/overlay"
import type { SolarSystemViewInput } from "@/ui/genesis/view/types"

const DEFAULT_COMPANION_DAYS_PER_YEAR = 365

/** Builds every companion star's own overlay params -- companions aren't
 * live-edited (no seed/spectral-class UI targets them), so this is a pure
 * mapping from the persisted solarSystem.companionStars, unlike the
 * primary's params which flow through the reactive generatedSystemBodies
 * pipeline below. */
function buildCompanionOverlayParams(
	companionStars: CompanionStar[] | undefined,
	toggles: {
		showEllipticalOrbits: boolean
		showDaylight: boolean
		showInclination: boolean
		showAxialTilt: boolean
		showRealisticSizes: boolean
		showBodyNames: boolean
		namesEnabled: boolean
	},
	initialDay: number,
): CompanionOverlayParams[] {
	return (companionStars ?? []).map((companion) => ({
		star: {
			bodies: companion.orbits,
			companions: [] as CompanionOverlayParams[],
			daysPerYear:
				companion.orbits[0]?.orbitalPeriodDays ??
				DEFAULT_COMPANION_DAYS_PER_YEAR,
			spectralClass: companion.class,
			starSubtype: companion.subtype,
			hostStar: companion.hostStar,
			initialDay,
			showEllipticalOrbits: toggles.showEllipticalOrbits,
			showDaylight: toggles.showDaylight,
			showInclination: toggles.showInclination,
			showAxialTilt: toggles.showAxialTilt,
			showRealisticSizes: toggles.showRealisticSizes,
			showBodyNames: toggles.showBodyNames,
			showRealNames: false,
			namesEnabled: toggles.namesEnabled,
			starName: companion.starName,
			proceduralSystem: true,
		},
		role: companion.role,
		orbitalDistanceAU: companion.orbitalDistanceAU,
		orbitalPeriodDays: companion.orbitalPeriodDays,
		eccentricity: companion.eccentricity,
		inclinationDeg: companion.inclinationDeg,
	}))
}

type ViewFocus = { bodyIndex: number; moonIndex?: number }

function isMainWorldFocus(bodies: SystemBody[], focus: ViewFocus): boolean {
	const body = bodies[focus.bodyIndex]
	if (!body) return false
	return focus.moonIndex === undefined
		? body.isMainWorld
		: body.moons[focus.moonIndex]?.isMainWorld === true
}

function findMainWorldFocus(bodies: SystemBody[]): ViewFocus | null {
	const bodyIndex = bodies.findIndex((body) => body.isMainWorld)
	if (bodyIndex >= 0) return { bodyIndex }
	for (let i = 0; i < bodies.length; i++) {
		const moonIndex = bodies[i]!.moons.findIndex((moon) => moon.isMainWorld)
		if (moonIndex >= 0) return { bodyIndex: i, moonIndex }
	}
	return null
}

/** This hook's own clock-knob/tidal-schedule machinery only ever reads the
 * primary's own `systemBodies` -- a companion star's bodies live in a
 * separate array (`solarSystem.companionStars[n].orbits`) this hook doesn't
 * have reactive access to, so a companion focus falls back to whatever the
 * primary was last focused on (see solarSystemClock/handleEnterSolarSystem)
 * rather than indexing the wrong array. The camera itself still flies to a
 * companion body/moon (that's the whole fix -- see
 * setSolarSystemFocusChangeHandler below), this only gates the
 * primary-scoped bookkeeping. Returns null for a star address too (no
 * "moon" of the star itself to look up). */
function toPrimaryBodyFocus(address: OrbitAddress | null): ViewFocus | null {
	if (!address || address.starIndex !== 0 || address.kind === "star")
		return null
	return address.kind === "moon"
		? { bodyIndex: address.bodyIdx, moonIndex: address.moonIdx }
		: { bodyIndex: address.bodyIdx }
}

function viewFocusToAddress(focus: ViewFocus): OrbitAddress {
	return focus.moonIndex !== undefined
		? {
				kind: "moon",
				starIndex: 0,
				bodyIdx: focus.bodyIndex,
				moonIdx: focus.moonIndex,
			}
		: { kind: "body", starIndex: 0, bodyIdx: focus.bodyIndex }
}

/**
 * Owns the 3D solar-system view: which body the camera is focused on, the
 * view's own independent rotation/orbit clock, the renderer overlay build and
 * update effects, and the persisted generation-session snapshot (which
 * bundles the focused body together with the generation panel's own open
 * state, so they restore as one).
 *
 * The bodies themselves come from useSolarSystemBodies -- this hook only
 * views them.
 */
export function useSolarSystemView(input: SolarSystemViewInput) {
	const {
		sceneRef,
		initialGenerationSession,
		sessionNamespace,
		world,
		solarSystem,
		setSolarSystem,
		skipNextGeneratedSystemBodiesSyncRef,
		systemBodies,
		systemBodiesRef,
		displayMoons,
		effectiveDaysPerYear,
		daysPerYear,
		hoursPerDay,
		planetRadiusKm,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
		tideLock,
		spectralClass,
		starSubtype,
		mainWorldMode,
		galaxyOrigin,
		starName,
		namesEnabled,
		seed,
		solarSystemViewActive,
		setSolarSystemViewActive,
		showSolarSystemEllipticalOrbits,
		showSolarSystemDaylight,
		showSolarSystemInclination,
		showSolarSystemAxialTilt,
		showSolarSystemRealisticSizes,
		showSolarSystemBodyNames,
		generationPanelOpen,
		setGenerationPanelOpen,
		generationPreviewTab,
		setGenerationPreviewTab,
		generationSessionRestored,
		setGenerationSessionRestored,
	} = input

	// The solar-system view's own clock is deliberately independent of the
	// planet overlay timing. The two knobs are additive: each
	// tracks its own elapsed hours (persisting across focus changes), and
	// their sum is the single elapsed-time value that drives both the spin
	// animation and the orbital day — so maxing both knobs out means "one
	// full rotation's worth of time, plus one full orbit's worth of time,
	// have passed."
	const [solarSystemRotationHours, setSolarSystemRotationHours] = useState(0)
	const [solarSystemOrbitHours, setSolarSystemOrbitHours] = useState(0)
	const solarSystemElapsedHours =
		solarSystemRotationHours + solarSystemOrbitHours
	// The clock knobs drag continuously — reading this via a ref (rather than
	// depending on the state directly) keeps them out of the rebuild effect's
	// dependency list below, so dragging only repositions meshes via the
	// lightweight update effects instead of disposing and rebuilding the
	// whole overlay (and re-fetching every body's texture) on every tick.
	const solarSystemElapsedHoursRef = useRef(solarSystemElapsedHours)
	solarSystemElapsedHoursRef.current = solarSystemElapsedHours
	// The main world's real simulated terrain/vegetation, rendered as its
	// solar-system-view surface texture -- for every main world except a real
	// Earth import, which keeps the curated Earth photo (its "real" surface
	// already has an authentic-looking texture; a satellite render of a real
	// Earth import would also be redundant with the observed/real color modes
	// the flat wiki map already exposes for it). Reuses the exact same
	// DataTexture the wiki 2D map's "Satellite" color mode builds (and its
	// own WeakMap-keyed cache), so switching to/from the solar-system view
	// costs nothing extra once that map's been viewed once.
	const mainWorldSatelliteTexture = useMemo(() => {
		// A seed edit immediately rebuilds the solar-system bodies, while the
		// previous world's terrain remains in state until the next generation
		// completes. Do not carry that terrain texture onto the new main world:
		// returning null restores its default Earth texture until its matching
		// generated world arrives.
		if (!world || world.isEarthImport || world.params.seed !== seed) return null
		const texture = getSatelliteTexture(world, "vegetationSatellite")
		if (!texture) return null
		// getSatelliteTexture's DataTexture defaults to flipY=false, matching
		// the wiki 2D map mesh's own UV setup (row 0 = north, sampled directly).
		// A standard THREE.SphereGeometry expects the same orientation image
		// textures get (flipY=true, like loadBodyTexture's), so used as-is here
		// the sphere renders upside down -- south pole at the north. Clone
		// (not mutate) the shared cached instance so the wiki map's own use of
		// it is untouched, and flip just this sphere-bound copy.
		const sphereTexture = texture.clone()
		sphereTexture.flipY = true
		sphereTexture.needsUpdate = true
		// Not cached by satellite-texture.ts's own WeakMap (it's a derived
		// clone) -- must not be disposed when this view's overlay tears
		// down/rebuilds, same as loadBodyTexture's own shared-texture marking.
		sphereTexture.userData.sharedTexture = true
		return sphereTexture
	}, [world, seed])

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		const initialDay = solarSystemElapsedHoursRef.current / 24
		sceneRef.current?.setSolarSystemOverlay(
			solarSystemViewActive && systemBodiesRef.current.length > 0
				? {
						bodies: systemBodiesRef.current,
						daysPerYear: effectiveDaysPerYear,
						spectralClass,
						starSubtype,
						hostStar: solarSystem.star.hostStar,
						initialDay,
						showEllipticalOrbits: showSolarSystemEllipticalOrbits,
						showDaylight: showSolarSystemDaylight,
						showInclination: showSolarSystemInclination,
						showAxialTilt: showSolarSystemAxialTilt,
						showRealisticSizes: showSolarSystemRealisticSizes,
						showBodyNames: showSolarSystemBodyNames,
						showRealNames: seed === SOL_DATA.solSeed,
						proceduralSystem: seed !== SOL_DATA.solSeed,
						namesEnabled,
						starName,
						mainWorldTexture: mainWorldSatelliteTexture,
						companions: buildCompanionOverlayParams(
							solarSystem.companionStars,
							{
								showEllipticalOrbits: showSolarSystemEllipticalOrbits,
								showDaylight: showSolarSystemDaylight,
								showInclination: showSolarSystemInclination,
								showAxialTilt: showSolarSystemAxialTilt,
								showRealisticSizes: showSolarSystemRealisticSizes,
								showBodyNames: showSolarSystemBodyNames,
								namesEnabled,
							},
							initialDay,
						),
					}
				: null,
		)
		if (solarSystemViewActive && systemBodiesRef.current.length > 0) {
			sceneRef.current?.setNebulaBackgroundSeed(seed)
		}
	}, [
		solarSystemViewActive,
		effectiveDaysPerYear,
		spectralClass,
		starSubtype,
		showSolarSystemEllipticalOrbits,
		showSolarSystemInclination,
		showSolarSystemAxialTilt,
		showSolarSystemRealisticSizes,
		showSolarSystemBodyNames,
		seed,
		starName,
		showSolarSystemDaylight,
		mainWorldSatelliteTexture,
		solarSystem.companionStars,
	])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (!solarSystemViewActive) return
		const initialDay = solarSystemElapsedHoursRef.current / 24
		sceneRef.current?.updateSolarSystemOverlay(
			solarSystemViewActive
				? {
						bodies: systemBodies,
						daysPerYear: effectiveDaysPerYear,
						spectralClass,
						starSubtype,
						hostStar: solarSystem.star.hostStar,
						initialDay,
						showEllipticalOrbits: showSolarSystemEllipticalOrbits,
						showDaylight: showSolarSystemDaylight,
						showInclination: showSolarSystemInclination,
						showAxialTilt: showSolarSystemAxialTilt,
						showRealisticSizes: showSolarSystemRealisticSizes,
						showBodyNames: showSolarSystemBodyNames,
						showRealNames: seed === SOL_DATA.solSeed,
						proceduralSystem: seed !== SOL_DATA.solSeed,
						namesEnabled,
						starName,
						mainWorldTexture: mainWorldSatelliteTexture,
						companions: buildCompanionOverlayParams(
							solarSystem.companionStars,
							{
								showEllipticalOrbits: showSolarSystemEllipticalOrbits,
								showDaylight: showSolarSystemDaylight,
								showInclination: showSolarSystemInclination,
								showAxialTilt: showSolarSystemAxialTilt,
								showRealisticSizes: showSolarSystemRealisticSizes,
								showBodyNames: showSolarSystemBodyNames,
								namesEnabled,
							},
							initialDay,
						),
					}
				: null,
		)
	}, [
		systemBodies,
		solarSystemViewActive,
		effectiveDaysPerYear,
		spectralClass,
		starSubtype,
		showSolarSystemEllipticalOrbits,
		showSolarSystemInclination,
		showSolarSystemAxialTilt,
		showSolarSystemRealisticSizes,
		showSolarSystemBodyNames,
		seed,
		starName,
		showSolarSystemDaylight,
		mainWorldSatelliteTexture,
		solarSystem.companionStars,
	])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (solarSystemViewActive)
			sceneRef.current?.updateSolarSystemDay(solarSystemElapsedHours / 24)
	}, [solarSystemElapsedHours, solarSystemViewActive])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (solarSystemViewActive)
			sceneRef.current?.setSolarSystemSpinHours(solarSystemElapsedHours)
	}, [solarSystemElapsedHours, solarSystemViewActive])

	// Entering the solar-system view and focusing a body both hinge on
	// `solarSystemViewActive` — the overlay-building effect above only
	// populates the renderer's body positions once that flips true, so a
	// focus request has to wait for that same commit before the renderer has
	// anything to focus on.
	const [pendingFocus, setPendingFocus] = useState<OrbitAddress | null>(
		initialGenerationSession?.solarSystemViewActive
			? (initialGenerationSession.currentFocus ?? null)
			: null,
	)
	// The last body/moon/star focused via the GPS buttons — drives the clock
	// knobs' reference periods and is not cleared on use (unlike pendingFocus,
	// which just triggers the one-shot camera animation).
	const [currentFocus, setCurrentFocus] = useState<OrbitAddress | null>(
		initialGenerationSession?.currentFocus ?? null,
	)
	// Whether the camera is (or was, as of the last systemBodies snapshot)
	// following the main world specifically -- kept in sync imperatively
	// wherever focus is set explicitly (handleFocusBody, the renderer's
	// double-click handler below), and consulted here, synchronously during
	// render rather than in an effect, so a main-world-driven regeneration
	// (the Main World mode toggle, dice/earth/apply seed) can move
	// pendingFocus/currentFocus onto the new main world's location in the
	// SAME commit the new systemBodies arrives in -- ahead of every effect in
	// this hook, including the overlay-rebuild effect above, which always
	// runs first among them since effects fire in declaration order within
	// one component. Doing this in an effect instead raced that rebuild:
	// depending on unrelated component-tree ordering, focusOnSystemBody could
	// fire against the stale pre-regeneration overlay and silently no-op.
	const wasFocusedOnMainWorldRef = useRef(
		(() => {
			const primary = toPrimaryBodyFocus(currentFocus)
			return primary ? isMainWorldFocus(systemBodies, primary) : true
		})(),
	)
	const prevSystemBodiesForFocusRef = useRef(systemBodies)
	if (systemBodies !== prevSystemBodiesForFocusRef.current) {
		prevSystemBodiesForFocusRef.current = systemBodies
		if (wasFocusedOnMainWorldRef.current) {
			const next = findMainWorldFocus(systemBodies)
			const currentPrimary = toPrimaryBodyFocus(currentFocus)
			if (
				next &&
				(!currentPrimary ||
					currentPrimary.bodyIndex !== next.bodyIndex ||
					currentPrimary.moonIndex !== next.moonIndex)
			) {
				const nextAddress = viewFocusToAddress(next)
				setPendingFocus(nextAddress)
				setCurrentFocus(nextAddress)
			}
		}
	}
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (typeof window === "undefined") return
		let cancelled = false
		void loadGenerationSessionSnapshot(sessionNamespace)
			.then((snapshot) => {
				if (cancelled || !snapshot) return
				// Only worth arming: the generated-bodies sync effect in
				// useSolarSystemBodies only re-fires (and needs skipping) when this
				// restore actually changes the derived seed -- e.g. still-Sol snapshots
				// leave the seed unchanged, so that effect never fires here at all,
				// and an armed flag would instead wrongly eat the *next* unrelated
				// seed change (e.g. the first post-refresh dice click) far later.
				const snapshotSeed =
					snapshot.solarSystem.star.seed === "sol"
						? SOL_DATA.solSeed
						: RNG.seedStringToNumber(snapshot.solarSystem.star.seed)
				skipNextGeneratedSystemBodiesSyncRef.current =
					snapshot.solarSystem.orbits.length > 0 && snapshotSeed !== seed
				setSolarSystem(snapshot.solarSystem)
				setSolarSystemViewActive(snapshot.solarSystemViewActive)
				setGenerationPanelOpen(snapshot.generationPanelOpen)
				setGenerationPreviewTab(snapshot.generationPreviewTab)
				setCurrentFocus(snapshot.currentFocus)
				setPendingFocus(
					snapshot.solarSystemViewActive ? snapshot.currentFocus : null,
				)
			})
			.catch((error) => {
				console.warn(
					`Failed to restore generation session from ${GENERATION_SESSION_STORAGE_KEY}:`,
					error,
				)
			})
			.finally(() => {
				if (!cancelled) setGenerationSessionRestored(true)
			})
		return () => {
			cancelled = true
		}
	}, [])
	// Syncs the primary-scoped bookkeeping (currentFocus's clock-knob/
	// tidal-schedule consumers, wasFocusedOnMainWorldRef) for any address --
	// a no-op for a companion star's own nodes (starIndex !== 0), same as a
	// star address itself (nothing to look up a "main world" status for).
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const syncPrimaryFocusBookkeeping = useCallback((address: OrbitAddress) => {
		if (address.starIndex !== 0) return
		if (address.kind === "star") {
			wasFocusedOnMainWorldRef.current = false
			return
		}
		wasFocusedOnMainWorldRef.current = isMainWorldFocus(
			systemBodiesRef.current,
			address.kind === "moon"
				? { bodyIndex: address.bodyIdx, moonIndex: address.moonIdx }
				: { bodyIndex: address.bodyIdx },
		)
	}, [])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleFocusBody = useCallback(
		(address: OrbitAddress) => {
			setSolarSystemViewActive(true)
			setPendingFocus(address)
			setCurrentFocus(address)
			syncPrimaryFocusBookkeeping(address)
		},
		[syncPrimaryFocusBookkeeping],
	)
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (!solarSystemViewActive || !pendingFocus) return
		sceneRef.current?.focusOnSystemBody(pendingFocus)
		setPendingFocus(null)
	}, [solarSystemViewActive, pendingFocus])

	// Keeps `currentFocus` (and thus the clock knobs) in sync even when the
	// focus change originates from a renderer-internal event — e.g.
	// double-clicking a body in the 3D view — rather than the GPS buttons.
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		if (!sceneRef.current) return
		sceneRef.current.setSolarSystemFocusChangeHandler((address) => {
			setCurrentFocus(address)
			syncPrimaryFocusBookkeeping(address)
		})
		return () => sceneRef.current?.setSolarSystemFocusChangeHandler(null)
	}, [syncPrimaryFocusBookkeeping])
	useEffect(() => {
		if (typeof window === "undefined" || !generationSessionRestored) return
		const validGenerationPreviewTabs = new Set(
			GENERATION_PREVIEW_TABS.map(([tab]) => tab),
		)
		if (!validGenerationPreviewTabs.has(generationPreviewTab)) return
		void saveGenerationSessionSnapshot(
			{
				solarSystem,
				solarSystemViewActive,
				currentFocus,
				generationPanelOpen,
				generationPreviewTab,
				mainWorldMode,
				galaxyOrigin: galaxyOrigin ?? undefined,
			},
			sessionNamespace,
		).catch((error) => {
			console.warn(
				`Failed to persist generation session to ${GENERATION_SESSION_STORAGE_KEY}:`,
				error,
			)
		})
	}, [
		currentFocus,
		generationPanelOpen,
		generationPreviewTab,
		generationSessionRestored,
		solarSystemViewActive,
		solarSystem,
		mainWorldMode,
		galaxyOrigin,
		sessionNamespace,
	])
	// Finds the main world wherever it lives -- a top-level SystemBody, or
	// (gas-giant-moon mode) a moon nested inside a sibling's moons array.
	const mainWorldFocus = useMemo(():
		| { bodyIndex: number; moonIndex?: number }
		| undefined => {
		const bodyIndex = systemBodies.findIndex((body) => body.isMainWorld)
		if (bodyIndex >= 0) return { bodyIndex }
		for (let i = 0; i < systemBodies.length; i++) {
			const moonIndex = systemBodies[i]!.moons.findIndex(
				(moon) => moon.isMainWorld,
			)
			if (moonIndex >= 0) return { bodyIndex: i, moonIndex }
		}
		return undefined
	}, [systemBodies])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	const handleEnterSolarSystem = useCallback(() => {
		const target = toPrimaryBodyFocus(currentFocus) ?? mainWorldFocus
		if (target) {
			handleFocusBody(viewFocusToAddress(target))
			return
		}
		setSolarSystemViewActive(true)
	}, [currentFocus, handleFocusBody, mainWorldFocus])

	// Clock-knob reference periods for whatever is currently focused — the
	// knobs stay hidden for the star (no parent to orbit, and no rotation
	// period worth exposing here) and default to the main world otherwise.
	const solarSystemClock = useMemo(() => {
		const focus = toPrimaryBodyFocus(currentFocus) ?? mainWorldFocus
		if (!focus) return null
		const body = systemBodies[focus.bodyIndex]
		if (!body) return null
		const moon =
			focus.moonIndex !== undefined ? body.moons[focus.moonIndex] : undefined
		const rotationPeriodHours = moon
			? moon.siderealDayHours
			: body.siderealDayHours
		const orbitalPeriodDays = moon
			? moon.orbitalPeriodDays
			: body.orbitalPeriodDays
		if (rotationPeriodHours <= 0 || orbitalPeriodDays <= 0) return null
		return { rotationPeriodHours, orbitalPeriodDays }
	}, [systemBodies, currentFocus, mainWorldFocus])

	const wrapFraction = (value: number, period: number) =>
		period > 0 ? (((value % period) + period) % period) / period : 0
	const solarSystemRotationFraction = solarSystemClock
		? wrapFraction(
				solarSystemRotationHours,
				solarSystemClock.rotationPeriodHours,
			)
		: 0
	const solarSystemOrbitFraction = solarSystemClock
		? wrapFraction(
				solarSystemOrbitHours,
				solarSystemClock.orbitalPeriodDays * 24,
			)
		: 0
	const setSolarSystemRotationFraction = (fraction: number) => {
		if (!solarSystemClock) return
		setSolarSystemRotationHours(fraction * solarSystemClock.rotationPeriodHours)
	}
	const setSolarSystemOrbitFraction = (fraction: number) => {
		if (!solarSystemClock) return
		setSolarSystemOrbitHours(fraction * solarSystemClock.orbitalPeriodDays * 24)
	}

	const primaryFocus = toPrimaryBodyFocus(currentFocus)
	const focusedMoon =
		solarSystemViewActive && primaryFocus?.moonIndex !== undefined
			? (systemBodies[primaryFocus.bodyIndex]?.moons[primaryFocus.moonIndex] ??
				null)
			: null
	const focusedMoonParent =
		focusedMoon && solarSystemViewActive
			? systemBodies[primaryFocus!.bodyIndex]
			: null

	const tidalSchedulePreview = useMemo(() => {
		if (focusedMoon && focusedMoonParent) {
			return TIDAL_SCHEDULE.computeMoonTidalSchedule({
				moon: focusedMoon,
				parent: {
					idx: focusedMoonParent.idx,
					massKg: focusedMoonParent.massKg,
					moons: focusedMoonParent.moons,
				},
				params: {
					daysPerYear,
					hoursPerDay,
					spectralClass,
					starSubtype,
					starMassKg: solarSystem.star.hostStar
						? solarSystem.star.hostStar.massSol * ORBIT_BODY.solarMassKg
						: undefined,
					starDiameterM: solarSystem.star.hostStar
						? solarSystem.star.hostStar.diameterSol * 1.392e9
						: undefined,
					orbitalDistanceAU: focusedMoonParent.orbitalDistanceAU,
					eccentricity: focusedMoonParent.eccentricity,
					perihelion,
				},
			})
		}
		const scheduleParams = {
			seed,
			daysPerYear,
			hoursPerDay,
			planetRadiusKm,
			tideLock,
			spectralClass,
			starSubtype,
			starMassKg: solarSystem.star.hostStar
				? solarSystem.star.hostStar.massSol * ORBIT_BODY.solarMassKg
				: undefined,
			starDiameterM: solarSystem.star.hostStar
				? solarSystem.star.hostStar.diameterSol * 1.392e9
				: undefined,
			orbitalDistanceAU,
			eccentricity,
			perihelion,
		}
		return TIDAL_SCHEDULE.computeTidalSchedule({
			moons: displayMoons,
			params: scheduleParams,
		})
	}, [
		focusedMoon,
		focusedMoonParent,
		displayMoons,
		seed,
		daysPerYear,
		hoursPerDay,
		planetRadiusKm,
		tideLock,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		perihelion,
		solarSystem.star.hostStar,
	])

	const solStarName = seed === SOL_DATA.solSeed ? "Sol" : undefined
	const surfaceTidesM = useMemo(() => {
		if (focusedMoon && focusedMoonParent) {
			return TIDAL_SCHEDULE.computeMoonSurfaceTidesM({
				moon: focusedMoon,
				parent: {
					name: seed === SOL_DATA.solSeed ? focusedMoonParent.name : undefined,
					massKg: focusedMoonParent.massKg,
					diameterKm: focusedMoonParent.diameterKm,
					moons: focusedMoonParent.moons,
				},
				params: {
					hoursPerDay,
					spectralClass,
					starSubtype,
					orbitalDistanceAU: focusedMoonParent.orbitalDistanceAU,
					eccentricity: focusedMoonParent.eccentricity,
					starName: solStarName,
				},
			})
		}
		return TIDAL_SCHEDULE.computeSurfaceTidesM({
			moons: displayMoons,
			planet: { diameterKm: planetRadiusKm * 2, tideLock },
			params: {
				hoursPerDay,
				spectralClass,
				starSubtype,
				orbitalDistanceAU,
				eccentricity,
				starName: solStarName,
			},
		})
	}, [
		focusedMoon,
		focusedMoonParent,
		displayMoons,
		planetRadiusKm,
		tideLock,
		hoursPerDay,
		spectralClass,
		starSubtype,
		orbitalDistanceAU,
		eccentricity,
		solStarName,
		seed,
	])

	return {
		currentFocus,
		handleEnterSolarSystem,
		handleFocusBody,
		setSolarSystemOrbitFraction,
		setSolarSystemRotationFraction,
		solarSystemClock,
		solarSystemOrbitFraction,
		solarSystemRotationFraction,
		surfaceTidesM,
		tidalSchedulePreview,
	}
}

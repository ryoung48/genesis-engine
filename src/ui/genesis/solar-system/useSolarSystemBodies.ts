import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { PLANET } from "@/model/celestial/planet"
import { STAR } from "@/model/celestial/star"
import type {
	MainSequenceClass,
	SpectralClass,
} from "@/model/celestial/star/types"
import { SYSTEM_GENERATION } from "@/model/celestial/system/generation"
import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import type { MainWorldMode } from "@/model/celestial/system/generation/types"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type {
	SolarSystemState,
	SystemBody,
} from "@/model/celestial/system/types"
import { TIDAL_SCHEDULE } from "@/model/climate/ocean/tides/tidal-schedule"
import { RNG } from "@/model/shared/random/rng"
import { UNITS } from "@/model/shared/units"
import type { SocietyEra } from "@/model/society/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"
import type { SolarSystemBodiesInput } from "@/ui/genesis/view/types"
import {
	updateBodyDiameter,
	updateBodyOrbitalDistance,
} from "@/ui/wiki/stats/orbit/body-mutations"
import { buildPressureAtmosphereProfile } from "@/ui/wiki/stats/orbit/formatters"
import { resolveBodyTideLockSiderealDayHours } from "@/ui/wiki/stats/orbit/tide-lock-stats"

/** Where the main world currently lives: a top-level SystemBody (moonIndex
 * null, "earth-clone"/"moon-system" modes), or a moon nested inside a
 * sibling's moons array ("gas-giant-moon" mode) -- see generateSystemBodies'
 * gas-giant-moon branch. */
interface MainWorldLocation {
	bodyIndex: number
	moonIndex: number | null
}

function findMainWorldLocation(orbits: SystemBody[]): MainWorldLocation | null {
	const bodyIndex = orbits.findIndex((body) => body.isMainWorld)
	if (bodyIndex >= 0) return { bodyIndex, moonIndex: null }
	for (let i = 0; i < orbits.length; i++) {
		const moonIndex = orbits[i]!.moons.findIndex((moon) => moon.isMainWorld)
		if (moonIndex >= 0) return { bodyIndex: i, moonIndex }
	}
	return null
}

// Projects a promoted moon into a SystemBody-shaped read view so every
// existing mainWorldSystemBody?.field slider derivation below keeps working
// unchanged -- orbitalDistanceAU/gravityG are synthesized (a moon has no
// star-relative AU of its own; it shares its parent's), and moons is always
// empty (moons don't nest further).
function moonToMainWorldView(moon: MoonBody, parent: SystemBody): SystemBody {
	// A moon promoted to main world (see promoteMoonToMainWorld) always has
	// sizeClass/density/group/classification/atmosphere populated, satisfying
	// SystemBody's narrower required fields even though MoonBody types them
	// as optional -- hence the cast.
	return {
		...moon,
		seed: "main-world",
		isMainWorld: true,
		orbitalDistanceAU: parent.orbitalDistanceAU,
		gravityG: ORBIT_BODY.computeGravityG({
			massKg: moon.massKg,
			diameterKm: moon.diameterKm,
		}),
		moons: [],
	} as SystemBody
}

// Inverse of moonToMainWorldView -- writes an updated view's MoonBody-
// compatible fields back onto the original moon, dropping the
// SystemBody-only fields the view synthesized (orbitalDistanceAU, gravityG,
// moons, seed, rings) that don't exist on MoonBody.
function applyMainWorldViewToMoon(
	updatedView: SystemBody,
	originalMoon: MoonBody,
): MoonBody {
	const {
		orbitalDistanceAU: _orbitalDistanceAU,
		gravityG: _gravityG,
		moons: _moons,
		seed: _seed,
		rings: _rings,
		// orbitalPeriodDays/zone on the view are star-relative (see
		// updateBodyOrbitalDistance); a moon's own are planet-relative -- keep
		// the moon's rather than writing the view's projection back.
		orbitalPeriodDays: _orbitalPeriodDays,
		zone: _zone,
		...moonFields
	} = updatedView
	return { ...originalMoon, ...moonFields }
}

/**
 * Owns the solar system's data model: the star, every orbiting body, and the
 * main world's own physical/orbital fields (which live only on its SystemBody
 * entry in `solarSystem.orbits`, exactly like every sibling planet -- there is
 * no separate slider state to keep in sync). Also exposes the per-body and
 * per-moon edit/reset operations the GenerationPanel stat cards drive.
 *
 * Purely the model: which bodies exist and what they look like. The 3D
 * solar-system *view* (camera focus, overlay toggles, its own clock) is
 * useSolarSystemView's concern.
 */
export function useSolarSystemBodies(input: SolarSystemBodiesInput) {
	const { initialGenerationSession } = input

	const [solarSystem, setSolarSystem] = useState<SolarSystemState>(() =>
		structuredClone(
			initialGenerationSession?.solarSystem ?? SOL_SYSTEM.solDefaultSolarSystem,
		),
	)
	const spectralClass = solarSystem.star.class
	const starSubtype = solarSystem.star.subtype
	const hostStar = solarSystem.star.hostStar
	// Same shape as spectralClass/starSubtype above: the live, authoritative
	// value, built once wherever solarSystem.star is constructed (see
	// SolarSystemState's doc) rather than derived fresh on every read.
	const starAgeGyr = solarSystem.star.ageGyr
	const seed =
		solarSystem.star.seed === "sol"
			? SOL_DATA.solSeed
			: RNG.seedStringToNumber(solarSystem.star.seed)
	// Sol always shows its real, curated body names; a procedurally generated
	// system's own language-generated names aren't spoilers either, so a body
	// name is always shown once it exists.
	const namesEnabled = true
	// undefined for Sol -- Sol's star uses its own hardcoded "Sol" name
	// instead of a generated one.
	const starName = useMemo(
		() =>
			seed === SOL_DATA.solSeed
				? undefined
				: STAR_IDENTITY.generateStarName(seed),
		[seed],
	)
	const setSeed = useCallback((value: number) => {
		setSolarSystem((current) => ({
			...current,
			star: {
				...current.star,
				seed:
					value === SOL_DATA.solSeed
						? "sol"
						: value.toString(36).padStart(6, "0"),
			},
		}))
	}, [])
	// Guards the generatedSystemBodies sync effect below (see its own doc) --
	// armed right before a direct setSolarSystem call whose orbits are already
	// final/correct, so that effect's next fire doesn't clobber them with a
	// fresh (and possibly very different) recompute. Declared up here, ahead
	// of resetMainWorldToEarth, which is one such direct-setter.
	const skipNextGeneratedSystemBodiesSyncRef = useRef(false)
	// The Earth-icon shortcut's full reset: unlike setSeed(SOL_DATA.solSeed),
	// which no-ops when we're already on Sol (the derived `seed`/spectralClass/
	// starSubtype primitives don't change, so generatedSystemBodies' useMemo
	// never reruns and any live-edited slider values -- axial tilt, pressure,
	// etc -- survive untouched), this replaces star+orbits outright so it
	// always lands on the real, unedited Earth/Luna defaults.
	const resetMainWorldToEarth = useCallback(() => {
		// solDefaultSolarSystem's own orbits carry zero surfaceTidesHeating (see
		// applySystemSeismology's doc -- that static top-level computation has
		// no real tide callbacks to run yet), so it's redone here with real
		// tide callbacks rather than left for generatedSystemBodies' Sol branch
		// to patch in later.
		//
		// When called from a NON-Sol seed (the common case -- this is the
		// "back to Earth" shortcut from wherever you are, e.g. right after
		// Dice), `seed` itself changes here, which *does* make the
		// generatedSystemBodies memo below rerun for its Sol branch on the
		// next render -- and that branch doesn't reproduce the real Sol
		// system, it procedurally rolls a fresh (seeded-by-SOL_DATA.solSeed)
		// set of siblings around an Earth-clone main world. Left unguarded,
		// the sync effect would silently swap these real orbits for that
		// fake set right after this call, moving Earth to a different
		// position/index than whatever the camera just focused on. Arm the
		// skip flag whenever we're actually changing seed to prevent that.
		if (seed !== SOL_DATA.solSeed) {
			skipNextGeneratedSystemBodiesSyncRef.current = true
		}
		const base = structuredClone(SOL_SYSTEM.solDefaultSolarSystem)
		setSolarSystem(() => ({
			...base,
			orbits: PLANET.applySystemSeismology({
				bodies: base.orbits,
				starAgeGyr: SOL_DATA.solStarAgeGyr,
				starLuminositySol: 1,
				spectralClass: "G",
				...TIDAL_SCHEDULE.buildSurfaceTidesSeismologyCallbacks({
					spectralClass: "G",
					starSubtype: 2,
				}),
			}),
		}))
	}, [seed])
	// How the HZ-center slot builds its main world (see generateSystemBodies)
	// -- ignored for Sol, which always has Earth. Plain component state, not
	// persisted, matching spectral class/subtype/seed.
	const [mainWorldMode, setMainWorldMode] = useState<MainWorldMode>(
		initialGenerationSession?.mainWorldMode ?? "earth-clone",
	)
	// Set once from a restored snapshot when the system was opened from the
	// galaxy view, and reassigned every time GenesisView opens another system
	// from its own in-page galaxy mode (see GenesisView's handleOpenGalaxySystem)
	// -- there's no longer a separate route to round-trip through, so this is
	// the only place that ever changes it. Drives SolarSystemControls' "back
	// to galaxy" control.
	const [galaxyOrigin, setGalaxyOrigin] = useState(
		() => initialGenerationSession?.galaxyOrigin ?? null,
	)

	// --- The main world's own physical/orbital state ---
	// Every one of these fields lives ONLY on the main world's SystemBody
	// entry in `solarSystem.orbits`, exactly like every sibling planet -- no
	// separate slider state to keep in sync. A procedurally generated (non-
	// Sol) main world is fully rolled fresh by generateSystemBodies itself on
	// every seed/star-type/mainWorldMode change (see generatedSystemBodies
	// below); its live edits persist via direct solarSystem.orbits mutation
	// (updateEditableSystemBody), never threaded back through regeneration.
	// Sol is the one remaining exception: Earth's live-edited values (e.g.
	// from the heightmap-import flow) DO need to survive a Sol-seed
	// regeneration, so `mainWorldBodyRef` still exists, scoped to that single
	// case, to avoid making every one of those fields a reactive dependency
	// of the memo below (which would otherwise loop: edit -> regenerate ->
	// new object identity -> sync effect -> "changed" again).
	const mainWorldBodyRef = useRef<SystemBody | null>(null)
	// The seed as of the last time generatedSystemBodies actually ran --
	// lets the Sol branch below tell "still on Sol, preserve live edits" apart
	// from "just switched TO Sol from some other seed," where mainWorldBodyRef
	// holds a foreign (non-Sol) world's moons/overrides that must NOT carry
	// over (e.g. Luna going missing after Dice -> Earth).
	const prevSeedRef = useRef<number | null>(null)

	// --- Sibling solar system bodies (used by the GenerationPanel stat cards
	// and by the solar system view) ---
	const systemSeismologyContext = useMemo(() => {
		const cls = STAR.isValidSpectralClass(spectralClass)
			? (spectralClass as MainSequenceClass)
			: STAR.defaultSpectralClass
		const surfaceTidesCallbacks =
			TIDAL_SCHEDULE.buildSurfaceTidesSeismologyCallbacks({
				spectralClass,
				starSubtype,
				starMassKg: hostStar?.massSol
					? hostStar.massSol * ORBIT_BODY.solarMassKg
					: undefined,
			})
		if (seed === SOL_DATA.solSeed) {
			return {
				starAgeGyr: SOL_DATA.solStarAgeGyr,
				starLuminositySol: 1,
				spectralClass: cls,
				...surfaceTidesCallbacks,
			}
		}
		return {
			starAgeGyr,
			starLuminositySol:
				hostStar?.luminositySol ??
				STAR.getStarLuminositySolExtended({
					cls: spectralClass as SpectralClass,
					subtype: starSubtype,
				}),
			// The real, uncoerced class -- SEISMOLOGY.applySystemSeismology's
			// spectralClass param is typed SpectralClass (the full exotic set,
			// see its own doc), not MainSequenceClass, so it's expected to see
			// "Y" here, not `cls`'s G-coerced fallback (only right for the
			// main-sequence-only dice-table lookups above).
			spectralClass: spectralClass as SpectralClass,
			...surfaceTidesCallbacks,
		}
	}, [seed, spectralClass, starSubtype, hostStar, starAgeGyr])

	const generatedSystemBodies: SystemBody[] = useMemo(() => {
		const cls = STAR.isValidSpectralClass(spectralClass)
			? (spectralClass as MainSequenceClass)
			: STAR.defaultSpectralClass
		if (seed !== SOL_DATA.solSeed) {
			// Non-Sol: the main world (if any) is rolled fresh right alongside
			// its siblings -- no external params to build here at all.
			// hostStar (when present) takes priority over spectralClass/cls
			// inside generateSystemBodies -- required for exotic classes (L/T/
			// Y/D/NS/BH), which `cls`'s MainSequenceClass coercion would
			// otherwise collapse to the default G star, giving every sibling
			// body a Sun-like luminosity instead of its real host star's.
			return SYSTEM_GENERATION.generateSystemBodies({
				seed: seed,
				hostStar: hostStar ?? undefined,
				spectralClass: cls,
				starSubtype,
				mainWorldMode,
				starAgeGyrOverride: starAgeGyr,
			})
		}
		// Sol: Earth's real live-edited slider values need to survive this
		// regeneration (e.g. the heightmap-import flow) -- see mainWorldBodyRef's
		// doc comment above for why this reads off the ref instead of reactive
		// state. Only preserved when we were ALREADY on Sol -- switching to Sol
		// from a different seed must reset to real Earth/Luna, not carry over
		// whatever random world/moons the previous seed had rolled.
		const prev =
			prevSeedRef.current === SOL_DATA.solSeed ? mainWorldBodyRef.current : null
		const planetRadiusKm = prev
			? prev.diameterKm / 2
			: DEFAULT_WORLD_PARAMS.planetRadiusKm
		const orbitalDistanceAU = prev
			? prev.orbitalDistanceAU
			: DEFAULT_WORLD_PARAMS.orbitalDistanceAU
		const hoursPerDay = prev
			? prev.siderealDayHours
			: DEFAULT_WORLD_PARAMS.hoursPerDay
		const eccentricity = prev
			? prev.eccentricity
			: DEFAULT_WORLD_PARAMS.eccentricity
		const longitudeOfPerihelionDeg = prev
			? prev.longitudeOfPerihelionDeg
			: DEFAULT_WORLD_PARAMS.perihelion
		const lsAphelionDeg = prev
			? (prev.lsAphelionDeg ?? DEFAULT_WORLD_PARAMS.perihelion)
			: DEFAULT_WORLD_PARAMS.perihelion
		const obliquity = prev ? prev.axialTiltDeg : DEFAULT_WORLD_PARAMS.obliquity
		const substellarLon = prev
			? (prev.substellarLon ?? 0)
			: DEFAULT_WORLD_PARAMS.substellarLon
		const pressure = prev
			? (prev.atmosphere?.pressureBar ?? DEFAULT_WORLD_PARAMS.pressure)
			: DEFAULT_WORLD_PARAMS.pressure
		const tideLock = prev ? (prev.tideLock ?? null) : null
		const moons = prev ? prev.moons : [{ ...SOL_SYSTEM.solLunaDefault, idx: 1 }]
		const solMainWorldOverrides = {
			name: SOL_SYSTEM.solMainWorldDefaults.name,
			orbitalDistanceAU,
			diameterKm: planetRadiusKm * 2,
			moons,
			massKg: MECHANICS.derivePlanetMassKg(planetRadiusKm),
			gravityG: ORBIT_BODY.computeGravityG({
				massKg: MECHANICS.derivePlanetMassKg(planetRadiusKm),
				diameterKm: planetRadiusKm * 2,
			}),
			siderealDayHours: hoursPerDay,
			eccentricity,
			longitudeOfPerihelionDeg,
			lsAphelionDeg,
			axialTiltDeg: obliquity,
			substellarLon,
			atmosphere: buildPressureAtmosphereProfile(pressure),
			tideLock,
			landDistribution:
				prev?.landDistribution ?? DEFAULT_WORLD_PARAMS.landDistribution,
			landCoverage: prev?.landCoverage ?? DEFAULT_WORLD_PARAMS.landCoverage,
			continentSizeVariety:
				prev?.continentSizeVariety ?? DEFAULT_WORLD_PARAMS.continentSizeVariety,
			seaLevel: prev?.seaLevel ?? DEFAULT_WORLD_PARAMS.seaLevel,
			maxElevation: 6000,
			albedo: SOL_SYSTEM.solMainWorldDefaults.albedo,
			greenhouseFactor: SOL_SYSTEM.solMainWorldDefaults.greenhouseFactor,
		}
		return SYSTEM_GENERATION.generateSystemBodies({
			seed: seed,
			spectralClass: cls,
			starSubtype,
			mainWorldMode: "earth-clone",
			solMainWorldOverrides,
		})
	}, [seed, spectralClass, starSubtype, mainWorldMode, starAgeGyr, hostStar])
	const resetSourceSystemBodies = useMemo(
		() =>
			seed === SOL_DATA.solSeed
				? SOL_SYSTEM.solDefaultSolarSystem.orbits
				: generatedSystemBodies,
		[generatedSystemBodies, seed],
	)

	useEffect(() => {
		if (skipNextGeneratedSystemBodiesSyncRef.current) {
			skipNextGeneratedSystemBodiesSyncRef.current = false
			return
		}
		setSolarSystem((current) => ({
			...current,
			orbits: generatedSystemBodies,
		}))
	}, [generatedSystemBodies])
	const systemBodies = solarSystem.orbits
	const mainWorldLocation = findMainWorldLocation(systemBodies)
	const mainWorldSystemBody =
		mainWorldLocation === null
			? null
			: mainWorldLocation.moonIndex === null
				? systemBodies[mainWorldLocation.bodyIndex]!
				: moonToMainWorldView(
						systemBodies[mainWorldLocation.bodyIndex]!.moons[
							mainWorldLocation.moonIndex
						]!,
						systemBodies[mainWorldLocation.bodyIndex]!,
					)
	// The moons shown in the UI's "moons of the main world" list: the main
	// world's own moons normally, but its parent gas giant's *other* moons
	// when the main world is itself a moon (gas-giant-moon mode) -- there's
	// nothing else to call "this world's moons" in that case.
	const displayMoons =
		mainWorldLocation?.moonIndex === null
			? (mainWorldSystemBody?.moons ?? [])
			: mainWorldLocation
				? systemBodies[mainWorldLocation.bodyIndex]!.moons.filter(
						(moon) => !moon.isMainWorld,
					)
				: []
	const systemBodiesRef = useRef(systemBodies)
	systemBodiesRef.current = systemBodies
	const displayMoonsRef = useRef(displayMoons)
	displayMoonsRef.current = displayMoons
	mainWorldBodyRef.current = mainWorldSystemBody
	prevSeedRef.current = seed

	// Every physical/orbital field the main world exposes is a plain read off
	// its own SystemBody entry -- editing any of them (from the dedicated
	// Planet-tab sliders below, or from the generic orbit-navigator stat
	// card) goes through `updateMainWorldBody`, which patches that one entry
	// in `solarSystem.orbits` exactly like `updateEditableSystemBody` does
	// for every sibling planet.
	const updateMainWorldBody = useCallback(
		(updater: (body: SystemBody) => SystemBody) => {
			setSolarSystem((current) => {
				const location = findMainWorldLocation(current.orbits)
				return {
					...current,
					orbits: PLANET.applySystemSeismology({
						bodies: current.orbits.map((body, bodyIndex) => {
							if (!location || bodyIndex !== location.bodyIndex) return body
							if (location.moonIndex === null) return updater(body)
							return {
								...body,
								moons: body.moons.map((moon, moonIndex) =>
									moonIndex === location.moonIndex
										? applyMainWorldViewToMoon(
												updater(moonToMainWorldView(moon, body)),
												moon,
											)
										: moon,
								),
							}
						}),
						...systemSeismologyContext,
					}),
				}
			})
		},
		[systemSeismologyContext],
	)
	const planetRadiusKm =
		(mainWorldSystemBody?.diameterKm ??
			DEFAULT_WORLD_PARAMS.planetRadiusKm * 2) / 2
	const setPlanetRadiusKm = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => updateBodyDiameter(body, value * 2)),
		[updateMainWorldBody],
	)
	const landDistribution =
		mainWorldSystemBody?.landDistribution ??
		DEFAULT_WORLD_PARAMS.landDistribution
	const setLandDistribution = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, landDistribution: value })),
		[updateMainWorldBody],
	)
	const continentSizeVariety =
		mainWorldSystemBody?.continentSizeVariety ??
		DEFAULT_WORLD_PARAMS.continentSizeVariety
	const setContinentSizeVariety = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				continentSizeVariety: value,
			})),
		[updateMainWorldBody],
	)
	const landCoverage =
		mainWorldSystemBody?.landCoverage ?? DEFAULT_WORLD_PARAMS.landCoverage
	const setLandCoverage = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				landCoverage: value,
				// Keep hydrosphereCode (and its HYDROSPHERE_DESCRIPTIONS text) in
				// sync with the hand-edited land coverage, instead of leaving it
				// stuck at whatever value it was originally rolled with.
				hydrosphereCode: PLANET.hydrosphereCodeFromWaterPct((1 - value) * 100),
			})),
		[updateMainWorldBody],
	)
	const obliquity =
		mainWorldSystemBody?.axialTiltDeg ?? DEFAULT_WORLD_PARAMS.obliquity
	const setObliquity = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, axialTiltDeg: value })),
		[updateMainWorldBody],
	)
	const eccentricity =
		mainWorldSystemBody?.eccentricity ?? DEFAULT_WORLD_PARAMS.eccentricity
	const setEccentricity = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, eccentricity: value })),
		[updateMainWorldBody],
	)
	const effectiveStarClass: MainSequenceClass = STAR.isValidSpectralClass(
		spectralClass,
	)
		? spectralClass
		: STAR.defaultSpectralClass
	const effectiveStarMassSol = STAR.getStarMassSol({
		cls: effectiveStarClass,
		subtype: starSubtype,
	})
	const orbitalDistanceAU =
		mainWorldSystemBody?.orbitalDistanceAU ??
		DEFAULT_WORLD_PARAMS.orbitalDistanceAU
	// Editing the semi-major axis also recomputes the derived orbital period
	// (Kepler) and habitable-zone position, so a moved AU slider actually
	// changes the calendar length / EBM year and the zone label.
	const setOrbitalDistanceAU = useCallback(
		(value: number) =>
			updateMainWorldBody((body) =>
				updateBodyOrbitalDistance(
					body,
					value,
					effectiveStarMassSol,
					systemSeismologyContext.starLuminositySol,
				),
			),
		[updateMainWorldBody, effectiveStarMassSol, systemSeismologyContext],
	)
	const hoursPerDay =
		mainWorldSystemBody?.siderealDayHours ?? DEFAULT_WORLD_PARAMS.hoursPerDay
	const setHoursPerDay = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, siderealDayHours: value })),
		[updateMainWorldBody],
	)

	// Re-clamps the current ageGyr to a new class/subtype's main-sequence-
	// lifespan bounds -- ageGyr is a plain, always-valid stored value (see
	// SolarSystemState's doc), so whichever setter changes what "valid" means
	// for it is responsible for keeping it in range, the same way nothing else
	// re-derives it on every read anymore.
	const clampAgeGyrForStar = useCallback(
		(star: SolarSystemState["star"], cls: string, subtype: number) => {
			const validCls: MainSequenceClass = STAR.isValidSpectralClass(cls)
				? cls
				: STAR.defaultSpectralClass
			return STAR_IDENTITY.clampStarAgeGyr({
				ageGyr: star.ageGyr,
				massSol:
					star.hostStar?.massSol ??
					STAR.getStarMassSol({ cls: validCls, subtype }),
			})
		},
		[],
	)
	const setSpectralClass = useCallback(
		(cls: string) => {
			const nextClass: MainSequenceClass = STAR.isValidSpectralClass(cls)
				? cls
				: STAR.defaultSpectralClass
			setSolarSystem((current) => ({
				...current,
				star: {
					...current.star,
					class: nextClass,
					ageGyr: clampAgeGyrForStar(
						current.star,
						nextClass,
						current.star.subtype,
					),
				},
			}))
		},
		[clampAgeGyrForStar],
	)
	const setStarSubtype = useCallback(
		(subtype: number) => {
			setSolarSystem((current) => ({
				...current,
				star: {
					...current.star,
					subtype,
					ageGyr: clampAgeGyrForStar(current.star, current.star.class, subtype),
				},
			}))
		},
		[clampAgeGyrForStar],
	)
	// Not meant to be wired up for Sol, whose age is fixed real value.
	const setStarAgeGyr = useCallback(
		(ageGyr: number) => {
			setSolarSystem((current) => ({
				...current,
				star: {
					...current.star,
					ageGyr: clampAgeGyrForStar(
						{ ...current.star, ageGyr },
						current.star.class,
						current.star.subtype,
					),
				},
			}))
		},
		[clampAgeGyrForStar],
	)

	const tideLock = mainWorldSystemBody?.tideLock ?? null
	const setTideLock = useCallback(
		(lock: TideLock | null) =>
			updateMainWorldBody((body) => {
				const siderealDayHours = resolveBodyTideLockSiderealDayHours(lock, body)
				return {
					...body,
					tideLock: lock,
					...(siderealDayHours !== undefined ? { siderealDayHours } : {}),
				}
			}),
		[updateMainWorldBody],
	)
	const tidallyLocked = tideLock?.type === "solar"
	const substellarLon = mainWorldSystemBody?.substellarLon ?? 0
	const setSubstellarLon = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, substellarLon: value })),
		[updateMainWorldBody],
	)
	const perihelion =
		mainWorldSystemBody?.lsAphelionDeg ?? DEFAULT_WORLD_PARAMS.perihelion
	const setPerihelion = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				lsAphelionDeg: value,
			})),
		[updateMainWorldBody],
	)
	const pressure =
		mainWorldSystemBody?.atmosphere?.pressureBar ??
		DEFAULT_WORLD_PARAMS.pressure
	const setPressure = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				atmosphere: buildPressureAtmosphereProfile(value),
			})),
		[updateMainWorldBody],
	)

	const daysPerYear = useMemo(() => {
		const keplerHours =
			STAR.getKeplerYearYears({
				orbitalDistanceAU,
				massSol: effectiveStarMassSol,
			}) *
			365.25 *
			24
		return Math.round(keplerHours / 24)
	}, [orbitalDistanceAU, effectiveStarMassSol])

	const effectiveDaysPerYear = tidallyLocked ? 1 : daysPerYear

	// Terrain params
	const terrainWarp = DEFAULT_WORLD_PARAMS.terrainWarp
	const smoothing = DEFAULT_WORLD_PARAMS.smoothing
	const hydraulicErosion = DEFAULT_WORLD_PARAMS.hydraulicErosion
	const thermalErosion = DEFAULT_WORLD_PARAMS.thermalErosion
	const ridgeSharpening = DEFAULT_WORLD_PARAMS.ridgeSharpening
	const glacialErosion = DEFAULT_WORLD_PARAMS.glacialErosion
	const seaLevel =
		mainWorldSystemBody?.seaLevel ?? DEFAULT_WORLD_PARAMS.seaLevel
	const setSeaLevel = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, seaLevel: value })),
		[updateMainWorldBody],
	)
	// Not user-adjustable -- fixed at Earth's real max elevation for every
	// generated world rather than tracked as UI state.
	const maxElevation = 6000
	const [era, setEra] = useState<SocietyEra>(DEFAULT_WORLD_PARAMS.era)

	const updateEditableSystemBody = useCallback(
		(bodyIndex: number, updater: (body: SystemBody) => SystemBody) => {
			setSolarSystem((current) => ({
				...current,
				orbits: PLANET.applySystemSeismology({
					bodies: current.orbits.map((body, index) =>
						index === bodyIndex ? updater(body) : body,
					),
					...systemSeismologyContext,
				}),
			}))
		},
		[systemSeismologyContext],
	)
	const updateEditableSystemMoon = useCallback(
		(
			bodyIndex: number,
			moonIndex: number,
			updater: (moon: MoonBody, parentBody: SystemBody) => MoonBody,
		) => {
			setSolarSystem((current) => ({
				...current,
				orbits: PLANET.applySystemSeismology({
					bodies: current.orbits.map((body, index) => {
						if (index !== bodyIndex) return body
						return {
							...body,
							moons: body.moons.map((moon, currentMoonIndex) =>
								currentMoonIndex === moonIndex ? updater(moon, body) : moon,
							),
						}
					}),
					...systemSeismologyContext,
				}),
			}))
		},
		[systemSeismologyContext],
	)
	// Resets a single moon back to its freshly-generated defaults for the
	// current seed, leaving its parent body's own fields and every sibling
	// moon untouched.
	const resetSystemMoon = useCallback(
		(bodyIndex: number, moonIndex: number) => {
			const resetMoon = resetSourceSystemBodies[bodyIndex]?.moons[moonIndex]
			if (!resetMoon) return
			updateEditableSystemMoon(bodyIndex, moonIndex, () =>
				structuredClone(resetMoon),
			)
		},
		[resetSourceSystemBodies, updateEditableSystemMoon],
	)

	const setters = useMemo(
		() => ({
			setLandDistribution,
			setContinentSizeVariety,
			setLandCoverage,
			setPlanetRadiusKm,
			setObliquity,
			setEccentricity,
			setPerihelion,
			setSpectralClass,
			setStarSubtype,
			setOrbitalDistanceAU,
			setHoursPerDay,
			setTideLock,
			setSubstellarLon,
			setPressure,
			setSeed,
			setSeaLevel,
			setEra,
			resetMainWorldToEarth,
		}),
		[
			setEccentricity,
			setHoursPerDay,
			setObliquity,
			setOrbitalDistanceAU,
			setPerihelion,
			setPlanetRadiusKm,
			setPressure,
			setSubstellarLon,
			setTideLock,
			setSpectralClass,
			setStarSubtype,
			setSeed,
			setContinentSizeVariety,
			setLandCoverage,
			setLandDistribution,
			setSeaLevel,
			resetMainWorldToEarth,
		],
	)

	const setAxialTiltDirection = useCallback(
		(value: number) => {
			const retrograde = value === 1
			const baseTilt = UNITS.getEffectiveObliquityDeg(obliquity)
			setObliquity(retrograde ? 180 - baseTilt : baseTilt)
		},
		[obliquity, setObliquity],
	)

	return {
		continentSizeVariety,
		daysPerYear,
		displayMoons,
		eccentricity,
		effectiveDaysPerYear,
		mainWorldMode,
		galaxyOrigin,
		setGalaxyOrigin,
		glacialErosion,
		hoursPerDay,
		hydraulicErosion,
		landCoverage,
		landDistribution,
		mainWorldSystemBody,
		maxElevation,
		namesEnabled,
		obliquity,
		orbitalDistanceAU,
		perihelion,
		planetRadiusKm,
		pressure,
		resetMainWorldToEarth,
		resetSystemMoon,
		seed,
		ridgeSharpening,
		seaLevel,
		setAxialTiltDirection,
		setContinentSizeVariety,
		setEccentricity,
		setMainWorldMode,
		setHoursPerDay,
		setLandCoverage,
		setLandDistribution,
		setObliquity,
		setOrbitalDistanceAU,
		setPerihelion,
		setPlanetRadiusKm,
		setPressure,
		setSeed,
		setSeaLevel,
		setSolarSystem,
		setSpectralClass,
		setStarSubtype,
		setStarAgeGyr,
		starAgeGyr,
		setSubstellarLon,
		setTideLock,
		setEra,
		era,
		setters,
		skipNextGeneratedSystemBodiesSyncRef,
		smoothing,
		solarSystem,
		spectralClass,
		starName,
		starSubtype,
		substellarLon,
		systemBodies,
		systemBodiesRef,
		terrainWarp,
		thermalErosion,
		tidallyLocked,
		tideLock,
		hostStar: solarSystem.star.hostStar,
		updateEditableSystemBody,
		updateEditableSystemMoon,
		updateMainWorldBody,
	}
}

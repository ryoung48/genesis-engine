import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { MECHANICS } from "@/model/celestial/moons/mechanics"
import type { MoonBody } from "@/model/celestial/moons/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import type { TideLock } from "@/model/celestial/orbit-body/types"
import { PLANET } from "@/model/celestial/planet"
import { STAR } from "@/model/celestial/star"
import type { MainSequenceClass } from "@/model/celestial/star/types"
import { SYSTEM_GENERATION } from "@/model/celestial/system/generation"
import { STAR_IDENTITY } from "@/model/celestial/system/generation/star-identity"
import { SOL_SYSTEM } from "@/model/celestial/system/sol-system"
import { SOL_DATA } from "@/model/celestial/system/sol-system/data"
import type {
	SolarSystemState,
	SystemBody,
} from "@/model/celestial/system/types"
import { TIDAL_SCHEDULE } from "@/model/climate/tidal-schedule"
import { RNG } from "@/model/shared/random/rng"
import { UNITS } from "@/model/shared/units"
import type { SocietyEra } from "@/model/society/types"
import type { SolarSystemBodiesInput } from "@/ui/planet/GenesisView/types"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"
import { updateBodyDiameter } from "@/ui/wiki/stats/orbit/body-mutations"
import { buildPressureAtmosphereProfile } from "@/ui/wiki/stats/orbit/formatters"
import { resolveBodyTideLockSiderealDayHours } from "@/ui/wiki/stats/orbit/tide-lock-stats"

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
	const restSeed =
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
			restSeed === SOL_DATA.solSeed
				? undefined
				: STAR_IDENTITY.generateStarName(restSeed),
		[restSeed],
	)
	const setRestSeed = useCallback((value: number) => {
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
	// Whether a star reroll reserves the HZ-center slot for a rolled main
	// world (see generateSystemBodies) -- ignored for Sol, which always has
	// Earth. Plain component state, not persisted, matching spectral
	// class/subtype/seed.
	const [forceMainWorld, setForceMainWorld] = useState(true)

	// --- The main world's own physical/orbital state ---
	// Every one of these fields lives ONLY on the main world's SystemBody
	// entry in `solarSystem.orbits`, exactly like every sibling planet -- no
	// separate slider state to keep in sync. A procedurally generated (non-
	// Sol) main world is fully rolled fresh by generateSystemBodies itself on
	// every restSeed/star-type/forceMainWorld change (see generatedSystemBodies
	// below); its live edits persist via direct solarSystem.orbits mutation
	// (updateEditableSystemBody), never threaded back through regeneration.
	// Sol is the one remaining exception: Earth's live-edited values (e.g.
	// from the heightmap-import flow) DO need to survive a Sol-seed
	// regeneration, so `mainWorldBodyRef` still exists, scoped to that single
	// case, to avoid making every one of those fields a reactive dependency
	// of the memo below (which would otherwise loop: edit -> regenerate ->
	// new object identity -> sync effect -> "changed" again).
	const mainWorldBodyRef = useRef<SystemBody | null>(null)

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
			})
		if (restSeed === SOL_DATA.solSeed) {
			return {
				starAgeGyr: SOL_DATA.solStarAgeGyr,
				starLuminositySol: 1,
				spectralClass: cls,
				...surfaceTidesCallbacks,
			}
		}
		return {
			starAgeGyr: STAR_IDENTITY.getStarAgeGyr({
				seed: restSeed,
				massSol: STAR.getStarMassSol({ cls, subtype: starSubtype }),
			}),
			starLuminositySol: STAR.getStarLuminositySol({
				cls,
				subtype: starSubtype,
			}),
			spectralClass: cls,
			...surfaceTidesCallbacks,
		}
	}, [restSeed, spectralClass, starSubtype])

	const generatedSystemBodies: SystemBody[] = useMemo(() => {
		const cls = STAR.isValidSpectralClass(spectralClass)
			? (spectralClass as MainSequenceClass)
			: STAR.defaultSpectralClass
		if (restSeed !== SOL_DATA.solSeed) {
			// Non-Sol: the main world (if any) is rolled fresh right alongside
			// its siblings -- no external params to build here at all.
			return SYSTEM_GENERATION.generateSystemBodies({
				seed: restSeed,
				spectralClass: cls,
				starSubtype,
				forceMainWorld,
			})
		}
		// Sol: Earth's real live-edited slider values need to survive this
		// regeneration (e.g. the heightmap-import flow) -- see mainWorldBodyRef's
		// doc comment above for why this reads off the ref instead of reactive
		// state.
		const prev = mainWorldBodyRef.current
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
		const perihelion = prev
			? prev.longitudeOfPerihelionDeg
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
			longitudeOfPerihelionDeg: perihelion,
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
			seed: restSeed,
			spectralClass: cls,
			starSubtype,
			forceMainWorld: true,
			solMainWorldOverrides,
		})
	}, [restSeed, spectralClass, starSubtype, forceMainWorld])
	const resetSourceSystemBodies = useMemo(
		() =>
			restSeed === SOL_DATA.solSeed
				? SOL_SYSTEM.solDefaultSolarSystem.orbits
				: generatedSystemBodies,
		[generatedSystemBodies, restSeed],
	)

	const skipNextGeneratedSystemBodiesSyncRef = useRef(false)
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
	const mainWorldSystemBody =
		systemBodies.find((body) => body.isMainWorld) ?? null
	const displayMoons = mainWorldSystemBody?.moons ?? []
	const systemBodiesRef = useRef(systemBodies)
	systemBodiesRef.current = systemBodies
	const displayMoonsRef = useRef(displayMoons)
	displayMoonsRef.current = displayMoons
	mainWorldBodyRef.current = mainWorldSystemBody

	// Every physical/orbital field the main world exposes is a plain read off
	// its own SystemBody entry -- editing any of them (from the dedicated
	// Planet-tab sliders below, or from the generic orbit-navigator stat
	// card) goes through `updateMainWorldBody`, which patches that one entry
	// in `solarSystem.orbits` exactly like `updateEditableSystemBody` does
	// for every sibling planet.
	const updateMainWorldBody = useCallback(
		(updater: (body: SystemBody) => SystemBody) => {
			setSolarSystem((current) => ({
				...current,
				orbits: PLANET.applySystemSeismology({
					bodies: current.orbits.map((body) =>
						body.isMainWorld ? updater(body) : body,
					),
					...systemSeismologyContext,
				}),
			}))
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
	const orbitalDistanceAU =
		mainWorldSystemBody?.orbitalDistanceAU ??
		DEFAULT_WORLD_PARAMS.orbitalDistanceAU
	const setOrbitalDistanceAU = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, orbitalDistanceAU: value })),
		[updateMainWorldBody],
	)
	const hoursPerDay =
		mainWorldSystemBody?.siderealDayHours ?? DEFAULT_WORLD_PARAMS.hoursPerDay
	const setHoursPerDay = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({ ...body, siderealDayHours: value })),
		[updateMainWorldBody],
	)
	const effectiveStarClass: MainSequenceClass = STAR.isValidSpectralClass(
		spectralClass,
	)
		? spectralClass
		: STAR.defaultSpectralClass

	const setSpectralClass = useCallback((cls: string) => {
		const nextClass: MainSequenceClass = STAR.isValidSpectralClass(cls)
			? cls
			: STAR.defaultSpectralClass
		setSolarSystem((current) => ({
			...current,
			star: { ...current.star, class: nextClass },
		}))
	}, [])
	const setStarSubtype = useCallback((subtype: number) => {
		setSolarSystem((current) => ({
			...current,
			star: { ...current.star, subtype },
		}))
	}, [])

	// Changing star class/subtype re-rolls the whole system (including the
	// main world) from the same restSeed -- generatedSystemBodies already
	// depends on spectralClass/starSubtype, and deviation 0 is always exactly
	// the new star's HZ center by construction (see generateSystemBodies), so
	// no separate "preserve HZ position" math is needed here anymore.
	const effectiveStarMassSol = STAR.getStarMassSol({
		cls: effectiveStarClass,
		subtype: starSubtype,
	})
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
		mainWorldSystemBody?.longitudeOfPerihelionDeg ??
		DEFAULT_WORLD_PARAMS.perihelion
	const setPerihelion = useCallback(
		(value: number) =>
			updateMainWorldBody((body) => ({
				...body,
				longitudeOfPerihelionDeg: value,
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

	useEffect(() => {
		if (tideLock?.type !== "solar") return
		if (obliquity !== 0) setObliquity(0)
		if (eccentricity !== 0) setEccentricity(0)
	}, [tideLock, obliquity, eccentricity, setObliquity, setEccentricity])

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
	// Rebuilds a body (and everything nested inside it, e.g. its moons) back
	// to its freshly-generated defaults for the current seed, without
	// touching any other body -- e.g. rebuilding Earth also rebuilds Luna
	// (nested in Earth's own `moons`), but leaves Mars/Jupiter/etc alone.
	// Omitting `bodyIndex` rebuilds the whole system (star-level reset).
	//
	// The main world needs no special case here anymore: `resetSourceSystemBodies`
	// is already either the real Sol defaults or `generatedSystemBodies` (the
	// freshly-seed-rolled body list, main world included), so the generic
	// per-index reset below already resets it correctly, live edits and all.
	const rebuildSystemBody = useCallback(
		(bodyIndex?: number) => {
			if (bodyIndex === undefined) {
				setSpectralClass(DEFAULT_WORLD_PARAMS.spectralClass)
				setStarSubtype(DEFAULT_WORLD_PARAMS.starSubtype)
				setRestSeed(SOL_DATA.solSeed)
			}
			if (bodyIndex === undefined) {
				// Explicit, rather than relying on the generatedSystemBodies
				// memo/sync-effect to pick up the spectralClass/starSubtype/
				// restSeed resets above -- if those were already at their
				// defaults (e.g. resetting an already-default Sol seed after
				// editing individual planets/moons), the memo's dependencies
				// wouldn't actually change, so it would never recompute and
				// every edited child body/moon would silently survive the
				// "reset". Resetting orbits directly here always restores
				// every planet (and, since each planet's own moons array is
				// replaced wholesale, every moon) unconditionally.
				setSolarSystem((current) => ({
					...current,
					// SOL_DEFAULT_SOLAR_SYSTEM.orbits is built without the surface-
					// tides callbacks (see sol-system.ts's SOL_SYSTEM_BODIES), so its
					// seismology is frozen with surfaceTidesHeating: 0 -- re-run
					// applySystemSeismology here with the real callbacks so the reset
					// system's totals/regimes match every other recompute path.
					orbits: PLANET.applySystemSeismology({
						bodies: structuredClone(SOL_SYSTEM.solDefaultSolarSystem.orbits),
						...systemSeismologyContext,
					}),
				}))
				return
			}
			setSolarSystem((current) => ({
				...current,
				orbits: PLANET.applySystemSeismology({
					bodies: current.orbits.map((body, index) =>
						index === bodyIndex
							? structuredClone(resetSourceSystemBodies[index] ?? body)
							: body,
					),
					...systemSeismologyContext,
				}),
			}))
		},
		[
			resetSourceSystemBodies,
			systemSeismologyContext,
			setRestSeed,
			setSpectralClass,
			setStarSubtype,
		],
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
	// moon untouched -- unlike rebuildSystemBody, which replaces the whole
	// body (and therefore every one of its moons) at once.
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
			setRestSeed,
			setSeaLevel,
			setEra,
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
			setRestSeed,
			setContinentSizeVariety,
			setLandCoverage,
			setLandDistribution,
			setSeaLevel,
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
		forceMainWorld,
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
		rebuildSystemBody,
		resetSystemMoon,
		restSeed,
		ridgeSharpening,
		seaLevel,
		setAxialTiltDirection,
		setContinentSizeVariety,
		setEccentricity,
		setForceMainWorld,
		setHoursPerDay,
		setLandCoverage,
		setLandDistribution,
		setObliquity,
		setOrbitalDistanceAU,
		setPerihelion,
		setPlanetRadiusKm,
		setPressure,
		setRestSeed,
		setSeaLevel,
		setSolarSystem,
		setSpectralClass,
		setStarSubtype,
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
		updateEditableSystemBody,
		updateEditableSystemMoon,
	}
}

import * as THREE from "three"
import { describe, expect, it, vi } from "vitest"
import { GALAXY } from "@/model/celestial/galaxy"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import { BINARY_ORBIT } from "@/model/celestial/galaxy/systems/binary-orbit"
import {
	encodeLuminosityClass,
	encodeSpectralClass,
	encodeStarRole,
} from "@/model/celestial/galaxy/systems/codes"
import type { StarPreview } from "@/model/celestial/galaxy/systems/types"
import type { Galaxy } from "@/model/celestial/galaxy/types"
import type {
	GalaxyWorkerRequest,
	GalaxyWorkerResponse,
} from "@/model/celestial/galaxy/worker-protocol/types"
import { ORBIT_BODY } from "@/model/celestial/orbit-body"
import { STAR } from "@/model/celestial/star"
import type { HostStarAttributes } from "@/model/celestial/star/types"
import { SYSTEM_GENERATION } from "@/model/celestial/system/generation"
import type { GenerateSystemBodiesParams } from "@/model/celestial/system/generation/types"
import { TIME } from "@/model/shared/time"
import {
	loadGenerationSessionSnapshot,
	loadGenerationSessionSnapshotSync,
	saveGenerationSessionSnapshot,
} from "@/ui/genesis/generation/session-persistence"
import { beltEdgesAU } from "@/ui/genesis/solar-system/overlay/helpers"
import { buildSolarSystemOverlay } from "@/ui/genesis/solar-system/overlay/overlay"
import type { SolarSystemOverlayParams } from "@/ui/genesis/solar-system/overlay/types"

vi.mock("@/ui/genesis/renderer/star-flare", () => ({
	STAR_FLARE: { create: () => new THREE.Sprite(), update: vi.fn() },
}))

const SOL_LIKE_HOST_STAR: HostStarAttributes = {
	spectralClass: "G",
	luminosityClass: "V",
	subtype: 2,
	massSol: 1,
	temperatureK: 5778,
	diameterSol: 1,
	luminositySol: 1,
	ageGyr: 4.6,
	mao: 0.1,
}

function packedFixture({
	companionMass,
	separationAU,
	triple,
}: {
	companionMass: number
	separationAU: number
	triple: boolean
}) {
	const count = triple ? 3 : 2
	const physical = (value: number) => new Float32Array(count).fill(value)
	return {
		systemStarOffset: Int32Array.of(0, count),
		starParent: triple ? Int32Array.of(-1, 0, 0) : Int32Array.of(-1, 0),
		starRole: Uint8Array.of(
			encodeStarRole("primary"),
			encodeStarRole("epistellar"),
			...(triple ? [encodeStarRole("inner")] : []),
		),
		starSpectralClass: new Uint8Array(count).fill(encodeSpectralClass("G")),
		starLuminosityClass: new Uint8Array(count).fill(encodeLuminosityClass("V")),
		starSubtype: physical(2),
		starOrbitalDistanceAU: Float32Array.of(
			0,
			separationAU,
			...(triple ? [separationAU / 2] : []),
		),
		starEccentricity: Float32Array.of(0, 0, ...(triple ? [0.3] : [])),
		starInclinationDeg: Float32Array.of(0, 25, ...(triple ? [55] : [])),
		starAge: physical(4),
		starMass: Float32Array.of(1, companionMass, ...(triple ? [0.75] : [])),
		starDiameter: physical(1),
		starTemperature: physical(5778),
		starLuminosity: physical(1),
		starMao: physical(0.001),
	}
}

describe("Orbit slot -> generated body integration", () => {
	it.each([
		1, 0.5,
	])("shares the mutual stellar period with a %s solar mass companion", (companionMass) => {
		const packed = packedFixture({
			companionMass,
			separationAU: 0.25,
			triple: false,
		})
		const { stars } = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
			packed,
		})
		const expectedDays =
			STAR.getKeplerYearYears({
				orbitalDistanceAU: 0.25,
				massSol: 1 + companionMass,
			}) * TIME.astronomicalDaysPerYear
		expect(stars.map((star) => star.orbitalPeriodDays)).toEqual([
			expectedDays,
			expectedDays,
		])
	})

	it("normalizes a packed triple and applies the outer S-type limits", () => {
		const packed = packedFixture({
			companionMass: 0.5,
			separationAU: 1,
			triple: true,
		})
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
			packed,
		})
		const [primary, secondary, wider] = system.stars
		const [inner, outer] = system.binaryOrbits
		expect(outer!.a.center).toEqual({ kind: "binary", index: 0 })
		const eccentricity = packed.starEccentricity[2]!
		const periapsisFloor =
			2.8 *
			inner!.orbitalDistanceAU *
			(((1 + 0.75 / 1.5) * (1 + eccentricity)) / Math.sqrt(1 - eccentricity)) **
				0.4
		expect(outer!.orbitalDistanceAU * (1 - eccentricity)).toBeGreaterThan(
			periapsisFloor,
		)
		expect(Math.fround(wider!.orbitalDistanceAU)).toBe(wider!.orbitalDistanceAU)
		expect(wider!.orbitalPeriodDays).toBeCloseTo(
			TIME.astronomicalDaysPerYear *
				Math.sqrt(wider!.orbitalDistanceAU ** 3 / 2.25),
			8,
		)
		const innerCeiling = BINARY_ORBIT.circumstellarLimitAU({
			...outer!,
			massRatio: 0.75 / 2.25,
		})
		for (const [star, otherMass] of [
			[primary!, 0.5],
			[secondary!, 1],
		] as const) {
			const excursion =
				(inner!.orbitalDistanceAU * (1 + inner!.eccentricity) * otherMass) / 1.5
			for (const { region } of star.regions) {
				expect(region.maxAU).toBeLessThanOrEqual(
					region.center.kind === "star"
						? innerCeiling - excursion
						: innerCeiling,
				)
			}
		}
		expect(wider!.regions[0]!.region.maxAU).toBeCloseTo(
			BINARY_ORBIT.circumstellarLimitAU({ ...outer!, massRatio: 1.5 / 2.25 }),
		)
	})

	it("clears a Roche-dominated outer orbit after rounding the stellar diameter", () => {
		const primary: StarPreview = {
			...SOL_LIKE_HOST_STAR,
			role: "primary" as const,
			parentIndex: null,
			orbitalDistanceAU: 0,
			eccentricity: 0,
			inclinationDeg: 0,
		}
		const inner = {
			...primary,
			role: "epistellar" as const,
			parentIndex: 0,
			orbitalDistanceAU: 0.03,
			inclinationDeg: 25,
		}
		const outer = {
			...primary,
			role: "inner" as const,
			parentIndex: 0,
			diameterSol: 100.000005,
			orbitalDistanceAU: 0.01,
			eccentricity: 0.2,
			inclinationDeg: 55,
		}
		const originalDiameter = outer.diameterSol
		expect(BINARY_ORBIT.normalizeTriple([primary, inner, outer])).toBe(true)
		expect(outer.diameterSol).toBeGreaterThan(originalDiameter)
		const rocheFloor =
			inner.orbitalDistanceAU / 2 +
			STAR.getMinimumStarPeriapsisAU({ a: inner, b: outer })
		expect(rocheFloor).toBeGreaterThan(0.3)
		expect(outer.orbitalDistanceAU * (1 - outer.eccentricity)).toBeGreaterThan(
			rocheFloor,
		)
	})

	it("transfers resolved binary and triple catalogs through the galaxy worker", async () => {
		const messages: GalaxyWorkerResponse[] = []
		const workerScope = {
			onmessage: null as
				| ((event: { data: GalaxyWorkerRequest }) => void)
				| null,
			postMessage: (message: GalaxyWorkerResponse) =>
				messages.push(structuredClone(message)),
		}
		const spawn = vi.spyOn(GALAXY, "spawn")
		vi.stubGlobal("self", workerScope)
		try {
			await import("@/model/celestial/galaxy/galaxy.worker")
			for (const triple of [false, true]) {
				const packed = packedFixture({
					companionMass: 0.5,
					separationAU: 2,
					triple,
				})
				const galaxy = {
					...packed,
					numSystems: 1,
					seed: 42,
					r_edge: Uint8Array.of(0),
					r_xy: new Float32Array(),
					adjOffset: new Int32Array(),
					adjList: new Int32Array(),
					lanes: new Int32Array(),
					nationAssignment: Int32Array.of(-1),
					nationSeeds: new Int32Array(),
					nationSize: new Int32Array(),
					nationColors: new Int32Array(),
					sectorState: { assignment: new Int32Array() },
					cultureAssignment: new Int32Array(),
					cultureSeeds: new Int32Array(),
					cultureSize: new Int32Array(),
					cultureColors: new Int32Array(),
					cultureBlendSecondary: new Int32Array(),
					cultureBlendWeight: new Float32Array(),
				} as unknown as Galaxy
				spawn.mockReturnValue({ galaxy, timings: [] })
				workerScope.onmessage!({
					data: {
						type: "generate",
						params: {
							size: 1,
							seed: 42,
							radius: { min: 0, max: 1 },
							dimensions: { w: 1, h: 1 },
							pregenerateAllSystems: true,
						},
					},
				})
				const reply = messages.at(-1)
				expect(reply?.type).toBe("done")
				if (reply?.type !== "done")
					throw new Error("Worker failed to generate the fixture")
				expect(reply.systems).toEqual([
					GALAXY_SYSTEMS.generate({
						galaxySeed: 42,
						systemIndex: 0,
						skipNaming: true,
						packed,
					}),
				])
			}
		} finally {
			spawn.mockRestore()
			vi.unstubAllGlobals()
		}
	})

	it("records legal final orbits and preserves dependent addresses across pair regions", () => {
		const packed = packedFixture({
			companionMass: 1,
			separationAU: 2,
			triple: false,
		})
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
			packed,
		})
		expect(
			system.stars
				.flatMap((star) => star.regions)
				.map(({ region }) => region.center),
		).toEqual([
			{ kind: "star", index: 0 },
			{ kind: "binary", index: 0 },
			{ kind: "star", index: 1 },
		])
		for (const star of system.stars) {
			for (const body of star.bodies) {
				const region = body.orbitRegion!
				expect(body.orbitalDistanceAU).toBeGreaterThanOrEqual(region.minAU)
				expect(body.orbitalDistanceAU).toBeLessThanOrEqual(region.maxAU)
				expect(body.eccentricity).toBe(0)
				expect(body.inclinationDeg).toBe(0)
				expect(body.orbitalPeriodDays).toBeCloseTo(
					TIME.astronomicalDaysPerYear *
						Math.sqrt(body.orbitalDistanceAU ** 3 / region.massSol),
					7,
				)
				expect(region.luminositySol).toBe(
					region.center.kind === "binary" ? 2 : 1,
				)
				if (body.belt) {
					expect(body.belt.spanOrbitNumber).toBeGreaterThan(0)
					const { minAU, maxAU } = beltEdgesAU(body)
					expect(minAU + 1e-10).toBeGreaterThanOrEqual(region.minAU)
					expect(maxAU - 1e-10).toBeLessThanOrEqual(region.maxAU)
				}
				for (const target of [body.trojanOfIdx, body.beltOfIdx]) {
					if (target === undefined) continue
					expect(
						star.bodies.find(({ idx }) => idx === target)?.orbitRegion,
					).toEqual(region)
				}
				for (const moon of body.moons) {
					if (moon.tideLock?.type === "planet")
						expect(moon.tideLock.target).toBe(body.idx)
				}
			}
		}
	})

	it("restores an empty primary catalog and its resolved hierarchy", async () => {
		const packed = packedFixture({
			companionMass: 0.5,
			separationAU: 2,
			triple: true,
		})
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
			packed,
		})
		const stored = new Map<string, string>()
		vi.stubGlobal("window", {
			localStorage: {
				getItem: (key: string) => stored.get(key) ?? null,
				setItem: (key: string, value: string) => stored.set(key, value),
			},
		})
		try {
			const snapshot: Parameters<typeof saveGenerationSessionSnapshot>[0] = {
				solarSystem: {
					star: { class: "G" as const, subtype: 2, seed: "test", ageGyr: 4 },
					orbits: [],
					galaxyCatalog: {
						systemIndex: system.systemIndex,
						binaryOrbits: system.binaryOrbits,
					},
				},
				generationPanelOpen: true,
				solarSystemViewActive: true,
				currentFocus: { kind: "star" as const, starIndex: 2 },
				mainWorldMode: "procedural" as const,
			}
			await saveGenerationSessionSnapshot(snapshot)
			expect(loadGenerationSessionSnapshotSync()).toEqual(snapshot)
			expect(await loadGenerationSessionSnapshot()).toEqual(snapshot)

			const planet = system.stars.flatMap((star) => star.bodies)[0]!
			const outdatedPlanet = {
				...planet,
				incidentIrradiance: { earthRelativeFlux: 1, source: "orbital-mean" },
			}
			await saveGenerationSessionSnapshot({
				...snapshot,
				solarSystem: { ...snapshot.solarSystem, orbits: [outdatedPlanet] },
			})
			expect(loadGenerationSessionSnapshotSync()).toBeNull()
			expect(await loadGenerationSessionSnapshot()).toBeNull()
		} finally {
			vi.unstubAllGlobals()
		}
	})

	it("pins the normal packed capital to a single temperate homeworld", () => {
		const packed = GALAXY_SYSTEMS.forceCapitalsMainWorldCapable({
			galaxySeed: 42,
			capitalSystemIndices: Int32Array.of(0),
			packed: packedFixture({
				companionMass: 1,
				separationAU: 0.25,
				triple: false,
			}),
		})
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			isCapital: true,
			skipNaming: true,
			packed,
		})
		expect(system.stars).toHaveLength(1)
		expect(
			system.stars[0]!.bodies.filter(({ isMainWorld }) => isMainWorld),
		).toEqual([expect.objectContaining({ zone: "inner" })])
	})

	it.each([
		false,
		true,
	])("moves and focuses a tilted sub-day binary at a shared scale (true scale %s)", (trueScale) => {
		const packed = packedFixture({
			companionMass: 0.5,
			separationAU: 0.02,
			triple: false,
		})
		const system = GALAXY_SYSTEMS.generate({
			galaxySeed: 42,
			systemIndex: 0,
			skipNaming: true,
			packed,
		})
		const starParams: SolarSystemOverlayParams = {
			bodies: [],
			companions: [],
			daysPerYear: 365,
			spectralClass: "G",
			starSubtype: 2,
			initialDay: 0,
			showEllipticalOrbits: true,
			showDaylight: false,
			showInclination: true,
			showAxialTilt: false,
			showBodyNames: false,
			showBodyMarkers: false,
			showRealNames: false,
			namesEnabled: false,
			trueScale,
			proceduralSystem: true,
		}
		const [primary, secondary] = system.stars
		const binary = system.binaryOrbits[0]!
		expect(binary.orbitalPeriodDays).toBeLessThan(1)
		const overlay = buildSolarSystemOverlay({
			...starParams,
			bodies: primary!.bodies,
			hostStar: primary,
			binaryOrbits: system.binaryOrbits,
			companions: [
				{
					star: {
						...starParams,
						hostStar: secondary,
						bodies: secondary!.bodies,
					},
					role: "epistellar",
					parentIndex: 0,
					orbitalDistanceAU: binary.orbitalDistanceAU,
					orbitalPeriodDays: binary.orbitalPeriodDays,
					eccentricity: binary.eccentricity,
					inclinationDeg: binary.inclinationDeg,
				},
			],
		})
		const focus = (starIndex: number) =>
			overlay.getBodyFocus({ kind: "star", starIndex })!.position
		const atEpoch = focus(1)
		if (!trueScale) {
			const first = overlay.getBodyFocus({ kind: "star", starIndex: 0 })!
			const second = overlay.getBodyFocus({ kind: "star", starIndex: 1 })!
			expect(first.radius + second.radius).toBeLessThan(
				first.position.distanceTo(second.position),
			)
		}
		const pairBodyIdx = primary!.bodies.findIndex(
			(body) =>
				body.group !== "asteroid belt" &&
				body.orbitRegion?.center.kind === "binary",
		)
		expect(pairBodyIdx).toBeGreaterThanOrEqual(0)
		const pairBodyFocus = overlay.getBodyFocus({
			kind: "body",
			starIndex: 0,
			bodyIdx: pairBodyIdx,
		})!
		expect(pairBodyFocus.position.length() / atEpoch.length()).toBeCloseTo(
			primary!.bodies[pairBodyIdx]!.orbitalDistanceAU /
				(binary.orbitalDistanceAU / 1.5),
		)
		expect(focus(0).addScaledVector(atEpoch, 0.5).length()).toBeCloseTo(0)
		overlay.setDay(binary.orbitalPeriodDays / 4)
		expect(focus(1).z).toBeGreaterThan(0)
		expect(focus(1).length()).toBeCloseTo(atEpoch.length())
		overlay.setDay(binary.orbitalPeriodDays)
		expect(focus(1).distanceTo(atEpoch)).toBeCloseTo(0)

		const primaryFocus = overlay.getBodyFocus({ kind: "star", starIndex: 0 })!
		let primaryTrail: THREE.Line | undefined
		overlay.group.traverse((object) => {
			if (!(object instanceof THREE.Line)) return
			const positions = object.geometry.getAttribute("position")
			if (!positions || positions.count === 0) return
			const end = new THREE.Vector3().fromBufferAttribute(
				positions,
				positions.count - 1,
			)
			if (
				object.localToWorld(end).distanceTo(primaryFocus.position) <
				primaryFocus.radius / 1000
			)
				primaryTrail = object
		})
		expect(primaryTrail).toBeDefined()
		const camera = new THREE.PerspectiveCamera(45)
		camera.position.copy(primaryFocus.position).z += primaryFocus.radius * 1000
		overlay.updateLabelOrientations(camera)
		expect(primaryTrail!.visible).toBe(true)
		camera.position.copy(primaryFocus.position).z += primaryFocus.radius * 6
		overlay.updateLabelOrientations(camera)
		expect(primaryTrail!.visible).toBe(false)
		overlay.dispose()
	})

	it("stores seeded orbit phases and offsets Trojans from their host", () => {
		const params: GenerateSystemBodiesParams = {
			seed: 42,
			hostStar: SOL_LIKE_HOST_STAR,
			mainWorldMode: "procedural",
			exactHZC: false,
			skipNaming: true,
			orbitSlots: [
				{
					orbitNumber: 3,
					type: "terrestrial",
					anomalousOrbitType: "trojan",
					trojanCount: 1,
					isBaseline: false,
					orbitalDistanceAU: 1,
					deviation: 0,
					zone: "inner",
					spreadOrbitNumber: 0.5,
				},
			],
		}
		const bodies = SYSTEM_GENERATION.generateSystemBodies(params)
		const trojan = bodies.find((body) => body.trojan)!
		const host = bodies.find((body) => body.idx === trojan.trojanOfIdx)!
		expect(host.meanAnomalyAtEpochDeg).toBeGreaterThanOrEqual(0)
		expect(host.meanAnomalyAtEpochDeg).toBeLessThan(360)
		expect(trojan.meanAnomalyAtEpochDeg).toBeCloseTo(
			(host.meanAnomalyAtEpochDeg + trojan.trojanOffsetDeg! + 360) % 360,
		)
		expect(trojan.orbitalPeriodDays).toBe(host.orbitalPeriodDays)
		const regenerated = SYSTEM_GENERATION.generateSystemBodies(params)
		expect(regenerated.map((body) => body.meanAnomalyAtEpochDeg)).toEqual(
			bodies.map((body) => body.meanAnomalyAtEpochDeg),
		)
	})

	it("multi-star: every non-empty slot becomes exactly one booked-type body, within this star's legal AU range", () => {
		for (let systemIndex = 0; systemIndex < 20; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 11,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				const nonEmptySlots = star.regions
					.flatMap(({ orbitSlots }) => orbitSlots)
					.filter((slot) => slot.type !== "empty")
				const ordinaryBodies = star.bodies.filter(
					(body) =>
						body.trojanOfIdx === undefined && body.beltOfIdx === undefined,
				)
				expect(ordinaryBodies).toHaveLength(nonEmptySlots.length)
				// AU isn't asserted exactly here: resolvePlanetVsCompanionStarOverlaps
				// still legitimately nudges a body clear of a companion-star band
				// afterward as a safety net (see galaxy/systems/index.ts) -- only
				// type-per-slot and count are guaranteed to match exactly.
				for (const [slotIndex, slot] of nonEmptySlots.entries()) {
					const body = ordinaryBodies[slotIndex]!
					if (slot.type === "gas-giant") {
						expect(body.group).toBe("jovian")
					} else if (slot.type === "belt") {
						expect(body.group).toBe("asteroid belt")
					} else {
						// A "terrestrial"-booked slot still rolls which kind of rocky
						// world it actually is -- see ROLLS.rollTerrestrialSubgroup.
						expect(["dwarf", "terrestrial", "helian"]).toContain(body.group)
					}
				}
			}
		}
	})

	it("multi-star: every generated body sits within its own star's MAO/ceiling bounds", () => {
		for (let systemIndex = 0; systemIndex < 20; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 12,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				const maxOrbitalDistanceAU = ORBIT_BODY.orbitNumberToAU({
					orbitNumber: 20,
				})
				for (const body of star.bodies) {
					if (body.trojanOfIdx !== undefined || body.beltOfIdx !== undefined) {
						continue
					}
					expect(body.orbitalDistanceAU).toBeGreaterThanOrEqual(
						star.mao * 0.999,
					)
					expect(body.orbitalDistanceAU).toBeLessThanOrEqual(
						maxOrbitalDistanceAU * 1.001,
					)
				}
			}
		}
	})

	it("multi-star: every asteroid-belt body has a well-formed belt profile", () => {
		let checkedAny = false
		for (let systemIndex = 0; systemIndex < 20; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 13,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				for (const body of star.bodies) {
					if (body.group !== "asteroid belt") continue
					checkedAny = true
					expect(body.belt).toBeDefined()
					expect(body.belt!.spanOrbitNumber).toBeGreaterThanOrEqual(0)
					expect(body.belt!.bulk).toBeGreaterThanOrEqual(1)
					expect(body.belt!.resourceRating).toBeGreaterThanOrEqual(2)
					expect(body.belt!.resourceRating).toBeLessThanOrEqual(12)
					const { mTypePct, sTypePct, cTypePct, otherPct } =
						body.belt!.composition
					expect(mTypePct).toBeGreaterThanOrEqual(0)
					expect(sTypePct).toBeGreaterThanOrEqual(0)
					expect(cTypePct).toBeGreaterThanOrEqual(0)
					expect(otherPct).toBeGreaterThanOrEqual(0)
					expect(mTypePct + sTypePct + cTypePct + otherPct).toBeCloseTo(100, 5)
				}
			}
		}
		expect(checkedAny).toBe(true)
	})

	it("multi-star: every non-belt body has impactExposure/asteroidImpacts, and asteroidImpacts is never true when no belt exists in the star's system", () => {
		let checkedAny = false
		for (let systemIndex = 0; systemIndex < 20; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 14,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				const hasBelt = star.bodies.some(
					(body) => body.group === "asteroid belt",
				)
				for (const body of star.bodies) {
					if (body.group === "asteroid belt") {
						expect(body.impactExposure).toBeUndefined()
						expect(body.asteroidImpacts).toBeUndefined()
						continue
					}
					checkedAny = true
					expect(body.impactExposure).toBeDefined()
					expect(body.asteroidImpacts).toBeDefined()
					if (!hasBelt) {
						expect(body.asteroidImpacts).toBe(false)
						expect(body.impactExposure!.score).toBe(0)
						expect(
							body.impactExposure!.nearestBeltOrbitNumberDistance,
						).toBeNull()
					}
				}
			}
		}
		expect(checkedAny).toBe(true)
	})

	it("single-star (non-galaxy) caller: budget still produces slot-matched bodies", () => {
		for (let seed = 1; seed <= 20; seed++) {
			const bodies = SYSTEM_GENERATION.generateSystemBodies({
				seed,
				hostStar: SOL_LIKE_HOST_STAR,
				mainWorldMode: "procedural",
				exactHZC: false,
				skipNaming: true,
			})
			const ordinaryBodies = bodies.filter(
				(body) =>
					body.trojanOfIdx === undefined && body.beltOfIdx === undefined,
			)
			expect(ordinaryBodies.length).toBeGreaterThan(0)
			for (const body of ordinaryBodies) {
				expect([
					"jovian",
					"asteroid belt",
					"dwarf",
					"terrestrial",
					"helian",
				]).toContain(body.group)
				expect(body.orbitalDistanceAU).toBeGreaterThan(0)
			}
		}
	})

	it("no generated orbit has its periapsis inside its own star's real radius", () => {
		let giantsSeen = 0
		let violations = 0
		for (let systemIndex = 0; systemIndex < 300; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 13,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				const radiusAU =
					(star.diameterSol * ORBIT_BODY.solarDiameterKm * 1000) /
					ORBIT_BODY.astronomicalUnitM /
					2
				if (star.luminosityClass !== "V") giantsSeen++
				for (const body of star.bodies) {
					if (body.beltOfIdx !== undefined || body.trojanOfIdx !== undefined) {
						continue
					}
					if (
						body.orbitalDistanceAU * (1 - body.eccentricity) <
						radiusAU * 0.999
					)
						violations++
				}
			}
		}
		expect(giantsSeen).toBeGreaterThan(0)
		expect(violations).toBe(0)
	})

	it("no companion star's periapsis is inside its parent's MAO or the two stars' combined radii", () => {
		let companionsSeen = 0
		let violations = 0
		for (let systemIndex = 0; systemIndex < 300; systemIndex++) {
			const system = GALAXY_SYSTEMS.generate({
				galaxySeed: 14,
				systemIndex,
				skipNaming: true,
			})
			for (const star of system.stars) {
				if (star.parentIndex === null) continue
				const parent = system.stars[star.parentIndex]!
				companionsSeen++
				const combinedRadiusAU =
					STAR.getStarRadiusAU({ diameterSol: parent.diameterSol }) +
					STAR.getStarRadiusAU({ diameterSol: star.diameterSol })
				if (
					star.orbitalDistanceAU * (1 - star.eccentricity) <
					Math.max(combinedRadiusAU, parent.mao) * 0.999
				)
					violations++
			}
		}
		expect(companionsSeen).toBeGreaterThan(0)
		expect(violations).toBe(0)
	})
})

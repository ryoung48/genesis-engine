import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { initHistory } from "@/model/history"
import { REL } from "@/model/history/state"
import { generateGenesisWorld } from "@/model/pipelines/generate-world"
import { decodePlanetCode } from "@/model/shared/planet-code"
import type { GenesisParams } from "@/model/types/tectonics"
import { DEFAULT_WORLD_PARAMS } from "@/ui/planet/screen/generation/defaults"

beforeAll(() => {
	vi.spyOn(console, "table").mockImplementation(() => undefined)
})
afterAll(() => {
	vi.restoreAllMocks()
})

it("no colony has illegitimate vassal relations", () => {
	const code = "8wqaf.06ggpbhgeuxiver0km7ez8g3saa3cawxha4u"
	const decoded = decodePlanetCode(code)!

	const params: GenesisParams = {
		seed: decoded.seed,
		numPoints: decoded.numPoints,
		jitter: decoded.jitter,
		numPlates: decoded.numPlates,
		landDistribution: decoded.landDistribution,
		continentSizeVariety: decoded.continentSizeVariety,
		landCoverage: decoded.landCoverage,
		roughness: decoded.roughness,
		terrainWarp: decoded.terrainWarp,
		smoothing: decoded.smoothing,
		hydraulicErosion: decoded.hydraulicErosion,
		thermalErosion: decoded.thermalErosion,
		ridgeSharpening: decoded.ridgeSharpening,
		glacialErosion: decoded.glacialErosion,
		seaLevel: decoded.seaLevel,
		volcanism: decoded.volcanism,
		craters: decoded.craters,
		maxElevation: decoded.maxElevation,
		planetRadiusKm: decoded.planetRadiusKm,
		obliquity: decoded.obliquity,
		eccentricity: decoded.eccentricity,
		spectralClass: decoded.spectralClass,
		starSubtype: decoded.starSubtype,
		orbitalDistanceAU: decoded.orbitalDistanceAU,
		daysPerYear: decoded.daysPerYear,
		hoursPerDay: decoded.hoursPerDay,
		tidallyLocked: decoded.tidallyLocked,
		antistellarLon: decoded.antistellarLon,
		perihelion: decoded.perihelion,
		pressure: decoded.pressure,
		era: decoded.era,
	}

	const world = generateGenesisWorld(params)
	const state = initHistory({
		nations: world.nations!,
		provinces: world.provinces!,
		population: world.population!,
		coastal: world.coastal!,
		riverVisible: world.rivers!.visible,
		r_xyz: world.mesh.r_xyz,
		cultures: world.cultures!,
		seed: world.params.seed,
	})

	const nc = world.nations!.nationColonizer!
	const seeds = world.nations!.seeds
	const P = state.P

	let bad = 0
	for (let col = 0; col < nc.length; col++) {
		if (nc[col] < 0) continue
		const cc = seeds[col]
		const cz = seeds[nc[col]]
		for (let o = 0; o < P; o++) {
			if (o === cc || state.desolate[o]) continue
			if (state.parentCurrent[o] >= 0 || state.sovereignCurrent[o] < 0) continue
			if (o === cz) continue
			const r = state.relationsCurrent[cc * P + o]
			if (r === REL.OVERLORD || r === REL.VASSAL) bad++
		}
	}
	expect(bad).toBe(0)
}, 120000)

it("seed 42 also has none", () => {
	const world = generateGenesisWorld({
		...DEFAULT_WORLD_PARAMS,
		seed: 42,
		numPoints: 200000,
		tidallyLocked: false,
	} as GenesisParams)
	const state = initHistory({
		nations: world.nations!,
		provinces: world.provinces!,
		population: world.population!,
		coastal: world.coastal!,
		riverVisible: world.rivers!.visible,
		r_xyz: world.mesh.r_xyz,
		cultures: world.cultures!,
		seed: world.params.seed,
	})

	const nc = world.nations!.nationColonizer!
	const seeds = world.nations!.seeds
	const P = state.P

	let bad = 0
	for (let col = 0; col < nc.length; col++) {
		if (nc[col] < 0) continue
		const colonyCap = seeds[col]
		const colonizerCap = seeds[nc[col]]
		for (let o = 0; o < P; o++) {
			if (o === colonyCap || state.desolate[o]) continue
			if (state.parentCurrent[o] >= 0 || state.sovereignCurrent[o] < 0) continue
			if (o === colonizerCap) continue
			const r = state.relationsCurrent[colonyCap * P + o]
			if (r === REL.OVERLORD || r === REL.VASSAL) bad++
		}
	}
	expect(bad).toBe(0)
}, 120000)

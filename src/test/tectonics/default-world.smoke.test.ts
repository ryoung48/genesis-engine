import { describe, expect, it } from "vitest"
import { CRUST } from "@/model/geography/tectonics/crust"
import { PRESENT_CONFIG } from "@/model/geography/tectonics/present-config"
import { TERRAIN_FEATURES } from "@/model/geography/tectonics/terrain-features"
import { WORLD_SAMPLE } from "@/model/geography/tectonics/world-sample"
import { HAZARDS } from "@/model/geography/terrain/hazards"
import { VEC3 } from "@/model/shared/math/vec3"
import { cachedWorld } from "./world-cache"

const SEEDS = [14963991]
const P = PRESENT_CONFIG

describe("present tectonics: the continents' past", () => {
	for (const seed of SEEDS) {
		it(`has craton cores and replays events oldest first (seed ${seed})`, () => {
			const { crust, past } = cachedWorld(seed).presentTectonics!
			expect(past.cores).toBeGreaterThan(0)
			let craton = 0
			for (let c = 0; c < crust.numCells; c++)
				if (crust.type[c] === CRUST.TYPE.CRATON) craton++
			expect(craton).toBeGreaterThan(0)
			for (let i = 1; i < past.events.length; i++)
				expect(past.events[i - 1].age).toBeGreaterThanOrEqual(
					past.events[i].age,
				)
			for (const ev of past.events) {
				expect(ev.age).toBeGreaterThan(0)
				expect(ev.age).toBeLessThanOrEqual(PRESENT_CONFIG.coreAgeMyr[1])
			}
			console.info(
				`seed ${seed}: cores ${past.cores}, craton cells ${craton}, events ${past.events.length}`,
			)
		})

		it(`wears older belts lower (seed ${seed})`, () => {
			const { crust } = cachedWorld(seed).presentTectonics!
			let oldSum = 0
			let oldN = 0
			let youngSum = 0
			let youngN = 0
			for (let c = 0; c < crust.numCells; c++) {
				if (crust.oroType[c] !== CRUST.OROGENY.URAL) continue
				if (crust.oroLast[c] < -500) {
					oldSum += crust.upliftKm[c]
					oldN++
				} else if (crust.oroLast[c] > -150) {
					youngSum += crust.upliftKm[c]
					youngN++
				}
			}
			console.info(`seed ${seed}: old ${oldN} cells, young ${youngN} cells`)
			if (oldN > 20 && youngN > 20)
				expect(oldSum / oldN).toBeLessThan(youngSum / youngN)
			expect(oldN + youngN).toBeGreaterThan(0)
		})

		it(`carries swells and terranes on land (seed ${seed})`, () => {
			const { crust } = cachedWorld(seed).presentTectonics!
			let land = 0
			let withTerrane = 0
			let swell = 0
			for (let c = 0; c < crust.numCells; c++) {
				if (crust.type[c] === CRUST.TYPE.OCEAN) continue
				land++
				if (crust.terrane[c] > 0) withTerrane++
				if (crust.baseKm[c] > 0) swell++
			}
			expect(land).toBeGreaterThan(0)
			expect(withTerrane / land).toBeGreaterThan(0.5)
			expect(swell).toBeGreaterThan(0)
		})
	}
})

describe("present tectonics: geologic record", () => {
	for (const seed of SEEDS) {
		it(`keeps cover and exhumation within their caps (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { crust, sample, record } = world.presentTectonics!
			expect(record).not.toBeNull()
			const land = WORLD_SAMPLE.gather({ sample, field: world.isLand })
			const coverCap =
				(P.recPlatformKm[1] * (1 + P.recCoverVary) +
					P.recRiftCoverKm +
					P.recForelandKm +
					P.recShelfCoverKm +
					P.geology.epeiricRateKmPerMyr * P.recFloodMyr) *
				(1 + P.recBeltThicken)
			let recorded = 0
			for (let c = 0; c < crust.numCells; c++) {
				if (!land[c] || crust.type[c] === CRUST.TYPE.OCEAN) continue
				recorded++
				expect(crust.coverKm[c]).toBeGreaterThanOrEqual(0)
				expect(crust.coverKm[c]).toBeLessThanOrEqual(coverCap)
				expect(crust.coverMaxKm[c]).toBeGreaterThanOrEqual(
					crust.coverKm[c] - 1e-3,
				)
				expect(crust.exhumKm[c]).toBeLessThanOrEqual(P.recExhumMaxKm + 1e-3)
				expect(crust.exhumKm[c]).toBeGreaterThanOrEqual(0)
				const facies =
					crust.coverCarb[c] +
					crust.coverSalt[c] +
					crust.coverCoal[c] +
					crust.coverOrganic[c]
				expect(facies).toBeLessThanOrEqual(1 + 1e-3)
			}
			expect(recorded).toBeGreaterThan(0)
		})

		it(`wears shields deeper than belts (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { crust, sample } = world.presentTectonics!
			const land = WORLD_SAMPLE.gather({ sample, field: world.isLand })
			const shield: number[] = []
			const belt: number[] = []
			for (let c = 0; c < crust.numCells; c++) {
				if (!land[c]) continue
				if (crust.type[c] === CRUST.TYPE.CRATON) shield.push(crust.exhumKm[c])
				else if (crust.oroType[c] !== CRUST.OROGENY.NONE)
					belt.push(crust.exhumKm[c])
			}
			const median = (v: number[]) =>
				[...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]
			expect(shield.length).toBeGreaterThan(0)
			if (belt.length > 20) expect(median(shield)).toBeGreaterThan(median(belt))
		})

		it(`flags forelands, shelves and rift basins on land (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { crust, sample, record } = world.presentTectonics!
			const land = WORLD_SAMPLE.gather({ sample, field: world.isLand })
			let foreland = 0
			let shelf = 0
			let rift = 0
			for (let c = 0; c < crust.numCells; c++) {
				if (!land[c]) continue
				if (crust.geoFlags[c] & CRUST.GEO.FORELAND) foreland++
				if (crust.geoFlags[c] & CRUST.GEO.SHELF) shelf++
				if (crust.geoFlags[c] & CRUST.GEO.RIFT_BASIN) rift++
			}
			expect(foreland + shelf + rift).toBeGreaterThan(0)
			expect(record!.oldLip.provinces).toBeGreaterThanOrEqual(0)
		})
	}
})

describe("present tectonics: plumes and volcano sites", () => {
	for (const seed of SEEDS) {
		it(`ages hotspot tracks away from the plume (seed ${seed})`, () => {
			const { crust, plumes, space } = cachedWorld(seed).presentTectonics!
			const { r_xyz } = space.mesh
			expect(plumes.plumes.length).toBeGreaterThan(0)
			expect(plumes.plumes.length).toBeLessThanOrEqual(P.plumeCount[1])
			for (const plume of plumes.plumes) {
				const cells: { km: number; age: number }[] = []
				let onPlate = 0
				for (let c = 0; c < crust.numCells; c++) {
					if (
						crust.volcSource[c] !== plume.id + 1 ||
						crust.volcType[c] !== CRUST.VOLCANIC.TRACK
					)
						continue
					expect(-crust.volcAt[c]).toBeGreaterThanOrEqual(0)
					expect(-crust.volcAt[c]).toBeLessThanOrEqual(
						P.trackMyr + P.trackStepMyr,
					)
					if (crust.plate[c] === plume.plate) onPlate++
					cells.push({
						km: VEC3.greatCircleKm({
							a: plume.p,
							b: VEC3.at({ xyz: r_xyz, cell: c }),
							radiusKm: space.radiusKm,
						}),
						age: -crust.volcAt[c],
					})
				}
				if (cells.length < 10) continue
				expect(onPlate / cells.length).toBeGreaterThanOrEqual(0.8)
				cells.sort((a, b) => a.km - b.km)
				const half = Math.floor(cells.length / 2)
				const mean = (list: { age: number }[]) =>
					list.reduce((s, x) => s + x.age, 0) / list.length
				expect(mean(cells.slice(half))).toBeGreaterThanOrEqual(
					mean(cells.slice(0, half)),
				)
			}
		})

		it(`keeps flood basalts within their counts, areas and ages (seed ${seed})`, () => {
			const { plumes } = cachedWorld(seed).presentTectonics!
			const lips = plumes.plumes.filter((p) => p.lip)
			expect(lips.length).toBeLessThanOrEqual(P.lipCount[1])
			for (const plume of lips) {
				expect(plume.lip!.areaKm2).toBeGreaterThanOrEqual(P.lipAreaKm2[0] - 1)
				expect(plume.lip!.areaKm2).toBeLessThanOrEqual(P.lipAreaKm2[1] + 1)
				expect(plume.lip!.ageMyr).toBeGreaterThanOrEqual(P.lipAgeMyr[0])
				expect(plume.lip!.ageMyr).toBeLessThanOrEqual(P.lipAgeMyr[1])
			}
		})

		it(`places arc and Andean sites only on active records (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { crust, sites, sample } = world.presentTectonics!
			const arcFront = WORLD_SAMPLE.gather({
				sample,
				field: world.arcRun!.crust.arcFront,
			})
			const counts = { arc: 0, andean: 0, hotspot: 0 }
			for (const site of sites) {
				counts[site.kind]++
				if (site.kind === "arc") {
					expect(crust.type[site.cell]).toBe(CRUST.TYPE.ARC)
					expect(arcFront[site.cell]).toBe(1)
				} else if (site.kind === "andean") {
					expect(crust.oroType[site.cell]).toBe(CRUST.OROGENY.ANDEAN)
					expect(crust.oroLast[site.cell]).toBeGreaterThan(
						-P.volcano.coneActiveMyr,
					)
				} else {
					expect(crust.type[site.cell]).toBe(CRUST.TYPE.OCEAN)
					expect(crust.volcType[site.cell]).toBe(CRUST.VOLCANIC.TRACK)
				}
			}
			console.info(`seed ${seed}: sites ${JSON.stringify(counts)}`)
			expect(sites.length).toBeGreaterThan(0)
		})
	}
})

describe("present tectonics: volcano edifices on the mesh", () => {
	for (const seed of SEEDS) {
		it(`stamps finite, bounded heights only near an edifice (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { edifices, volcano } = world.presentTectonics!
			const { mesh } = world
			expect(volcano).not.toBeNull()
			expect(edifices.length).toBeGreaterThan(0)
			const R = world.params.planetRadiusKm
			const edgeKm =
				Math.sqrt((8 * Math.PI) / (Math.sqrt(3) * mesh.numRegions)) * R
			let stamped = 0
			for (let r = 0; r < mesh.numRegions; r++) {
				const added = volcano!.addedKm[r]
				expect(Number.isFinite(added)).toBe(true)
				expect(added).toBeGreaterThanOrEqual(0)
				expect(added).toBeLessThanOrEqual(P.trackMaxKm)
				if (added === 0) continue
				stamped++
				let near = false
				for (const e of edifices) {
					const d =
						mesh.r_xyz[3 * r] * e.pos[0] +
						mesh.r_xyz[3 * r + 1] * e.pos[1] +
						mesh.r_xyz[3 * r + 2] * e.pos[2]
					if (Math.acos(Math.min(1, d)) * R <= e.reachKm + edgeKm) {
						near = true
						break
					}
				}
				expect(near).toBe(true)
			}
			console.info(
				`seed ${seed}: edifices ${edifices.length}, stamped regions ${stamped}`,
			)
			for (let r = 0; r < mesh.numRegions; r++)
				expect(Number.isNaN(world.elevation_km[r])).toBe(false)
		})
	}
})

const WEIGHT_MAX = 0.9
const HAZARD_KM = 100

describe("present tectonics: hazards from volcano records", () => {
	for (const seed of SEEDS) {
		it(`keeps volcano danger near active edifices and under the kind weight (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { mesh } = world
			const activity = world.presentTectonics!.volcano!.activity
			const edgeKm = Math.sqrt(
				(4 * Math.PI * world.params.planetRadiusKm ** 2) / mesh.numRegions,
			)
			const hops = Math.ceil(HAZARD_KM / edgeKm) + 3
			const dist = new Int32Array(mesh.numRegions).fill(-1)
			const queue: number[] = []
			for (let r = 0; r < mesh.numRegions; r++)
				if (activity[r] > 0) {
					dist[r] = 0
					queue.push(r)
				}
			for (let h = 0; h < queue.length; h++) {
				const r = queue[h]
				if (dist[r] >= hops) continue
				for (let k = mesh.adjOffset[r]; k < mesh.adjOffset[r + 1]; k++) {
					const nb = mesh.adjList[k]
					if (dist[nb] < 0) {
						dist[nb] = dist[r] + 1
						queue.push(nb)
					}
				}
			}
			let dangerous = 0
			for (let r = 0; r < mesh.numRegions; r++) {
				const v = world.hazards.volcano[r]
				expect(v).toBeLessThanOrEqual(WEIGHT_MAX + 1e-6)
				if (v > 0.05) {
					dangerous++
					expect(dist[r]).toBeGreaterThanOrEqual(0)
				}
			}
			expect(dangerous).toBeGreaterThan(0)
		})

		it(`has no volcano danger once every edifice is extinct, and the same earthquakes (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const input = {
				mesh: world.mesh,
				boundary: world.boundary,
				distFields: world.distFields,
				elevationKm: world.elevation_km,
				isLand: world.isLand,
				planetRadiusKm: world.params.planetRadiusKm,
			}
			const quiet = HAZARDS.computeHazards({
				...input,
				volcanoActivity: new Float32Array(world.mesh.numRegions),
			})
			const live = HAZARDS.computeHazards({
				...input,
				volcanoActivity: world.presentTectonics!.volcano!.activity,
			})
			let quietMax = 0
			for (const v of quiet.volcano) quietMax = Math.max(quietMax, v)
			expect(quietMax).toBe(0)
			expect(Array.from(live.earthquake)).toEqual(Array.from(quiet.earthquake))
		})
	}
})

describe("present tectonics: flood basalt relief", () => {
	for (const seed of SEEDS) {
		it(`lifts every flood basalt region within its cap and feathers the edge (seed ${seed})`, () => {
			const world = cachedWorld(seed)
			const { volcano } = world.presentTectonics!
			const bit =
				1 << (TERRAIN_FEATURES.genesisTerrainFeature.LARGE_IGNEOUS_PROVINCE - 1)
			const cap = P.lipMaxPileKm * Math.max(P.lipLandKmPerKm, P.lipSeaKmPerKm)
			let lipRegions = 0
			let liftRegions = 0
			for (let r = 0; r < world.mesh.numRegions; r++) {
				const lift = volcano!.lipKm[r]
				expect(lift).toBeGreaterThanOrEqual(0)
				expect(lift).toBeLessThanOrEqual(cap + 1e-6)
				if (lift > 0) liftRegions++
				if (world.terrainFeatures!.featureMask[r] & bit) {
					lipRegions++
					expect(lift).toBeGreaterThan(0)
				}
			}
			expect(lipRegions).toBeGreaterThan(0)
			expect(liftRegions).toBeGreaterThan(lipRegions)
		})
	}
})

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { expect, it } from "vitest"
import { IMPORT_HEIGHTMAP } from "@/model/pipelines/import-heightmap"
import { FARMING } from "@/model/society/farming"
import { FARMING_WAY_OF_LIFE } from "@/model/society/farming/way-of-life"
import { MIGRATION } from "@/model/society/migration"
import { POPULATION } from "@/model/society/population"
import { TECH_START } from "@/model/society/tech-level/start-year"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"
import { FARMING_EARTH } from "@/test/history-run/farming-earth"

const SEED = 14963991
const POINTS = 204000
const HORIZON_YEAR = 2025
const HYDE_YEARS = [-5000, -1000, 0, 1000, 1500]

function stamp(date: Date): string {
	return date.toISOString().replace(/[:.]/g, "-")
}

function withoutNaN(array: Float32Array): Float32Array {
	return array.some(Number.isNaN)
		? array.map((v) => (Number.isNaN(v) ? 0 : v))
		: array
}

it.skipIf(process.env.HISTORY_FARMING_EARTH !== "1")(
	"compares farming hearths, dated arrivals and ways of life with Earth, asserting nothing",
	() => {
		const started = new Date()
		const file = join("stats", "farming-earth", `${stamp(started)}.json`)
		const write = (report: Record<string, unknown>) => {
			mkdirSync(join("stats", "farming-earth"), { recursive: true })
			writeFileSync(file, JSON.stringify(report, null, 1))
			console.log(`farming-earth diagnostic written to ${file}`)
		}
		const header = {
			startedAt: started.toISOString(),
			seed: SEED,
			points: POINTS,
			inputs:
				"observed climate: observed monthly temperature, rainfall and GDD; observed-hydrology PET; habitability and migration recomputed from observed climate zones, vegetation, annual temperature and rainfall; imported terrain",
		}
		const reference = FARMING_EARTH.loadReference()
		if (
			reference.missing.length ||
			!reference.sites ||
			!reference.regions ||
			!reference.landuse
		) {
			write({
				...header,
				incomplete: `missing reference files: ${reference.missing.join(", ")}`,
			})
			return
		}
		const world = CLIMATE_EARTH.importWorld()
		const { provinces, mesh, population, climate, rainfall } = world
		const real = world.realPastaDebug
		const realTemperature = climate.real_temperature_monthly
		const realRain = rainfall.real_monthly
		if (
			!provinces ||
			!population ||
			!real ||
			!realTemperature ||
			!realRain ||
			!world.params.numPoints
		) {
			write({
				...header,
				incomplete: "world lacks provinces, population or observed climate",
			})
			return
		}
		const observedPet = world.observedHydrology?.pet_monthly
		const realTemperatureAvg = climate.real_temperature_avg
		const realRainAnnual = rainfall.real_annual
		if (
			!observedPet ||
			!world.realClimateZones ||
			!world.realVegetation ||
			!world.landmarks ||
			!realTemperatureAvg ||
			!realRainAnnual
		) {
			write({
				...header,
				incomplete:
					"world lacks observed PET, climate zones, vegetation, landmarks or annual climate",
			})
			return
		}
		const planetRadiusKm = world.params.planetRadiusKm ?? 6371
		const observedHabitability = POPULATION.computeProvinceHabitability({
			provinces,
			_landmarks: world.landmarks,
			climateZones: world.realClimateZones,
			vegetation: world.realVegetation,
			topography: world.topography,
			oceanCoastal: world.coastal,
			lakeCoastal: new Uint8Array(world.coastal.length),
			riverVisible: world.rivers.visible,
			seed: world.params.seed,
		})
		const migration = MIGRATION.compute({
			provinces,
			habitability: observedHabitability,
			mesh,
			isLand: world.isLand,
			elevationKm: world.elevation_km,
			temperatureC: withoutNaN(realTemperatureAvg),
			rainfallMm: withoutNaN(realRainAnnual),
			originHint: IMPORT_HEIGHTMAP.earthMigrationOrigin,
			planetRadiusKm,
			seed: SEED,
			horizonYear: HORIZON_YEAR,
		})
		const N = mesh.numRegions
		const observed = new Uint8Array(provinces.count).fill(1)
		for (let r = 0; r < N; r++) {
			const p = provinces.regionProvince[r]
			if (p < 0) continue
			let complete = !Number.isNaN(real.gdd[r])
			for (let m = 0; m < 12 && complete; m++)
				complete =
					!Number.isNaN(realTemperature[m * N + r]) &&
					!Number.isNaN(realRain[m * N + r])
			if (!complete) observed[p] = 0
		}
		const habitable = Uint8Array.from(provinces.desolate, (d, p) =>
			!d && observed[p] ? 1 : 0,
		)
		const mask = Uint8Array.from(habitable, (ok, p) =>
			ok && migration.result.arrivalYear[p] !== MIGRATION.sentinel ? 1 : 0,
		)
		const coverage = {
			provinces: provinces.count,
			nonDesolate: provinces.desolate.reduce((n, d) => n + (d ? 0 : 1), 0),
			withObservedClimate: habitable.reduce((n, ok) => n + ok, 0),
			searchMask: mask.reduce((n, ok) => n + ok, 0),
		}
		const searchMigration = {
			...migration,
			result: {
				...migration.result,
				arrivalYear: Int32Array.from(migration.result.arrivalYear, (year, p) =>
					observed[p] ? year : MIGRATION.sentinel,
				),
			},
		}
		const farming = FARMING.compute({
			provinces,
			migration: searchMigration,
			mesh,
			planetRadiusKm,
			temperatureMonthly: withoutNaN(realTemperature),
			rainfallMonthly: withoutNaN(realRain),
			petMonthly: withoutNaN(observedPet),
			elevationKm: world.elevation_km,
			slopeScore: world.slopeScore,
			soilFertility: world.soilFertility ?? null,
			lakeKind: world.rivers.lakeKind,
			gdd: withoutNaN(real.gdd),
			topography: world.topography,
			vegetation: world.realVegetation ?? world.vegetation,
			riverVisible: world.rivers.visible,
			horizonYear: HORIZON_YEAR,
		})
		const points = FARMING_EARTH.provincePoints({
			seeds: provinces.seeds,
			r_xyz: mesh.r_xyz,
		})
		const regions = reference.regions
		const members = FARMING_EARTH.regionMembers({
			regions,
			points,
			mask: habitable,
		})
		const graph = {
			count: provinces.count,
			desolate: Uint8Array.from(habitable, (open) => (open ? 0 : 1)),
			adjOffset: provinces.adjOffset,
			adjList: provinces.adjList,
		}
		const fields = new Map<
			number,
			ReturnType<typeof FARMING_WAY_OF_LIFE.wayOfLife>
		>()
		const fieldAt = (year: number) => {
			const cached = fields.get(year)
			if (cached) return cached
			const field = FARMING_WAY_OF_LIFE.wayOfLife({
				farming,
				graph,
				year,
				techLevel: FARMING_EARTH.techLevelAt({ year }),
			})
			fields.set(year, field)
			return field
		}
		const hydeSeries = FARMING_EARTH.loadHyde()
		const hyde = hydeSeries
			? HYDE_YEARS.map((year) => {
					const people = hydeSeries.population(year)
					const field = fieldAt(year)
					return people
						? FARMING_EARTH.hydeCompare({
								year,
								hyde: Array.from(people, (population, i) => ({
									population,
									areaKm2: hydeSeries.areaKm2[i],
								})),
								model: Array.from({ length: provinces.count }, (_, p) => ({
									population: habitable[p]
										? field.density[p] * searchMigration.result.areaKm2[p]
										: 0,
									areaKm2: habitable[p] ? searchMigration.result.areaKm2[p] : 0,
								})),
							})
						: { year, missing: true }
				})
			: { missing: "HYDE asset not found" }
		const landmasses = new Map<
			number,
			{
				provinces: number
				areaKm2: number
				first: number
				reached: number
				adopting: number
				herdBeatsForage: number
				farmed: number
				lat: number
				lon: number
			}
		>()
		for (let p = 0; p < provinces.count; p++) {
			if (!habitable[p]) continue
			const id = provinces.landmassId[p]
			const entry = landmasses.get(id) ?? {
				provinces: 0,
				areaKm2: 0,
				first: Number.POSITIVE_INFINITY,
				reached: 0,
				adopting: 0,
				herdBeatsForage: 0,
				farmed: 0,
				lat: points.latDeg[p],
				lon: points.lonDeg[p],
			}
			entry.provinces++
			entry.areaKm2 += migration.result.areaKm2[p]
			if (farming.herdAdoptionYear[p] !== MIGRATION.sentinel) entry.adopting++
			if (farming.herdCapacity[p] > farming.forageDensity[p])
				entry.herdBeatsForage++
			if (farming.adoptionYear[p] !== MIGRATION.sentinel) entry.farmed++
			if (farming.herdYear[p] !== MIGRATION.sentinel) {
				entry.reached++
				if (farming.herdYear[p] < entry.first) {
					entry.first = farming.herdYear[p]
					entry.lat = points.latDeg[p]
					entry.lon = points.lonDeg[p]
				}
			}
			landmasses.set(id, entry)
		}
		const livestock = [...landmasses.entries()]
			.sort((a, b) => b[1].areaKm2 - a[1].areaKm2)
			.slice(0, 40)
			.map(([id, entry]) => ({
				landmass: id,
				...entry,
				first: Number.isFinite(entry.first) ? entry.first : null,
			}))
		const hearths = farming.hearths.map((hearth) => ({
			...hearth,
			latitude: points.latDeg[hearth.province],
			longitude: points.lonDeg[hearth.province],
		}))
		write({
			...header,
			sources: reference.sources,
			assets: FARMING_EARTH.assetDigests(),
			coverage,
			migrationMatchesWorld: farming.settledYear.every(
				(year, p) => !observed[p] || year === population.arrivalYear?.[p],
			),
			summary: farming.summary,
			hearths,
			centres: FARMING_EARTH.centres({
				points,
				mask: habitable,
				farmingYear: farming.farmingYear,
				hearths: farming.hearths,
			}),
			pinhasi: FARMING_EARTH.pinhasi({
				sites: reference.sites,
				points,
				mask: habitable,
				farmingYear: farming.farmingYear,
			}),
			livestock,
			hyde,
			timeline: [-10000, -3000, -1000, 1, 900, 917, 1500].map((year) => ({
				year,
				farmingAge: TECH_START.farmingAgeAt({
					farming,
					areaKm2: migration.result.areaKm2,
					graph: provinces,
					techLevel: FARMING_EARTH.techLevelAt({ year }),
					year,
				}),
				settledShare: TECH_START.settledShareAt({
					farming,
					areaKm2: migration.result.areaKm2,
					graph: provinces,
					techLevel: FARMING_EARTH.techLevelAt({ year }),
					year,
				}),
			})),
			techLevel: FARMING_EARTH.techLevelCheck({
				settledScore: population.habitabilityScore,
			}),
			worktreeComparable: {
				pinhasi: FARMING_EARTH.worktreePinhasi({
					sites: reference.sites,
					points,
					mask: habitable,
					farmingYear: farming.farmingYear,
				}),
				archaeoglobe: FARMING_EARTH.worktreeWayOfLife({
					regions,
					landuse: reference.landuse,
					members,
					modeOf: ({ province, year }) =>
						FARMING_WAY_OF_LIFE.modeOf({ field: fieldAt(year), province }),
				}),
			},
			archaeoglobe: FARMING_EARTH.wayOfLife({
				regions,
				landuse: reference.landuse,
				members,
				areaKm2: Float64Array.from(migration.result.areaKm2),
				modeOf: ({ province, year }) =>
					FARMING_WAY_OF_LIFE.modeOf({ field: fieldAt(year), province }),
				capacities: {
					forage: farming.forageDensity,
					farm: farming.farmCapacity,
					herd: farming.herdCapacity,
				},
			}),
		})
		expect(true).toBe(true)
	},
)

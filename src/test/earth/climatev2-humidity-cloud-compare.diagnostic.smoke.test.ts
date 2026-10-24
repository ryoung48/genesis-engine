import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { CLOUD_COVER } from "@/model/climate/precipitation/cloud-cover"
import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { CLIMATEV2_OUTPUTS } from "@/model/climatev2/outputs"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { loadEarthMonthlyRaster } from "@/test/earth/assets"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"

// v2's clouds and humidity against our display proxies, scored on observed Earth: ERA5 total cloud cover (1991-2020)
// and WorldClim 2.1 vapour pressure over land, as relative humidity e / e_s(T) at WorldClim's own temperature.
// v2 has no cloud-cover output: its temperature stage shades land by 1 − e^{−rain / 100 mm} of each month's rain,
// which is what is scored as its cloud cover. Its humidity is the rain stage's column relative humidity (water
// vapour over the saturated column), not the near-surface humidity the observations measure.

const MONTHS = 12
const CLOUD_RAIN_MM = 100
const BANDS = [
	["60N–90N", 60, 90],
	["30N–60N", 30, 60],
	["0–30N", 0, 30],
	["0–30S", -30, 0],
	["30S–60S", -60, -30],
	["60S–90S", -90, -60],
] as const

type Sample = { model: number; obs: number; weight: number }

function saturationKpa(tempC: number) {
	return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))
}

function score(samples: Sample[]) {
	let w = 0
	let sm = 0
	let so = 0
	for (const s of samples) {
		w += s.weight
		sm += s.weight * s.model
		so += s.weight * s.obs
	}
	const mm = sm / w
	const mo = so / w
	let abs = 0
	let cov = 0
	let vm = 0
	let vo = 0
	for (const s of samples) {
		const dm = s.model - mm
		const dobs = s.obs - mo
		abs += s.weight * Math.abs(s.model - s.obs)
		cov += s.weight * dm * dobs
		vm += s.weight * dm * dm
		vo += s.weight * dobs * dobs
	}
	const round = (x: number) => Number(x.toFixed(3))
	return {
		n: samples.length,
		mae: round(abs / w),
		bias: round(mm - mo),
		r: round(cov / Math.sqrt(vm * vo)),
		modelMean: round(mm),
		obsMean: round(mo),
	}
}

// Monthly cells, their annual means across cells, and each cell's seasonal cycle about its own mean
function report(params: {
	samples: Sample[][]
	lat: Float64Array
	include: (r: number) => boolean
}) {
	const { samples, lat, include } = params
	const all: Sample[] = []
	const annual: Sample[] = []
	const seasonal: Sample[] = []
	const bands = Object.fromEntries(
		BANDS.map(([name]) => [name, [] as Sample[]]),
	)
	samples.forEach((months, r) => {
		if (!include(r) || months.length < MONTHS) return
		let model = 0
		let obs = 0
		for (const s of months) {
			model += s.model / MONTHS
			obs += s.obs / MONTHS
		}
		annual.push({ model, obs, weight: months[0].weight })
		for (const s of months) {
			all.push(s)
			seasonal.push({
				model: s.model - model,
				obs: s.obs - obs,
				weight: s.weight,
			})
		}
		const band = BANDS.find(([, lo, hi]) => lat[r] >= lo && lat[r] < hi)
		if (band) bands[band[0]].push(...months)
	})
	return {
		monthly: score(all),
		annualMeans: score(annual),
		seasonalCycle: score(seasonal),
		bands: Object.fromEntries(
			Object.entries(bands).map(([name, s]) => [
				name,
				s.length ? score(s) : null,
			]),
		),
	}
}

describe("climatev2 humidity and clouds vs observed Earth (diagnostic)", () => {
	it("scores v2's clouds and humidity against our proxies", () => {
		const world = CLIMATE_EARTH.importWorld()
		const { mesh, isLand, climate, rainfall, hydrology, oceanDist } = world
		const N = mesh.numRegions
		const dtr = world.dtr_monthly
		const lat = new Float64Array(N)
		for (let r = 0; r < N; r++)
			lat[r] =
				(Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) * 180) /
				Math.PI

		const observedCloud = world.observedCloudCover?.real_monthly
		if (!observedCloud) throw new Error("no observed cloud cover")
		const cloudOurs: Sample[][] = Array.from({ length: N }, (): Sample[] => [])
		const cloudV2: Sample[][] = Array.from({ length: N }, (): Sample[] => [])
		for (let r = 0; r < N; r++) {
			const weight = mesh.regionArea[r]
			for (let m = 0; m < MONTHS; m++) {
				const i = m * N + r
				const obs = observedCloud[i]
				if (!Number.isFinite(obs)) continue
				cloudOurs[r].push({
					model: CLOUD_COVER.estimate({
						aetMm: hydrology.aet_monthly[i],
						petMm: climate.pet_monthly[i],
						rainfallMm: rainfall.monthly[i],
						dtrC: dtr[i],
						temperatureC: climate.temperature_monthly[i],
						oceanDistanceKm: oceanDist[r],
					}),
					obs,
					weight,
				})
				cloudV2[r].push({
					model:
						1 - Math.exp(-Math.max(0, rainfall.monthly[i]) / CLOUD_RAIN_MM),
					obs,
					weight,
				})
			}
		}

		const vapour = loadEarthMonthlyRaster("earth-real-vapor-pressure")
		const vapourKpa = OBSERVED_EARTH.sampleMonthlyFloatRaster({
			mesh,
			raster: vapour.monthly,
			rasterW: vapour.width,
			rasterH: vapour.height,
			months: vapour.months,
			scale: vapour.scale,
			nodata: vapour.nodata,
		})
		const observedT = climate.real_temperature_monthly
		if (!observedT) throw new Error("no observed temperature")

		const result = planetClimate(
			{
				xyz: mesh.r_xyz,
				elevKm: world.elevation_km,
				axes: "z-up",
				land: isLand,
			},
			{
				...CLIMATEV2_ORBIT.fromParams(world.params),
				seed: world.params.seed,
				greenhouseWm2: 0,
				onCell: () => undefined,
			},
		)
		const { grid, anchorMonths } = result
		const columnRh = result.stages.rain.r
		const K = anchorMonths.length
		if (columnRh.length !== K * grid.size) throw new Error("rain grid differs")
		const rhMonths = new Float32Array(MONTHS * grid.size)
		for (let m = 0; m < MONTHS; m++) {
			const pos = (((((m - anchorMonths[0]) * K) / MONTHS) % K) + K) % K
			const k0 = Math.floor(pos)
			const k1 = (k0 + 1) % K
			const f = pos - k0
			for (let c = 0; c < grid.size; c++)
				rhMonths[m * grid.size + c] =
					(1 - f) * columnRh[k0 * grid.size + c] +
					f * columnRh[k1 * grid.size + c]
		}
		const rhV2Cells = new Float32Array(MONTHS * N)
		CLIMATEV2_OUTPUTS.sampleCells({
			weights: CLIMATEV2_OUTPUTS.bilinearWeights({ mesh, grid }),
			field: rhMonths,
			fieldSize: grid.size,
			months: MONTHS,
			out: rhV2Cells,
			cells: null,
		})

		const rhOurs: Sample[][] = Array.from({ length: N }, (): Sample[] => [])
		const rhV2: Sample[][] = Array.from({ length: N }, (): Sample[] => [])
		for (let r = 0; r < N; r++) {
			if (!isLand[r]) continue
			const weight = mesh.regionArea[r]
			let aet = 0
			let pet = 0
			for (let m = 0; m < MONTHS; m++) {
				aet += hydrology.aet_monthly[m * N + r]
				pet += climate.pet_monthly[m * N + r]
			}
			for (let m = 0; m < MONTHS; m++) {
				const i = m * N + r
				const e = vapourKpa[i]
				const t = observedT[i]
				if (!Number.isFinite(e) || !Number.isFinite(t) || e <= 0) continue
				const obs = Math.min(100, (100 * e) / saturationKpa(t))
				rhOurs[r].push({
					model: HUMIDITY.relativeHumidityFromTempRange({
						meanTempC: climate.temperature_monthly[i],
						dtrC: dtr[i],
						annualAridity: pet > 0 ? aet / pet : 1,
						annualRainfallMm: rainfall.annual[r],
					}),
					obs,
					weight,
				})
				rhV2[r].push({ model: 100 * Math.min(1, rhV2Cells[i]), obs, weight })
			}
		}

		const notAntarctic = (r: number) => lat[r] > -60
		const out = {
			cloud: {
				ours: {
					all: report({ samples: cloudOurs, lat, include: () => true }),
					land: report({
						samples: cloudOurs,
						lat,
						include: (r) => isLand[r] === 1,
					}),
					sea: report({
						samples: cloudOurs,
						lat,
						include: (r) => isLand[r] === 0,
					}),
				},
				v2: {
					all: report({ samples: cloudV2, lat, include: () => true }),
					land: report({
						samples: cloudV2,
						lat,
						include: (r) => isLand[r] === 1,
					}),
					sea: report({
						samples: cloudV2,
						lat,
						include: (r) => isLand[r] === 0,
					}),
				},
			},
			humidity: {
				ours: report({ samples: rhOurs, lat, include: notAntarctic }),
				v2: report({ samples: rhV2, lat, include: notAntarctic }),
			},
		}
		const dir = join(
			"stats",
			"climate",
			`${new Date().toISOString().replace(/[:.]/g, "-")}-humidity-cloud`,
		)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "results.json"), JSON.stringify(out, null, 2))
		console.log(JSON.stringify(out, null, 2))
	}, 600000)
})

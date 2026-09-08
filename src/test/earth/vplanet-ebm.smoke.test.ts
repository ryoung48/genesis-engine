import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { gunzipSync } from "node:zlib"
import { expect, test } from "vitest"
import { CONFIG } from "@/model/climate/temperature/ebm/config"
import { EnergyBalanceModel } from "@/model/climate/temperature/ebm/energy-balance-model"
import { SEASONAL_SURFACE } from "@/model/climate/temperature/ebm/seasonal-surface"
import type {
	ComparisonParams,
	VplanetReference,
} from "@/test/earth/vplanet/types"

function compare(params: ComparisonParams) {
	let squared = 0
	let bias = 0
	let weight = 0
	let maxAbsolute = 0
	for (let lat = 0; lat < params.actual.length; lat++) {
		for (let day = 0; day < params.actual[lat].length; day++) {
			const difference = params.actual[lat][day] - params.expected[day][lat]
			expect(Number.isFinite(difference)).toBe(true)
			squared += difference ** 2 * params.weights[lat]
			bias += difference * params.weights[lat]
			weight += params.weights[lat]
			maxAbsolute = Math.max(maxAbsolute, Math.abs(difference))
		}
	}
	return { rmse: Math.sqrt(squared / weight), bias: bias / weight, maxAbsolute }
}

test.each([
	{
		name: "EarthClimate",
		slug: "earth-climate",
		config: CONFIG.earthClimate,
		output: "logs/vplanet",
		temperatureTolerance: 0.05,
		iceTolerance: 1.5e-6,
	},
	{
		name: "IceBelts",
		slug: "ice-belts",
		config: CONFIG.iceBelts,
		output: "logs/vplanet/ice-belts",
		temperatureTolerance: 0.001,
		iceTolerance: 1e-8,
	},
])("raw EBM reproduces VPLanet $name seasonal fields", ({
	slug,
	config,
	output,
	temperatureTolerance,
	iceTolerance,
}) => {
	const reference: VplanetReference = JSON.parse(
		gunzipSync(
			readFileSync(`src/test/earth/fixtures/vplanet-${slug}.json.gz`),
		).toString(),
	)
	const model = new EnergyBalanceModel(config)
	model.runModel({
		years: 200,
		dtDays: 365 / config.discretization.samplesPerYear,
	})
	expect(model.converged).toBe(true)
	expect(model.lats_deg).toHaveLength(reference.latitudeDegrees.length)
	for (let i = 0; i < model.lats_deg.length; i++)
		expect(model.lats_deg[i]).toBeCloseTo(reference.latitudeDegrees[i], 10)
	const insolation = reference.forcingDay.map(
		(day) => reference.insolation[day],
	)
	const report = {
		revision: reference.revision,
		yearsRun: model.yearsRun,
		insolation: compare({
			actual: model.insolation,
			expected: insolation,
			weights: model.dx,
		}),
		temperature: compare({
			actual: model.temperature,
			expected: reference.temperature,
			weights: model.dx,
		}),
		iceMassBalance: compare({
			actual: model.ice_mass_balance,
			expected: reference.iceMassBalance,
			weights: model.dx,
		}),
		seasonal: [...Array(12).keys()].map((month) => {
			const start = Math.floor((month * reference.forcingDay.length) / 12)
			const end = Math.floor(((month + 1) * reference.forcingDay.length) / 12)
			return {
				startDaySinceSolstice: reference.forcingDay[start],
				temperature: compare({
					actual: model.temperature.map((row) => row.slice(start, end)),
					expected: reference.temperature.slice(start, end),
					weights: model.dx,
				}),
				iceMassBalance: compare({
					actual: model.ice_mass_balance.map((row) => row.slice(start, end)),
					expected: reference.iceMassBalance.slice(start, end),
					weights: model.dx,
				}),
			}
		}),
	}
	mkdirSync(output, { recursive: true })
	writeFileSync(`${output}/comparison.json`, JSON.stringify(report, null, 2))
	const rows = [
		"latitude,forcingDay,ebmInsolationWm2,vplanetInsolationWm2,ebmTemperatureC,vplanetTemperatureC,ebmIceBalanceKgM2S,vplanetIceBalanceKgM2S",
	]
	for (let lat = 0; lat < model.lats.length; lat++) {
		for (let day = 0; day < reference.forcingDay.length; day++)
			rows.push(
				[
					model.lats_deg[lat],
					reference.forcingDay[day],
					model.insolation[lat][day],
					insolation[day][lat],
					model.temperature[lat][day],
					reference.temperature[day][lat],
					model.ice_mass_balance[lat][day],
					reference.iceMassBalance[day][lat],
				].join(","),
			)
	}
	writeFileSync(`${output}/comparison.csv`, rows.join("\n"))
	console.log(report)
	expect(report.insolation.rmse).toBeLessThan(0.001)
	expect(report.temperature.rmse).toBeLessThan(temperatureTolerance)
	expect(report.temperature.maxAbsolute).toBeLessThan(0.3)
	expect(report.iceMassBalance.rmse).toBeLessThan(iceTolerance)
})

test("finer timesteps converge without changing the length of the seasonal year", () => {
	const samples = CONFIG.earthClimate.discretization.samplesPerYear
	const temperatures = [
		365 / samples,
		365 / samples / 2,
		365 / samples / 4,
	].map((dtDays) => {
		const model = new EnergyBalanceModel(CONFIG.earthClimate)
		model.runModel({ years: 12, dtDays })
		expect(model.temperature).toHaveLength(
			CONFIG.earthClimate.discretization.latitudeCount,
		)
		expect(model.temperature[0]).toHaveLength(samples)
		return model.temperature
	})
	const reference = [...temperatures[2][0].keys()].map((day) =>
		temperatures[2].map((row) => row[day]),
	)
	const weights = new Array(
		CONFIG.earthClimate.discretization.latitudeCount,
	).fill(1)
	const coarse = compare({
		actual: temperatures[0],
		expected: reference,
		weights,
	})
	const fine = compare({
		actual: temperatures[1],
		expected: reference,
		weights,
	})
	expect(fine.rmse).toBeLessThanOrEqual(coarse.rmse + 1e-9)
	expect(coarse.rmse).toBeLessThan(0.3)
})

test("running the same EBM twice resets its grid and thermal state", () => {
	const model = new EnergyBalanceModel(CONFIG.earthClimate)
	model.runModel({ years: 4, dtDays: 365 / 60 })
	const first = model.temperature.map((row) => row.slice())
	model.runModel({ years: 4, dtDays: 365 / 60 })
	expect(model.temperature).toEqual(first)
	expect(model.dx.reduce((sum, width) => sum + width, 0)).toBeCloseTo(2, 12)
	expect(() => model.runModel({ years: 1, dtDays: 0 })).toThrow()
})

test("seasonal ice balance includes potential melt on bare ground and suppresses snowball accumulation", () => {
	const config = CONFIG.earthClimate.seasonalSurface
	if (!config) throw new Error("EarthClimate requires seasonal surface physics")
	const warm = SEASONAL_SURFACE.step({
		temperatureK: 280,
		iceMass: 0,
		dt: 86400,
		snowball: false,
		config,
	})
	expect(warm.massBalance).toBeLessThan(0)
	expect(warm.iceMass).toBe(0)
	expect(warm.temperatureK).toBe(280)
	const frozen = SEASONAL_SURFACE.step({
		temperatureK: 260,
		iceMass: 0,
		dt: 86400,
		snowball: true,
		config,
	})
	expect(frozen.massBalance).toBe(0)
	const accumulating = SEASONAL_SURFACE.step({
		temperatureK: 260,
		iceMass: 0,
		dt: 86400,
		snowball: false,
		config,
	})
	expect(accumulating.iceMass).toBeCloseTo(config.iceDepositionRate * 86400, 12)
	expect(accumulating.temperatureK).toBeGreaterThan(260)
})

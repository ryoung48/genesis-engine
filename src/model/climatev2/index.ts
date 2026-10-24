import { TEMPERATURE_SHARED } from "@/model/climate/shared/temperature"
import { CLIMATEV2_DIURNAL } from "@/model/climatev2/diurnal"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { CLIMATEV2_OUTPUTS } from "@/model/climatev2/outputs"
import type {
	ClimateV2ApplyParams,
	ClimateV2Cells,
	ClimateV2Input,
	ClimateV2WorldParams,
	ZonalSeaAnomalyParams,
} from "@/model/climatev2/types"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"

const MONTHS = 12
const DEG = 180 / Math.PI
const ROWS = 180

function zonalSeaAnomaly({
	mesh,
	isLand,
	temperatureMonthly,
}: ZonalSeaAnomalyParams): Float32Array {
	const N = mesh.numRegions
	const row = new Int32Array(N)
	for (let r = 0; r < N; r++) {
		const lat =
			Math.asin(Math.max(-1, Math.min(1, mesh.r_xyz[3 * r + 2]))) * DEG
		row[r] = Math.max(0, Math.min(ROWS - 1, Math.floor(90 - lat)))
	}
	const out = new Float32Array(MONTHS * N)
	const sum = new Float64Array(ROWS)
	const area = new Float64Array(ROWS)
	for (let m = 0; m < MONTHS; m++) {
		sum.fill(0)
		area.fill(0)
		for (let r = 0; r < N; r++) {
			if (isLand[r]) continue
			sum[row[r]] += mesh.regionArea[r] * temperatureMonthly[m * N + r]
			area[row[r]] += mesh.regionArea[r]
		}
		for (let r = 0; r < N; r++)
			if (!isLand[r])
				out[m * N + r] =
					temperatureMonthly[m * N + r] - sum[row[r]] / area[row[r]]
	}
	return out
}

function computeCellClimate(input: ClimateV2Input): ClimateV2Cells {
	const { mesh, elevationKm, isLand, orbit, seed, diagnostics } = input
	const N = mesh.numRegions
	const temperatureMonthly = new Float32Array(MONTHS * N)
	const rainfallMonthly = new Float32Array(MONTHS * N)
	const result = planetClimate(
		{ xyz: mesh.r_xyz, elevKm: elevationKm, axes: "z-up", land: isLand },
		{
			...orbit,
			seed,
			greenhouseWm2: 0,
			onCell: (r, T12, P12) => {
				for (let m = 0; m < MONTHS; m++) {
					temperatureMonthly[m * N + r] = T12[m]
					rainfallMonthly[m * N + r] = P12[m]
				}
			},
		},
	)
	const { grid } = result
	const { temperature, circulation, ocean } = result.stages
	const weights = CLIMATEV2_OUTPUTS.bilinearWeights({ mesh, grid })
	const sea = new Uint8Array(N)
	for (let r = 0; r < N; r++) sea[r] = isLand[r] ? 0 : 1
	const monthly = { weights, fieldSize: grid.size, months: MONTHS }
	CLIMATEV2_OUTPUTS.sampleCells({
		...monthly,
		field: temperature.monthlySL,
		out: temperatureMonthly,
		cells: sea,
	})
	CLIMATEV2_OUTPUTS.sampleCells({
		...monthly,
		field: result.months.P,
		out: rainfallMonthly,
		cells: sea,
	})
	const rainfallAnnual = new Float32Array(N)
	for (let m = 0; m < MONTHS; m++)
		for (let r = 0; r < N; r++) rainfallAnnual[r] += rainfallMonthly[m * N + r]
	const windFields = CLIMATEV2_OUTPUTS.windFields({
		weights,
		circulation,
		fieldSize: grid.size,
	})
	const oceanCurrents = {
		...CLIMATEV2_OUTPUTS.currentFlows({ weights, ocean, fieldSize: grid.size }),
		...CLIMATEV2_OUTPUTS.seaSurface({
			anomalyMonthly: zonalSeaAnomaly({ mesh, isLand, temperatureMonthly }),
			isLand,
		}),
	}
	let iceDiagnostics: ClimateV2Cells["diagnostics"] = null
	if (diagnostics) {
		const seaIceMonthly = new Float32Array(MONTHS * N)
		const snowIceShare = new Float32Array(N)
		CLIMATEV2_OUTPUTS.sampleCells({
			...monthly,
			field: temperature.seaIce,
			out: seaIceMonthly,
			cells: sea,
		})
		CLIMATEV2_OUTPUTS.sampleCells({
			weights,
			fieldSize: grid.size,
			months: 1,
			field: temperature.iceFrac,
			out: snowIceShare,
			cells: isLand,
		})
		iceDiagnostics = { seaIceMonthly, snowIceShare }
	}
	return {
		temperatureMonthly,
		rainfallMonthly,
		rainfallAnnual,
		...windFields,
		oceanCurrents,
		diagnostics: iceDiagnostics,
		diurnalRange: CLIMATEV2_DIURNAL.cells({ result, weights, isLand }),
		koppen: result.cell.koppen,
		timing: result.timing,
	}
}

function computeForWorld({
	mesh,
	elevationKm,
	isLand,
	params,
}: ClimateV2WorldParams): ClimateV2Cells {
	return computeCellClimate({
		mesh,
		elevationKm,
		isLand,
		orbit: CLIMATEV2_ORBIT.fromParams(params),
		seed: params.seed,
		diagnostics: false,
	})
}

// The world's temperature is v2's; its annual mean and range follow from the months.
function applyTemperature({ climate, v2 }: ClimateV2ApplyParams): void {
	climate.temperature_monthly.set(v2.temperatureMonthly)
	TEMPERATURE_SHARED.recomputeAnnualTemperatureStats({
		temperature_monthly: climate.temperature_monthly,
		temperature_avg: climate.temperature_avg,
		temperature_min: climate.temperature_min,
		temperature_max: climate.temperature_max,
		N: climate.temperature_avg.length,
	})
}

export const CLIMATE_V2 = {
	computeCellClimate,
	computeForWorld,
	applyTemperature,
}

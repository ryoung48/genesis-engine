import { CLIMATE } from "@/model/climate/classification/climate"
import { TEMPERATURE_SHARED } from "@/model/climate/shared/temperature"
import type { GenesisClimate } from "@/model/climate/types"
import { CLIMATEV2_LOCKED_CIRCULATION } from "@/model/climatev2/circulation/locked"
import { CLIMATEV2_DIURNAL } from "@/model/climatev2/diurnal"
import { CLIMATEV2_LOCKED_OCEAN } from "@/model/climatev2/ocean/locked"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { CLIMATEV2_OUTPUTS } from "@/model/climatev2/outputs"
import type {
	ApplyLockedClimateParams,
	ClimateV2Cells,
	ClimateV2ClimateParams,
	ClimateV2Input,
	ClimateV2WorldParams,
	LockedClimateCells,
	LockedClimateOutputs,
	LockedClimateParams,
	ZonalSeaAnomalyParams,
} from "@/model/climatev2/types"
import {
	lockedClimate,
	planetClimate,
} from "@/model/climatev2/vendor/climate.js"

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
	let climateDiagnostics: ClimateV2Cells["diagnostics"] = null
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
		climateDiagnostics = {
			seaIceMonthly,
			snowIceShare,
			radiation: temperature.budget,
		}
	}
	return {
		cloudCoverMonthly: CLIMATEV2_OUTPUTS.monthlyCells({
			weights,
			field: result.stages.clouds.cover,
			fieldSize: grid.size,
		}),
		temperatureMonthly,
		rainfallMonthly,
		rainfallAnnual,
		...windFields,
		oceanCurrents,
		diagnostics: climateDiagnostics,
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

// The world's climate record: v2's temperature by month (the annual mean and range follow from the months) and its
// day-night range, beside the planet's sunlight; PET is filled once the day-night range is applied.
function toClimate({
	mesh,
	params,
	v2,
}: ClimateV2ClimateParams): GenesisClimate {
	const N = mesh.numRegions
	const climate: GenesisClimate = {
		cloud_cover_monthly: v2.cloudCoverMonthly,
		temperature_avg: new Float32Array(N),
		temperature_min: new Float32Array(N),
		temperature_max: new Float32Array(N),
		temperature_monthly: Float32Array.from(v2.temperatureMonthly),
		temperature_monthly_range: Float32Array.from(v2.diurnalRange.monthly),
		pet_monthly: new Float32Array(N * 12),
		...CLIMATE.computeSunlight({ mesh, params }),
	}
	TEMPERATURE_SHARED.recomputeAnnualTemperatureStats({
		temperature_monthly: climate.temperature_monthly,
		temperature_avg: climate.temperature_avg,
		temperature_min: climate.temperature_min,
		temperature_max: climate.temperature_max,
		N,
	})
	return climate
}

function computeLocked({
	mesh,
	elevationKm,
	isLand,
	params,
}: LockedClimateParams): LockedClimateCells {
	const N = mesh.numRegions
	const temperatureMonthly = new Float32Array(MONTHS * N)
	const rainfallMonthly = new Float32Array(MONTHS * N)
	const orbit = CLIMATEV2_ORBIT.lockedFromParams(params)
	const result = lockedClimate(
		{ xyz: mesh.r_xyz, elevKm: elevationKm, axes: "z-up", land: isLand },
		{
			...orbit,
			seed: params.seed,
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
	const sea = new Uint8Array(N)
	for (let r = 0; r < N; r++) sea[r] = isLand[r] ? 0 : 1
	const weights = CLIMATEV2_OUTPUTS.bilinearWeights({ mesh, grid })
	const monthly = { weights, fieldSize: grid.size, months: MONTHS, cells: sea }
	CLIMATEV2_OUTPUTS.sampleCells({
		...monthly,
		field: result.stages.temperature.monthlySL,
		out: temperatureMonthly,
	})
	CLIMATEV2_OUTPUTS.sampleCells({
		...monthly,
		field: result.months.P,
		out: rainfallMonthly,
	})
	const rainfallAnnual = new Float32Array(N)
	for (let m = 0; m < MONTHS; m++)
		for (let r = 0; r < N; r++) rainfallAnnual[r] += rainfallMonthly[m * N + r]
	const ctx = {
		grid,
		surface: result.surface,
		anchorMonths: result.anchorMonths,
		options: { ...orbit },
	}
	const temperature = result.stages.temperature
	const circulation = CLIMATEV2_LOCKED_CIRCULATION.estimate({
		ctx,
		temperature,
	})
	const ocean = CLIMATEV2_LOCKED_OCEAN.estimate({
		ctx,
		circulation,
		temperature,
	})
	return {
		temperatureMonthly,
		rainfallMonthly,
		rainfallAnnual,
		...CLIMATEV2_OUTPUTS.windFields({
			weights,
			circulation,
			fieldSize: grid.size,
		}),
		oceanCurrents: {
			...CLIMATEV2_OUTPUTS.currentFlows({
				weights,
				ocean,
				fieldSize: grid.size,
			}),
			...CLIMATEV2_OUTPUTS.seaSurface({
				anomalyMonthly: zonalSeaAnomaly({ mesh, isLand, temperatureMonthly }),
				isLand,
			}),
		},
	}
}

function applyLocked({
	climate,
	...world
}: ApplyLockedClimateParams): LockedClimateOutputs {
	const N = world.mesh.numRegions
	const cells = computeLocked(world)
	climate.temperature_monthly.set(cells.temperatureMonthly)
	TEMPERATURE_SHARED.recomputeAnnualTemperatureStats({
		temperature_monthly: climate.temperature_monthly,
		temperature_avg: climate.temperature_avg,
		temperature_min: climate.temperature_min,
		temperature_max: climate.temperature_max,
		N,
	})
	return {
		rain: { monthly: cells.rainfallMonthly, annual: cells.rainfallAnnual },
		wind: cells.wind,
		windUMonthly: cells.windUMonthly,
		windVMonthly: cells.windVMonthly,
		oceanCurrents: cells.oceanCurrents,
	}
}

export const CLIMATE_V2 = {
	computeLocked,
	applyLocked,
	computeCellClimate,
	computeForWorld,
	toClimate,
}

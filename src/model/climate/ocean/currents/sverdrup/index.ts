import { COASTAL_BLEED } from "@/model/climate/ocean/coastal-bleed"
import { SVERDRUP_CIRCULATION } from "@/model/climate/ocean/currents/sverdrup/circulation"
import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"
import { SVERDRUP_RASTER } from "@/model/climate/ocean/currents/sverdrup/raster"
import { SVERDRUP_SST_ANOMALY } from "@/model/climate/ocean/currents/sverdrup/sst-anomaly"
import { STOMMEL } from "@/model/climate/ocean/currents/sverdrup/stommel"
import type {
	ComputeSverdrupSSTParams,
	MonthSolve,
	MonthSolveParams,
} from "@/model/climate/ocean/currents/sverdrup/types"
import { MIXED_LAYER } from "@/model/climate/ocean/mixed-layer"
import { RAIN } from "@/model/climate/precipitation/rain"
import type { GenesisOceanCurrents } from "@/model/climate/types"
import { WIND } from "@/model/climate/weather/wind"
import { LANDMARKS } from "@/model/geography/terrain/landmarks"
import { MATH } from "@/model/shared/math/core"
import { UNITS } from "@/model/shared/units"

const MONTHS = 12
const SEA_LEVEL_AIR_DENSITY_KG_M3 = 1.225

// The SST anomaly now feeds a baroclinic term back into the flow (see
// SVERDRUP_CIRCULATION.baroclinic), so flow and anomaly have to be solved as
// a fixed point rather than once each: pass 0 is wind-only, each later pass
// re-solves the flow from the previous pass's anomaly and re-solves the
// anomaly from that flow. One correction pass is what this measures against;
// more bought negligible further movement at 200 Gauss-Seidel sweeps a pass.
const FEEDBACK_PASSES = 2

function solveMonth({
	index,
	tau,
	psi,
	isOcean,
	latDeg,
	lonDeg,
	temperature,
	planet,
	sstSaturationC,
}: MonthSolveParams): MonthSolve {
	let circulation = SVERDRUP_CIRCULATION.surface({
		index,
		tau,
		psi,
		planet,
		sstAnomaly: null,
	})
	let anomaly = SVERDRUP_SST_ANOMALY.solve({
		index,
		circulation,
		temperature,
		isOcean,
		planet,
		upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
	})
	for (let pass = 1; pass < FEEDBACK_PASSES; pass++) {
		circulation = SVERDRUP_CIRCULATION.surface({
			index,
			tau,
			psi,
			planet,
			sstAnomaly: anomaly,
		})
		anomaly = SVERDRUP_SST_ANOMALY.solve({
			index,
			circulation,
			temperature,
			isOcean,
			planet,
			upwelledDeficitC: SVERDRUP_SST_ANOMALY.upwelledDeficitC,
		})
	}
	const sampleOcean = (field: Float32Array) =>
		SVERDRUP_RASTER.sample({
			field,
			mask: index.ocean,
			latDeg,
			lonDeg,
			include: isOcean,
		})
	const sstC = sampleOcean(anomaly)
	const sst = new Float32Array(sstC.length)
	for (let r = 0; r < sst.length; r++)
		sst[r] = MATH.clamp({ value: sstC[r] / sstSaturationC, lo: -1, hi: 1 })
	return {
		sst,
		flowU: sampleOcean(circulation.flow.x),
		flowV: sampleOcean(circulation.flow.y),
	}
}

// Wind-driven surface circulation (Sverdrup gyres with western boundary
// currents, plus Ekman drift) and the SST anomaly it produces by carrying
// water across the background meridional temperature gradient and by Ekman
// upwelling, from each month's wind.
function computeSST({
	mesh,
	climate,
	elevation_km,
	isLand,
	landmarks,
	sstSaturationC,
	params,
}: ComputeSverdrupSSTParams): GenesisOceanCurrents {
	const N = mesh.numRegions
	const isLake = LANDMARKS.regionTypeMask({ landmarks, type: "lake" })
	const isOcean = new Uint8Array(N)
	for (let r = 0; r < N; r++) isOcean[r] = !isLand[r] && !isLake[r] ? 1 : 0
	const { latDeg, lonDeg } = RAIN.getClimateGeometry(mesh)
	const index = SVERDRUP_RASTER.buildIndex({ latDeg, lonDeg, isOcean })
	const planet: SverdrupPlanet = {
		coriolisSign: UNITS.isRetrogradeObliquity(params.obliquity) ? -1 : 1,
		rotationRateRadS: (2 * Math.PI) / (params.hoursPerDay * 3600),
		radiusM: params.planetRadiusKm * 1000,
		airDensityKgM3: SEA_LEVEL_AIR_DENSITY_KG_M3 * (params.pressure ?? 1),
		seawaterDensityKgM3: MIXED_LAYER.seawaterDensityKgM3,
		// Sverdrup gyres need rotation to dominate; on slow rotators they fade
		// out along with the atmosphere's Hadley/Ferrel/polar cells.
		gyreStrength: 1 - WIND.rotationCollapse(params.hoursPerDay),
	}

	const operator = STOMMEL.build({ ocean: index.ocean, planet })
	const sst = new Float32Array(N)
	const flowU = new Float32Array(N)
	const flowV = new Float32Array(N)
	const sstMonthly = new Float32Array(N * MONTHS)
	const flowUMonthly = new Float32Array(N * MONTHS)
	const flowVMonthly = new Float32Array(N * MONTHS)

	// Every month shares the same operator and differs only in its forcing, so
	// the year's wind stress is gathered first and the streamfunction solved in
	// temporal Fourier modes rather than twelve times over.
	const monthlyTau = []
	const monthlyCurl = []
	for (let month = 0; month < MONTHS; month++) {
		const forcing = SVERDRUP_CIRCULATION.forcing({
			index,
			wind: WIND.computeWindVectors({
				mesh,
				climate,
				elevation_km,
				params,
				month,
			}),
			planet,
		})
		monthlyTau.push(forcing.tau)
		monthlyCurl.push(forcing.curl)
	}
	const seasonal = STOMMEL.solveSeasonal({ operator, monthlyCurl, planet })

	for (let month = 0; month < MONTHS; month++) {
		const result = solveMonth({
			index,
			tau: monthlyTau[month],
			psi: seasonal.monthlyPsi[month],
			isOcean,
			latDeg,
			lonDeg,
			temperature: climate.temperature_monthly.subarray(
				month * N,
				(month + 1) * N,
			),
			planet,
			sstSaturationC,
		})
		sstMonthly.set(result.sst, month * N)
		flowUMonthly.set(result.flowU, month * N)
		flowVMonthly.set(result.flowV, month * N)
		for (let r = 0; r < N; r++) {
			sst[r] += result.sst[r] / MONTHS
			flowU[r] += result.flowU[r] / MONTHS
			flowV[r] += result.flowV[r] / MONTHS
		}
	}

	COASTAL_BLEED.fillLand({
		mesh,
		isLand,
		isLake,
		avgEdgeKm: UNITS.meanEdgeLengthKm({
			mesh,
			planetRadiusKm: params.planetRadiusKm,
		}),
		sst,
		sstMonthly,
	})
	return { sst, sstMonthly, flowU, flowV, flowUMonthly, flowVMonthly }
}

export const SVERDRUP_CURRENTS = {
	computeSST,
}

import type {
	ComputeAetFromPetParams,
	ComputeHydrologyFieldsParams,
	ComputeObservedAridityParams,
	FillPetMonthlyHargreavesParams,
	ObservedAridityResult,
	RefreshClimatePetMonthlyParams,
} from "@/model/climate/hydrology/types"
import type { GenesisHydrology } from "@/model/climate/types"

function petMonthHargreaves({
	tas,
	td,
	raWm2,
	dpm,
}: {
	tas: number
	td: number
	raWm2: number
	dpm: number
}): number {
	const raMJ = raWm2 * 0.0864
	// Thermal correction: latent heat of vaporization varies with temperature.
	// From Hargreaves (1975) eq. 3: multiply by 238.8 / (595.5 - 0.55 * T).
	// This factor ≈ 0.41 at typical temperatures and was omitted from the
	// Hargreaves-Samani shorthand, causing ~2.4× overestimation without it.
	const lambda = 595.5 - 0.55 * tas
	const petDay =
		0.0023 * (tas + 17.8) * Math.sqrt(Math.max(2, td)) * raMJ * (238.8 / lambda)
	return Math.max(0, petDay) * dpm
}

function fillPetMonthlyHargreaves({
	temperatureMonthly,
	rangeMonthly,
	insolationMonthly,
	petMonthly,
	dpm,
}: FillPetMonthlyHargreavesParams): void {
	for (let i = 0; i < temperatureMonthly.length; i++) {
		petMonthly[i] = petMonthHargreaves({
			tas: temperatureMonthly[i],
			td: rangeMonthly[i],
			raWm2: insolationMonthly[i],
			dpm,
		})
	}
}

function refreshClimatePetMonthly({
	climate,
	params,
}: RefreshClimatePetMonthlyParams): void {
	fillPetMonthlyHargreaves({
		temperatureMonthly: climate.temperature_monthly,
		rangeMonthly: climate.temperature_monthly_range,
		insolationMonthly: climate.insolation_monthly,
		petMonthly: climate.pet_monthly,
		dpm: (params?.daysPerYear ?? 365) / 12,
	})
}

function computeAetFromPet({
	rain,
	petBuf,
	aetBuf,
}: ComputeAetFromPetParams): void {
	let soil = 250
	for (let iter = 0; iter < 20; iter++) {
		const startSoil = soil
		for (let m = 0; m < 12; m++) {
			const p = rain[m]
			const pe = petBuf[m]
			if (p >= pe) {
				soil = soil + (p - pe)
				if (soil > 500) soil = 500
				aetBuf[m] = pe
			} else {
				const deficit = pe - p
				const soilEvap =
					soil > 250
						? soil < deficit
							? soil
							: deficit
						: deficit * (soil / 250) < soil
							? deficit * (soil / 250)
							: soil
				soil -= soilEvap
				aetBuf[m] = p + soilEvap
			}
		}
		if (Math.abs(soil - startSoil) < 1) break
	}
}

const F_PERC = 0.3

const K_GW = 0.05

function computeHydrologyFields({
	climate,
	rainfall,
	isLand,
}: ComputeHydrologyFieldsParams): GenesisHydrology {
	const N = isLand.length
	const aet_monthly = new Float32Array(12 * N)
	const aridity_monthly = new Float32Array(12 * N)
	const baseflow_monthly = new Float32Array(12 * N)
	const rain = new Float64Array(12)
	const petBuf = new Float64Array(12)
	const aetBuf = new Float64Array(12)
	const landRegions: number[] = []
	for (let r = 0; r < N; r++) {
		if (isLand[r]) landRegions.push(r)
	}

	for (const r of landRegions) {
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			rain[m] = rainfall.monthly[idx]
			petBuf[m] = climate.pet_monthly[idx]
		}
		computeAetFromPet({ rain, petBuf, aetBuf })
		for (let m = 0; m < 12; m++) {
			const idx = m * N + r
			const pet = petBuf[m]
			const aet = aetBuf[m]
			aet_monthly[idx] = aet
			aridity_monthly[idx] = pet > 0 ? aet / pet : 1
		}

		// Spin up groundwater store to cyclostationary state.
		// Recharge = F_PERC × surface runoff each month; release = K_GW × S_gw.
		let gw = 0
		for (let iter = 0; iter < 30; iter++) {
			const startGw = gw
			for (let m = 0; m < 12; m++) {
				const runoff = Math.max(0, rain[m] - aetBuf[m])
				gw += F_PERC * runoff
				gw -= K_GW * gw
			}
			if (Math.abs(gw - startGw) < 0.01) break
		}
		for (let m = 0; m < 12; m++) {
			const runoff = Math.max(0, rain[m] - aetBuf[m])
			gw += F_PERC * runoff
			const baseflow = K_GW * gw
			gw -= baseflow
			baseflow_monthly[m * N + r] = baseflow
		}
	}

	return { aet_monthly, aridity_monthly, baseflow_monthly }
}

function mergeWithModeledFallback(
	real: Float32Array | undefined,
	modeled: Float32Array,
): Float32Array {
	if (!real) return modeled
	const out = new Float32Array(real.length)
	for (let i = 0; i < real.length; i++) {
		const v = real[i]
		out[i] = Number.isFinite(v) ? v : modeled[i]
	}
	return out
}

// Shared by both real-Earth pasta classification (assignEarthPastaClimate)
// and observed humidity (attachObservedEarthHumidity) so "how wet is this
// cell, really" is computed exactly once and agrees between the two. Falls
// back to the modeled value per month/cell wherever the observed raster has
// no coverage, rather than propagating NaN through the water-balance
// iteration for an entire cell.
function computeObservedAridity(
	params: ComputeObservedAridityParams,
): ObservedAridityResult | undefined {
	const {
		isLand,
		realTemperatureMonthly,
		modeledTemperatureMonthly,
		realDtrMonthly,
		modeledDtrMonthly,
		realRainfallMonthly,
		modeledRainfallMonthly,
		insolationMonthly,
		dpm,
	} = params
	if (!realTemperatureMonthly || !realRainfallMonthly) return undefined

	const N = isLand.length
	const temperatureMonthly = mergeWithModeledFallback(
		realTemperatureMonthly,
		modeledTemperatureMonthly,
	)
	const dtrMonthly = mergeWithModeledFallback(realDtrMonthly, modeledDtrMonthly)
	const rainfallMonthly = mergeWithModeledFallback(
		realRainfallMonthly,
		modeledRainfallMonthly,
	)

	const pet_monthly = new Float32Array(12 * N)
	fillPetMonthlyHargreaves({
		temperatureMonthly,
		rangeMonthly: dtrMonthly,
		insolationMonthly,
		petMonthly: pet_monthly,
		dpm,
	})

	const { aet_monthly, aridity_monthly } = computeHydrologyFields({
		climate: { pet_monthly },
		rainfall: { monthly: rainfallMonthly },
		isLand,
	})

	return {
		temperatureMonthly,
		rainfallMonthly,
		dtrMonthly,
		pet_monthly,
		aet_monthly,
		aridity_monthly,
	}
}

export const HYDROLOGY = {
	fillPetMonthlyHargreaves,
	refreshClimatePetMonthly,
	computeAetFromPet,
	computeHydrologyFields,
	computeObservedAridity,
}

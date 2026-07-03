import type {
	GenesisClimate,
	GenesisHydrology,
	GenesisParams,
	GenesisRainfall,
} from ".."

function petMonthHargreaves(
	tas: number,
	td: number,
	raWm2: number,
	dpm: number,
): number {
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

export function fillPetMonthlyHargreaves(
	temperatureMonthly: Float32Array,
	rangeMonthly: Float32Array,
	insolationMonthly: Float32Array,
	petMonthly: Float32Array,
	dpm: number,
): void {
	for (let i = 0; i < temperatureMonthly.length; i++) {
		petMonthly[i] = petMonthHargreaves(
			temperatureMonthly[i],
			rangeMonthly[i],
			insolationMonthly[i],
			dpm,
		)
	}
}

export function refreshClimatePetMonthly(
	climate: Pick<
		GenesisClimate,
		| "temperature_monthly"
		| "temperature_monthly_range"
		| "insolation_monthly"
		| "pet_monthly"
	>,
	params?: Pick<GenesisParams, "daysPerYear">,
): void {
	fillPetMonthlyHargreaves(
		climate.temperature_monthly,
		climate.temperature_monthly_range,
		climate.insolation_monthly,
		climate.pet_monthly,
		params?.daysPerYear ?? 365 / 12,
	)
}

function computeAetFromPet(
	rain: Float64Array,
	petBuf: Float64Array,
	aetBuf: Float64Array,
): void {
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

// Fraction of surface runoff that recharges the groundwater store each month.
const F_PERC = 0.3
// Monthly recession coefficient: fraction of groundwater store released as baseflow.
// Half-life ≈ ln(2) / K_GW ≈ 14 months.
const K_GW = 0.05

export function computeHydrologyFields(
	climate: Pick<GenesisClimate, "pet_monthly">,
	rainfall: Pick<GenesisRainfall, "monthly">,
	isLand: Uint8Array,
): GenesisHydrology {
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
		computeAetFromPet(rain, petBuf, aetBuf)
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

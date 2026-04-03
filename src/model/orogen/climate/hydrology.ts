import type { OrogenClimate, OrogenHydrology, OrogenParams, OrogenRainfall } from "../types"
import { getDaysPerYear } from "../units"

export function petMonth(temp: number, dpm: number): number {
	const v = temp * 5.5 / 30 * dpm
	return v > 0 ? v : 0
}

export function fillPetMonthlyFromTemperature(
	temperatureMonthly: Float32Array,
	petMonthly: Float32Array,
	dpm: number,
): void {
	for (let i = 0; i < temperatureMonthly.length; i++) petMonthly[i] = petMonth(temperatureMonthly[i], dpm)
}

export function refreshClimatePetMonthly(
	climate: Pick<OrogenClimate, "temperature_monthly" | "pet_monthly">,
	params?: Pick<OrogenParams, "daysPerYear">,
): void {
	fillPetMonthlyFromTemperature(
		climate.temperature_monthly,
		climate.pet_monthly,
		getDaysPerYear(params?.daysPerYear) / 12,
	)
}

export function computeAetFromPet(
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
				const soilEvap = soil > 250
					? (soil < deficit ? soil : deficit)
					: (deficit * (soil / 250) < soil ? deficit * (soil / 250) : soil)
				soil -= soilEvap
				aetBuf[m] = p + soilEvap
			}
		}
		if (Math.abs(soil - startSoil) < 1) break
	}
}

export function computeAet(
	temps: Float64Array,
	rain: Float64Array,
	petBuf: Float64Array,
	aetBuf: Float64Array,
	dpm: number,
): void {
	for (let m = 0; m < 12; m++) petBuf[m] = petMonth(temps[m], dpm)
	computeAetFromPet(rain, petBuf, aetBuf)
}

export function computeHydrologyFields(
	climate: Pick<OrogenClimate, "pet_monthly">,
	rainfall: Pick<OrogenRainfall, "monthly">,
	isLand: Uint8Array,
): OrogenHydrology {
	const N = isLand.length
	const aet_monthly = new Float32Array(12 * N)
	const aridity_monthly = new Float32Array(12 * N)
	const rain = new Float64Array(12)
	const petBuf = new Float64Array(12)
	const aetBuf = new Float64Array(12)

	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
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
	}

	return { aet_monthly, aridity_monthly }
}

import { HUMIDITY } from "@/model/climate/precipitation/humidity"
import type {
	CoastalHumiditySources,
	MarineHumidityCache,
	MarineHumidityFields,
	MarineHumidityWorld,
} from "@/model/climate/precipitation/humidity/marine/types"
import { PriorityHeap } from "@/model/shared/min-heap"

const MARINE_HUMIDITY_PERCENT = 80
const COASTAL_BLEND_KM = 300
const MONTHS = 12
const cache = new WeakMap<MarineHumidityWorld["climate"], MarineHumidityCache>()

function coastalSources(world: MarineHumidityWorld): CoastalHumiditySources {
	const { mesh, isLand } = world
	const { numRegions: N, adjOffset, adjList, neighborDist } = mesh
	const region = new Int32Array(N).fill(-1)
	const distanceKm = new Float64Array(N).fill(Infinity)
	const queue = new PriorityHeap<number>()
	for (let r = 0; r < N; r++) {
		if (!isLand[r]) continue
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			if (isLand[adjList[j]]) continue
			region[r] = r
			distanceKm[r] = 0
			queue.push(0, r)
			break
		}
	}
	while (queue.size) {
		const next = queue.pop()!
		const r = next.value
		if (next.key !== distanceKm[r]) continue
		for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
			const neighbor = adjList[j]
			if (isLand[neighbor]) continue
			const edgeKm =
				2 *
				Math.asin(Math.min(1, neighborDist[j] / 2)) *
				world.params.planetRadiusKm
			const distance = next.key + edgeKm
			if (distance >= COASTAL_BLEND_KM || distance >= distanceKm[neighbor])
				continue
			distanceKm[neighbor] = distance
			region[neighbor] = region[r]
			queue.push(distance, neighbor)
		}
	}
	return { region, distanceKm }
}

function fields(world: MarineHumidityWorld): MarineHumidityFields {
	const {
		climate,
		isLand,
		mesh,
		rainfall,
		hydrology,
		oceanDist,
		dtr_annual: dtrAnnual,
		dtr_monthly: dtrMonthly,
	} = world
	const signature = [
		mesh,
		isLand,
		climate.temperature_avg,
		climate.temperature_monthly,
		climate.pet_monthly,
		rainfall?.annual,
		hydrology?.aet_monthly,
		oceanDist,
		dtrAnnual,
		dtrMonthly,
		world.params.planetRadiusKm,
	]
	const saved = cache.get(climate)
	if (saved && signature.every((value, i) => value === saved.signature[i]))
		return saved.fields
	const N = mesh.numRegions
	const annual = new Float32Array(N),
		monthly = new Float32Array(MONTHS * N)
	for (let r = 0; r < N; r++) {
		let annualAridity: number | undefined
		if (isLand[r] && hydrology?.aet_monthly && climate.pet_monthly) {
			let aet = 0,
				pet = 0
			for (let m = 0; m < MONTHS; m++) {
				aet += hydrology.aet_monthly[m * N + r]
				pet += climate.pet_monthly[m * N + r]
			}
			annualAridity = pet > 0 ? aet / pet : 1
		}
		const moisture = {
			annualAridity,
			annualRainfallMm: rainfall?.annual[r],
			distFromOceanKm: oceanDist[r],
		}
		annual[r] = HUMIDITY.relativeHumidityFromTempRange({
			...moisture,
			meanTempC: climate.temperature_avg[r],
			dtrC: dtrAnnual[r],
		})
		for (let m = 0; m < MONTHS; m++) {
			const i = m * N + r
			monthly[i] = HUMIDITY.relativeHumidityFromTempRange({
				...moisture,
				meanTempC: climate.temperature_monthly[i],
				dtrC: dtrMonthly?.[i] ?? dtrAnnual[r],
			})
		}
	}
	const sources = coastalSources(world)
	for (let r = 0; r < N; r++) {
		if (isLand[r]) continue
		const land = sources.region[r]
		const x = Math.min(1, sources.distanceKm[r] / COASTAL_BLEND_KM)
		const landWeight = 1 - x * x * (3 - 2 * x)
		if (annual[r] >= MARINE_HUMIDITY_PERCENT) {
			const landValue = land >= 0 ? annual[land] : MARINE_HUMIDITY_PERCENT
			annual[r] =
				MARINE_HUMIDITY_PERCENT +
				landWeight * (landValue - MARINE_HUMIDITY_PERCENT)
		}
		for (let m = 0; m < MONTHS; m++) {
			const i = m * N + r
			if (monthly[i] < MARINE_HUMIDITY_PERCENT) continue
			const landValue =
				land >= 0 ? monthly[m * N + land] : MARINE_HUMIDITY_PERCENT
			monthly[i] =
				MARINE_HUMIDITY_PERCENT +
				landWeight * (landValue - MARINE_HUMIDITY_PERCENT)
		}
	}
	const result = { annual, monthly }
	cache.set(climate, { signature, fields: result })
	return result
}

export const HUMIDITY_MARINE = { fields }

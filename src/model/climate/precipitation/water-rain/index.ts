import type {
	EdgeGeometry,
	EvaporationRateParams,
	RainoutParams,
	SaturationVaporPressureParams,
	SaturationWaterDensityParams,
	WaterRainInputs,
	WaterRainParameters,
	WaterRainResult,
} from "@/model/climate/precipitation/water-rain/types"

const MONTHS = 12
const SECONDS_PER_DAY = 86_400
const UNIVERSAL_GAS_CONSTANT = 8.314462618
const WATER_MOLAR_MASS_KG_MOL = 0.01801528
const WATER_TRIPLE_POINT_PA = 611.657
const MIN_WEIGHT = 1e-9
const PORTABLE_PRIOR_PARAMETERS: WaterRainParameters = Object.freeze({
	relativeHumidity: 0.75,
	exchangeCoefficient: 0.0012,
	landRainoutLengthKm: 2500,
	oceanRainoutLengthKm: 15_000,
	crosswindFraction: 0.15,
	coolingEfficiency: 0.3,
	orographicEfficiency: 0.35,
	orographicRiseKm: 1,
	convergenceEfficiency: 0.15,
	landfallFraction: 0.05,
	remainingMoistureTolerance: 0.001,
	maxTransportSteps: 80,
})

function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value))
}

function saturationVaporPressurePa({
	temperatureC,
	freezingPointC,
}: SaturationVaporPressureParams): number {
	if (temperatureC >= freezingPointC) {
		return (
			611.21 *
			Math.exp(
				(18.678 - temperatureC / 234.5) *
					(temperatureC / (257.14 + temperatureC)),
			)
		)
	}
	return (
		611.15 *
		Math.exp(
			(23.036 - temperatureC / 333.7) *
				(temperatureC / (279.82 + temperatureC)),
		)
	)
}

function saturationWaterDensityKgM3({
	temperatureC,
	freezingPointC,
}: SaturationWaterDensityParams): number {
	const temperatureK = Math.max(1, temperatureC + 273.15)
	return (
		(saturationVaporPressurePa({ temperatureC, freezingPointC }) *
			WATER_MOLAR_MASS_KG_MOL) /
		(UNIVERSAL_GAS_CONSTANT * temperatureK)
	)
}

function evaporationRateMmDay({
	airTemperatureC,
	seaSurfaceTemperatureC,
	windSpeedMs,
	permanentWater,
	planet,
	parameters,
}: EvaporationRateParams): number {
	if (!permanentWater || planet.surfacePressurePa <= WATER_TRIPLE_POINT_PA)
		return 0
	const liquidFraction = clamp01(
		(seaSurfaceTemperatureC - (planet.freezingPointC - 1)) / 2,
	)
	if (liquidFraction <= 0) return 0
	const surfaceDensity = saturationWaterDensityKgM3({
		temperatureC: seaSurfaceTemperatureC,
		freezingPointC: planet.freezingPointC,
	})
	const airDensity = saturationWaterDensityKgM3({
		temperatureC: airTemperatureC,
		freezingPointC: planet.freezingPointC,
	})
	const vaporDeficit = Math.max(
		0,
		surfaceDensity - parameters.relativeHumidity * airDensity,
	)
	return (
		parameters.exchangeCoefficient *
		Math.max(0.1, windSpeedMs) *
		vaporDeficit *
		SECONDS_PER_DAY *
		liquidFraction
	)
}

function buildEdgeGeometry(inputs: WaterRainInputs): EdgeGeometry {
	const { mesh, planet } = inputs
	let edgeCount = 0
	for (let side = 0; side < mesh.numSides; side++) {
		const opposite = mesh.halfedges[side]
		if (opposite >= 0 && side < opposite) edgeCount++
	}
	const from = new Int32Array(edgeCount)
	const to = new Int32Array(edgeCount)
	const lengthKm = new Float32Array(edgeCount)
	const fromEast = new Float32Array(edgeCount)
	const fromNorth = new Float32Array(edgeCount)
	const toEast = new Float32Array(edgeCount)
	const toNorth = new Float32Array(edgeCount)
	let edge = 0
	for (let side = 0; side < mesh.numSides; side++) {
		const opposite = mesh.halfedges[side]
		if (opposite < 0 || side >= opposite) continue
		const a = mesh.s_begin_r[side]
		const b = mesh.s_end_r[side]
		const ax = mesh.r_xyz[3 * a]
		const ay = mesh.r_xyz[3 * a + 1]
		const az = mesh.r_xyz[3 * a + 2]
		const bx = mesh.r_xyz[3 * b]
		const by = mesh.r_xyz[3 * b + 1]
		const bz = mesh.r_xyz[3 * b + 2]
		const dot = Math.max(-1, Math.min(1, ax * bx + ay * by + az * bz))
		const tangentScale = Math.max(1e-9, Math.sqrt(1 - dot * dot))
		const atx = (bx - dot * ax) / tangentScale
		const aty = (by - dot * ay) / tangentScale
		const atz = (bz - dot * az) / tangentScale
		const btx = -(ax - dot * bx) / tangentScale
		const bty = -(ay - dot * by) / tangentScale
		const btz = -(az - dot * bz) / tangentScale
		const aLonNorm = Math.max(1e-9, Math.hypot(ax, ay))
		const bLonNorm = Math.max(1e-9, Math.hypot(bx, by))
		const aEastX = -ay / aLonNorm
		const aEastY = ax / aLonNorm
		const bEastX = -by / bLonNorm
		const bEastY = bx / bLonNorm
		const aNorthX = (-az * ax) / aLonNorm
		const aNorthY = (-az * ay) / aLonNorm
		const aNorthZ = aLonNorm
		const bNorthX = (-bz * bx) / bLonNorm
		const bNorthY = (-bz * by) / bLonNorm
		const bNorthZ = bLonNorm
		from[edge] = a
		to[edge] = b
		lengthKm[edge] = Math.acos(dot) * planet.radiusKm
		fromEast[edge] = atx * aEastX + aty * aEastY
		fromNorth[edge] = atx * aNorthX + aty * aNorthY + atz * aNorthZ
		toEast[edge] = btx * bEastX + bty * bEastY
		toNorth[edge] = btx * bNorthX + bty * bNorthY + btz * bNorthZ
		edge++
	}
	return { from, to, lengthKm, fromEast, fromNorth, toEast, toNorth }
}

function rainoutFraction({
	source,
	destination,
	monthOffset,
	edgeLengthKm,
	convergence,
	capacityMonthlyPa,
	forcing,
	parameters,
}: RainoutParams): number {
	const sourceIndex = monthOffset + source
	const destinationIndex = monthOffset + destination
	const lengthScaleKm = forcing.permanentWater[destination]
		? parameters.oceanRainoutLengthKm
		: parameters.landRainoutLengthKm
	const distanceFraction = 1 - Math.exp(-edgeLengthKm / lengthScaleKm)
	const coolingFraction =
		parameters.coolingEfficiency *
		Math.max(
			0,
			1 - capacityMonthlyPa[destinationIndex] / capacityMonthlyPa[sourceIndex],
		)
	const climbKm = Math.max(
		0,
		forcing.elevationKm[destination] - forcing.elevationKm[source],
	)
	const orographicFraction =
		parameters.orographicEfficiency *
		clamp01(climbKm / parameters.orographicRiseKm)
	const convergenceFraction =
		parameters.convergenceEfficiency * convergence[destination]
	const landfallFraction =
		forcing.permanentWater[source] && !forcing.permanentWater[destination]
			? parameters.landfallFraction
			: 0
	return clamp01(
		1 -
			(1 - distanceFraction) *
				(1 - clamp01(coolingFraction)) *
				(1 - clamp01(orographicFraction)) *
				(1 - clamp01(convergenceFraction)) *
				(1 - landfallFraction),
	)
}

function validateInputs(inputs: WaterRainInputs): void {
	const { mesh, planet, forcing, parameters } = inputs
	const N = mesh.numRegions
	const monthlyLength = MONTHS * N
	if (planet.monthDays.length !== MONTHS)
		throw new Error("water-rain requires twelve month lengths")
	if (planet.monthDays.some((days) => !Number.isFinite(days) || days <= 0))
		throw new Error("water-rain requires positive finite month lengths")
	if (forcing.elevationKm.length !== N || forcing.permanentWater.length !== N)
		throw new Error("water-rain static fields do not match the mesh")
	for (const field of [
		forcing.airTemperatureMonthlyC,
		forcing.seaSurfaceTemperatureMonthlyC,
		forcing.windUMonthlyMs,
		forcing.windVMonthlyMs,
	]) {
		if (field.length !== monthlyLength)
			throw new Error("water-rain monthly fields do not match the mesh")
	}
	if (
		planet.radiusKm <= 0 ||
		planet.surfacePressurePa <= 0 ||
		parameters.relativeHumidity < 0 ||
		parameters.relativeHumidity > 1 ||
		parameters.exchangeCoefficient < 0 ||
		parameters.landRainoutLengthKm <= 0 ||
		parameters.oceanRainoutLengthKm <= 0 ||
		parameters.crosswindFraction < 0 ||
		parameters.crosswindFraction > 1 ||
		parameters.coolingEfficiency < 0 ||
		parameters.orographicEfficiency < 0 ||
		parameters.orographicRiseKm <= 0 ||
		parameters.convergenceEfficiency < 0 ||
		parameters.landfallFraction < 0 ||
		parameters.landfallFraction > 1 ||
		parameters.remainingMoistureTolerance <= 0 ||
		parameters.maxTransportSteps < 1
	) {
		throw new Error("water-rain requires positive physical and routing values")
	}
}

function simulate(inputs: WaterRainInputs): WaterRainResult {
	validateInputs(inputs)
	const { mesh, planet, forcing, parameters } = inputs
	const N = mesh.numRegions
	const monthlyLength = MONTHS * N
	const edges = buildEdgeGeometry(inputs)
	const edgeCount = edges.from.length
	const areasM2 = new Float64Array(N)
	const radiusM = planet.radiusKm * 1000
	for (let r = 0; r < N; r++)
		areasM2[r] = mesh.regionArea[r] * radiusM * radiusM
	const capacityMonthlyPa = new Float32Array(monthlyLength)
	const evaporationMonthlyMm = new Float32Array(monthlyLength)
	for (let index = 0; index < monthlyLength; index++) {
		const region = index % N
		capacityMonthlyPa[index] = Math.min(
			planet.surfacePressurePa,
			saturationVaporPressurePa({
				temperatureC: forcing.airTemperatureMonthlyC[index],
				freezingPointC: planet.freezingPointC,
			}),
		)
		evaporationMonthlyMm[index] =
			evaporationRateMmDay({
				airTemperatureC: forcing.airTemperatureMonthlyC[index],
				seaSurfaceTemperatureC: forcing.seaSurfaceTemperatureMonthlyC[index],
				windSpeedMs: Math.hypot(
					forcing.windUMonthlyMs[index],
					forcing.windVMonthlyMs[index],
				),
				permanentWater: forcing.permanentWater[region] === 1,
				planet,
				parameters,
			}) * planet.monthDays[Math.floor(index / N)]
	}

	const precipitationMass = new Float64Array(N)
	const mobileMass = new Float64Array(N)
	const nextMass = new Float64Array(N)
	const outgoingWeight = new Float64Array(N)
	const incomingWeight = new Float64Array(N)
	const convergence = new Float32Array(N)
	const fromWeight = new Float32Array(edgeCount)
	const toWeight = new Float32Array(edgeCount)
	const precipitationMonthlyMm = new Float32Array(monthlyLength)
	const remainingMoistureMonthlyMm = new Float32Array(monthlyLength)
	const remainingMoistureFraction = new Float64Array(MONTHS)
	const waterBudgetResidualFraction = new Float64Array(MONTHS)
	const transportSteps = new Uint16Array(MONTHS)
	for (let month = 0; month < MONTHS; month++) {
		const monthOffset = month * N
		precipitationMass.fill(0)
		mobileMass.fill(0)
		outgoingWeight.fill(0)
		incomingWeight.fill(0)
		let sourceMass = 0
		for (let r = 0; r < N; r++) {
			const mass = evaporationMonthlyMm[monthOffset + r] * areasM2[r]
			mobileMass[r] = mass
			sourceMass += mass
		}
		for (let edge = 0; edge < edgeCount; edge++) {
			const a = edges.from[edge]
			const b = edges.to[edge]
			const aIndex = monthOffset + a
			const bIndex = monthOffset + b
			const aWindSpeed = Math.hypot(
				forcing.windUMonthlyMs[aIndex],
				forcing.windVMonthlyMs[aIndex],
			)
			const bWindSpeed = Math.hypot(
				forcing.windUMonthlyMs[bIndex],
				forcing.windVMonthlyMs[bIndex],
			)
			fromWeight[edge] = Math.max(
				0,
				forcing.windUMonthlyMs[aIndex] * edges.fromEast[edge] +
					forcing.windVMonthlyMs[aIndex] * edges.fromNorth[edge] +
					parameters.crosswindFraction * aWindSpeed,
			)
			toWeight[edge] = Math.max(
				0,
				-(
					forcing.windUMonthlyMs[bIndex] * edges.toEast[edge] +
					forcing.windVMonthlyMs[bIndex] * edges.toNorth[edge]
				) +
					parameters.crosswindFraction * bWindSpeed,
			)
			outgoingWeight[a] += fromWeight[edge]
			outgoingWeight[b] += toWeight[edge]
		}
		for (let edge = 0; edge < edgeCount; edge++) {
			const a = edges.from[edge]
			const b = edges.to[edge]
			if (outgoingWeight[a] > MIN_WEIGHT)
				incomingWeight[b] += fromWeight[edge] / outgoingWeight[a]
			if (outgoingWeight[b] > MIN_WEIGHT)
				incomingWeight[a] += toWeight[edge] / outgoingWeight[b]
		}
		for (let r = 0; r < N; r++)
			convergence[r] = clamp01((incomingWeight[r] - 1) / 2)

		let remainingMass = sourceMass
		for (let step = 0; step < parameters.maxTransportSteps; step++) {
			nextMass.fill(0)
			for (let edge = 0; edge < edgeCount; edge++) {
				const a = edges.from[edge]
				const b = edges.to[edge]
				if (outgoingWeight[a] > MIN_WEIGHT) {
					const routed = mobileMass[a] * (fromWeight[edge] / outgoingWeight[a])
					const rainout = rainoutFraction({
						source: a,
						destination: b,
						monthOffset,
						edgeLengthKm: edges.lengthKm[edge],
						convergence,
						capacityMonthlyPa,
						forcing,
						parameters,
					})
					precipitationMass[b] += routed * rainout
					nextMass[b] += routed * (1 - rainout)
				}
				if (outgoingWeight[b] > MIN_WEIGHT) {
					const routed = mobileMass[b] * (toWeight[edge] / outgoingWeight[b])
					const rainout = rainoutFraction({
						source: b,
						destination: a,
						monthOffset,
						edgeLengthKm: edges.lengthKm[edge],
						convergence,
						capacityMonthlyPa,
						forcing,
						parameters,
					})
					precipitationMass[a] += routed * rainout
					nextMass[a] += routed * (1 - rainout)
				}
			}
			for (let r = 0; r < N; r++) {
				if (outgoingWeight[r] <= MIN_WEIGHT) nextMass[r] += mobileMass[r]
			}
			remainingMass = 0
			for (let r = 0; r < N; r++) {
				mobileMass[r] = nextMass[r]
				remainingMass += nextMass[r]
			}
			transportSteps[month] = step + 1
			if (remainingMass <= sourceMass * parameters.remainingMoistureTolerance)
				break
		}
		let precipitationTotalMass = 0
		for (let r = 0; r < N; r++) {
			const index = monthOffset + r
			precipitationMonthlyMm[index] = precipitationMass[r] / areasM2[r]
			remainingMoistureMonthlyMm[index] = mobileMass[r] / areasM2[r]
			precipitationTotalMass += precipitationMass[r]
		}
		remainingMoistureFraction[month] = remainingMass / Math.max(1, sourceMass)
		waterBudgetResidualFraction[month] =
			(sourceMass - precipitationTotalMass - remainingMass) /
			Math.max(1, sourceMass)
	}

	const rainMonthlyMm = new Float32Array(monthlyLength)
	const snowMonthlyMmWaterEquivalent = new Float32Array(monthlyLength)
	const annualPrecipitationMm = new Float32Array(N)
	for (let index = 0; index < monthlyLength; index++) {
		const region = index % N
		const rainFraction = clamp01(
			(forcing.airTemperatureMonthlyC[index] - (planet.freezingPointC - 1)) / 2,
		)
		rainMonthlyMm[index] = precipitationMonthlyMm[index] * rainFraction
		snowMonthlyMmWaterEquivalent[index] =
			precipitationMonthlyMm[index] - rainMonthlyMm[index]
		annualPrecipitationMm[region] += precipitationMonthlyMm[index]
	}

	return {
		precipitationMonthlyMm,
		rainMonthlyMm,
		snowMonthlyMmWaterEquivalent,
		evaporationMonthlyMm,
		remainingMoistureMonthlyMm,
		annualPrecipitationMm,
		waterBudgetResidualFraction,
		remainingMoistureFraction,
		transportSteps,
	}
}

export const WATER_RAIN = { PORTABLE_PRIOR_PARAMETERS, simulate }

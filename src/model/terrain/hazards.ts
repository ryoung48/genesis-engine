import type {
	BoundaryInfo,
	DistanceFields,
	GenesisHazards,
	SphereMesh,
} from ".."
import { clamp01, smoothstep } from "../shared"
import type { PropagateInfluenceParams, ComputeHazardsParams } from "./types"

function gradualFalloff(distance: number, reach: number, power = 1.35): number {
	if (!Number.isFinite(distance)) return 0
	return Math.pow(1 - clamp01(distance / reach), power)
}

function percentile(values: number[], q: number): number {
	if (values.length === 0) return 0
	values.sort((a, b) => a - b)
	const index = Math.min(
		values.length - 1,
		Math.max(0, Math.floor(q * (values.length - 1))),
	)
	return values[index]
}

function normalizeField(
	values: Float32Array,
	percentileQ: number,
): Float32Array {
	const samples: number[] = []
	for (let i = 0; i < values.length; i++) {
		const value = values[i]
		if (Number.isFinite(value) && value > 1e-5) samples.push(value)
	}
	const scale = percentile(samples, percentileQ)
	const normalized = new Float32Array(values.length)
	if (scale <= 1e-6) return normalized
	const invScale = 1 / scale
	for (let i = 0; i < values.length; i++) {
		normalized[i] = clamp01(values[i] * invScale)
	}
	return normalized
}

function propagateInfluence({
	mesh,
	seeds,
	base,
	decay,
	minValue,
}: PropagateInfluenceParams): Float32Array {
	const out = new Float32Array(base)
	const queue = [...seeds]
	const { adjOffset, adjList } = mesh
	let head = 0
	while (head < queue.length) {
		const r = queue[head++]
		const propagated = out[r] * decay
		if (propagated <= minValue) continue
		for (let j = adjOffset[r], jEnd = adjOffset[r + 1]; j < jEnd; j++) {
			const nb = adjList[j]
			if (propagated > out[nb] + 1e-4) {
				out[nb] = propagated
				queue.push(nb)
			}
		}
	}
	return out
}

function thresholdField(source: Float32Array, minValue: number): Float32Array {
	const out = new Float32Array(source.length)
	for (let i = 0; i < source.length; i++) {
		if (source[i] >= minValue) out[i] = source[i]
	}
	return out
}

export function computeHazards({
	mesh,
	boundary,
	distFields,
	elevationKm,
	isLand,
	hotspot,
}: ComputeHazardsParams): GenesisHazards {
	const N = elevationKm.length
	const earthquake = new Float32Array(N)
	const volcano = new Float32Array(N)
	const danger = new Float32Array(N)

	const stressNorm = normalizeField(boundary.r_stress, 0.97)
	const hotspotNorm = hotspot
		? normalizeField(hotspot, 0.95)
		: new Float32Array(N)

	const tectonicReach = Math.max(7, Math.round(16 * Math.sqrt(N / 10000)))
	const coastalReach = Math.max(5, Math.round(12 * Math.sqrt(N / 10000)))
	const volcanicReach = Math.max(4, Math.round(8 * Math.sqrt(N / 10000)))
	const quakeSeedBase = new Float32Array(N)
	const quakeSeeds: number[] = []
	const boundaryStressValues: number[] = []

	for (let r = 0; r < N; r++) {
		if (boundary.r_boundaryType[r] !== 0 && stressNorm[r] > 0.01) {
			boundaryStressValues.push(stressNorm[r])
		}
	}
	const boundaryStressCutoff = Math.max(
		0.3,
		percentile(boundaryStressValues, 0.82),
	)

	for (let r = 0; r < N; r++) {
		const type = boundary.r_boundaryType[r]
		if (type === 0) continue
		const stress = stressNorm[r]
		const hasOcean = boundary.r_hasOcean[r] === 1
		const bothOcean = boundary.r_bothOcean[r] === 1
		const isStrongBoundary =
			type === 1
				? stress >= boundaryStressCutoff * 0.96
				: type === 3
					? stress >= boundaryStressCutoff * 1.18
					: bothOcean
						? stress >= boundaryStressCutoff * 2.3
						: stress >= boundaryStressCutoff * 1.45
		let seed = 0
		if (isStrongBoundary) {
			if (type === 1) seed = 0.42 + stress * 0.5
			else if (type === 3) seed = 0.3 + stress * 0.42
			else if (type === 2)
				seed = (bothOcean ? 0.08 : 0.18) + stress * (bothOcean ? 0.16 : 0.24)
		}
		if (hasOcean || bothOcean) seed *= 1.02
		if (seed > 0.2) {
			quakeSeedBase[r] = seed
			quakeSeeds.push(r)
		}
	}

	const quakeBelt = propagateInfluence({
		mesh,
		seeds: quakeSeeds,
		base: quakeSeedBase,
		decay: 0.84,
		minValue: 0.09,
	})

	for (let r = 0; r < N; r++) {
		const type = boundary.r_boundaryType[r]
		const subduct = clamp01(boundary.r_subductFactor[r])
		const stress = stressNorm[r]
		const localStress = smoothstep(0.06, 0.5, stress)
		const mountainProximity = gradualFalloff(
			distFields.distMountain[r],
			tectonicReach,
			0.9,
		)
		const coastalBoundaryProximity = gradualFalloff(
			distFields.distCoastline[r],
			coastalReach,
			1.05,
		)
		const volcanicProximity = Number.isFinite(distFields.distMountain[r])
			? 1 - smoothstep(0, volcanicReach, distFields.distMountain[r])
			: 0
		const hotspotScore = hotspotNorm[r]
		const relief = smoothstep(0.6, 4.5, Math.max(0, elevationKm[r]))
		const land = isLand[r] ? 1 : 0
		const activeBoundary = type === 1 || type === 2 || type === 3
		const activeMargin =
			activeBoundary &&
			(boundary.r_hasOcean[r] === 1 || boundary.r_bothOcean[r] === 1)
		const mountainousVolcanicZone = mountainProximity >= 0.2 && relief >= 0.12
		const hotspotVolcanicZone = hotspotScore >= 0.1

		let quake = Math.max(
			localStress * 0.72,
			quakeBelt[r],
			quakeSeedBase[r] * 0.95,
			mountainProximity * (0.05 + 0.22 * localStress),
			coastalBoundaryProximity *
				(activeMargin ? 0.015 + 0.1 * localStress : 0.002 + 0.02 * localStress),
		)
		if (quakeSeedBase[r] > 0) {
			if (type === 1) quake = Math.max(quake, 0.12 + localStress * 0.66)
			else if (type === 2) quake = Math.max(quake, 0.01 + localStress * 0.28)
			else if (type === 3) quake = Math.max(quake, 0.05 + localStress * 0.42)
		}
		if (!activeBoundary && coastalBoundaryProximity > 0)
			quake = Math.min(
				quake,
				Math.max(quakeBelt[r], coastalBoundaryProximity * 0.06),
			)
		if (localStress < 0.12 && quakeBelt[r] < 0.15 && mountainProximity < 0.12)
			quake *= 0.18
		if (type === 2 && boundary.r_bothOcean[r] === 1 && localStress < 0.24)
			quake *= 0.3
		if (type === 3 && localStress < 0.16) quake *= 0.55
		if (!land && !boundary.r_hasOcean[r]) quake *= 0.55

		let volc = hotspotScore * 0.95
		if (type === 1) {
			const arcFactor = boundary.r_hasOcean[r] ? 1 - subduct * 0.55 : 0.45
			volc = Math.max(
				volc,
				(0.16 + 0.5 * localStress + 0.16 * relief) *
					volcanicProximity *
					arcFactor,
			)
		} else if (type === 2) {
			const ridgeFactor = boundary.r_bothOcean[r] ? 0.65 : 0.4
			volc = Math.max(
				volc,
				(0.06 + 0.46 * localStress) * volcanicProximity * ridgeFactor,
			)
		}
		volc = Math.max(volc, volcanicProximity * relief * 0.18)
		if (hotspotScore < 0.07 && volcanicProximity < 0.1) volc *= 0.3
		if (!(mountainousVolcanicZone || hotspotVolcanicZone)) {
			volc = 0
		}

		earthquake[r] = clamp01(quake)
		volcano[r] = clamp01(volc)
	}

	const strongEarthquakeSeeds = thresholdField(earthquake, 0.8)
	const strongSeedList: number[] = []
	for (let r = 0; r < N; r++) {
		if (strongEarthquakeSeeds[r] > 0) strongSeedList.push(r)
	}
	const diffusedEarthquake = propagateInfluence({
		mesh,
		seeds: strongSeedList,
		base: strongEarthquakeSeeds,
		decay: 0.78,
		minValue: 0.24,
	})
	for (let r = 0; r < N; r++) {
		earthquake[r] = diffusedEarthquake[r]
		danger[r] = clamp01(
			Math.max(
				earthquake[r] * 0.98,
				volcano[r],
				earthquake[r] * 0.45 + volcano[r] * 0.55,
			),
		)
	}

	return { earthquake, volcano, danger }
}

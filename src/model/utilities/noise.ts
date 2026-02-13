import Alea from "alea"
import { scaleLinear } from "d3"
import { createNoise3D, NoiseFunction3D } from "simplex-noise"
import { MATH } from "./math"
import { Point } from "./points/types"

export interface NoiseParameters {
	octaves: number
	frequency: number
	persistence: number
	distributionGroups?: Array<{
		size: number // Percentage of values in this group (0-1)
		range: [number, number] // Target range for these values [min, max]
	}>
}

class Simplex {
	protected params: NoiseParameters
	protected n: NoiseFunction3D
	constructor(params: NoiseParameters) {
		this.params = params
		this.n = createNoise3D(Alea(window.world.id))
	}
	protected noise3d(i: number, j: number, k: number) {
		const { octaves, frequency, persistence } = this.params
		const amplitudes = Array.from({ length: octaves }, (_, octave) =>
			Math.pow(persistence, octave),
		)
		let [f, maxValue, res] = [frequency, 0, 0]
		for (let octave = 1; octave <= octaves; octave++) {
			const n = this.n(i * f, j * f, k * f)
			res += n * amplitudes[octave - 1]
			maxValue += amplitudes[octave - 1]
			f *= 2
		}
		return res / maxValue
	}
	public sphere(points: Point[]) {
		const data: number[] = []
		let [high, low] = [-Infinity, Infinity]
		for (const { x: lon, y: lat } of points) {
			const latRadians = MATH.conversion.angles.radians(lat)
			const lonRadians = MATH.conversion.angles.radians(lon - 180)
			const x = Math.cos(latRadians) * Math.cos(lonRadians)
			const y = Math.cos(latRadians) * Math.sin(lonRadians)
			const z = Math.sin(latRadians)
			const val = this.noise3d(x, y, z)
			data.push(val)
			high = val > high ? val : high
			low = val < low ? val : low
		}
		return [data, high, low] as const
	}
	public continents(points: Point[]) {
		const [data, high, low] = this.sphere(points)
		const scaleFn = scaleLinear().domain([low, high]).range([0, 1])
		for (const i in data) {
			data[i] = scaleFn(Math.abs(data[i])) ** 6
		}
		return data
	}
	public chaos(points: Point[]) {
		const [data] = this.sphere(points)
		const high = data.reduce(
			(acc, curr) => Math.max(acc, Math.abs(curr)),
			-Infinity,
		)
		const low = data.reduce(
			(acc, curr) => Math.min(acc, Math.abs(curr)),
			Infinity,
		)
		for (const i in data) {
			data[i] = MATH.scale([low, high], [0, 1], Math.abs(data[i]))
		}
		return data
	}
}

const _cache: Record<string, Simplex> = {}

export const SIMPLEX = {
	continents: (points: Point[], params: NoiseParameters) => {
		const key = JSON.stringify(params)
		if (!_cache[key]) _cache[key] = new Simplex(params)
		return _cache[key].continents(points)
	},
	chaos: (points: Point[], params: NoiseParameters) => {
		const key = JSON.stringify(params)
		if (!_cache[key]) _cache[key] = new Simplex(params)
		return _cache[key].chaos(points)
	},
	sphere: (points: Point[], params: NoiseParameters) => {
		const key = JSON.stringify(params)
		if (!_cache[key]) _cache[key] = new Simplex(params)
		return _cache[key].sphere(points)
	},
}

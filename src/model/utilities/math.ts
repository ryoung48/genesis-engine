import { geoDistance, range, scaleLinear } from "d3"
import { WeightedDistribution } from "./dice/types"

export const MATH = {
	buildDistribution: <T>(
		map: WeightedDistribution<T>,
		qty = 1,
	): WeightedDistribution<T> => {
		const total = map.reduce((sum, { w }) => sum + w, 0)
		return map.map(({ w, v }) => ({
			v,
			w: total === 0 ? 0 : (w / total) * qty,
		}))
	},
	conversion: {
		angles: {
			degrees: (rad: number) => rad * (180 / Math.PI),
			radians: (deg: number) => deg * (Math.PI / 180),
		},
		area: {
			sqMi: {
				sqKm: (sqMi: number) => sqMi * 2.59,
			},
		},
		distance: {
			feet: {
				km: (feet: number) => feet / 3281,
			},
			km: {
				miles: (km: number) => km / 1.609,
			},
			miles: {
				km: (miles: number) => miles * 1.609,
			},
		},
		height: {
			mm: {
				in: (mm: number) => mm / 25.4,
			},
		},
		temperature: {
			celsius: {
				fahrenheit: (celsius: number) => (celsius * 9) / 5 + 32,
			},
			fahrenheit: {
				celsius: (fahrenheit: number) => ((fahrenheit - 32) * 5) / 9,
			},
			kelvin: {
				celsius: (kelvin: number) => kelvin - 273.15,
			},
		},
	},
	distance: {
		geo: (p1: [number, number], p2: [number, number]) => {
			return geoDistance(p1, p2)
		},
		geoCheap: ([x1, y1]: number[], [x2, y2]: number[]) => {
			const lat1 = MATH.conversion.angles.radians(y1)
			const lon1 = MATH.conversion.angles.radians(x1)
			const lat2 = MATH.conversion.angles.radians(y2)
			const lon2 = MATH.conversion.angles.radians(x2)
			const x = (lon2 - lon1) * Math.cos((lat1 + lat2) / 2)
			const y = lat2 - lat1
			return Math.sqrt(x * x + y * y)
		},
	},
	normalize: (a: number[]) => {
		const total = a.reduce((sum, i) => sum + i, 0)
		return a.map((i) => i / total)
	},
	scale: (domain: number[], range: number[], v: number) => {
		const scaleFn = scaleLinear().domain(domain).range(range)
		return scaleFn(v)
	},
	scaleDiscrete: (count: number) => range(count).map((i) => i / (count - 1)),
	smoothstep: (min: number, max: number, value: number) => {
		const x = Math.max(0, Math.min(1, (value - min) / (max - min)))
		return x * x * (3 - 2 * x)
	},
	interpolation: {
		cosine: {
			interp: (y1: number, y2: number, mu: number): number => {
				const mu2 = (1 - Math.cos(mu * Math.PI)) / 2
				return y1 * (1 - mu2) + y2 * mu2
			},
			create: (domain: number[], range: number[]): ((_x: number) => number) => {
				return (x: number): number => {
					if (x <= domain[0]) return range[0]
					if (x >= domain[domain.length - 1]) return range[range.length - 1]

					for (let i = 0; i < domain.length - 1; i++) {
						const x0 = domain[i]
						const x1 = domain[i + 1]
						if (x >= x0 && x <= x1) {
							const mu = (x - x0) / (x1 - x0)
							return MATH.interpolation.cosine.interp(
								range[i],
								range[i + 1],
								mu,
							)
						}
					}
				}
			},
		},
	},
}

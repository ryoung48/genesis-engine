import { Point2D } from "@/model/society/script/runegen/point2d"

export class Chaikin {
	static render(
		points: Point2D[],
		closed: boolean,
		order = 1,
		exclude?: number[],
	): Point2D[] {
		let result = points

		const lerp = (p1: Point2D, p2: Point2D, ratio: number): Point2D =>
			new Point2D(p1.x + ratio * (p2.x - p1.x), p1.y + ratio * (p2.y - p1.y))

		for (let iter = 0; iter < order; iter++) {
			const n = result.length
			if (n === 0) {
				return result
			}

			const next: Point2D[] = []
			for (let i = 1; i < n - 1; i++) {
				const point = result[i]
				if (!exclude || exclude.indexOf(i) === -1) {
					next.push(lerp(point, result[i - 1], 0.25))
					next.push(lerp(point, result[i + 1], 0.25))
				} else {
					next.push(point)
				}
			}

			if (closed) {
				const last = result[n - 1]
				if (!exclude || exclude.indexOf(n - 1) === -1) {
					next.push(lerp(last, result[n - 2], 0.25))
					next.push(lerp(last, result[0], 0.25))
				} else {
					next.push(last)
				}

				const first = result[0]
				if (!exclude || exclude.indexOf(0) === -1) {
					next.push(lerp(first, result[n - 1], 0.25))
					next.push(lerp(first, result[1], 0.25))
				} else {
					next.push(first)
				}
			} else {
				next.unshift(result[0])
				next.push(result[n - 1])
			}

			result = next
		}

		return result
	}
}

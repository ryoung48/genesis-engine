import { geoInterpolate, range } from "d3"

import { MATH } from "../math"
import { Directions, Point } from "./types"

export const POINT = {
	bearing: {
		geo: (ref: Point, origin: Point) => {
			const lat1 = MATH.conversion.angles.radians(ref.y)
			const lon1 = MATH.conversion.angles.radians(ref.x)
			const lat2 = MATH.conversion.angles.radians(origin.y)
			const lon2 = MATH.conversion.angles.radians(origin.x)
			const deltaLon = lon2 - lon1
			const bearing = Math.atan2(
				Math.sin(deltaLon) * Math.cos(lat2),
				Math.cos(lat1) * Math.sin(lat2) -
					Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon),
			)
			return (MATH.conversion.angles.degrees(bearing) + 360) % 360
		},
	},
	direction: {
		geo: (p1: Point, p2: Point): Directions => {
			const deg = POINT.bearing.geo(p1, p2)
			if (deg > 45 && deg <= 135) return "E"
			else if (deg > 135 && deg <= 225) return "S"
			else if (deg > 225 && deg <= 315) return "W"
			return "N"
		},
	},
	distance: {
		geo: (params: { points: [Point, Point]; radius?: number }) => {
			const { points, radius = window.world.radius } = params
			const [p1, p2] = points
			return MATH.distance.geo([p1.x, p1.y], [p2.x, p2.y]) * radius
		},
	},
	isOnEdge: {
		geo: (params: { points: [Point, Point]; distance: number }) => {
			const { points, distance } = params
			const [p1, p2] = points

			// The geoInterpolate function expects points as [longitude, latitude]
			const interpolate = geoInterpolate([p1.x, p1.y], [p2.x, p2.y])
			const [interpolatedLongitude, interpolatedLatitude] =
				interpolate(distance)

			return { x: interpolatedLongitude, y: interpolatedLatitude }
		},
	},
	sameEdge: (e1: number[], e2: number[]) => {
		return e1[0] === e2[0] && e1[1] === e2[1]
	},
	random: (count: number): [number, number][] => {
		return range(count).map(() => {
			return [
				360 * window.dice.random,
				90 * (window.dice.random - window.dice.random),
			]
		})
	},
}

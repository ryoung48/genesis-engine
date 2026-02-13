import { geoDistance, polygonCentroid } from "d3"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { geoDelaunay } from "d3-geo-voronoi"

import {
	GeoVoronoiDiagram,
	RelaxedVoronoiParams,
	Vertex,
	VoronoiParams,
} from "./types"

const spherical = ({
	points,
}: Omit<VoronoiParams, "w" | "h">): GeoVoronoiDiagram => geoDelaunay(points)

export const VORONOI = {
	/**
	 * Returns the common edges between two arrays of vertices.
	 *
	 * @param {Vertex[]} i - The first array of vertices.
	 * @param {Vertex[]} j - The second array of vertices.
	 * @return {Vertex[]} - The array of common edges between the two arrays of vertices.
	 */
	commonEdge: (i: Vertex[], j: Vertex[]): Vertex[] => {
		const cellI = new Set(i.map(String))
		const edge = j.filter((p) => cellI.has(String(p)))
		return edge
	},
	/**
	 * Applies relaxation to a Voronoi diagram.
	 *
	 * @param {RelaxedVoronoiParams} params - The parameters for the relaxation.
	 * @param {Array<[number, number]>} params.points - The points for the Voronoi diagram.
	 * @param {number} [params.relaxation=1] - The number of iterations for relaxation.
	 * @param {number} params.w - The width of the image to clip the Voronoi diagram.
	 * @param {number} params.h - The height of the image to clip the Voronoi diagram.
	 * @return {Delaunay} - The relaxed Voronoi diagram.
	 */
	relaxed: ({
		points,
		relaxation = 1,
	}: Omit<RelaxedVoronoiParams, "w" | "h">) => {
		// create voronoi object clipped by the image width & height
		let vor = spherical({ points })
		let count = 0
		let relaxedSites = points
		// perform loyd relaxation to smooth voronoi cells
		while (count++ < relaxation) {
			relaxedSites = Array.from(vor.polygons).map((poly) =>
				polygonCentroid(poly.map((i) => vor.centers[i])),
			)
			vor = spherical({ points: relaxedSites })
		}
		return { vor, sites: relaxedSites }
	},
	urquhart: (points: Vertex[]) => {
		const vor = spherical({ points })
		const distances = vor.edges.map((e) =>
			geoDistance(points[e[0]], points[e[1]]),
		)
		const urquhart = vor.urquhart(distances)
		return vor.edges.filter((_, i) => urquhart[i])
	},
}

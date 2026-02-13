// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { S2 } from "s2-geometry"

// Approximate cell size in miles for each S2 level (rough estimates)
function getS2LevelFromDistance(minDistanceMiles: number): number {
	if (minDistanceMiles <= 0) {
		throw new Error("Distance must be greater than 0.")
	}

	// Approximate cell size in miles for each S2 level (rough estimates)
	const cellSizesInMiles = [
		2500, // Level 0
		1200, // Level 1
		600, // Level 2
		300, // Level 3
		150, // Level 4
		75, // Level 5
		37, // Level 6
		18, // Level 7
		9, // Level 8
		4.5, // Level 9
		2.2, // Level 10
		1.1, // Level 11
		0.5, // Level 12
		0.3, // Level 13
		0.15, // Level 14
		0.08, // Level 15
		0.04, // Level 16
		0.02, // Level 17
		0.01, // Level 18
	]

	// Find the highest level where the cell size is greater than or equal to the minimum distance
	for (let level = 0; level < cellSizesInMiles.length; level++) {
		if (minDistanceMiles >= cellSizesInMiles[level]) {
			return level
		}
	}

	// If no matching level is found, return the maximum level
	return cellSizesInMiles.length - 1
}

/**
 * Generate neighbor keys (including diagonal neighbors) for a given lat/lng and level.
 * @param {number} lat - Latitude.
 * @param {number} lng - Longitude.
 * @param {number} level - S2 level.
 * @returns {string[]} Array of neighbor keys as Hilbert quadkeys.
 */
function latLngToNeighborKeys(
	lat: number,
	lng: number,
	level: number,
): string[] {
	const cell = S2.S2Cell.FromLatLng({ lat, lng }, level)
	const neighbors = getNeighbors(cell)
	return neighbors.map((neighbor) => neighbor.toHilbertQuadkey())
}

/**
 * Get neighbors (cardinal and diagonal) for an S2 cell.
 * @param {S2.S2Cell} cell - An S2 cell.
 * @returns {S2.S2Cell[]} Array of neighboring S2 cells.
 */
function getNeighbors(cell: S2.S2Cell): S2.S2Cell[] {
	const fromFaceIJWrap = (
		face: number,
		ij: [number, number],
		level: number,
	): S2.S2Cell => {
		const maxSize = 1 << level

		if (ij[0] >= 0 && ij[1] >= 0 && ij[0] < maxSize && ij[1] < maxSize) {
			// No wrapping out of bounds
			return S2.S2Cell.FromFaceIJ(face, ij, level)
		} else {
			// Wrap coordinates to the appropriate cube face
			const st = S2.IJToST(ij, level, [0.5, 0.5])
			const uv = S2.STToUV(st)
			const xyz = S2.FaceUVToXYZ(face, uv)
			const faceUV = S2.XYZToFaceUV(xyz)
			const newFace = faceUV[0]
			const newUV = faceUV[1]
			const newST = S2.UVToST(newUV)
			const newIJ = S2.STToIJ(newST, level)
			return S2.S2Cell.FromFaceIJ(newFace, newIJ, level)
		}
	}

	const face = cell.face
	const i = cell.ij[0]
	const j = cell.ij[1]
	const level = cell.level

	// Define all 8 neighboring positions (cardinal + diagonal)
	const neighborOffsets: [number, number][] = [
		[-1, 0], // Left
		[0, -1], // Down
		[1, 0], // Right
		[0, 1], // Up
		[-1, -1], // Bottom-left
		[-1, 1], // Top-left
		[1, -1], // Bottom-right
		[1, 1], // Top-right
	]

	return neighborOffsets.map(([di, dj]) =>
		fromFaceIJWrap(face, [i + di, j + dj], level),
	)
}

export const S2_EXTENDED = { getS2LevelFromDistance, latLngToNeighborKeys }

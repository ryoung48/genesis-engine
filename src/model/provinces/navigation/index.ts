import { PriorityQueue } from "@datastructures-js/priority-queue"

import { MATH } from "../../utilities/math"
import * as Navigation from "./types"
import { PROVINCE } from ".."

/**
 * Reconstructs the shortest path from the start cell to the end cell using the visited object.
 *
 * @param {Object} args - The arguments object.
 * @param {number} args.start - The index of the start cell.
 * @param {number} args.end - The index of the end cell.
 * @param {Object} args.visited - A record of visited cells, where the keys are the indices of the cells and the values are the indices of the previous cells in the path.
 * @returns {number[]} - An array of numbers representing the indices of the cells in the shortest path from the start cell to the end cell.
 *
 * @example
 * const start = 0;
 * const end = 5;
 * const visited = {
 *   1: 0,
 *   2: 1,
 *   3: 2,
 *   4: 3,
 *   5: 4
 * };
 * const path = restorePath({ start, end, visited });
 * console.log(path); // [0, 1, 2, 3, 4, 5]
 */
const restorePath = ({ start, end, visited }: Navigation.RestorePathParams) => {
	const path: number[] = []
	let current = end
	let prev = window.world.cells[current]
	path.push(prev.idx)
	// go from source to end
	while (current !== start) {
		// use the visited list to get the next cell in the path
		current = visited[current]
		const curr = window.world.cells[current]
		if (current === undefined) {
			return []
		}
		// add index to the path
		path.push(curr.idx)
		prev = curr
	}
	return path
}

export const NAVIGATION = {
	shortestPath: ({ start, end }: Navigation.PathParams) => {
		// initialize the priority queue to compare cell priorities
		const queue = new PriorityQueue(
			(a: Navigation.PathElement, b: Navigation.PathElement) => a.p - b.p,
		)
		queue.enqueue({
			idx: start,
			p: 0,
			d: 0,
		})
		const destination = window.world.provinces[end]
		const dloc = PROVINCE.cell(destination)
		// total cost from a cell
		const totals = { [start]: 0 }
		// visited cell list marking the next cell in the path
		const visited: { [index: string]: number | undefined } = {}
		let prev = start
		let len = 0
		while (queue.size() > 0 && prev !== end) {
			// get the next item in the queue
			const { idx, d } = queue.dequeue()
			len = d + 1
			prev = idx
			const province = window.world.provinces[prev]
			const ploc = PROVINCE.cell(province)
			// consider all neighbors that pass the validation condition (f)
			PROVINCE.neighbors({ province }).forEach((neighbor) => {
				const next = neighbor.idx
				if (next === end) {
					// only consider neighbors that haven't already been visited
					if (visited[next] === undefined) {
            const nloc = PROVINCE.cell(neighbor)
						const [nx, ny] = [nloc.x, nloc.y]
						const [cx, cy] = [ploc.x, ploc.y]
						const [dx, dy] = [dloc.x, dloc.y]
						// start the cost at the distance between cells
						const cost = MATH.distance.geo([nx, ny], [cx, cy])
						let penalty = 1
						// mountains are difficult to traverse
						if (nloc.isMountains) penalty += 10
						// prioritize coastal roads
						if (!nloc.isCoast) penalty += 0.3
						// finalize the cost by adding it to the total cost to get to the previous cell
						const prospect = cost * penalty + totals[prev]
						totals[next] = prospect
						visited[next] = prev
						const priority = prospect + MATH.distance.geo([nx, ny], [dx, dy])
						// add cell w/ priority to the queue
						queue.enqueue({
							idx: next,
							p: priority,
							d: len,
						})
					}
				}
			})
		}
		const success = prev === end
		return success ? restorePath({ start, end, visited }) : []
	},
}

import { PriorityQueue } from "@datastructures-js/priority-queue"
import { scalePow } from "d3"
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import { S2 } from "s2-geometry"
import { CELL } from "./cells"
import { Cell } from "./cells/types"
import {
	MergeLakeParams,
	RemoveLakeParams,
	World,
	WorldPlacementParams,
	WorldSpawn,
} from "./types"
import { DICE } from "./utilities/dice"
import { MATH } from "./utilities/math"
import { PERFORMANCE } from "./utilities/performance"
import { S2_EXTENDED } from "./utilities/s2"
import { START_DATE } from "./utilities/time"

const _land = () =>
	window.world.cells.filter((e) => {
		return e.h >= WORLD.elevation.seaLevel
	})
const land = PERFORMANCE.memoize.decorate({ f: _land })

const _water = () =>
	window.world.cells.filter((e) => {
		return e.h < WORLD.elevation.seaLevel
	})
const water = PERFORMANCE.memoize.decorate({ f: _water })

export const WORLD = {
	cells: {
		land: () => land(),
		lakes: {
			get: () => WORLD.cells.water().filter((cell) => !cell.ocean),
			merge: ({ lakes, lake }: MergeLakeParams) => {
				const lakeCells = lakes.filter((cell) => cell.landmark === lake)
				const { landmark } = lakeCells
					.map((cell) => CELL.neighbors(cell))
					.flat()
					.find((cell) => cell.landmark !== lake)
				lakeCells.forEach((cell) => {
					cell.landmark = landmark
					cell.isWater = true
					cell.shallow = false
					cell.h = WORLD.elevation.seaLevel - 0.01
				})
				delete window.world.landmarks[lake]
				window.world.landmarks[landmark].size += lakeCells.length
				return lakeCells
			},
			remove: ({ lakes, lake }: RemoveLakeParams) => {
				const lakeCells = lakes.filter((cell) => cell.landmark === lake)
				const shallow = lakeCells.find((cell) => cell.shallow)
				const { landmark } = CELL.neighbors(shallow).find(
					(cell) => cell.landmark !== lake,
				)
				lakeCells.forEach((cell) => {
					cell.landmark = landmark
					cell.isWater = false
					cell.shallow = false
					cell.wasLake = true
					cell.h = WORLD.elevation.seaLevel
					CELL.neighbors(cell)
						.filter((n) => !n.isWater)
						.forEach((n) => {
							const coast = CELL.neighbors(n).filter((p) => p.isWater)
							n.isCoast = coast.length > 0
						})
				})
				delete window.world.landmarks[lake]
				window.world.landmarks[landmark].size += lakeCells.length
				return lakeCells
			},
		},
		water: () => water(),
		reshape: () => {
			PERFORMANCE.memoize.remove(_land)
			PERFORMANCE.memoize.remove(_water)
		},
	},
	elevation: {
		seaLevel: 0.1,
		mountains: 0.5,
		max: 0.95,
		compute: (cell: Cell) => {
			const islandScale = window.world.cells.length / 4266
			const decline = 3.5
			const { oceanDist, mountainDist } = cell
			const scaleFn = scalePow()
				.exponent(decline)
				.domain([0, mountainDist > 0 ? oceanDist + mountainDist : islandScale])
				.range([WORLD.elevation.seaLevel, WORLD.elevation.mountains])
			return scaleFn(oceanDist)
		},
		heightToKM: (h: number) =>
			MATH.scale(
				[
					WORLD.elevation.seaLevel,
					WORLD.elevation.mountains,
					WORLD.elevation.max,
				],
				[0, 0.6, 8],
				h,
			),
		kmToHeight: (km: number) =>
			MATH.scale(
				[0, 0.6, 8],
				[
					WORLD.elevation.seaLevel,
					WORLD.elevation.mountains,
					WORLD.elevation.max,
				],
				km,
			),
	},
	features: (type: "water" | "land") => {
		const water = (v: World["landmarks"][number]) => v.water
		const land = (v: World["landmarks"][number]) => !v.water
		const filter = type === "water" ? water : land
		return Object.entries(window.world.landmarks)
			.filter(([, v]) => filter(v))
			.map(([k]) => parseInt(k))
	},
	landmarks: (type: "water" | "land") => {
		const water = (v: World["landmarks"][number]) => v.water
		const land = (v: World["landmarks"][number]) => !v.water
		const filter = type === "water" ? water : land
		return Object.entries(window.world.landmarks)
			.filter(([, v]) => filter(v))
			.map(([k]) => parseInt(k))
	},
	placement: {
		spacing: { regions: 350, provinces: 105, oceans: 800, oceanRegions: 325 },
		autoSpacing: (count: number, area: number) =>
			Math.sqrt(area / count) * 0.75,
		limit: (spacing: number) =>
			Math.ceil((spacing * window.world.radius) / window.world.cell.length),
		run: ({
			blacklist = [],
			whitelist,
			count,
			spacing,
		}: WorldPlacementParams) => {
			const grid: Record<string, Cell[]> = {}

			const level = S2_EXTENDED.getS2LevelFromDistance(spacing)

			function getGridCell(cell: Cell): string {
				return S2.latLngToKey(cell.y, cell.x, level)
			}
			// Function to add a city to the grid
			function addCityToGrid(cell: Cell): void {
				const cellId = getGridCell(cell)
				if (!grid[cellId]) grid[cellId] = []
				grid[cellId].push(cell)
			}
			// Function to retrieve nearby cities from the grid
			function getNearbyCities(cell: Cell): Cell[] {
				const cellId = getGridCell(cell)
				const search: string[] = S2_EXTENDED.latLngToNeighborKeys(
					cell.y,
					cell.x,
					level,
				)
				search.push(cellId)
				return search
					.map((i) => grid[i])
					.filter((cells) => cells)
					.flat()
			}

			const placed: Cell[] = []

			// Add blacklist cities to the grid if provided
			for (const city of blacklist) {
				addCityToGrid(city)
			}

			// Process each cell in the shuffled whitelist
			for (const cell of whitelist) {
				// Stop if we've placed the required number of cities
				if (placed.length >= count) break

				const mod = 1

				// Retrieve nearby cities to check for spacing constraints
				const nearbyCities = getNearbyCities(cell)
				let tooClose = false

				for (const city of nearbyCities) {
					const distance = CELL.distance(city, cell)
					if (distance < spacing * mod) {
						tooClose = true
						break
					}
				}
				if (!tooClose) {
					// No nearby city violates the spacing constraint; place a city here
					placed.push(cell)
					addCityToGrid(cell)
				}
			}
			if (placed.length < count)
				console.log(`placement failure: ${placed.length} / ${count}`)

			return placed
		},
		ratio: () =>
			2 ** (WORLD.cells.land().length / window.world.cells.length / 0.2 - 1),
	},
	spawn: ({
		seed,
		obliquity = 23.5,
		eccentricity = 0.017,
		perihelion = 102,
	}: WorldSpawn) => {
		// load the dice
		console.log(seed)
		DICE.spawn(seed)
		// cell dimensions
		const res = 2
		const count = res * 16000
		const radius = 3.959e3 // miles
		const surfaceArea = 4 * Math.PI * radius ** 2
		const area = surfaceArea / count
		const length = area ** 0.5

		const world: World = {
			id: seed,
			obliquity,
			eccentricity,
			perihelion,
			time: START_DATE,
			cells: [],
			cell: { length, count, area },
			display: { islands: {}, lakes: {} },
			resolution: res,
			scale: res / 4,
			coasts: [],
			radius: 3.959e3, // miles
			landmarks: {},
			mountains: [],
			oceanRegions: [],
			provinces: [],
			cultures: [],
			heritages: [],
			faiths: [],
			religions: [],
			future: new PriorityQueue((a, b) => a.time - b.time),
			wars: [],
			past: [],
		}
		return world
	},
}

import type { SeaIcePatchParams } from "@/model/climatev2/sea-ice-patches/types"
import { SPREAD } from "@/model/shared/spread"

const MIN_PATCH_WORLD_AREA_SHARE = 0.00016
const MIN_PATCH_AVERAGE_REGIONS = 8

function merge({ mesh, ocean, months, monthCount }: SeaIcePatchParams): void {
	const { numRegions: N, adjOffset, adjList, regionArea } = mesh
	const minArea =
		4 *
		Math.PI *
		Math.max(MIN_PATCH_WORLD_AREA_SHARE, MIN_PATCH_AVERAGE_REGIONS / N)
	const phase = months.map((count) =>
		count === 0 ? 0 : count === monthCount ? 2 : 1,
	)
	const { cells, label } = SPREAD.components({
		mesh,
		isMember: (r) => ocean[r] !== 0,
		canConnect: ({ from, to }) => phase[from] === phase[to],
	})
	const areas = cells.map((group) =>
		group.reduce((area, r) => area + regionArea[r], 0),
	)
	const { cells: specks } = SPREAD.components({
		mesh,
		isMember: (r) => label[r] >= 0 && areas[label[r]] < minArea,
		canConnect: () => true,
	})
	const contacts = new Uint32Array(3)
	const totals = new Uint32Array(3)
	for (const speck of specks) {
		contacts.fill(0)
		totals.fill(0)
		for (const r of speck) {
			for (let j = adjOffset[r]; j < adjOffset[r + 1]; j++) {
				const neighbor = adjList[j]
				const other = label[neighbor]
				if (other < 0 || areas[other] < minArea) continue
				const kind = phase[neighbor]
				contacts[kind]++
				totals[kind] += months[neighbor]
			}
		}
		let surrounding = 0
		for (let kind = 1; kind < contacts.length; kind++)
			if (contacts[kind] > contacts[surrounding]) surrounding = kind
		if (!contacts[surrounding]) continue
		const replacement = Math.round(totals[surrounding] / contacts[surrounding])
		for (const r of speck) months[r] = replacement
	}
}

export const SEA_ICE_PATCHES = { merge }

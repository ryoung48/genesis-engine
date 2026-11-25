import { CRUST } from "@/model/geography/tectonics/crust"
import type {
	AtollRemnant,
	AtollRemnantParams,
	AtollSitesParams,
	GenesisAtolls,
} from "@/model/geography/terrain/seabed/atolls/types"
import { SEABED_CONFIG } from "@/model/geography/terrain/seabed-config"

const C = SEABED_CONFIG

function remnantOf({ crust, cell }: AtollRemnantParams): AtollRemnant | null {
	if (crust.volcType[cell] !== CRUST.VOLCANIC.TRACK) return null
	if (crust.type[cell] !== CRUST.TYPE.OCEAN) return null
	const peakKm = crust.volcKm[cell]
	if (peakKm < C.seamountKm) return null
	const wornKm = crust.volcWornKm[cell]
	if (peakKm - wornKm >= C.hotspotMinKm) return null
	return { ageMyr: wornKm / C.islandErosionKmPerMyr, peakKm }
}

function sites({
	mesh,
	crust,
	sample,
	isLand,
	openWater,
	temperatureMonthly,
}: AtollSitesParams): GenesisAtolls {
	const found = new Map<number, AtollRemnant>()
	for (let cell = 0; cell < crust.numCells; cell++) {
		const remnant = remnantOf({ crust, cell })
		if (!remnant) continue
		const region = sample.regionOfCell[cell]
		if (isLand[region] || !openWater[region]) continue
		let coldestC = Infinity
		for (let m = 0; m < C.monthsPerYear; m++)
			coldestC = Math.min(
				coldestC,
				temperatureMonthly[m * mesh.numRegions + region],
			)
		if (coldestC < C.coralMinColdC) continue
		const previous = found.get(region)
		if (!previous || remnant.ageMyr > previous.ageMyr)
			found.set(region, remnant)
	}
	const regions = [...found.keys()].sort((a, b) => a - b)
	const out: GenesisAtolls = {
		region: Int32Array.from(regions),
		ageMyr: new Float32Array(regions.length),
		peakKm: new Float32Array(regions.length),
		xyz: new Float32Array(3 * regions.length),
	}
	regions.forEach((region, i) => {
		const remnant = found.get(region) as AtollRemnant
		out.ageMyr[i] = remnant.ageMyr
		out.peakKm[i] = remnant.peakKm
		out.xyz.set(mesh.r_xyz.subarray(3 * region, 3 * region + 3), 3 * i)
	})
	return out
}

export const SEABED_ATOLLS = { remnantOf, sites }

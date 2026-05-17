import {
	forEachRoute,
	ROUTE_SEA,
	type Route,
	type SerializedRoutes,
} from "@/model/transport/worker-types"
import type { StageTiming } from "@/model/types/tectonics"

interface MissingSeaRoutePort {
	province: number
	urbanPopulation: number
	anchorRegion: number
	portRegion: number
	waterLandmark: number
	seaRouteCount: number
}

interface SeaRoutePortDiagnostics {
	eligiblePorts: number
	portsWithSeaRoutes: number
	missingPorts: MissingSeaRoutePort[]
}

export function selectTimingStages(
	timings: readonly StageTiming[],
	prefixes: readonly string[],
): StageTiming[] {
	return timings.filter((entry) =>
		prefixes.some((prefix) => entry.Stage.startsWith(prefix)),
	)
}

function isPackedInfrastructureRoutes(
	routes: readonly Route[] | SerializedRoutes,
): routes is SerializedRoutes {
	return !Array.isArray(routes)
}

export function collectSeaRoutePortDiagnostics(input: {
	urbanPopulation: ArrayLike<number>
	settlementRegions: Int32Array
	settlementWaterLandmarks: Int32Array
	settlementPortRegions: Int32Array
	routes: readonly Route[] | SerializedRoutes
	minPopulation: number
}): SeaRoutePortDiagnostics {
	const seaRouteCounts = new Int32Array(input.urbanPopulation.length)
	if (!isPackedInfrastructureRoutes(input.routes)) {
		for (const route of input.routes) {
			if (route.kind !== ROUTE_SEA) continue
			seaRouteCounts[route.fromProvince]++
			seaRouteCounts[route.toProvince]++
		}
	} else {
		forEachRoute(input.routes, (route) => {
			if (route.kind !== ROUTE_SEA) return
			seaRouteCounts[route.fromProvince]++
			seaRouteCounts[route.toProvince]++
		})
	}

	const missingPorts: MissingSeaRoutePort[] = []
	let eligiblePorts = 0
	let portsWithSeaRoutes = 0
	for (let province = 0; province < input.urbanPopulation.length; province++) {
		const urbanPopulation = input.urbanPopulation[province] ?? 0
		const anchorRegion = input.settlementRegions[province] ?? -1
		const waterLandmark = input.settlementWaterLandmarks[province] ?? -1
		const portRegion = input.settlementPortRegions[province] ?? -1
		if (
			urbanPopulation < input.minPopulation ||
			anchorRegion < 0 ||
			waterLandmark < 0 ||
			portRegion < 0
		) {
			continue
		}
		eligiblePorts++
		if (seaRouteCounts[province] > 0) {
			portsWithSeaRoutes++
			continue
		}
		missingPorts.push({
			province,
			urbanPopulation,
			anchorRegion,
			portRegion,
			waterLandmark,
			seaRouteCount: 0,
		})
	}

	missingPorts.sort(
		(a, b) =>
			b.urbanPopulation - a.urbanPopulation ||
			a.waterLandmark - b.waterLandmark ||
			a.province - b.province,
	)

	return {
		eligiblePorts,
		portsWithSeaRoutes,
		missingPorts,
	}
}

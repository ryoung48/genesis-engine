/// <reference lib="webworker" />

import { GALAXY } from "@/model/celestial/galaxy"
import { GALAXY_SYSTEMS } from "@/model/celestial/galaxy/systems"
import type { GalaxySystem } from "@/model/celestial/galaxy/systems/types"
import type { Galaxy } from "@/model/celestial/galaxy/types"
import type {
	GalaxyWorkerRequest,
	GalaxyWorkerResponse,
} from "@/model/celestial/galaxy/worker-protocol/types"

declare const self: DedicatedWorkerGlobalScope

function buildTransferList(galaxy: Galaxy): Transferable[] {
	return [
		galaxy.r_xy.buffer,
		galaxy.r_edge.buffer,
		galaxy.adjOffset.buffer,
		galaxy.adjList.buffer,
		galaxy.lanes.buffer,
		galaxy.systemStarOffset.buffer,
		galaxy.starParent.buffer,
		galaxy.starRole.buffer,
		galaxy.starSpectralClass.buffer,
		galaxy.starLuminosityClass.buffer,
		galaxy.starSubtype.buffer,
		galaxy.starOrbitalDistanceAU.buffer,
		galaxy.starEccentricity.buffer,
		galaxy.starInclinationDeg.buffer,
		galaxy.starAge.buffer,
		galaxy.starMass.buffer,
		galaxy.starDiameter.buffer,
		galaxy.starTemperature.buffer,
		galaxy.starLuminosity.buffer,
		galaxy.starMao.buffer,
		galaxy.nationAssignment.buffer,
		galaxy.nationSeeds.buffer,
		galaxy.nationSize.buffer,
		galaxy.nationColors.buffer,
		galaxy.sectorState.assignment.buffer,
		galaxy.cultureAssignment.buffer,
		galaxy.cultureSeeds.buffer,
		galaxy.cultureSize.buffer,
		galaxy.cultureColors.buffer,
		galaxy.cultureBlendSecondary.buffer,
		galaxy.cultureBlendWeight.buffer,
	]
}

self.onmessage = (event: MessageEvent<GalaxyWorkerRequest>) => {
	const message = event.data
	if (message.type !== "generate") return

	const progressCb = (label: string, pct: number) => {
		self.postMessage({
			type: "progress",
			label,
			pct,
		} satisfies GalaxyWorkerResponse)
	}

	try {
		const { galaxy, timings } = GALAXY.spawn(message.params, progressCb)
		let systems: GalaxySystem[] | undefined
		if (message.params.pregenerateAllSystems) {
			systems = []
			const capitalSystems = new Set(galaxy.nationSeeds)
			for (
				let systemIndex = 0;
				systemIndex < galaxy.numSystems;
				systemIndex++
			) {
				if (galaxy.r_edge[systemIndex]) continue
				systems.push(
					GALAXY_SYSTEMS.generate({
						galaxySeed: galaxy.seed,
						systemIndex,
						nationIndex: galaxy.nationAssignment[systemIndex] ?? -1,
						isCapital: capitalSystems.has(systemIndex),
						packed: galaxy,
						skipNaming: true,
					}),
				)
				if (systemIndex % 25 === 0) {
					progressCb(
						`Generating systems... (${systemIndex.toLocaleString()}/${galaxy.numSystems.toLocaleString()})`,
						(systemIndex / galaxy.numSystems) * 100,
					)
				}
			}
		}
		self.postMessage(
			{ type: "done", galaxy, timings, systems } satisfies GalaxyWorkerResponse,
			buildTransferList(galaxy),
		)
	} catch (error) {
		const err = error instanceof Error ? error : new Error(String(error))
		self.postMessage({
			type: "error",
			message: err.message,
			stack: err.stack,
		} satisfies GalaxyWorkerResponse)
	}
}

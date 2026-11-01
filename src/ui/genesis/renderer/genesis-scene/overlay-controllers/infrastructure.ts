import type { SerializedNetwork } from "@/model/worker-protocol/types"
import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import {
	buildTradeRouteLines,
	computeTradeRoutePositions,
} from "@/ui/genesis/renderer/trade-route-overlay"

export interface InfrastructureControllerDeps {
	updateOverlayVisibility: () => void
}

/** Owns the trade-route/transport-network overlay -- named "infrastructure"
 * after its public setInfrastructure/setInfrastructureVisible GenesisScene
 * methods. Route geometry is computed in a worker; a newer rebuild discards
 * the result of an older one still in flight. See
 * plans/genesis-scene-controller-split.md. */
export function createInfrastructureController(
	ctx: GenesisContext,
	deps: InfrastructureControllerDeps,
) {
	let latestRebuild = 0

	function clear() {
		disposeGroup(ctx.globeGroup, ctx.globeInfrastructure)
		disposeGroup(ctx.scene, ctx.mapInfrastructure)
		ctx.globeInfrastructure = null
		ctx.mapInfrastructure = null
		ctx.globeInfrastructureMaterials = []
		ctx.mapInfrastructureMaterials = []
		ctx.infrastructureMaterials = []
	}

	async function rebuild() {
		const rebuildId = ++latestRebuild
		clear()
		const world = ctx.currentWorld
		const network = ctx.infrastructureData
		if (
			!world?.provinces ||
			!network ||
			network.fromRegion.length === 0 ||
			!ctx.infrastructureVisible
		) {
			return
		}
		const positions = await computeTradeRoutePositions({
			network,
			r_xyz: world.mesh.r_xyz,
			elevation: world.elevation,
			elevationVisible: ctx.elevationVisible,
			centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		if (rebuildId !== latestRebuild) return
		const resolution = {
			width: ctx.canvas.clientWidth || 1,
			height: ctx.canvas.clientHeight || 1,
		}
		const globeBuild = buildTradeRouteLines(positions.globe, resolution)
		const mapBuild = buildTradeRouteLines(positions.map, resolution)
		ctx.globeInfrastructure = globeBuild.group
		ctx.mapInfrastructure = mapBuild.group
		ctx.globeInfrastructureMaterials = globeBuild.materials
		ctx.mapInfrastructureMaterials = mapBuild.materials
		ctx.infrastructureMaterials = [
			...globeBuild.materials,
			...mapBuild.materials,
		]
		ctx.globeGroup.add(ctx.globeInfrastructure)
		addMapSlideClones(ctx.mapInfrastructure)
		if (ctx.mapMesh) ctx.mapInfrastructure.position.copy(ctx.mapMesh.position)
		ctx.scene.add(ctx.mapInfrastructure)
		deps.updateOverlayVisibility()
	}

	function setInfrastructure(edges: SerializedNetwork | null) {
		if (ctx.infrastructureData === edges) return
		ctx.infrastructureData = edges
		void rebuild()
	}

	function setInfrastructureVisible(visible: boolean) {
		if (ctx.infrastructureVisible === visible) return
		ctx.infrastructureVisible = visible
		void rebuild()
	}

	return {
		rebuild: () => {
			void rebuild()
		},
		setInfrastructure,
		setInfrastructureVisible,
	}
}

import { TRANSPORT } from "@/model/society/infrastructure/transport"
import type { SerializedNetwork } from "@/model/worker-protocol/types"
import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import {
	buildGlobeTradeRoutes,
	buildMapTradeRoutes,
} from "@/ui/genesis/renderer/trade-route-overlay"

export interface InfrastructureControllerDeps {
	updateOverlayVisibility: () => void
}

/** Owns the trade-route/transport-network overlay -- named "infrastructure"
 * after its public setInfrastructure/setInfrastructureVisible GenesisScene
 * methods, though it's built via buildGlobeTradeRoutes/buildMapTradeRoutes.
 * See plans/genesis-scene-controller-split.md. */
export function createInfrastructureController(
	ctx: GenesisContext,
	deps: InfrastructureControllerDeps,
) {
	function rebuild() {
		disposeGroup(ctx.globeGroup, ctx.globeInfrastructure)
		disposeGroup(ctx.scene, ctx.mapInfrastructure)
		ctx.globeInfrastructure = null
		ctx.mapInfrastructure = null
		ctx.globeInfrastructureMaterials = []
		ctx.mapInfrastructureMaterials = []
		ctx.infrastructureMaterials = []
		if (
			!ctx.currentWorld?.provinces ||
			!ctx.infrastructureData ||
			TRANSPORT.networkCount(ctx.infrastructureData) === 0 ||
			!ctx.infrastructureVisible
		) {
			return
		}
		const globeTradeRouteBuild = buildGlobeTradeRoutes(
			ctx.currentWorld,
			ctx.infrastructureData,
			{
				width: ctx.canvas.clientWidth || 1,
				height: ctx.canvas.clientHeight || 1,
			},
			ctx.elevationVisible,
		)
		const mapTradeRouteBuild = buildMapTradeRoutes(
			ctx.currentWorld,
			ctx.infrastructureData,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			{
				width: ctx.canvas.clientWidth || 1,
				height: ctx.canvas.clientHeight || 1,
			},
		)
		ctx.globeInfrastructure = globeTradeRouteBuild.group
		ctx.mapInfrastructure = mapTradeRouteBuild.group
		ctx.globeInfrastructureMaterials = globeTradeRouteBuild.materials
		ctx.mapInfrastructureMaterials = mapTradeRouteBuild.materials
		ctx.infrastructureMaterials = [
			...globeTradeRouteBuild.materials,
			...mapTradeRouteBuild.materials,
		]
		if (ctx.globeInfrastructure) ctx.globeGroup.add(ctx.globeInfrastructure)
		if (ctx.mapInfrastructure) {
			addMapSlideClones(ctx.mapInfrastructure)
			if (ctx.mapMesh) ctx.mapInfrastructure.position.copy(ctx.mapMesh.position)
			ctx.scene.add(ctx.mapInfrastructure)
		}
		deps.updateOverlayVisibility()
	}

	function setInfrastructure(edges: SerializedNetwork | null) {
		ctx.infrastructureData = edges
		rebuild()
	}

	function setInfrastructureVisible(visible: boolean) {
		if (ctx.infrastructureVisible === visible) return
		ctx.infrastructureVisible = visible
		rebuild()
	}

	return { rebuild, setInfrastructure, setInfrastructureVisible }
}

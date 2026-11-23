import type { MigrationRoutes } from "@/model/society/migration/types"
import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/genesis/renderer/map-export"
import { MIGRATION_ROUTE_OVERLAY } from "@/ui/genesis/renderer/migration-route-overlay"

export interface MigrationRoutesControllerDeps {
	updateOverlayVisibility: () => void
}

export function createMigrationRoutesController(
	ctx: GenesisContext,
	deps: MigrationRoutesControllerDeps,
) {
	function clear() {
		disposeGroup(ctx.globeGroup, ctx.globeMigrationRoutes)
		disposeGroup(ctx.scene, ctx.mapMigrationRoutes)
		ctx.globeMigrationRoutes = null
		ctx.mapMigrationRoutes = null
	}

	function rebuild() {
		clear()
		const world = ctx.currentWorld
		const routes = ctx.migrationRoutesData
		if (!world?.provinces || !routes) return
		const overlay = MIGRATION_ROUTE_OVERLAY.build({
			routes,
			seeds: world.provinces.seeds,
			r_xyz: world.mesh.r_xyz,
			elevation: world.elevation,
			canvasSize: [ctx.canvas.clientWidth || 1, ctx.canvas.clientHeight || 1],
			centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
			viewMode: ctx.currentViewMode,
		})
		ctx.globeMigrationRoutes = overlay.globe
		ctx.mapMigrationRoutes = overlay.map
		ctx.globeGroup.add(overlay.globe)
		addMapSlideClones(overlay.map)
		if (ctx.mapMesh) overlay.map.position.copy(ctx.mapMesh.position)
		ctx.scene.add(overlay.map)
		deps.updateOverlayVisibility()
	}

	function setMigrationRoutes(routes: MigrationRoutes | null) {
		if (ctx.migrationRoutesData === routes) return
		ctx.migrationRoutesData = routes
		rebuild()
	}

	return { rebuild, setMigrationRoutes }
}

import * as THREE from "three"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import type {
	GenesisViewMode,
	OrgHighlightSpec,
} from "@/ui/genesis/renderer/types"

export interface ViewStateControllerDeps {
	updateOverlayVisibility: () => void
	syncAnimationState: () => void
	rebuildOverlays: () => void
	rebuildNationBorders: () => void
	rebuildNationLabels: () => void
	rebuildTerrain: () => void
	rebuildSolarTerminator: () => void
	rebuildSettlementLabels: () => void
	rebuildCultureLabels: () => void
	rebuildHeritageLabels: () => void
	rebuildReligionLabels: () => void
	earthHistoryNationOverridesEqual: (
		a: {
			assignment: Int32Array
			seeds: Int32Array
			names: string[]
		} | null,
		b: {
			assignment: Int32Array
			seeds: Int32Array
			names: string[]
		} | null,
	) => boolean
}

/** Thin scene-wide state setters that don't have a large enough overlay of
 * their own to warrant a dedicated controller: view mode (globe/map),
 * wireframe/grid toggles, elevation display, the earth-history nation
 * override and organization-highlight overrides that drive nation border/
 * label rebuilds, and screen-space projection for hover/UI anchoring. See
 * plans/genesis-scene-controller-split.md. */
export function createViewStateController(
	ctx: GenesisContext,
	deps: ViewStateControllerDeps,
) {
	function setEarthHistoryNationOverride(
		override: {
			assignment: Int32Array
			seeds: Int32Array
			names: string[]
		} | null,
	) {
		if (
			deps.earthHistoryNationOverridesEqual(
				ctx.earthHistoryNationOverride,
				override,
			)
		)
			return
		ctx.earthHistoryNationOverride = override
		deps.rebuildNationBorders()
		deps.rebuildNationLabels()
	}

	/** Current territory highlight for one international organization (HRE,
	 * Hanseatic League, ...), from GenesisView's organizationHighlightSpec --
	 * recomputed fresh from FoldedState each earth-history scrub tick, so
	 * this always does a full rebuild rather than an in-place update. Pass
	 * null exactly when no organization's wiki page is open, which both
	 * clears the fill highlight and lets rebuildNationLabels resume showing
	 * normal nation name labels. */
	function setOrganizationHighlight(spec: OrgHighlightSpec | null) {
		if (ctx.currentOrgHighlight === spec) return
		ctx.currentOrgHighlight = spec
		// rebuildNationBorders' border-line tracing never reads
		// ctx.currentOrgHighlight (territory coloring is region-level, handled
		// by GenesisView's withOrgHighlight instead) -- only labels branch on
		// it (rebuildNationLabels' ctx.currentOrgHighlight check). Calling
		// rebuildNationBorders here would re-trace every border in the world a
		// second time for no visual effect, on top of the identical rebuild
		// setEarthHistoryNationOverride already triggers the same tick.
		deps.rebuildNationLabels()
	}

	function setViewMode(mode: GenesisViewMode) {
		ctx.currentViewMode = mode
		const isMap = mode === "map"
		ctx.controls.enabled = !isMap
		ctx.mapControls.enabled = isMap
		if (ctx.terrainMesh) ctx.terrainMesh.visible = !isMap
		if (ctx.mapMesh) ctx.mapMesh.visible = isMap
		ctx.waterMesh.visible = !isMap
		ctx.atmosMesh.visible = !isMap && ctx.sun.intensity > 0
		ctx.globeCloudMesh.visible = false
		if (ctx.globeSolarTerminator) ctx.globeSolarTerminator.visible = !isMap
		if (ctx.mapSolarTerminator) ctx.mapSolarTerminator.visible = isMap
		deps.updateOverlayVisibility()
		deps.syncAnimationState()
	}

	function setWireframeVisible(visible: boolean) {
		if (ctx.wireframeVisible === visible) return
		ctx.wireframeVisible = visible
		deps.rebuildOverlays()
	}

	function setGridVisible(visible: boolean) {
		if (ctx.gridVisible === visible) return
		ctx.gridVisible = visible
		deps.rebuildOverlays()
	}

	function setGridSpacing(spacingDeg: number) {
		if (ctx.gridSpacingDeg === spacingDeg) return
		ctx.gridSpacingDeg = spacingDeg
		deps.rebuildOverlays()
	}

	function setElevationVisible(visible: boolean) {
		if (ctx.elevationVisible === visible) return
		ctx.elevationVisible = visible
		if (ctx.currentWorld) deps.rebuildTerrain()
		deps.rebuildSolarTerminator()
		deps.rebuildNationLabels()
		deps.rebuildSettlementLabels()
		deps.rebuildCultureLabels()
		deps.rebuildHeritageLabels()
		deps.rebuildReligionLabels()
	}

	function projectToScreen(
		xyz: [number, number, number],
		lonOffsetRad = 0,
	): [number, number] | null {
		const cam = ctx.currentViewMode === "map" ? ctx.mapCamera : ctx.camera
		const v = new THREE.Vector3(...xyz)
		if (ctx.currentViewMode === "map") {
			const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
			const projection = createMapProjection(
				ctx.currentMapCenterLongitudeDeg,
				ctx.currentMapProjectionLatitudeDeg,
			)
			const projected = projection.projectCartesian(
				v.x / len,
				v.y / len,
				v.z / len,
			)
			const mapPoint = projection.projectRadians(
				projected.lon + lonOffsetRad,
				projected.lat,
				0.003,
			)
			v.set(mapPoint[0], mapPoint[1], mapPoint[2])
			if (ctx.mapMesh) v.add(ctx.mapMesh.position)
		} else {
			v.normalize().multiplyScalar(1.005)
			ctx.globeGroup.updateWorldMatrix(true, false)
			v.applyMatrix4(ctx.globeGroup.matrixWorld)
		}
		v.project(cam)
		if (v.z > 1) return null
		const w = ctx.canvas.clientWidth
		const h = ctx.canvas.clientHeight
		return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h]
	}

	return {
		setEarthHistoryNationOverride,
		setOrganizationHighlight,
		setViewMode,
		setWireframeVisible,
		setGridVisible,
		setGridSpacing,
		setElevationVisible,
		projectToScreen,
	}
}

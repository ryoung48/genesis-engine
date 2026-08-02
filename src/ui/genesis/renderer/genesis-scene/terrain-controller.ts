import type * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { disposeObject3D } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { DEFAULT_WATER_SPECULAR } from "@/ui/genesis/renderer/genesis-scene/scene-setup"
import {
	applyFaceRegionColors,
	applyMapColorModeColors,
	applyTerrainColorModeColors,
	buildMapMesh,
	buildTerrainMesh,
} from "@/ui/genesis/renderer/mesh-builders"
import type {
	GenesisHoverInfo,
	GenesisViewMode,
} from "@/ui/genesis/renderer/types"
import type { ColorMode } from "@/ui/genesis/shared/colors"
import { VEGETATION_WATER_BLUE } from "@/ui/genesis/shared/colors"

/** Cross-controller calls `terrain-controller.ts` needs but doesn't own --
 * supplied by create-genesis-scene.ts at construction time. Most of these
 * point at functions that still live in create-genesis-scene.ts because
 * their own controllers (overlay aggregator, nation borders, interaction)
 * haven't been extracted yet; once they are, create-genesis-scene.ts can
 * swap these for the real controllers' methods without terrain-controller
 * itself changing. */
export interface TerrainControllerDeps {
	rebuildOverlays: () => void
	updateOverlayVisibility: () => void
	setViewMode: (mode: GenesisViewMode) => void
	syncMapLighting: () => void
	rebuildNationBorders: () => void
	rebuildSelectedProvinceBorder: () => void
	emitHover: (info: GenesisHoverInfo | null) => void
	requestRender: () => void
	/** Disposes and clears the map solar-terminator overlay -- it has to be
	 * torn down and rebuilt whenever the terrain mesh is, since it's parented
	 * relative to the map mesh's position. */
	resetMapSolarTerminator: () => void
	/** Clears the heritage-script cache/queue that's keyed by world identity
	 * (nation-script-overlay.ts's pools) whenever the world object changes. */
	resetWorldChangeScriptState: () => void
	resetHoveredRegion: () => void
}

function reapplyMeshOverlayState(params: {
	world: SerializedGenesisWorld
	colorMode: ColorMode
	regionColors: Float32Array | null
	occupationOverlay: Float32Array | null
	terrainMesh: THREE.Mesh | null
	terrainFaceToRegion: Int32Array
	mapMesh: THREE.Mesh | null
	mapFaceToRegion: Int32Array
	mapCenterLongitudeDeg: number
	mapProjectionLatitudeDeg: number
}): void {
	const {
		world,
		colorMode,
		regionColors,
		occupationOverlay,
		terrainMesh,
		terrainFaceToRegion,
		mapMesh,
		mapFaceToRegion,
		mapCenterLongitudeDeg,
		mapProjectionLatitudeDeg,
	} = params

	if (regionColors) {
		applyFaceRegionColors(
			terrainMesh,
			terrainFaceToRegion,
			regionColors,
			occupationOverlay,
		)
		applyFaceRegionColors(
			mapMesh,
			mapFaceToRegion,
			regionColors,
			occupationOverlay,
		)
		return
	}

	applyTerrainColorModeColors(
		terrainMesh,
		world,
		colorMode,
		terrainFaceToRegion,
		occupationOverlay,
	)
	applyMapColorModeColors(
		mapMesh,
		world,
		colorMode,
		mapFaceToRegion,
		mapCenterLongitudeDeg,
		mapProjectionLatitudeDeg,
		occupationOverlay,
	)
}

/** Owns the terrain/map mesh pair and the color-mode/region-color state
 * that drives their vertex colors -- `rebuildTerrain` (full geometry
 * rebuild), `updateWorld` (the top-level "swap worlds" entry point), the
 * in-place recolor fast paths, and the water material's per-mode tint. See
 * plans/genesis-scene-controller-split.md. */
export function createTerrainController(
	ctx: GenesisContext,
	deps: TerrainControllerDeps,
) {
	function recolorMeshesInPlace(): boolean {
		if (!ctx.currentRegionColors) return false
		const terrainUpdated = applyFaceRegionColors(
			ctx.terrainMesh,
			ctx.terrainFaceToRegion,
			ctx.currentRegionColors,
			ctx.currentOccupationOverlay,
		)
		const mapUpdated = applyFaceRegionColors(
			ctx.mapMesh,
			ctx.mapFaceToRegion,
			ctx.currentRegionColors,
			ctx.currentOccupationOverlay,
		)
		return terrainUpdated || mapUpdated
	}

	function recolorModeColorsInPlace(): boolean {
		if (!ctx.currentWorld || ctx.currentRegionColors) return false
		const terrainUpdated = applyTerrainColorModeColors(
			ctx.terrainMesh,
			ctx.currentWorld,
			ctx.currentColorMode,
			ctx.terrainFaceToRegion,
			ctx.currentOccupationOverlay,
		)
		const mapUpdated = applyMapColorModeColors(
			ctx.mapMesh,
			ctx.currentWorld,
			ctx.currentColorMode,
			ctx.mapFaceToRegion,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			ctx.currentOccupationOverlay,
		)
		return terrainUpdated || mapUpdated
	}

	function applyWaterMaterialForMode(mode: ColorMode) {
		const useTerrainWaterMaterial = mode === "terrain"
		const useVegetationWaterMaterial =
			mode === "vegetation" ||
			mode === "vegetationMaps" ||
			mode === "vegetationSatellite"
		if (useTerrainWaterMaterial) {
			ctx.waterMat.color.set(0xffffff)
			ctx.waterMat.opacity = 0.12
			ctx.waterMat.specular.set(DEFAULT_WATER_SPECULAR)
		} else {
			if (useVegetationWaterMaterial) {
				ctx.waterMat.color.setRGB(
					VEGETATION_WATER_BLUE[0],
					VEGETATION_WATER_BLUE[1],
					VEGETATION_WATER_BLUE[2],
				)
			} else {
				ctx.waterMat.color.set(0x0c3a6e)
			}
			ctx.waterMat.opacity = 0.12
			ctx.waterMat.specular.set(0x000000)
		}
		const riverHex = 0x8fc4e8
		for (const material of ctx.riverMaterials) {
			material.color.setHex(riverHex)
			material.opacity = useVegetationWaterMaterial
				? 1
				: (material.userData.baseOpacity ?? material.opacity)
			material.transparent = !useVegetationWaterMaterial
			material.needsUpdate = true
		}
		if (ctx.currentViewMode === "globe") {
			ctx.waterMesh.visible = true
			ctx.atmosMesh.visible = ctx.sun.intensity > 0
		}
	}

	function rebuildTerrain() {
		if (!ctx.currentWorld) return
		disposeObject3D(ctx.globeGroup, ctx.terrainMesh)
		disposeObject3D(ctx.scene, ctx.mapMesh)
		deps.resetMapSolarTerminator()
		ctx.terrainMesh = null
		ctx.mapMesh = null
		const terrainBuild = buildTerrainMesh(
			ctx.currentWorld,
			ctx.currentColorMode,
			ctx.currentRegionColors,
			ctx.elevationVisible,
		)
		ctx.terrainMesh = terrainBuild.mesh
		ctx.terrainFaceToRegion = terrainBuild.faceToRegion
		const mapBuild = buildMapMesh(
			ctx.currentWorld,
			ctx.currentColorMode,
			ctx.currentRegionColors,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
		)
		ctx.mapMesh = mapBuild.mesh
		ctx.mapFaceToRegion = mapBuild.faceToRegion
		ctx.globeGroup.add(ctx.terrainMesh)
		ctx.scene.add(ctx.mapMesh)
		reapplyMeshOverlayState({
			world: ctx.currentWorld,
			colorMode: ctx.currentColorMode,
			regionColors: ctx.currentRegionColors,
			occupationOverlay: ctx.currentOccupationOverlay,
			terrainMesh: ctx.terrainMesh,
			terrainFaceToRegion: ctx.terrainFaceToRegion,
			mapMesh: ctx.mapMesh,
			mapFaceToRegion: ctx.mapFaceToRegion,
			mapCenterLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
			mapProjectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
		})
		deps.syncMapLighting()
		deps.rebuildOverlays()
		deps.setViewMode(ctx.currentViewMode)
	}

	function refreshMeshColors() {
		if (ctx.currentRegionColors) {
			if (!recolorMeshesInPlace()) rebuildTerrain()
			else deps.requestRender()
			return
		}
		if (!recolorModeColorsInPlace()) rebuildTerrain()
		else deps.requestRender()
	}

	function updateWorld(world: SerializedGenesisWorld | null) {
		if (ctx.currentWorld !== world) {
			deps.resetWorldChangeScriptState()
		}
		if (!world) {
			ctx.currentWorld = null
			deps.resetHoveredRegion()
			disposeObject3D(ctx.globeGroup, ctx.terrainMesh)
			disposeObject3D(ctx.scene, ctx.mapMesh)
			ctx.terrainMesh = null
			ctx.mapMesh = null
			deps.rebuildOverlays()
			deps.emitHover(null)
			return
		}
		const geometryUnchanged =
			!!ctx.currentWorld &&
			ctx.currentWorld.mesh === world.mesh &&
			ctx.currentWorld.elevation === world.elevation &&
			ctx.currentWorld.elevation_km === world.elevation_km &&
			ctx.currentWorld.provinces?.regionProvince ===
				world.provinces?.regionProvince
		ctx.currentWorld = world
		if (geometryUnchanged) {
			deps.rebuildNationBorders()
			deps.rebuildSelectedProvinceBorder()
			return
		}
		rebuildTerrain()
	}

	function setColorMode(mode: ColorMode) {
		if (mode === ctx.currentColorMode) return
		ctx.currentColorMode = mode
		applyWaterMaterialForMode(mode)
		refreshMeshColors()
	}

	function setRegionColors(colors: Float32Array | null) {
		if (ctx.currentRegionColors === colors) return
		ctx.currentRegionColors = colors
		refreshMeshColors()
	}

	function setDisplayColors(mode: ColorMode, colors: Float32Array | null) {
		if (mode === ctx.currentColorMode && ctx.currentRegionColors === colors)
			return
		ctx.currentColorMode = mode
		ctx.currentRegionColors = colors
		applyWaterMaterialForMode(mode)
		refreshMeshColors()
	}

	function setOccupationOverlay(overlay: Float32Array | null) {
		if (ctx.currentOccupationOverlay === overlay) return
		ctx.currentOccupationOverlay = overlay
		if (!recolorMeshesInPlace()) {
			rebuildTerrain()
			return
		}
		deps.updateOverlayVisibility()
	}

	return {
		rebuildTerrain,
		updateWorld,
		recolorMeshesInPlace,
		recolorModeColorsInPlace,
		applyWaterMaterialForMode,
		refreshMeshColors,
		setColorMode,
		setRegionColors,
		setDisplayColors,
		setOccupationOverlay,
	}
}

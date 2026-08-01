import * as THREE from "three"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { disposeGroup, disposeObject3D } from "@/ui/planet/renderer/disposal"
import { createAnimationLoopController } from "@/ui/planet/renderer/genesis-scene/animation-loop"
import { createCameraFocusController } from "@/ui/planet/renderer/genesis-scene/camera-focus-controller"
import { createDisposeController } from "@/ui/planet/renderer/genesis-scene/dispose"
import { createExportController } from "@/ui/planet/renderer/genesis-scene/export"
import { createInteractionController } from "@/ui/planet/renderer/genesis-scene/interaction-controller"
import { createCoastlineController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/coastline"
import { createHierarchyController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/hierarchy"
import { createInfrastructureController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/infrastructure"
import {
	createLabelsController,
	earthHistoryNationOverridesEqual,
} from "@/ui/planet/renderer/genesis-scene/overlay-controllers/labels"
import { createMeasurementController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/measurement"
import { createNationBordersController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/nation-borders"
import { createPathfindingController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/pathfinding"
import { createRiversWindThermalController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/rivers-wind-thermal"
import { createSettlementsController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/settlements"
import { createSolarTerminatorController } from "@/ui/planet/renderer/genesis-scene/overlay-controllers/solar-terminator"
import {
	buildGenesisSceneSetup,
	DEFAULT_AMBIENT_INTENSITY,
	DEFAULT_SUN_INTENSITY,
	DEFAULT_WATER_SPECULAR,
} from "@/ui/planet/renderer/genesis-scene/scene-setup"
import { createSolarSystemController } from "@/ui/planet/renderer/genesis-scene/solar-system-controller"
import { createTerrainController } from "@/ui/planet/renderer/genesis-scene/terrain-controller"
import { addMapSlideClones } from "@/ui/planet/renderer/map-export"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import {
	buildMapWireframe,
	buildTerrainWireframe,
} from "@/ui/planet/renderer/mesh-builders"
import { createNationLabelPools } from "@/ui/planet/renderer/nation-label-overlay/pool"
import { disposeScriptTextureCache } from "@/ui/planet/renderer/nation-script-overlay"
import {
	buildGlobeGrid,
	buildMapGrid,
} from "@/ui/planet/renderer/overlay-builders/grid"
import { loadGlobeCloudTexture } from "@/ui/planet/renderer/textures"
import type {
	GenesisScene,
	GenesisViewMode,
	OrgHighlightSpec,
} from "@/ui/planet/renderer/types"

const CONTROL_SETTLE_FRAMES = 2

export interface MapExportOptions {
	width: number
	centerLongitudeDeg?: number
	onProgress?: (percent: number, label: string) => void
}

export interface ExportRenderTargetLike {
	width?: number
	height?: number
	texture?:
		| {
				colorSpace?: string
		  }
		| Array<{
				colorSpace?: string
		  }>
	dispose: () => void
}

export interface MapExportVisibilityTarget {
	object: THREE.Object3D | null
	visible: boolean
}

export interface MapExportDependencies {
	createRenderTarget?: (width: number, height: number) => ExportRenderTargetLike
	yieldToMainThread?: () => Promise<void>
}

export interface ExportRendererLike {
	capabilities: {
		maxTextureSize: number
	}
	getRenderTarget: () => unknown
	setRenderTarget: (target: unknown | null) => void
	render: (sceneToRender: THREE.Scene, cameraToRender: THREE.Camera) => void
	readRenderTargetPixels: (
		target: unknown,
		x: number,
		y: number,
		width: number,
		height: number,
		buffer: Uint8Array,
	) => void
}

// lon/lat -> elevation_km, via nearest-mesh-region snapping (same technique
// import-heightmap.ts uses to place real river lines at the right height).
// Keyed by mesh object identity so it's built once per world's mesh, not
// once per rebuildNationBorders() call (which fires on most color-mode/
// timeline changes, far more often than the mesh itself changes).

export function createGenesisScene(
	canvas: HTMLCanvasElement,
	initialWorld?: SerializedGenesisWorld,
	dependencies: MapExportDependencies = {},
): GenesisScene {
	const context = buildGenesisSceneSetup(canvas)
	const {
		renderer,
		scene,
		camera,
		mapCamera,
		controls,
		mapControls,
		globeGroup,
		orbitGroup,
		ambient,
		sun,
		waterMat,
		waterMesh,
		atmosMat,
		atmosMesh,
		globeCloudMat,
		globeCloudMesh,
	} = context

	const solarTerminatorController = createSolarTerminatorController(context, {
		requestRender: () => requestRender(),
	})
	const {
		rebuildSolarTerminator,
		updateSolarTerminatorLabels,
		setSolarTerminatorVisible,
		setSolarTerminatorUseMeridiem,
	} = solarTerminatorController

	const {
		rebuildTerrain,
		updateWorld,
		applyWaterMaterialForMode,
		setColorMode,
		setRegionColors,
		setDisplayColors,
		setOccupationOverlay,
	} = createTerrainController(context, {
		rebuildOverlays: () => rebuildOverlays(),
		updateOverlayVisibility: () => updateOverlayVisibility(),
		setViewMode: (mode) => setViewMode(mode),
		syncMapLighting: () => syncMapLighting(),
		rebuildNationBorders: () => rebuildNationBorders(),
		rebuildSelectedProvinceBorder: () => rebuildSelectedProvinceBorder(),
		emitHover: (info) => emitHover(info),
		requestRender: () => requestRender(),
		resetMapSolarTerminator: () => {
			disposeGroup(scene, context.mapSolarTerminator)
			context.mapSolarTerminator = null
		},
		resetWorldChangeScriptState: () => {
			context.heritageScripts = null
			disposeScriptTextureCache(context.nationScriptTextureCache)
			context.pendingNationScriptTextureQueue = null
		},
		resetHoveredRegion: () => {
			context.hoveredRegion = -1
		},
	})

	function setGlobeCloudTexturePath(texturePath: string | null): void {
		if (!texturePath) {
			globeCloudMat.alphaMap = null
			globeCloudMat.needsUpdate = true
			globeCloudMesh.visible = false
			requestRender()
			return
		}
		globeCloudMat.alphaMap = loadGlobeCloudTexture(texturePath)
		globeCloudMat.needsUpdate = true
		globeCloudMesh.visible = false
		requestRender()
	}

	// Coastline overlay, on both the globe and the flat map. For a real
	// "Load Earth" world this is the exact Natural Earth vector data
	// (fetched once, cached, independent of any generated world). For a
	// procedurally generated world there's no real coastline to load, so
	// one is derived from the mesh's own land/ocean boundary and
	// Catmull-Rom-smoothed (see deriveCoastlineFromWorld) — computed lazily
	// (only when the overlay is actually toggled on) and cached per world
	// instance so toggling or map-longitude changes don't recompute it.
	const coastlineController = createCoastlineController(context, {
		requestRender: () => requestRender(),
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const setCoastlineOverlayVisible = coastlineController.setVisible

	const riversWindThermalController = createRiversWindThermalController(
		context,
		{ rebuildOverlays: () => rebuildOverlays() },
	)
	const { setThermalEquator, setWindArrows, setRivers, setRiversVisible } =
		riversWindThermalController

	function setAtmospherePressure(pressureBar: number) {
		const clamped = Math.max(
			0.1,
			Math.min(10, Number.isFinite(pressureBar) ? pressureBar : 1),
		)
		const pressureFactor = Math.pow(clamped, 0.4)
		atmosMat.uniforms.atmosphereStrength.value = 0.7 + pressureFactor * 0.45
		const shellScale = 1.105 + pressureFactor * 0.02
		atmosMesh.scale.setScalar(shellScale / 1.12)
		requestRender()
	}

	// Terrain mesh placeholder
	// Real EU4 province boundary vectors, used instead of the procedural mesh's
	// own Voronoi edges for nation/province borders when world.isEarthImport.
	// Static across all Earth-imported worlds, so fetched once and reused.
	// Real EU4 province fill polygons, paired with context.cachedEu4BorderGeometry --
	// see eu4-nation-fill-overlay.ts. Also static/fetched once.
	// Radius/projection the current fill meshes were actually built at, so a
	// rebuild triggered purely by a nation-ownership change (the common case
	// -- every timeline scrub tick creates a new context.currentNationFillColorForRawId
	// closure) can recolor the existing mesh in place instead of rebuilding
	// its (unchanged) position buffer from scratch. Null whenever the mesh
	// itself is null, so a stale radius never causes a wrongly-skipped rebuild.
	// Contested-province stripe overlay, drawn from the same real EU4
	// province polygons as the fill mesh above -- see eu4-nation-fill-
	// overlay.ts's buildEu4OccupationStripesGlobe/Map. Rebuilt fresh each
	// call (no in-place recolor path like the fill mesh has): contested
	// status is rare enough, and the mesh usually small enough, that this
	// hasn't needed the same optimization.
	// International organization label (HRE, Hanseatic League, ...) -- a
	// single org-name label in place of the member nations' own name labels
	// (see rebuildNationLabels' context.currentOrgHighlight branch). Territory
	// *coloring* is handled at region level in GenesisView's regionColors,
	// not here -- see OrgHighlightSpec's doc comment. context.currentOrgHighlight is
	// provided fresh each earth-history scrub tick while an organization's
	// wiki page is open (see GenesisView's organizationHighlightSpec), and
	// null the rest of the time.
	const orgLabelPools = createNationLabelPools()
	const globeOrgLabel: THREE.Group | null = null
	const mapOrgLabel: THREE.Group | null = null
	// Border LINES and nation LABELS are both traced/placed from
	// context.currentWorld.nations (assignment for border tracing; seeds for label
	// capital anchors) independently of the fill-color path
	// (setDisplayColors/setRegionColors) -- for Earth-imported worlds
	// scrubbing the earth-history timeline this override substitutes a
	// shadow nations object sourced from the folded history state, so both
	// track the selected date instead of always reflecting the static
	// generation-time assignment. See docs/earth-history-plan.md "Map modes
	// and hover gating".
	// Religion labels have no procedural equivalent (world.religions is
	// culture-indexed, not province-indexed, and the procedural UI never
	// exposed a religion label toggle) -- this overlay only ever renders
	// for Earth-imported worlds, driven by context.earthHistoryLabelPartitions.
	// Real culture/religion partitions (from the earth-history engine's
	// folded state) for Earth-imported worlds -- a different id space than
	// the procedural world.cultures/world.heritages, so culture/religion
	// labels are built directly via buildGlobePartitionLabels rather than
	// through a shadow `.cultures` object (see rebuildCultureLabels).

	const animationLoopController = createAnimationLoopController(context, {
		stepFocusTween: () => stepFocusTween(),
		stepPulse: () => stepPulse(),
		stepSolarSystemFocusTween: () => stepSolarSystemFocusTween(),
		updateSolarTerminatorLabels: (radius) =>
			updateSolarTerminatorLabels(radius),
	})
	const { requestRender, syncAnimationState } = animationLoopController

	function updateMapCameraFrustum() {
		const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
		const mapAspect = 2
		let halfW: number
		let halfH: number
		if (aspect > mapAspect) {
			halfH = 1.15
			halfW = halfH * aspect
		} else {
			halfW = 2.3
			halfH = halfW / aspect
		}
		mapCamera.left = -halfW
		mapCamera.right = halfW
		mapCamera.top = halfH
		mapCamera.bottom = -halfH
		mapCamera.updateProjectionMatrix()
	}

	const hierarchyController = createHierarchyController(context, {
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const setHierarchyOverlay = hierarchyController.setHierarchyOverlay

	const settlementsController = createSettlementsController(context, {
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const {
		rebuildSettlementOverlay,
		rebuildEu4SettlementOverlay,
		setSettlements,
		setSettlementsVisible,
		setEu4Settlements,
		setEu4SettlementsVisible,
	} = settlementsController

	const labelsController = createLabelsController(context, {
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const {
		rebuildNationLabels,
		rebuildSettlementLabels,
		rebuildCultureLabels,
		rebuildReligionLabels,
		rebuildHeritageLabels,
		setLabelMode,
		setNationNames,
		setDynastyNames,
		setCultureNames,
		setHeritageNames,
		setSettlementNames,
		setEarthHistoryLabelPartitions,
	} = labelsController

	const nationBordersController = createNationBordersController(context, {
		requestRender: () => requestRender(),
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const {
		getWorldForBorders,
		rebuildNationBorders,
		rebuildSelectedProvinceBorder,
		setNationFillColorForRawId,
		setNationOccupationStripeColorForRawId,
		setNationBordersVisible,
		setLandNationBordersVisible,
		setSelectedProvince,
	} = nationBordersController

	const cameraFocusController = createCameraFocusController(context, {
		requestRender: () => requestRender(),
		syncAnimationState: () => syncAnimationState(),
		setSelectedProvince: (provinceId) => setSelectedProvince(provinceId),
		getWorldForBorders: () => getWorldForBorders(),
		rebuildTerrain: () => rebuildTerrain(),
		rebuildOverlays: () => rebuildOverlays(),
	})
	const {
		focusOnNation,
		focusOnProvince,
		stepPulse,
		stepFocusTween,
		setMapCenterLongitude,
		setMapProjectionLatitude,
		commitMapCenterLongitude,
	} = cameraFocusController

	const solarSystemController = createSolarSystemController(context, {
		requestRender: () => requestRender(),
		syncAnimationState: () => syncAnimationState(),
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const {
		stepSolarSystemFocusTween,
		focusOnSystemBody,
		setMoonOrbitOverlay,
		updateMoonOrbitOverlay,
		updateMoonOrbitDay,
		setSolarSystemActive,
		setSolarSystemOverlay,
		updateSolarSystemOverlay,
		updateSolarSystemDay,
		setSolarSystemSpinHours,
		setSolarSystemFocusChangeHandler,
	} = solarSystemController

	const interactionController = createInteractionController(context, {
		setSelectedProvince: (provinceId) => setSelectedProvince(provinceId),
		focusOnSystemBody: (bodyIndex, moonIndex) =>
			focusOnSystemBody(bodyIndex, moonIndex),
	})
	const {
		setHoveredRegion,
		emitHover,
		clearHover,
		updateHover,
		handlePointerDown,
		handleClick,
		handleSolarSystemDoubleClick,
		setHoverHandler,
		setClickHandler,
	} = interactionController

	const exportController = createExportController(context, {
		requestRender: () => requestRender(),
		setMapCenterLongitude: (longitudeDeg) =>
			setMapCenterLongitude(longitudeDeg),
		mapExportDependencies: dependencies,
	})
	const { exportMapPng } = exportController

	const infrastructureController = createInfrastructureController(context, {
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const rebuildTradeRouteOverlay = infrastructureController.rebuild
	const setInfrastructure = infrastructureController.setInfrastructure
	const setInfrastructureVisible =
		infrastructureController.setInfrastructureVisible

	function rebuildOverlays() {
		disposeObject3D(globeGroup, context.terrainWireframe)
		disposeObject3D(scene, context.mapWireframe)
		disposeObject3D(globeGroup, context.globeGrid)
		disposeObject3D(scene, context.mapGrid)
		disposeGroup(scene, context.mapSolarTerminator)
		disposeObject3D(globeGroup, context.globeNationBorders)
		disposeObject3D(scene, context.mapNationBorders)
		disposeObject3D(globeGroup, context.globeLandNationBorders)
		disposeObject3D(scene, context.mapLandNationBorders)
		disposeObject3D(globeGroup, context.globeNationFill)
		disposeObject3D(scene, context.mapNationFill)
		disposeObject3D(globeGroup, context.globeOccupationStripes)
		disposeObject3D(scene, context.mapOccupationStripes)
		disposeObject3D(globeGroup, context.globeSelectedProvinceBorder)
		disposeObject3D(scene, context.mapSelectedProvinceBorder)
		disposeObject3D(globeGroup, context.pulseGlobe)
		disposeObject3D(scene, context.pulseMap)
		disposeGroup(globeGroup, context.globeHierarchyOverlay)
		disposeGroup(scene, context.mapHierarchyOverlay)
		disposeGroup(globeGroup, context.globeSettlements)
		disposeGroup(scene, context.mapSettlements)
		disposeGroup(globeGroup, context.globeEu4Settlements)
		disposeGroup(scene, context.mapEu4Settlements)
		disposeGroup(globeGroup, context.globeInfrastructure)
		disposeGroup(scene, context.mapInfrastructure)
		disposeGroup(globeGroup, context.globeNationLabels)
		disposeGroup(scene, context.mapNationLabels)
		if (context.globeNationScripts)
			globeGroup.remove(context.globeNationScripts)
		if (context.mapNationScripts) scene.remove(context.mapNationScripts)
		disposeGroup(globeGroup, context.globeSettlementLabels)
		disposeGroup(scene, context.mapSettlementLabels)
		context.terrainWireframe = null
		context.mapWireframe = null
		context.globeGrid = null
		context.mapGrid = null
		context.mapSolarTerminator = null
		context.globeNationBorders = null
		context.mapNationBorders = null
		context.globeLandNationBorders = null
		context.mapLandNationBorders = null
		context.globeNationFill = null
		context.mapNationFill = null
		context.globeNationFillRadius = null
		context.mapNationFillParams = null
		context.globeOccupationStripes = null
		context.mapOccupationStripes = null
		context.nationBorderMaterials = []
		context.landNationBorderMaterials = []
		context.pulseGlobe = null
		context.pulseMap = null
		context.pulse = null
		context.globeHierarchyOverlay = null
		context.mapHierarchyOverlay = null
		context.globeSettlements = null
		context.mapSettlements = null
		context.settlementsDirty = true
		context.globeInfrastructure = null
		context.mapInfrastructure = null
		context.globeNationLabels = null
		context.mapNationLabels = null
		context.globeNationScripts = null
		context.mapNationScripts = null
		context.globeSettlementLabels = null
		context.mapSettlementLabels = null
		syncAnimationState()

		if (context.wireframeVisible && context.currentWorld) {
			context.terrainWireframe = buildTerrainWireframe(
				context.currentWorld,
				context.wireframeVisible,
				context.currentViewMode,
				context.elevationVisible,
			)
			globeGroup.add(context.terrainWireframe)
		}
		if (context.wireframeVisible && context.currentWorld) {
			context.mapWireframe = buildMapWireframe({
				world: context.currentWorld,
				centerLongitudeDeg: context.currentMapCenterLongitudeDeg,
				projectionLatitudeDeg: context.currentMapProjectionLatitudeDeg,
				wireframeVisible: context.wireframeVisible,
				viewMode: context.currentViewMode,
			})
			addMapSlideClones(context.mapWireframe)
			scene.add(context.mapWireframe)
		}
		if (context.gridVisible) {
			context.globeGrid = buildGlobeGrid(
				context.gridSpacingDeg,
				context.gridVisible,
				context.currentViewMode,
				context.elevationVisible,
			)
			context.mapGrid = buildMapGrid(
				context.gridSpacingDeg,
				context.currentMapProjectionLatitudeDeg,
				context.gridVisible,
				context.currentViewMode,
			)
			globeGroup.add(context.globeGrid)
			addMapSlideClones(context.mapGrid)
			scene.add(context.mapGrid)
		}
		coastlineController.rebuild()
		riversWindThermalController.rebuildThermalEquator()
		rebuildSolarTerminator()
		riversWindThermalController.rebuildWindArrows()
		riversWindThermalController.rebuildRivers()
		applyWaterMaterialForMode(context.currentColorMode)
		rebuildNationBorders()
		rebuildSelectedProvinceBorder()
		hierarchyController.rebuild()
		rebuildSettlementOverlay()
		rebuildEu4SettlementOverlay()
		rebuildTradeRouteOverlay()
		rebuildNationLabels()
		updateOverlayVisibility()
	}

	function updateOverlayVisibility() {
		const showMap =
			context.currentViewMode === "map" && !context.solarSystemActive
		if (context.globeCoastlineOverlay)
			context.globeCoastlineOverlay.visible =
				context.coastlineOverlayVisible && context.currentViewMode === "globe"
		if (context.mapCoastlineOverlay) {
			context.mapCoastlineOverlay.visible =
				context.coastlineOverlayVisible && showMap
			if (context.mapMesh)
				context.mapCoastlineOverlay.position.copy(context.mapMesh.position)
		}
		if (context.terrainWireframe)
			context.terrainWireframe.visible =
				context.wireframeVisible && context.currentViewMode === "globe"
		if (context.mapWireframe) {
			context.mapWireframe.visible = context.wireframeVisible && showMap
			if (context.mapMesh)
				context.mapWireframe.position.copy(context.mapMesh.position)
		}
		if (context.globeNationFill)
			context.globeNationFill.visible = context.currentViewMode === "globe"
		if (context.mapNationFill) {
			context.mapNationFill.visible = showMap
			if (context.mapMesh)
				context.mapNationFill.position.copy(context.mapMesh.position)
		}
		if (context.globeOccupationStripes)
			context.globeOccupationStripes.visible =
				context.currentViewMode === "globe"
		if (context.mapOccupationStripes) {
			context.mapOccupationStripes.visible = showMap
			if (context.mapMesh)
				context.mapOccupationStripes.position.copy(context.mapMesh.position)
		}
		if (context.globeLandNationBorders)
			context.globeLandNationBorders.visible =
				context.currentViewMode === "globe" && context.landNationBordersVisible
		if (context.mapLandNationBorders) {
			context.mapLandNationBorders.visible =
				showMap && context.landNationBordersVisible
			if (context.mapMesh)
				context.mapLandNationBorders.position.copy(context.mapMesh.position)
		}
		if (context.globeNationBorders)
			context.globeNationBorders.visible =
				context.currentViewMode === "globe" && context.nationBordersVisible
		if (context.mapNationBorders) {
			context.mapNationBorders.visible = showMap && context.nationBordersVisible
			if (context.mapMesh)
				context.mapNationBorders.position.copy(context.mapMesh.position)
		}
		if (globeOrgLabel)
			globeOrgLabel.visible = context.currentViewMode === "globe"
		if (mapOrgLabel) {
			mapOrgLabel.visible = showMap
			if (context.mapMesh) mapOrgLabel.position.copy(context.mapMesh.position)
		}
		if (context.globeSelectedProvinceBorder)
			context.globeSelectedProvinceBorder.visible =
				context.currentViewMode === "globe"
		if (context.mapSelectedProvinceBorder) {
			context.mapSelectedProvinceBorder.visible = showMap
			if (context.mapMesh)
				context.mapSelectedProvinceBorder.position.copy(
					context.mapMesh.position,
				)
		}
		if (context.globeGrid)
			context.globeGrid.visible =
				context.gridVisible && context.currentViewMode === "globe"
		if (context.mapGrid) {
			context.mapGrid.visible = context.gridVisible && showMap
			if (context.mapMesh)
				context.mapGrid.position.copy(context.mapMesh.position)
		}
		if (context.globeThermalEquator)
			context.globeThermalEquator.visible = context.currentViewMode === "globe"
		if (context.mapThermalEquator) {
			context.mapThermalEquator.visible = showMap
			if (context.mapMesh)
				context.mapThermalEquator.position.copy(context.mapMesh.position)
		}
		if (context.mapSolarTerminator) {
			context.mapSolarTerminator.visible =
				context.solarTerminatorVisible && showMap
			if (context.mapMesh)
				context.mapSolarTerminator.position.copy(context.mapMesh.position)
		}
		if (context.globeWindArrows)
			context.globeWindArrows.visible = context.currentViewMode === "globe"
		if (context.mapWindArrows) {
			context.mapWindArrows.visible = showMap
			if (context.mapMesh)
				context.mapWindArrows.position.copy(context.mapMesh.position)
		}
		if (context.globeRivers)
			context.globeRivers.visible =
				context.riversVisible && context.currentViewMode === "globe"
		if (context.mapRivers) {
			context.mapRivers.visible = context.riversVisible && showMap
			if (context.mapMesh)
				context.mapRivers.position.copy(context.mapMesh.position)
		}
		if (context.globeMeasureLine)
			context.globeMeasureLine.visible = context.currentViewMode === "globe"
		if (context.mapMeasureLine) {
			context.mapMeasureLine.visible = showMap
			if (context.mapMesh)
				context.mapMeasureLine.position.copy(context.mapMesh.position)
		}
		if (context.globeMeasureDots)
			context.globeMeasureDots.visible = context.currentViewMode === "globe"
		if (context.mapMeasureDots) {
			context.mapMeasureDots.visible = showMap
			if (context.mapMesh)
				context.mapMeasureDots.position.copy(context.mapMesh.position)
		}
		if (context.globeHierarchyOverlay)
			context.globeHierarchyOverlay.visible =
				context.currentViewMode === "globe"
		if (context.mapHierarchyOverlay) {
			context.mapHierarchyOverlay.visible = showMap
			if (context.mapMesh)
				context.mapHierarchyOverlay.position.copy(context.mapMesh.position)
		}
		if (context.globeSettlements)
			context.globeSettlements.visible =
				context.settlementsVisible && context.currentViewMode === "globe"
		if (context.mapSettlements) {
			context.mapSettlements.visible = context.settlementsVisible && showMap
			if (context.mapMesh)
				context.mapSettlements.position.copy(context.mapMesh.position)
		}
		if (context.globeEu4Settlements)
			context.globeEu4Settlements.visible =
				context.eu4SettlementsVisible && context.currentViewMode === "globe"
		if (context.mapEu4Settlements) {
			context.mapEu4Settlements.visible =
				context.eu4SettlementsVisible && showMap
			if (context.mapMesh)
				context.mapEu4Settlements.position.copy(context.mapMesh.position)
		}
		if (context.globeInfrastructure)
			context.globeInfrastructure.visible =
				context.infrastructureVisible && context.currentViewMode === "globe"
		if (context.mapInfrastructure) {
			context.mapInfrastructure.visible =
				context.infrastructureVisible && showMap
			if (context.mapMesh)
				context.mapInfrastructure.position.copy(context.mapMesh.position)
		}
		if (context.globeNationLabels)
			context.globeNationLabels.visible =
				(context.labelMode.nations || context.labelMode.dynasty) &&
				context.currentViewMode === "globe"
		if (context.globeNationScripts)
			context.globeNationScripts.visible =
				context.labelMode.script &&
				(context.labelMode.nations || context.labelMode.dynasty) &&
				context.currentViewMode === "globe"
		if (context.mapNationLabels) {
			context.mapNationLabels.visible =
				(context.labelMode.nations || context.labelMode.dynasty) && showMap
			if (context.mapMesh)
				context.mapNationLabels.position.copy(context.mapMesh.position)
		}
		if (context.mapNationScripts) {
			context.mapNationScripts.visible =
				context.labelMode.script &&
				(context.labelMode.nations || context.labelMode.dynasty) &&
				showMap
			if (context.mapMesh)
				context.mapNationScripts.position.copy(context.mapMesh.position)
		}
		if (context.globeSettlementLabels)
			context.globeSettlementLabels.visible =
				context.labelMode.settlements && context.currentViewMode === "globe"
		if (context.mapSettlementLabels) {
			context.mapSettlementLabels.visible =
				context.labelMode.settlements && showMap
			if (context.mapMesh)
				context.mapSettlementLabels.position.copy(context.mapMesh.position)
		}
		if (context.globeCultureLabels)
			context.globeCultureLabels.visible =
				context.labelMode.culture && context.currentViewMode === "globe"
		if (context.mapCultureLabels) {
			context.mapCultureLabels.visible = context.labelMode.culture && showMap
			if (context.mapMesh)
				context.mapCultureLabels.position.copy(context.mapMesh.position)
		}
		if (context.globeHeritageLabels)
			context.globeHeritageLabels.visible =
				context.labelMode.heritage && context.currentViewMode === "globe"
		if (context.mapHeritageLabels) {
			context.mapHeritageLabels.visible = context.labelMode.heritage && showMap
			if (context.mapMesh)
				context.mapHeritageLabels.position.copy(context.mapMesh.position)
		}
		if (context.globeReligionLabels)
			context.globeReligionLabels.visible =
				context.labelMode.religion && context.currentViewMode === "globe"
		if (context.mapReligionLabels) {
			context.mapReligionLabels.visible = context.labelMode.religion && showMap
			if (context.mapMesh)
				context.mapReligionLabels.position.copy(context.mapMesh.position)
		}
		requestRender()
	}

	function setEarthHistoryNationOverride(
		override: {
			assignment: Int32Array
			seeds: Int32Array
			names: string[]
		} | null,
	) {
		if (
			earthHistoryNationOverridesEqual(
				context.earthHistoryNationOverride,
				override,
			)
		)
			return
		context.earthHistoryNationOverride = override
		rebuildNationBorders()
		rebuildNationLabels()
	}

	/** Current territory highlight for one international organization (HRE,
	 * Hanseatic League, ...), from GenesisView's organizationHighlightSpec --
	 * recomputed fresh from FoldedState each earth-history scrub tick, so
	 * this always does a full rebuild rather than an in-place update. Pass
	 * null exactly when no organization's wiki page is open, which both
	 * clears the fill highlight and lets rebuildNationLabels resume showing
	 * normal nation name labels. */
	function setOrganizationHighlight(spec: OrgHighlightSpec | null) {
		if (context.currentOrgHighlight === spec) return
		context.currentOrgHighlight = spec
		// rebuildNationBorders' border-line tracing never reads
		// context.currentOrgHighlight (territory coloring is region-level, handled by
		// GenesisView's withOrgHighlight instead) -- only labels branch on it
		// (rebuildNationLabels' context.currentOrgHighlight check). Calling
		// rebuildNationBorders here would re-trace every border in the world a
		// second time for no visual effect, on top of the identical rebuild
		// setEarthHistoryNationOverride already triggers the same tick.
		rebuildNationLabels()
	}

	function setViewMode(mode: GenesisViewMode) {
		context.currentViewMode = mode
		const isMap = mode === "map"
		controls.enabled = !isMap
		mapControls.enabled = isMap
		if (context.terrainMesh) context.terrainMesh.visible = !isMap
		if (context.mapMesh) context.mapMesh.visible = isMap
		waterMesh.visible = !isMap
		atmosMesh.visible = !isMap && sun.intensity > 0
		globeCloudMesh.visible = false
		if (context.globeSolarTerminator)
			context.globeSolarTerminator.visible = !isMap
		if (context.mapSolarTerminator) context.mapSolarTerminator.visible = isMap
		updateOverlayVisibility()
		syncAnimationState()
	}

	function setWireframeVisible(visible: boolean) {
		if (context.wireframeVisible === visible) return
		context.wireframeVisible = visible
		rebuildOverlays()
	}

	function setGridVisible(visible: boolean) {
		if (context.gridVisible === visible) return
		context.gridVisible = visible
		rebuildOverlays()
	}

	function setGridSpacing(spacingDeg: number) {
		if (context.gridSpacingDeg === spacingDeg) return
		context.gridSpacingDeg = spacingDeg
		rebuildOverlays()
	}

	if (initialWorld) {
		updateWorld(initialWorld)
	} else {
		requestRender()
	}

	function resize() {
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		camera.aspect = w / h
		camera.updateProjectionMatrix()
		updateMapCameraFrustum()
		renderer.setSize(w, h, false)
		for (const mat of context.coastlineMaterials) mat.resolution.set(w, h)
		for (const mat of context.riverMaterials) mat.resolution.set(w, h)
		for (const mat of context.pulseMaterials) mat.resolution.set(w, h)
		for (const mat of context.infrastructureMaterials) mat.resolution.set(w, h)
		for (const mat of context.nationBorderMaterials) mat.resolution.set(w, h)
		for (const mat of context.landNationBorderMaterials)
			mat.resolution.set(w, h)
		if (context.selectedProvince >= 0) rebuildSelectedProvinceBorder()
		requestRender()
	}

	updateMapCameraFrustum()

	canvas.addEventListener("pointermove", updateHover)
	canvas.addEventListener("pointerleave", clearHover)
	canvas.addEventListener("pointerdown", handlePointerDown)
	canvas.addEventListener("pointerup", handleClick)
	canvas.addEventListener("dblclick", handleSolarSystemDoubleClick)
	controls.addEventListener("start", () => {
		context.globeControlsInteracting = true
		context.globeControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	controls.addEventListener("change", () => {
		context.globeControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	controls.addEventListener("end", () => {
		context.globeControlsInteracting = false
		context.globeControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	mapControls.addEventListener("start", () => {
		context.mapControlsInteracting = true
		context.mapControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	mapControls.addEventListener("change", () => {
		context.mapControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})
	mapControls.addEventListener("end", () => {
		context.mapControlsInteracting = false
		context.mapControlActivityFrames = CONTROL_SETTLE_FRAMES
		syncAnimationState()
		requestRender()
	})

	const { dispose } = createDisposeController(context, {
		disposeAnimationLoop: () => animationLoopController.dispose(),
		removeEventListeners: () => {
			canvas.removeEventListener("pointermove", updateHover)
			canvas.removeEventListener("pointerleave", clearHover)
			canvas.removeEventListener("pointerdown", handlePointerDown)
			canvas.removeEventListener("pointerup", handleClick)
			canvas.removeEventListener("dblclick", handleSolarSystemDoubleClick)
		},
		disposeLabelPools: () => labelsController.disposePools(),
		globeOrgLabel,
		mapOrgLabel,
		orgLabelPools,
	})

	const { setMeasureLine } = createMeasurementController(context, {
		requestRender: () => requestRender(),
	})
	const { setPathfindingOverlay } = createPathfindingController(context, {
		requestRender: () => requestRender(),
	})

	function projectToScreen(
		xyz: [number, number, number],
		lonOffsetRad = 0,
	): [number, number] | null {
		const cam = context.currentViewMode === "map" ? mapCamera : camera
		const v = new THREE.Vector3(...xyz)
		if (context.currentViewMode === "map") {
			const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
			const projection = createMapProjection(
				context.currentMapCenterLongitudeDeg,
				context.currentMapProjectionLatitudeDeg,
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
			if (context.mapMesh) v.add(context.mapMesh.position)
		} else {
			v.normalize().multiplyScalar(1.005)
			globeGroup.updateWorldMatrix(true, false)
			v.applyMatrix4(globeGroup.matrixWorld)
		}
		v.project(cam)
		if (v.z > 1) return null
		const w = canvas.clientWidth
		const h = canvas.clientHeight
		return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h]
	}

	// Sun is fixed at +X. The globe spins (Z) for time-of-day and tilts (Y)
	// for obliquity. orbitGroup gets the obliquity tilt only so orbit rings
	// stay in the ecliptic plane regardless of the planet's rotation.
	const SUN_DIST = 10
	const Y_AXIS = new THREE.Vector3(0, 1, 0)
	const Z_AXIS = new THREE.Vector3(0, 0, 1)
	sun.position.set(SUN_DIST, 0, 0)
	context.currentSunDirection.set(1, 0, 0)
	atmosMat.uniforms.sunDirection.value.set(1, 0, 0)

	function applyGlobeOrientation(subSolarLatRad: number, spinAngle: number) {
		// Obliquity: north pole tips toward sun (+X) by subSolarLatRad → Y rotation
		const obliquityQ = new THREE.Quaternion().setFromAxisAngle(
			Y_AXIS,
			subSolarLatRad,
		)
		// Spin: planet rotates around its own pole (Z) for time-of-day
		const spinQ = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, spinAngle)
		// Globe = obliquity then spin (spin is in globe-local space)
		globeGroup.quaternion.copy(obliquityQ).multiply(spinQ)
		// Orbit rings: obliquity tilt only, no spin
		orbitGroup.quaternion.copy(obliquityQ)
		// Sun direction in globe-local space for the solar terminator
		context.currentLocalSunDirection
			.copy(context.currentSunDirection)
			.applyQuaternion(globeGroup.quaternion.clone().invert())
	}

	/**
	 * Position sun from month (season) and time-of-day (planet spin).
	 * month 0 = equinox, 1-12 = Jan-Dec.
	 * timeOfDay in hours [0, hoursPerDay).
	 */
	function setSunPosition(
		month: number,
		obliquityDeg: number,
		timeOfDay: number,
		hoursPerDay: number,
	) {
		const oblRad = (obliquityDeg * Math.PI) / 180
		const subSolarLat =
			month === 0 ? 0 : oblRad * Math.sin((2 * Math.PI * (month - 4)) / 12)
		// Spin angle: offset by Ï€ so noon (timeOfDay=hoursPerDay/2) faces +X (sun)
		const spinAngle = Math.PI + 2 * Math.PI * (timeOfDay / (hoursPerDay || 24))
		context.currentSunHoursPerDay = hoursPerDay || 24
		applyGlobeOrientation(subSolarLat, spinAngle)
		syncMapLighting()
		if (context.solarTerminatorVisible) rebuildSolarTerminator()
		requestRender()
	}

	function setSunDirection(
		x: number,
		y: number,
		z: number,
		hoursPerDay: number,
	) {
		// For tidally-locked mode: the sun direction is fixed in world space,
		// so the globe spin is whatever longitude places that substellar point
		// under +X.
		const subSolarLatRad = Math.asin(Math.max(-1, Math.min(1, z)))
		const spinAngle = -Math.atan2(y, x)
		context.currentSunHoursPerDay = hoursPerDay || 24
		applyGlobeOrientation(subSolarLatRad, spinAngle)
		syncMapLighting()
		if (context.solarTerminatorVisible) rebuildSolarTerminator()
		requestRender()
	}

	function syncMapLighting() {
		if (!context.mapMesh) return
		const mat = context.mapMesh.material as THREE.ShaderMaterial
		const invPi = 1 / Math.PI
		mat.uniforms.uAmbient.value.set(
			ambient.color.r * ambient.intensity * invPi,
			ambient.color.g * ambient.intensity * invPi,
			ambient.color.b * ambient.intensity * invPi,
		)
		mat.uniforms.uSunDirection.value
			.copy(context.currentLocalSunDirection)
			.normalize()
		mat.uniforms.uSunLight.value.set(
			sun.color.r * sun.intensity * invPi,
			sun.color.g * sun.intensity * invPi,
			sun.color.b * sun.intensity * invPi,
		)
	}

	function setFullAmbient(enabled: boolean) {
		if (enabled) {
			ambient.color.set(0xffffff)
			ambient.intensity = 2.5
			sun.intensity = 0
			atmosMesh.visible = false
			waterMat.specular.set(0x000000)
		} else {
			ambient.color.set(0x667788)
			ambient.intensity = DEFAULT_AMBIENT_INTENSITY
			sun.intensity = DEFAULT_SUN_INTENSITY
			if (context.currentViewMode === "globe") atmosMesh.visible = true
			waterMat.specular.set(
				context.currentColorMode === "terrain"
					? DEFAULT_WATER_SPECULAR
					: 0x000000,
			)
		}
		syncMapLighting()
		requestRender()
	}

	function setElevationVisible(visible: boolean) {
		if (context.elevationVisible === visible) return
		context.elevationVisible = visible
		if (context.currentWorld) rebuildTerrain()
		rebuildSolarTerminator()
		rebuildNationLabels()
		rebuildSettlementLabels()
		rebuildCultureLabels()
		rebuildHeritageLabels()
		rebuildReligionLabels()
	}

	return {
		dispose,
		resize,
		updateWorld,
		exportMapPng,
		setColorMode,
		setRegionColors,
		setDisplayColors,
		setNationFillColorForRawId,
		setNationOccupationStripeColorForRawId,
		setOccupationOverlay,
		setHoveredRegion,
		setNationBordersVisible,
		setEarthHistoryNationOverride,
		setLandNationBordersVisible,
		setOrganizationHighlight,
		setViewMode,
		setWireframeVisible,
		setGridVisible,
		setGridSpacing,
		setMapCenterLongitude,
		setMapProjectionLatitude,
		commitMapCenterLongitude,
		setHoverHandler,
		setClickHandler,
		setMeasureLine,
		setPathfindingOverlay,
		projectToScreen,
		getGlobeCameraDir(): [number, number, number] | null {
			if (context.currentViewMode !== "globe") return null
			const p = camera.position
			if (p.x === 0 && p.y === 0 && p.z === 0) return null
			// Transform camera world position into globe-body space so the
			// dot-product visibility test matches particle positions (body space).
			globeGroup.updateWorldMatrix(true, false)
			const bodyPos = p
				.clone()
				.applyMatrix4(globeGroup.matrixWorld.clone().invert())
			return [bodyPos.x, bodyPos.y, bodyPos.z]
		},
		setThermalEquator,
		setWindArrows,
		setRivers,
		setRiversVisible,
		setHierarchyOverlay,
		setSettlements,
		setSettlementsVisible,
		setEu4Settlements,
		setEu4SettlementsVisible,
		setInfrastructure,
		setInfrastructureVisible,
		setLabelMode,
		setNationNames,
		setDynastyNames,
		setCultureNames,
		setHeritageNames,
		setEarthHistoryLabelPartitions,
		setSettlementNames,
		setElevationVisible,
		setSunPosition,
		setSunDirection,
		setSolarTerminatorUseMeridiem,
		setSolarTerminatorVisible,
		setAtmospherePressure,
		setGlobeCloudTexturePath,
		setCoastlineOverlayVisible,
		setFullAmbient,
		focusOnNation,
		focusOnProvince,
		setMoonOrbitOverlay,
		updateMoonOrbitOverlay,
		updateMoonOrbitDay,
		setSolarSystemActive,
		setSolarSystemOverlay,
		updateSolarSystemOverlay,
		updateSolarSystemDay,
		setSolarSystemSpinHours,
		focusOnSystemBody,
		setSolarSystemFocusChangeHandler,
	}
}

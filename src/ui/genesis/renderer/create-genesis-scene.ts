import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import { createAnimationLoopController } from "@/ui/genesis/renderer/genesis-scene/animation-loop"
import { createCameraFocusController } from "@/ui/genesis/renderer/genesis-scene/camera-focus-controller"
import { createDisposeController } from "@/ui/genesis/renderer/genesis-scene/dispose"
import { createExportController } from "@/ui/genesis/renderer/genesis-scene/export"
import { createInteractionController } from "@/ui/genesis/renderer/genesis-scene/interaction-controller"
import { createLightingController } from "@/ui/genesis/renderer/genesis-scene/lighting-controller"
import { createOverlayAggregatorController } from "@/ui/genesis/renderer/genesis-scene/overlay-aggregator"
import { createCoastlineController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/coastline"
import { createInfrastructureController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/infrastructure"
import {
	createLabelsController,
	earthHistoryNationOverridesEqual,
} from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/labels"
import { createMeasurementController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/measurement"
import { createNationBordersController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/nation-borders"
import { createPathfindingController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/pathfinding"
import { createRealmBordersController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/realm-borders"
import { createRiversWindThermalController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/rivers-wind-thermal"
import { createSettlementsController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/settlements"
import { createSolarTerminatorController } from "@/ui/genesis/renderer/genesis-scene/overlay-controllers/solar-terminator"
import { createOverlayVisibilityController } from "@/ui/genesis/renderer/genesis-scene/overlay-visibility-controller"
import { buildGenesisSceneSetup } from "@/ui/genesis/renderer/genesis-scene/scene-setup"
import { createSolarSystemController } from "@/ui/genesis/renderer/genesis-scene/solar-system-controller"
import { createTerrainController } from "@/ui/genesis/renderer/genesis-scene/terrain-controller"
import type { MapExportDependencies } from "@/ui/genesis/renderer/genesis-scene/types"
import { createViewStateController } from "@/ui/genesis/renderer/genesis-scene/view-state-controller"
import { createNationLabelPools } from "@/ui/genesis/renderer/nation-label-overlay/pool"
import { disposeScriptTextureCache } from "@/ui/genesis/renderer/nation-script-overlay"
import { sizeNebulaBackground } from "@/ui/genesis/renderer/nebula-background"
import type { GenesisScene } from "@/ui/genesis/renderer/types"

const CONTROL_SETTLE_FRAMES = 2

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
		rebuildSettlementLabels: () => rebuildSettlementLabels(),
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

	const orgLabelPools = createNationLabelPools()

	const animationLoopController = createAnimationLoopController(context, {
		stepFocusTween: () => stepFocusTween(),
		stepPulse: () => stepPulse(),
		stepSolarSystemFocusTween: () => stepSolarSystemFocusTween(),
		renderSolarSystemView: () => renderSolarSystemView(),
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

	const realmBordersController = createRealmBordersController(context, {
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const setRealmBorders = realmBordersController.setRealmBorders

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
		setReligionNames,
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
		renderSolarSystemView,
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
		setNebulaBackgroundSeed,
	} = solarSystemController

	const interactionController = createInteractionController(context, {
		setSelectedProvince: (provinceId) => setSelectedProvince(provinceId),
		focusOnSystemBody: (address, opts) => focusOnSystemBody(address, opts),
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
		rebuildSettlementLabels: () => rebuildSettlementLabels(),
	})
	const rebuildTradeRouteOverlay = infrastructureController.rebuild
	const setInfrastructure = infrastructureController.setInfrastructure
	const setInfrastructureVisible =
		infrastructureController.setInfrastructureVisible

	const overlayVisibilityController = createOverlayVisibilityController(
		context,
		{ requestRender: () => requestRender() },
	)
	const { updateOverlayVisibility } = overlayVisibilityController

	const overlayAggregatorController = createOverlayAggregatorController(
		context,
		{
			syncAnimationState: () => syncAnimationState(),
			rebuildCoastline: () => coastlineController.rebuild(),
			rebuildThermalEquator: () =>
				riversWindThermalController.rebuildThermalEquator(),
			rebuildSolarTerminator: () => rebuildSolarTerminator(),
			rebuildWindArrows: () => riversWindThermalController.rebuildWindArrows(),
			rebuildRivers: () => riversWindThermalController.rebuildRivers(),
			applyWaterMaterialForMode: (mode) => applyWaterMaterialForMode(mode),
			rebuildNationBorders: () => rebuildNationBorders(),
			rebuildSelectedProvinceBorder: () => rebuildSelectedProvinceBorder(),
			rebuildRealmBorders: () => realmBordersController.rebuild(),
			rebuildSettlementOverlay: () => rebuildSettlementOverlay(),
			rebuildEu4SettlementOverlay: () => rebuildEu4SettlementOverlay(),
			rebuildTradeRouteOverlay: () => rebuildTradeRouteOverlay(),
			rebuildNationLabels: () => rebuildNationLabels(),
			updateOverlayVisibility: () => updateOverlayVisibility(),
		},
	)
	const { rebuildOverlays } = overlayAggregatorController

	const viewStateController = createViewStateController(context, {
		updateOverlayVisibility: () => updateOverlayVisibility(),
		syncAnimationState: () => syncAnimationState(),
		rebuildOverlays: () => rebuildOverlays(),
		rebuildNationBorders: () => rebuildNationBorders(),
		rebuildNationLabels: () => rebuildNationLabels(),
		rebuildTerrain: () => rebuildTerrain(),
		rebuildSolarTerminator: () => rebuildSolarTerminator(),
		rebuildSettlementLabels: () => rebuildSettlementLabels(),
		rebuildCultureLabels: () => rebuildCultureLabels(),
		rebuildHeritageLabels: () => rebuildHeritageLabels(),
		rebuildReligionLabels: () => rebuildReligionLabels(),
		earthHistoryNationOverridesEqual,
	})
	const {
		setEarthHistoryNationOverride,
		setOrganizationHighlight,
		setViewMode,
		setWireframeVisible,
		setGridVisible,
		setGridSpacing,
		setElevationVisible,
		projectToScreen,
	} = viewStateController

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
		sizeNebulaBackground({ mesh: context.nebulaBackground, renderer })
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
		orgLabelPools,
	})

	const { setMeasureLine } = createMeasurementController(context, {
		requestRender: () => requestRender(),
	})
	const { setPathfindingOverlay } = createPathfindingController(context, {
		requestRender: () => requestRender(),
	})

	// Sun is fixed at +X. The globe spins (Z) for time-of-day and tilts (Y)
	// for obliquity. orbitGroup gets the obliquity tilt only so orbit rings
	// stay in the ecliptic plane regardless of the planet's rotation. See
	// lighting-controller.ts.
	const lightingController = createLightingController(context, {
		requestRender: () => requestRender(),
		rebuildSolarTerminator: () => rebuildSolarTerminator(),
		updateOverlayVisibility: () => updateOverlayVisibility(),
	})
	const {
		setAtmospherePressure,
		setGlobeCloudTexturePath,
		setCloudsVisible,
		setSunPosition,
		setSunDirection,
		syncMapLighting,
		setFullAmbient,
	} = lightingController

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
		setRealmBorders,
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
		setReligionNames,
		setEarthHistoryLabelPartitions,
		setSettlementNames,
		setElevationVisible,
		setSunPosition,
		setSunDirection,
		setSolarTerminatorUseMeridiem,
		setSolarTerminatorVisible,
		setAtmospherePressure,
		setGlobeCloudTexturePath,
		setCloudsVisible,
		setCoastlineOverlayVisible,
		setFullAmbient,
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
		setNebulaBackgroundSeed,
	}
}

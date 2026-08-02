import { useEffect } from "react"
import {
	buildGhslSettlementPopulationSlice,
	topSettlementIndices,
} from "@/ui/genesis/generation/earth-assets"
import type { GenesisSceneSyncInput } from "@/ui/genesis/view/types"
/**
 * Pushes UI state into the live GenesisScene: hovered region, border and
 * grid visibility, projection/view mode, the settlement and infrastructure
 * marker sets (procedural dots vs. real EU4 settlements -- both share the
 * Infrastructure toggle but only one set is ever shown), and the label
 * overlays. Every effect here is one-way UI -> renderer.
 */
export function useGenesisSceneSync(input: GenesisSceneSyncInput) {
	const {
		sceneRef,
		worldForDisplay,
		earthHistory,
		hoverInfo,
		selectedNationId,
		viewMode,
		solarSystemViewActive,
		mapProjectionLatitude,
		setDraftMapProjectionLatitude,
		exportCenterLongitude,
		showNationBorders,
		showLandBorders,
		showNationHierarchy,
		showWireframe,
		showCoastlines,
		showGrid,
		gridSpacing,
		showInfrastructure,
		showElevation,
		eu4GhslSettlements,
		labelMode,
		sampledNationLabelsArray,
		sampledDynastyLabelsArray,
		sampledSettlementLabelsArray,
		sampledCultureLabelsArray,
		sampledHeritageLabelsArray,
	} = input

	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setHoveredRegion(hoverInfo?.region ?? null)
	}, [hoverInfo])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setNationBordersVisible(showNationBorders)
	}, [showNationBorders])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setLandNationBordersVisible(showLandBorders)
	}, [showLandBorders])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (showNationHierarchy && worldForDisplay && selectedNationId !== null) {
			scene.setHierarchyOverlay(worldForDisplay, selectedNationId)
		} else {
			scene.setHierarchyOverlay(null, -1)
		}
	}, [showNationHierarchy, worldForDisplay, selectedNationId])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setViewMode(viewMode)
	}, [viewMode])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setSolarSystemActive(solarSystemViewActive)
	}, [solarSystemViewActive])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setMapProjectionLatitude(mapProjectionLatitude)
	}, [mapProjectionLatitude])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setMapCenterLongitude(exportCenterLongitude)
		sceneRef.current?.commitMapCenterLongitude()
	}, [exportCenterLongitude])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		setDraftMapProjectionLatitude(mapProjectionLatitude)
	}, [mapProjectionLatitude])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setWireframeVisible(showWireframe)
	}, [showWireframe])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setCoastlineOverlayVisible(showCoastlines)
	}, [showCoastlines])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setGridVisible(showGrid)
	}, [showGrid])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setGridSpacing(gridSpacing)
	}, [gridSpacing])
	// Real (EU4-import) settlements replace the procedural province settlement
	// dots and trade-route "roads" entirely -- both share the Infrastructure
	// toggle, but only one of the two marker sets is ever shown at once.
	const isEarthImportDisplay = !!worldForDisplay?.isEarthImport
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setSettlementsVisible(
			showInfrastructure && !isEarthImportDisplay,
		)
	}, [showInfrastructure, isEarthImportDisplay])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (
			showInfrastructure &&
			!isEarthImportDisplay &&
			worldForDisplay?.urbanPopulation
		) {
			scene.setSettlements(worldForDisplay.urbanPopulation)
		} else {
			scene.setSettlements(null)
		}
	}, [showInfrastructure, isEarthImportDisplay, worldForDisplay])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setInfrastructureVisible(
			showInfrastructure && !isEarthImportDisplay,
		)
	}, [showInfrastructure, isEarthImportDisplay])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (
			showInfrastructure &&
			!isEarthImportDisplay &&
			worldForDisplay?.network
		) {
			scene.setInfrastructure(worldForDisplay.network)
		} else {
			scene.setInfrastructure(null)
		}
	}, [showInfrastructure, isEarthImportDisplay, worldForDisplay])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setEu4SettlementsVisible(
			showInfrastructure && isEarthImportDisplay,
		)
	}, [showInfrastructure, isEarthImportDisplay])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		const scene = sceneRef.current
		if (!scene) return
		if (showInfrastructure && isEarthImportDisplay && eu4GhslSettlements) {
			const population = buildGhslSettlementPopulationSlice(
				eu4GhslSettlements,
				earthHistory.selectedDays,
			)
			const indices = population
				? topSettlementIndices(population, eu4GhslSettlements.provinceIds)
				: []
			// worldForDisplay.nations.seeds is stale procedural-world data --
			// buildDisplayWorld overrides assignment/sovereign/colors/etc for
			// earth-history playback but never seeds (display-model.ts), and
			// the replay-based HistoryView it's built from doesn't compute
			// capitals at all. earthHistory.query.frame comes from the
			// separate fold-based engine (queryEarthHistory ->
			// foldedStateToGenesisFrame) which *does* compute real,
			// capital-preferring seeds per nation for the current date -- see
			// adapter.ts's GenesisFrameFromHistory.seeds.
			const capitalProvinceIds = new Set<number>()
			const frameSeeds = earthHistory.query?.frame.seeds
			const realIds = worldForDisplay?.provinces?.realIds
			if (frameSeeds && realIds) {
				for (const compactIdx of frameSeeds) {
					if (compactIdx >= 0 && compactIdx < realIds.length) {
						capitalProvinceIds.add(realIds[compactIdx])
					}
				}
			}
			scene.setEu4Settlements(
				eu4GhslSettlements.lats,
				eu4GhslSettlements.lons,
				population,
				eu4GhslSettlements.provinceIds,
				capitalProvinceIds,
				indices,
			)
		} else {
			scene.setEu4Settlements(null, null, null, null, new Set(), [])
		}
	}, [
		showInfrastructure,
		isEarthImportDisplay,
		eu4GhslSettlements,
		earthHistory.selectedDays,
		earthHistory.query,
		worldForDisplay,
	])

	// --- Labels ---
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setLabelMode(labelMode)
	}, [labelMode])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setNationNames(sampledNationLabelsArray)
	}, [sampledNationLabelsArray])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setDynastyNames(sampledDynastyLabelsArray)
	}, [sampledDynastyLabelsArray])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setSettlementNames(sampledSettlementLabelsArray)
	}, [sampledSettlementLabelsArray])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setCultureNames(sampledCultureLabelsArray)
	}, [sampledCultureLabelsArray])
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setHeritageNames(sampledHeritageLabelsArray)
	}, [sampledHeritageLabelsArray])
	// --- Elevation ---
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setElevationVisible(showElevation)
	}, [showElevation])
}

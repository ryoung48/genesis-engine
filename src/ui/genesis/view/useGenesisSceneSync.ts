import { useEffect } from "react"
import { DATE } from "@/model/history/earth/date"
import { FRAME } from "@/model/history/world-frame"
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
		history,
		hoverInfo,
		selectedWikiNationId,
		viewMode,
		solarSystemViewActive,
		mapProjectionLatitude,
		setDraftMapProjectionLatitude,
		exportCenterLongitude,
		showNationBorders,
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
		sampledReligionLabelsArray,
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
		const scene = sceneRef.current
		if (!scene) return
		const frame = history.query?.frame
		if (
			showNationHierarchy &&
			worldForDisplay?.provinces &&
			frame &&
			selectedWikiNationId !== null
		) {
			scene.setHierarchyOverlay({
				world: worldForDisplay,
				nationId: selectedWikiNationId,
				provinceNation: frame.provinceNation,
				provinceParent: frame.provinceParent,
				provinceDepth: FRAME.provinceDepth({ frame }),
			})
		} else {
			scene.setHierarchyOverlay(null)
		}
	}, [
		showNationHierarchy,
		worldForDisplay,
		history.query,
		selectedWikiNationId,
	])
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
				DATE.timeMsToDays(history.selectedTimeMs),
			)
			const realSettlement = worldForDisplay?.realSettlement
			const indices = realSettlement
				? realSettlement.names.flatMap((name, provinceIndex) =>
						name ? [provinceIndex] : [],
					)
				: population
					? topSettlementIndices(population, eu4GhslSettlements.provinceIds)
					: []
			// worldForDisplay.nations.seeds is stale procedural-world data; the
			// history frame carries the real, capital-preferring seeds per nation
			// for the current date.
			const capitalProvinceIds = new Set<number>()
			const frameSeeds = history.query?.renderInputs.seeds
			const realIds = worldForDisplay?.provinces?.realIds
			if (frameSeeds && realIds) {
				for (const compactIdx of frameSeeds) {
					if (compactIdx >= 0 && compactIdx < realIds.length) {
						capitalProvinceIds.add(realIds[compactIdx])
					}
				}
			}
			scene.setEu4Settlements(
				realSettlement?.lats ?? eu4GhslSettlements.lats,
				realSettlement?.lons ?? eu4GhslSettlements.lons,
				realSettlement?.population ?? population,
				realSettlement
					? Int32Array.from(worldForDisplay?.provinces.realIds ?? [])
					: eu4GhslSettlements.provinceIds,
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
		history.selectedTimeMs,
		history.query,
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setReligionNames(sampledReligionLabelsArray)
	}, [sampledReligionLabelsArray])
	// --- Elevation ---
	// biome-ignore lint/correctness/useExhaustiveDependencies: state setters and the scene/worker refs arrive as hook parameters here, so Biome cannot see their useState/useRef origin; adding them would change effect timing.
	useEffect(() => {
		sceneRef.current?.setElevationVisible(showElevation)
	}, [showElevation])
}

import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import { DATA_SOURCE } from "@/model/history/earth/data-source"
import { disposeObject3D } from "@/ui/planet/renderer/disposal"
import {
	buildEu4NationBorderContext,
	buildEu4NationBordersGlobe,
	buildEu4NationBordersMap,
	buildEu4SelectedProvinceBorderGlobe,
	buildEu4SelectedProvinceBorderMap,
} from "@/ui/planet/renderer/eu4-nation-border-overlay"
import {
	buildEu4NationFillGlobe,
	buildEu4NationFillMap,
	buildEu4OccupationStripesGlobe,
	buildEu4OccupationStripesMap,
	type ColorForRawId,
	updateEu4NationFillGlobeColors,
	updateEu4NationFillMapColors,
} from "@/ui/planet/renderer/eu4-nation-fill-overlay"
import type { GenesisContext } from "@/ui/planet/renderer/genesis-scene/context"
import { addMapSlideClones } from "@/ui/planet/renderer/map-export"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"
import { shouldRebuildNationBordersForVisibilityChange } from "@/ui/planet/renderer/nation-border-visibility"
import { repeatMapPositions } from "@/ui/planet/renderer/overlay-builders"
import {
	buildLandNationBordersGlobe,
	buildLandNationBordersMap,
	collectAllNationBorderGlobePositions,
	collectAllNationBorderMapPositions,
} from "@/ui/planet/renderer/overlay-builders/nation-borders"
import {
	buildSelectedProvinceBorderGlobe,
	buildSelectedProvinceBorderMap,
} from "@/ui/planet/renderer/province-overlay"
import { buildElevationLookup } from "@/ui/planet/screen/display/region-colors"

export interface NationBordersControllerDeps {
	requestRender: () => void
	updateOverlayVisibility: () => void
}

// Earth-imported worlds never have a procedural world.nations (see
// derive-province-society.ts's isEarthImportRaster check), so anything
// needing "which nation owns this province" for such a world -- nation
// border rendering, nation-border focus pulses -- has to read from
// earthHistoryNationOverride instead. Shadows world.nations with the real
// per-date assignment so existing nation/sovereign/rebel-aware helpers
// (buildRealIdToNation, forEachNationBorderSide, etc.) work unmodified.
function getWorldForBorders(ctx: GenesisContext) {
	return ctx.earthHistoryNationOverride && ctx.currentWorld
		? {
				...ctx.currentWorld,
				nations: {
					...ctx.currentWorld.nations,
					assignment: ctx.earthHistoryNationOverride.assignment,
					// See rebuildNationBorders' identical aliasing below for why
					// sovereign points at the same array and activeRebelWars is
					// cleared -- same stale-procedural-id gap this fixes there.
					sovereign: ctx.earthHistoryNationOverride.assignment,
					activeRebelWars: [],
				},
			}
		: ctx.currentWorld
}

/** Owns nation/land-nation border lines, the real-EU4-province-polygon
 * nation-fill and occupation-stripe overlays, and the selected-province
 * border highlight -- the biggest and most tangled of the overlay
 * controllers (EU4-import vs. procedural-world paths, in-place-recolor vs.
 * full-rebuild fast paths for the fill mesh). See
 * plans/genesis-scene-controller-split.md. */
export function createNationBordersController(
	ctx: GenesisContext,
	deps: NationBordersControllerDeps,
) {
	function rebuildNationBorders() {
		disposeObject3D(ctx.globeGroup, ctx.globeNationBorders)
		disposeObject3D(ctx.scene, ctx.mapNationBorders)
		disposeObject3D(ctx.globeGroup, ctx.globeLandNationBorders)
		disposeObject3D(ctx.scene, ctx.mapLandNationBorders)
		ctx.globeNationBorders = null
		ctx.mapNationBorders = null
		ctx.globeLandNationBorders = null
		ctx.mapLandNationBorders = null
		// The fill mesh is intentionally NOT disposed unconditionally here
		// (unlike the border lines above, which must always be fully rebuilt
		// since their segment set is re-filtered every call) -- see the
		// isEarthImport branch below, which recolors it in place when only
		// nation ownership changed and only disposes/rebuilds it when the
		// radius/projection actually changed.
		ctx.nationBorderMaterials = []
		ctx.landNationBorderMaterials = []

		const w = ctx.canvas.clientWidth || 1
		const h = ctx.canvas.clientHeight || 1

		const worldForBorders = getWorldForBorders(ctx)

		if (worldForBorders?.isEarthImport) {
			if (!ctx.cachedEu4BorderGeometry) {
				DATA_SOURCE.loadEu4ProvinceBorderGeometry()
					.then((geometry) => {
						ctx.cachedEu4BorderGeometry = geometry
						rebuildNationBorders()
						deps.requestRender()
					})
					.catch((err) => {
						console.error("Failed to load EU4 province border geometry:", err)
					})
				return
			}
			const borderContext = buildEu4NationBorderContext(worldForBorders)
			const geometry = ctx.cachedEu4BorderGeometry

			if (ctx.currentNationFillColorForRawId) {
				if (!ctx.cachedEu4FillGeometry) {
					DATA_SOURCE.loadEu4ProvinceFillGeometry()
						.then((fillGeometry) => {
							ctx.cachedEu4FillGeometry = fillGeometry
							rebuildNationBorders()
							deps.requestRender()
						})
						.catch((err) => {
							console.error("Failed to load EU4 province fill geometry:", err)
						})
				} else {
					const elevationLookup = buildElevationLookup(worldForBorders)
					const globeRadius = ctx.elevationVisible ? 1.002 : 1.0005
					const mapZ = 0.0003

					// Recolor in place when the only thing that changed since the
					// last rebuild is nation ownership (the common case -- every
					// timeline scrub tick creates a new ctx.currentNationFillColorForRawId
					// closure, but the mesh's positions are still valid for the same
					// radius/projection). Falls through to a full rebuild on the
					// first build, or a real radius/pan/zoom change.
					if (
						ctx.globeNationFill &&
						ctx.globeNationFillRadius === globeRadius
					) {
						updateEu4NationFillGlobeColors(
							ctx.globeNationFill,
							ctx.cachedEu4FillGeometry,
							ctx.currentNationFillColorForRawId,
							elevationLookup,
						)
					} else {
						disposeObject3D(ctx.globeGroup, ctx.globeNationFill)
						const globeFill = buildEu4NationFillGlobe({
							geometry: ctx.cachedEu4FillGeometry,
							colorForRawId: ctx.currentNationFillColorForRawId,
							viewMode: ctx.currentViewMode,
							visible: true,
							radius: globeRadius,
							elevationKmForLonLat: elevationLookup,
						})
						ctx.globeNationFill = globeFill?.mesh ?? null
						ctx.globeNationFillRadius = globeFill ? globeRadius : null
						if (ctx.globeNationFill) ctx.globeGroup.add(ctx.globeNationFill)
					}

					if (
						ctx.mapNationFill &&
						ctx.mapNationFillParams?.z === mapZ &&
						ctx.mapNationFillParams.centerLongitudeDeg ===
							ctx.currentMapCenterLongitudeDeg &&
						ctx.mapNationFillParams.projectionLatitudeDeg ===
							ctx.currentMapProjectionLatitudeDeg
					) {
						updateEu4NationFillMapColors(
							ctx.mapNationFill,
							ctx.cachedEu4FillGeometry,
							ctx.currentNationFillColorForRawId,
							elevationLookup,
						)
					} else {
						disposeObject3D(ctx.scene, ctx.mapNationFill)
						const mapFill = buildEu4NationFillMap({
							geometry: ctx.cachedEu4FillGeometry,
							colorForRawId: ctx.currentNationFillColorForRawId,
							centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
							projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
							viewMode: ctx.currentViewMode,
							visible: true,
							z: mapZ,
							elevationKmForLonLat: elevationLookup,
						})
						ctx.mapNationFill = mapFill?.mesh ?? null
						ctx.mapNationFillParams = mapFill
							? {
									z: mapZ,
									centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
									projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
								}
							: null
						if (ctx.mapNationFill) ctx.scene.add(ctx.mapNationFill)
					}
					// Visibility/position (view-mode gating, map-pan following) is
					// handled uniformly by deps.updateOverlayVisibility() below, same
					// as every other overlay in this function.
				}
			} else if (ctx.globeNationFill || ctx.mapNationFill) {
				// Fill overlay just got switched off (e.g. left political display
				// mode) -- dispose it rather than leaving it hidden and stale, so
				// the next time it's switched back on this takes the full-rebuild
				// path instead of finding a null radius that never matches.
				disposeObject3D(ctx.globeGroup, ctx.globeNationFill)
				disposeObject3D(ctx.scene, ctx.mapNationFill)
				ctx.globeNationFill = null
				ctx.mapNationFill = null
				ctx.globeNationFillRadius = null
				ctx.mapNationFillParams = null
			}

			disposeObject3D(ctx.globeGroup, ctx.globeOccupationStripes)
			disposeObject3D(ctx.scene, ctx.mapOccupationStripes)
			ctx.globeOccupationStripes = null
			ctx.mapOccupationStripes = null
			if (ctx.currentOccupationStripeColorForRawId) {
				if (!ctx.cachedEu4FillGeometry) {
					DATA_SOURCE.loadEu4ProvinceFillGeometry()
						.then((fillGeometry) => {
							ctx.cachedEu4FillGeometry = fillGeometry
							rebuildNationBorders()
							deps.requestRender()
						})
						.catch((err) => {
							console.error("Failed to load EU4 province fill geometry:", err)
						})
				} else {
					const globeStripes = buildEu4OccupationStripesGlobe({
						geometry: ctx.cachedEu4FillGeometry,
						colorForRawId: ctx.currentOccupationStripeColorForRawId,
						viewMode: ctx.currentViewMode,
						visible: true,
						radius: ctx.elevationVisible ? 1.002 : 1.0005,
					})
					const mapStripes = buildEu4OccupationStripesMap({
						geometry: ctx.cachedEu4FillGeometry,
						colorForRawId: ctx.currentOccupationStripeColorForRawId,
						centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
						projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
						viewMode: ctx.currentViewMode,
						visible: true,
						z: 0.0003,
					})
					if (globeStripes) {
						ctx.globeOccupationStripes = globeStripes.mesh
						ctx.globeGroup.add(ctx.globeOccupationStripes)
					}
					if (mapStripes) {
						ctx.mapOccupationStripes = mapStripes.mesh
						ctx.scene.add(ctx.mapOccupationStripes)
					}
				}
			}

			if (borderContext && ctx.landNationBordersVisible) {
				const globeLand = buildEu4NationBordersGlobe(
					geometry,
					borderContext,
					ctx.currentViewMode,
					ctx.landNationBordersVisible,
					ctx.elevationVisible ? 1.004 : 1.001,
					[w, h],
					{ color: 0x7d556f, opacity: 0.9, lineWidth: 2 },
				)
				const mapLand = buildEu4NationBordersMap(
					geometry,
					borderContext,
					ctx.currentMapCenterLongitudeDeg,
					ctx.currentMapProjectionLatitudeDeg,
					ctx.currentViewMode,
					ctx.landNationBordersVisible,
					0.001,
					[w, h],
					{ color: 0x7d556f, opacity: 0.9, lineWidth: 2 },
				)
				if (globeLand) {
					ctx.globeLandNationBorders = globeLand.lines
					ctx.landNationBorderMaterials.push(globeLand.material)
					ctx.globeGroup.add(ctx.globeLandNationBorders)
				}
				if (mapLand) {
					ctx.mapLandNationBorders = mapLand.lines
					ctx.landNationBorderMaterials.push(mapLand.material)
					ctx.scene.add(ctx.mapLandNationBorders)
				}
			}

			if (borderContext && ctx.nationBordersVisible) {
				const BORDER_BASE_WIDTH = 1.2
				const globeThin = buildEu4NationBordersGlobe(
					geometry,
					borderContext,
					ctx.currentViewMode,
					ctx.nationBordersVisible,
					ctx.elevationVisible ? 1.006 : 1.003,
					[w, h],
					{ color: 0x020617, opacity: 0.95, lineWidth: BORDER_BASE_WIDTH },
				)
				const mapThin = buildEu4NationBordersMap(
					geometry,
					borderContext,
					ctx.currentMapCenterLongitudeDeg,
					ctx.currentMapProjectionLatitudeDeg,
					ctx.currentViewMode,
					ctx.nationBordersVisible,
					0,
					[w, h],
					{ color: 0x020617, opacity: 0.95, lineWidth: BORDER_BASE_WIDTH },
				)
				if (globeThin) {
					globeThin.lines.renderOrder = 1
					ctx.globeNationBorders = globeThin.lines
					ctx.nationBorderMaterials.push(globeThin.material)
					ctx.globeGroup.add(ctx.globeNationBorders)
				}
				if (mapThin) {
					mapThin.lines.renderOrder = 1
					ctx.mapNationBorders = mapThin.lines
					ctx.nationBorderMaterials.push(mapThin.material)
					ctx.scene.add(ctx.mapNationBorders)
				}
			}

			deps.updateOverlayVisibility()
			return
		}

		if (worldForBorders && ctx.landNationBordersVisible) {
			const globeLand = buildLandNationBordersGlobe({
				world: worldForBorders,
				viewMode: ctx.currentViewMode,
				visible: ctx.landNationBordersVisible,
				elevationVisible: ctx.elevationVisible,
				resolution: [w, h],
			})
			const mapLand = buildLandNationBordersMap({
				world: worldForBorders,
				centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
				projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
				viewMode: ctx.currentViewMode,
				visible: ctx.landNationBordersVisible,
				resolution: [w, h],
			})
			if (globeLand) {
				ctx.globeLandNationBorders = globeLand.lines
				ctx.landNationBorderMaterials.push(globeLand.material)
				ctx.globeGroup.add(ctx.globeLandNationBorders)
			}
			if (mapLand) {
				ctx.mapLandNationBorders = mapLand.lines
				ctx.landNationBorderMaterials.push(mapLand.material)
				ctx.scene.add(ctx.mapLandNationBorders)
			}
		}

		if (worldForBorders && ctx.nationBordersVisible) {
			const BORDER_BASE_WIDTH = 1.2
			const globePos = collectAllNationBorderGlobePositions(
				worldForBorders,
				0,
				ctx.elevationVisible,
			)
			if (globePos.length > 0) {
				const geom = new LineSegmentsGeometry()
				geom.setPositions(globePos)
				const mat = new LineMaterial({
					color: 0x020617,
					linewidth: BORDER_BASE_WIDTH,
					resolution: new THREE.Vector2(w, h),
					transparent: true,
					opacity: 0.95,
					depthWrite: false,
				})
				mat.userData.baseWidth = BORDER_BASE_WIDTH
				ctx.globeNationBorders = new LineSegments2(geom, mat)
				ctx.globeNationBorders.computeLineDistances()
				ctx.globeNationBorders.visible = ctx.currentViewMode === "globe"
				ctx.globeNationBorders.renderOrder = 1
				ctx.nationBorderMaterials.push(mat)
				ctx.globeGroup.add(ctx.globeNationBorders)
			}
			const mapRaw = collectAllNationBorderMapPositions(
				worldForBorders,
				ctx.currentMapCenterLongitudeDeg,
				ctx.currentMapProjectionLatitudeDeg,
				0,
			)
			const mapPos = repeatMapPositions(
				mapRaw,
				createMapProjection(
					ctx.currentMapCenterLongitudeDeg,
					ctx.currentMapProjectionLatitudeDeg,
				).repeatWidth,
			)
			if (mapPos.length > 0) {
				const geom = new LineSegmentsGeometry()
				geom.setPositions(mapPos)
				const mat = new LineMaterial({
					color: 0x020617,
					linewidth: BORDER_BASE_WIDTH,
					resolution: new THREE.Vector2(w, h),
					transparent: true,
					opacity: 0.95,
					depthWrite: false,
				})
				mat.userData.baseWidth = BORDER_BASE_WIDTH
				ctx.mapNationBorders = new LineSegments2(geom, mat)
				ctx.mapNationBorders.computeLineDistances()
				ctx.mapNationBorders.visible = ctx.currentViewMode === "map"
				ctx.mapNationBorders.renderOrder = 1
				ctx.nationBorderMaterials.push(mat)
				ctx.scene.add(ctx.mapNationBorders)
			}
		}

		deps.updateOverlayVisibility()
	}

	function rebuildSelectedProvinceBorder() {
		disposeObject3D(ctx.globeGroup, ctx.globeSelectedProvinceBorder)
		disposeObject3D(ctx.scene, ctx.mapSelectedProvinceBorder)
		ctx.globeSelectedProvinceBorder = null
		ctx.mapSelectedProvinceBorder = null
		if (!ctx.currentWorld?.provinces || ctx.selectedProvince < 0) return
		const resolution: [number, number] = [
			ctx.canvas.clientWidth || 1,
			ctx.canvas.clientHeight || 1,
		]

		if (ctx.currentWorld.isEarthImport) {
			if (!ctx.cachedEu4BorderGeometry) {
				DATA_SOURCE.loadEu4ProvinceBorderGeometry()
					.then((geometry) => {
						ctx.cachedEu4BorderGeometry = geometry
						rebuildSelectedProvinceBorder()
						deps.requestRender()
					})
					.catch((err) => {
						console.error("Failed to load EU4 province border geometry:", err)
					})
				return
			}
			const provinceRealId =
				ctx.currentWorld.provinces.realIds?.[ctx.selectedProvince]
			if (provinceRealId === undefined) return
			const geometry = ctx.cachedEu4BorderGeometry
			const globeBorder = buildEu4SelectedProvinceBorderGlobe({
				geometry,
				provinceRealId,
				viewMode: ctx.currentViewMode,
				radius: 1.006,
				resolution,
				opts: { color: 0xfffbeb, opacity: 0.95, lineWidth: 4 },
			})
			const mapBorder = buildEu4SelectedProvinceBorderMap({
				geometry,
				provinceRealId,
				centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
				projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
				viewMode: ctx.currentViewMode,
				z: 0.007,
				resolution,
				opts: { color: 0xfffbeb, opacity: 0.95, lineWidth: 4 },
			})
			if (globeBorder) {
				ctx.globeSelectedProvinceBorder = globeBorder.lines
				ctx.globeGroup.add(ctx.globeSelectedProvinceBorder)
			}
			if (mapBorder) {
				ctx.mapSelectedProvinceBorder = mapBorder.lines
				addMapSlideClones(ctx.mapSelectedProvinceBorder)
				ctx.scene.add(ctx.mapSelectedProvinceBorder)
			}
			deps.updateOverlayVisibility()
			return
		}

		ctx.globeSelectedProvinceBorder = buildSelectedProvinceBorderGlobe({
			world: ctx.currentWorld,
			province: ctx.selectedProvince,
			viewMode: ctx.currentViewMode,
			elevationVisible: ctx.elevationVisible,
			opts: {
				color: 0xfffbeb,
				radiusBoost: 0.003,
				lineWidth: 4,
				resolution,
			},
		})
		ctx.mapSelectedProvinceBorder = buildSelectedProvinceBorderMap({
			world: ctx.currentWorld,
			province: ctx.selectedProvince,
			centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
			viewMode: ctx.currentViewMode,
			opts: {
				color: 0xfffbeb,
				zBoost: 0.004,
				lineWidth: 4,
				resolution,
			},
		})
		if (ctx.globeSelectedProvinceBorder)
			ctx.globeGroup.add(ctx.globeSelectedProvinceBorder)
		if (ctx.mapSelectedProvinceBorder) {
			addMapSlideClones(ctx.mapSelectedProvinceBorder)
			ctx.scene.add(ctx.mapSelectedProvinceBorder)
		}
		deps.updateOverlayVisibility()
	}

	function setNationFillColorForRawId(fn: ColorForRawId | null) {
		if (ctx.currentNationFillColorForRawId === fn) return
		ctx.currentNationFillColorForRawId = fn
		rebuildNationBorders()
	}

	function setNationOccupationStripeColorForRawId(fn: ColorForRawId | null) {
		if (ctx.currentOccupationStripeColorForRawId === fn) return
		ctx.currentOccupationStripeColorForRawId = fn
		rebuildNationBorders()
	}

	function setNationBordersVisible(visible: boolean) {
		if (ctx.nationBordersVisible === visible) return
		ctx.nationBordersVisible = visible
		if (
			shouldRebuildNationBordersForVisibilityChange({
				nextVisible: visible,
				hasGlobeOverlay: ctx.globeNationBorders !== null,
				hasMapOverlay: ctx.mapNationBorders !== null,
			})
		) {
			rebuildNationBorders()
			return
		}
		deps.updateOverlayVisibility()
	}

	function setLandNationBordersVisible(visible: boolean) {
		if (ctx.landNationBordersVisible === visible) return
		ctx.landNationBordersVisible = visible
		if (
			shouldRebuildNationBordersForVisibilityChange({
				nextVisible: visible,
				hasGlobeOverlay: ctx.globeLandNationBorders !== null,
				hasMapOverlay: ctx.mapLandNationBorders !== null,
			})
		) {
			rebuildNationBorders()
			return
		}
		deps.updateOverlayVisibility()
	}

	function setSelectedProvince(provinceId: number | null) {
		ctx.selectedProvince = provinceId ?? -1
		rebuildSelectedProvinceBorder()
	}

	return {
		getWorldForBorders: () => getWorldForBorders(ctx),
		rebuildNationBorders,
		rebuildSelectedProvinceBorder,
		setNationFillColorForRawId,
		setNationOccupationStripeColorForRawId,
		setNationBordersVisible,
		setLandNationBordersVisible,
		setSelectedProvince,
	}
}

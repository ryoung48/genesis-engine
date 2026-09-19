import * as THREE from "three"
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js"
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js"
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"
import {
	buildRealIdToNation,
	collectEu4NationBorderGlobePositions,
	collectEu4NationBorderMapPositions,
	collectEu4ProvinceBorderGlobePositions,
	collectEu4ProvinceBorderMapPositions,
} from "@/ui/genesis/political/eu4-nation-border-overlay"
import { disposeObject3D } from "@/ui/genesis/renderer/disposal"
import { getRegionFocusTargets } from "@/ui/genesis/renderer/focus"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { normalizeMapCenterLongitudeDeg } from "@/ui/genesis/renderer/map-export"
import {
	collectNationBorderGlobePositions,
	collectNationBorderMapPositions,
} from "@/ui/genesis/renderer/overlay-builders/nation-borders"
import {
	collectProvinceBorderGlobePositions,
	collectProvinceBorderMapPositions,
} from "@/ui/genesis/renderer/province-overlay"

export interface CameraFocusControllerDeps {
	requestRender: () => void
	syncAnimationState: () => void
	setSelectedProvince: (provinceId: number | null) => void
	getWorldForBorders: () => SerializedGenesisWorld | null | undefined
	rebuildTerrain: () => void
	rebuildOverlays: () => void
}

/** Owns camera focus/pulse animation: the region/nation/province focus
 * tweens (focusOnRegion/Nation/Province), the pulsing border-highlight line
 * drawn alongside a focus (startBorderPulse), and the map center/projection
 * setters that also drive a tween-free rebuild. See
 * plans/genesis-scene-controller-split.md. */
export function createCameraFocusController(
	ctx: GenesisContext,
	deps: CameraFocusControllerDeps,
) {
	function focusOnRegion(
		region: number,
		opts?: { durationMs?: number; distanceScale?: number },
	) {
		if (!ctx.currentWorld) return
		const targets = getRegionFocusTargets({
			meshXYZ: ctx.currentWorld.mesh.r_xyz,
			numRegions: ctx.currentWorld.mesh.numRegions,
			region,
			centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
			projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
			mapOffsetX: ctx.mapMesh?.position.x ?? 0,
			mapOffsetY: ctx.mapMesh?.position.y ?? 0,
			minDistance: ctx.controls.minDistance,
			distanceScale: opts?.distanceScale,
		})
		if (!targets) return

		ctx.focusTween = {
			mode: ctx.currentViewMode,
			t0: performance.now(),
			duration: opts?.durationMs ?? 700,
			globeFrom: ctx.camera.position.clone(),
			globeTo: new THREE.Vector3(...targets.globeTarget),
			mapFromX: ctx.mapCamera.position.x,
			mapFromY: ctx.mapCamera.position.y,
			mapToX: targets.mapToX,
			mapToY: targets.mapToY,
			mapFromZoom: ctx.mapCamera.zoom,
			mapToZoom: targets.mapToZoom,
		}
		if (ctx.currentViewMode === "globe") ctx.controls.enabled = false
		else ctx.mapControls.enabled = false
		deps.syncAnimationState()
		deps.requestRender()
	}

	function focusOnProvince(
		provinceId: number,
		opts?: {
			durationMs?: number
			distanceScale?: number
			/** "nation" highlights the whole nation's border instead of just
			 * this one province's -- used when the caller is really focusing
			 * on a nation and only has a representative
			 * province to hand in. */
			pulseTarget?: "nation" | "province"
		},
	) {
		if (!ctx.currentWorld?.provinces) return
		if (provinceId < 0 || provinceId >= ctx.currentWorld.provinces.count) {
			deps.setSelectedProvince(null)
			return
		}
		const pulseTarget = opts?.pulseTarget ?? "province"
		// The persistent yellow "selected province" outline is a distinct,
		// separate overlay from the pulse below -- only mark this as the
		// selected province when it really is one; a "nation" focus just
		// uses provinceId as a representative anchor point, not something
		// the user selected, and leaving it set would draw a stray
		// single-province outline alongside the nation-wide pulse.
		deps.setSelectedProvince(pulseTarget === "province" ? provinceId : null)
		const region = ctx.currentWorld.provinces.seeds[provinceId]
		if (region < 0) {
			return
		}
		focusOnRegion(region, opts)
		startBorderPulse(provinceId, pulseTarget)
	}

	function clearPulse() {
		disposeObject3D(ctx.globeGroup, ctx.pulseGlobe)
		disposeObject3D(ctx.scene, ctx.pulseMap)
		ctx.pulseGlobe = null
		ctx.pulseMap = null
		ctx.pulseMaterials = []
		ctx.pulse = null
	}

	function makeThickPulseLine(
		positions: number[],
		linewidth = 4,
	): LineSegments2 | null {
		if (positions.length === 0) return null
		const geom = new LineSegmentsGeometry()
		geom.setPositions(positions)
		const w = ctx.canvas.clientWidth || 1
		const h = ctx.canvas.clientHeight || 1
		const mat = new LineMaterial({
			color: 0xffffff,
			linewidth,
			resolution: new THREE.Vector2(w, h),
			transparent: true,
			opacity: 0,
			depthWrite: false,
			depthTest: false,
		})
		ctx.pulseMaterials.push(mat)
		const line = new LineSegments2(geom, mat)
		line.computeLineDistances()
		line.renderOrder = 998
		return line
	}

	function startBorderPulse(
		province: number,
		target: "nation" | "province" = "nation",
	) {
		clearPulse()
		if (!ctx.currentWorld) return
		const lineWidth = target === "province" ? 5 : 4
		const useEu4Vectors =
			ctx.currentWorld.isEarthImport && ctx.cachedEu4BorderGeometry
		const provinceRealId = useEu4Vectors
			? ctx.currentWorld.provinces?.realIds?.[province]
			: undefined
		const globePositions = useEu4Vectors
			? target === "province"
				? provinceRealId === undefined
					? []
					: collectEu4ProvinceBorderGlobePositions(
							ctx.cachedEu4BorderGeometry!,
							provinceRealId,
							1.006,
						)
				: (() => {
						const worldForBorders = deps.getWorldForBorders()
						const nation = worldForBorders?.nations?.assignment[province]
						if (nation === undefined || nation < 0) return []
						const realIdToNation = worldForBorders
							? buildRealIdToNation(worldForBorders)
							: null
						return realIdToNation
							? collectEu4NationBorderGlobePositions(
									ctx.cachedEu4BorderGeometry!,
									realIdToNation,
									nation,
									1.006,
								)
							: []
					})()
			: target === "province"
				? collectProvinceBorderGlobePositions(
						ctx.currentWorld,
						province,
						0.003,
						ctx.elevationVisible,
					)
				: (() => {
						const worldForBorders = deps.getWorldForBorders()
						const nation = worldForBorders?.nations?.assignment[province]
						return !worldForBorders || nation === undefined || nation < 0
							? []
							: collectNationBorderGlobePositions(
									worldForBorders,
									nation,
									0.003,
									ctx.elevationVisible,
								)
					})()
		const mapPositions = useEu4Vectors
			? target === "province"
				? provinceRealId === undefined
					? []
					: collectEu4ProvinceBorderMapPositions({
							geometry: ctx.cachedEu4BorderGeometry!,
							provinceRealId,
							centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
							projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
							z: 0.007,
						})
				: (() => {
						const worldForBorders = deps.getWorldForBorders()
						const nation = worldForBorders?.nations?.assignment[province]
						if (nation === undefined || nation < 0) return []
						const realIdToNation = worldForBorders
							? buildRealIdToNation(worldForBorders)
							: null
						return realIdToNation
							? collectEu4NationBorderMapPositions({
									geometry: ctx.cachedEu4BorderGeometry!,
									realIdToNation,
									nation,
									centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
									projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
									z: 0.001,
								})
							: []
					})()
			: target === "province"
				? collectProvinceBorderMapPositions({
						world: ctx.currentWorld,
						province,
						centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
						projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
						zBoost: 0.004,
					})
				: (() => {
						const worldForBorders = deps.getWorldForBorders()
						const nation = worldForBorders?.nations?.assignment[province]
						return !worldForBorders || nation === undefined || nation < 0
							? []
							: collectNationBorderMapPositions({
									world: worldForBorders,
									nation,
									centerLongitudeDeg: ctx.currentMapCenterLongitudeDeg,
									projectionLatitudeDeg: ctx.currentMapProjectionLatitudeDeg,
									zBoost: 0.001,
								})
					})()
		ctx.pulseGlobe = makeThickPulseLine(globePositions, lineWidth)
		ctx.pulseMap = makeThickPulseLine(mapPositions, lineWidth)
		if (!ctx.pulseGlobe && !ctx.pulseMap) return
		if (ctx.pulseGlobe) {
			ctx.pulseGlobe.visible = ctx.currentViewMode === "globe"
			ctx.globeGroup.add(ctx.pulseGlobe)
		}
		if (ctx.pulseMap) {
			ctx.pulseMap.visible = ctx.currentViewMode === "map"
			if (ctx.mapMesh) ctx.pulseMap.position.copy(ctx.mapMesh.position)
			ctx.scene.add(ctx.pulseMap)
		}
		ctx.pulse = {
			t0: performance.now(),
			duration: 1200,
			clearSelectedProvince: target === "province",
		}
		deps.syncAnimationState()
		deps.requestRender()
	}

	function stepPulse() {
		if (!ctx.pulse) return
		const u = (performance.now() - ctx.pulse.t0) / ctx.pulse.duration
		if (u >= 1) {
			const clearSelectedProvince = ctx.pulse.clearSelectedProvince
			clearPulse()
			if (clearSelectedProvince) deps.setSelectedProvince(null)
			deps.syncAnimationState()
			return
		}
		const op = 0.9 * Math.abs(Math.sin(u * 2 * Math.PI))
		for (const m of ctx.pulseMaterials) m.opacity = op
	}

	function stepFocusTween() {
		if (!ctx.focusTween) return
		const u = Math.min(
			1,
			(performance.now() - ctx.focusTween.t0) / ctx.focusTween.duration,
		)
		const eased = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
		if (ctx.focusTween.mode === "globe") {
			ctx.camera.position.lerpVectors(
				ctx.focusTween.globeFrom,
				ctx.focusTween.globeTo,
				eased,
			)
		} else {
			ctx.mapCamera.position.x =
				ctx.focusTween.mapFromX +
				(ctx.focusTween.mapToX - ctx.focusTween.mapFromX) * eased
			ctx.mapCamera.position.y =
				ctx.focusTween.mapFromY +
				(ctx.focusTween.mapToY - ctx.focusTween.mapFromY) * eased
			ctx.mapCamera.zoom =
				ctx.focusTween.mapFromZoom +
				(ctx.focusTween.mapToZoom - ctx.focusTween.mapFromZoom) * eased
			ctx.mapCamera.updateProjectionMatrix()
			ctx.mapControls.target.set(
				ctx.mapCamera.position.x,
				ctx.mapCamera.position.y,
				0,
			)
		}
		if (u >= 1) {
			const mode = ctx.focusTween.mode
			ctx.focusTween = null
			if (mode === "globe")
				ctx.controls.enabled = ctx.currentViewMode === "globe"
			else ctx.mapControls.enabled = ctx.currentViewMode === "map"
			deps.syncAnimationState()
		}
	}

	function setMapCenterLongitude(longitudeDeg: number) {
		const normalized = normalizeMapCenterLongitudeDeg(longitudeDeg)
		if (ctx.currentMapCenterLongitudeDeg === normalized) return
		ctx.currentMapCenterLongitudeDeg = normalized
		if (ctx.currentWorld) deps.rebuildTerrain()
		else deps.rebuildOverlays()
	}

	function setMapProjectionLatitude(latitudeDeg: number) {
		const clamped = THREE.MathUtils.clamp(latitudeDeg, -90, 90)
		if (ctx.currentMapProjectionLatitudeDeg === clamped) return
		ctx.currentMapProjectionLatitudeDeg = clamped
		if (ctx.currentWorld) deps.rebuildTerrain()
		else deps.rebuildOverlays()
	}

	function commitMapCenterLongitude() {
		deps.requestRender()
	}

	return {
		focusOnRegion,
		focusOnProvince,
		clearPulse,
		startBorderPulse,
		stepPulse,
		stepFocusTween,
		setMapCenterLongitude,
		setMapProjectionLatitude,
		commitMapCenterLongitude,
	}
}

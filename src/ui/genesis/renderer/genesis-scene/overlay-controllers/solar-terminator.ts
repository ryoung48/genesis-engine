import * as THREE from "three"
import { disposeGroup } from "@/ui/genesis/renderer/disposal"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import {
	buildSolarTerminatorRingPoints,
	createSolarTerminatorBand,
	createSolarTerminatorLabelSprite,
	getSolarTerminatorLabelText,
	projectSolarTerminatorPointsToMap,
	SOLAR_TERMINATOR_ALTITUDE_DEG,
	SOLAR_TERMINATOR_BAND_COLOR,
	SOLAR_TERMINATOR_BAND_HALF_WIDTH,
	SOLAR_TERMINATOR_ELEVATED_RADIUS,
	SOLAR_TERMINATOR_HAIRLINE_COLOR,
	SOLAR_TERMINATOR_LABEL_COUNT,
	SOLAR_TERMINATOR_LABEL_RENDER_ORDER,
	SOLAR_TERMINATOR_LINE_COLOR,
	SOLAR_TERMINATOR_RADIUS,
} from "@/ui/genesis/renderer/solar-terminator"

export interface SolarTerminatorControllerDeps {
	requestRender: () => void
}

interface SolarTerminatorLabel {
	anchor: THREE.Vector3
	sprite: THREE.Sprite
	aspect: number
	leader: THREE.Line
}

/** Owns the day/night terminator line overlay -- the band+hairline+label
 * ring on the globe, its flat-map projection, and the per-frame label
 * billboard/declutter step (called from animation-loop.ts). See
 * plans/genesis-scene-controller-split.md. */
export function createSolarTerminatorController(
	ctx: GenesisContext,
	deps: SolarTerminatorControllerDeps,
) {
	const solarTerminatorLabels: SolarTerminatorLabel[] = []
	const solarTerminatorCameraUp = new THREE.Vector3()
	const solarTerminatorCameraDir = new THREE.Vector3()
	const solarTerminatorCameraRight = new THREE.Vector3()
	const solarTerminatorLabelStart = new THREE.Vector3()
	const solarTerminatorLabelEnd = new THREE.Vector3()

	function buildSolarTerminatorGroup(): THREE.Group | null {
		if (!ctx.solarTerminatorVisible) return null
		const radius = ctx.elevationVisible
			? SOLAR_TERMINATOR_ELEVATED_RADIUS
			: SOLAR_TERMINATOR_RADIUS
		// Terminator geometry lives in globeGroup local space; use the
		// pre-computed globe-local sun direction (includes obliquity Z
		// component).
		const sunDir = ctx.currentLocalSunDirection.clone().normalize()
		const points = buildSolarTerminatorRingPoints(
			ctx.currentLocalSunDirection,
			radius,
		)
		if (!points) return null
		const h0 = THREE.MathUtils.degToRad(SOLAR_TERMINATOR_ALTITUDE_DEG)
		const sinH0 = Math.sin(h0)
		const cosH0 = Math.cos(h0)
		const reference =
			Math.abs(sunDir.z) > 0.9
				? new THREE.Vector3(1, 0, 0)
				: new THREE.Vector3(0, 0, 1)
		const U = new THREE.Vector3().crossVectors(reference, sunDir).normalize()
		const V = new THREE.Vector3().crossVectors(sunDir, U).normalize()

		const group = new THREE.Group()
		group.add(
			new THREE.Mesh(
				createSolarTerminatorBand(
					points,
					radius,
					SOLAR_TERMINATOR_BAND_HALF_WIDTH,
				),
				new THREE.MeshBasicMaterial({
					color: SOLAR_TERMINATOR_BAND_COLOR,
					transparent: true,
					opacity: 0.16,
					side: THREE.DoubleSide,
					depthWrite: false,
				}),
			),
		)
		group.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(points),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_HAIRLINE_COLOR,
					transparent: true,
					opacity: 0.42,
					depthWrite: false,
				}),
			),
		)
		group.add(
			new THREE.Line(
				new THREE.BufferGeometry().setFromPoints(points),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_LINE_COLOR,
					transparent: true,
					opacity: 0.82,
					depthWrite: false,
				}),
			),
		)

		solarTerminatorLabels.length = 0
		for (let index = 0; index < SOLAR_TERMINATOR_LABEL_COUNT; index++) {
			const fraction = (index + 0.5) / SOLAR_TERMINATOR_LABEL_COUNT
			const t = fraction * Math.PI * 2
			const ring = U.clone()
				.multiplyScalar(Math.cos(t))
				.addScaledVector(V, Math.sin(t))
			const anchor = sunDir
				.clone()
				.multiplyScalar(sinH0)
				.addScaledVector(ring, cosH0)
				.normalize()
			const spriteData = createSolarTerminatorLabelSprite(
				getSolarTerminatorLabelText({
					anchor,
					sunDirection: sunDir,
					hoursPerDay: ctx.currentSunHoursPerDay,
					useMeridiem: ctx.solarTerminatorUseMeridiem,
				}),
			)
			if (!spriteData) continue
			const leader = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([
					anchor.clone().multiplyScalar(radius),
					anchor.clone().multiplyScalar(radius + 0.01),
				]),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_LINE_COLOR,
					transparent: true,
					opacity: 0.75,
					depthWrite: false,
				}),
			)
			group.add(leader)
			group.add(spriteData.sprite)
			solarTerminatorLabels.push({
				anchor,
				sprite: spriteData.sprite,
				aspect: spriteData.aspect,
				leader,
			})
		}

		group.visible = ctx.currentViewMode === "globe"
		updateSolarTerminatorLabels(radius)
		return group
	}

	function buildMapSolarTerminatorGroup(): THREE.Group | null {
		if (!ctx.solarTerminatorVisible || !ctx.mapMesh) return null
		const projection = createMapProjection(
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
		)
		const sunDir = ctx.currentLocalSunDirection.clone().normalize()
		const points = buildSolarTerminatorRingPoints(
			ctx.currentLocalSunDirection,
			1,
		)
		if (!points) return null
		const segments = projectSolarTerminatorPointsToMap(
			points,
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
			0.012,
		)
		if (segments.length === 0) return null

		const content = new THREE.Group()
		for (const segment of segments) {
			const geometry = new THREE.BufferGeometry().setFromPoints(segment)
			const hairline = new THREE.Line(
				geometry.clone(),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_HAIRLINE_COLOR,
					transparent: true,
					opacity: 0.55,
					depthWrite: false,
				}),
			)
			hairline.renderOrder = 1001
			const line = new THREE.Line(
				geometry,
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_LINE_COLOR,
					transparent: true,
					opacity: 0.9,
					depthWrite: false,
				}),
			)
			line.renderOrder = 1002
			content.add(hairline, line)
		}

		for (let index = 0; index < SOLAR_TERMINATOR_LABEL_COUNT; index++) {
			const pointIndex = Math.floor(
				((index + 0.5) / SOLAR_TERMINATOR_LABEL_COUNT) * (points.length - 1),
			)
			const anchorPoint = points[pointIndex]
			if (!anchorPoint) continue
			const anchor = anchorPoint.clone().normalize()
			const label = getSolarTerminatorLabelText({
				anchor,
				sunDirection: sunDir,
				hoursPerDay: ctx.currentSunHoursPerDay,
				useMeridiem: ctx.solarTerminatorUseMeridiem,
			})
			const spriteData = createSolarTerminatorLabelSprite(label)
			if (!spriteData) continue
			const projected = projection.projectRadians(
				Math.atan2(anchor.y, anchor.x),
				Math.asin(THREE.MathUtils.clamp(anchor.z, -1, 1)),
				0.014,
			)
			const posX = projection.clampX(projected[0])
			const posY = projection.clampY(projected[1])
			const leader = new THREE.Line(
				new THREE.BufferGeometry().setFromPoints([
					new THREE.Vector3(posX, posY, 0.0125),
					new THREE.Vector3(posX, posY + 0.008, 0.0125),
				]),
				new THREE.LineBasicMaterial({
					color: SOLAR_TERMINATOR_LINE_COLOR,
					transparent: true,
					opacity: 0.72,
					depthWrite: false,
				}),
			)
			leader.renderOrder = SOLAR_TERMINATOR_LABEL_RENDER_ORDER
			spriteData.sprite.position.set(posX, posY + 0.012, 0.014)
			spriteData.sprite.scale.set(spriteData.aspect * 0.028, 0.028, 1)
			content.add(leader, spriteData.sprite)
		}

		const root = new THREE.Group()
		for (const offset of [-projection.repeatWidth, 0, projection.repeatWidth]) {
			const copy = offset === 0 ? content : content.clone(true)
			copy.position.x = offset
			root.add(copy)
		}

		root.visible = ctx.currentViewMode === "map"
		root.position.copy(ctx.mapMesh.position)
		return root
	}

	function rebuildSolarTerminator() {
		if (ctx.globeSolarTerminator) {
			disposeGroup(ctx.globeGroup, ctx.globeSolarTerminator)
			ctx.globeSolarTerminator = null
		}
		if (ctx.mapSolarTerminator) {
			disposeGroup(ctx.scene, ctx.mapSolarTerminator)
			ctx.mapSolarTerminator = null
		}
		if (!ctx.solarTerminatorVisible) return
		ctx.globeSolarTerminator = buildSolarTerminatorGroup()
		if (ctx.globeSolarTerminator) ctx.globeGroup.add(ctx.globeSolarTerminator)
		ctx.mapSolarTerminator = buildMapSolarTerminatorGroup()
		if (ctx.mapSolarTerminator) ctx.scene.add(ctx.mapSolarTerminator)
	}

	function updateSolarTerminatorLabels(radius: number) {
		if (!ctx.globeSolarTerminator || ctx.currentViewMode !== "globe") return
		solarTerminatorCameraDir.copy(ctx.camera.position).normalize()
		solarTerminatorCameraUp.set(0, 1, 0).applyQuaternion(ctx.camera.quaternion)
		solarTerminatorCameraRight
			.crossVectors(solarTerminatorCameraDir, solarTerminatorCameraUp)
			.normalize()
		const camDist = ctx.camera.position.length()
		const depth = Math.max(camDist - 1.0, 0.3)
		const baseHeight = Math.pow(depth, 0.65) * 0.022
		const stride = camDist < 2.0 ? 1 : camDist < 3.2 ? 2 : 3

		// Labels are children of globeGroup, so camera vectors must be in
		// globe-local space to position them correctly when the globe is tilted.
		const invQ = ctx.globeGroup.quaternion.clone().invert()
		const localCamDir = solarTerminatorCameraDir.clone().applyQuaternion(invQ)
		const localCamUp = solarTerminatorCameraUp.clone().applyQuaternion(invQ)
		const localCamRight = solarTerminatorCameraRight
			.clone()
			.applyQuaternion(invQ)

		for (let index = 0; index < solarTerminatorLabels.length; index++) {
			const label = solarTerminatorLabels[index]!
			const frontFacing =
				index % stride === 0 && label.anchor.dot(localCamDir) > 0.06
			label.sprite.visible = frontFacing
			label.leader.visible = frontFacing
			if (!frontFacing) continue

			solarTerminatorLabelStart.copy(label.anchor).multiplyScalar(radius)
			solarTerminatorLabelEnd
				.copy(label.anchor)
				.multiplyScalar(radius + 0.04)
				.addScaledVector(
					localCamUp,
					baseHeight * (index % 2 === 0 ? 0.22 : -0.22),
				)
				.addScaledVector(localCamRight, baseHeight * ((index % 3) - 1) * 0.16)
			label.sprite.position.copy(solarTerminatorLabelEnd)
			label.sprite.scale.set(label.aspect * baseHeight, baseHeight, 1)
			;(label.leader.geometry as THREE.BufferGeometry).setFromPoints([
				solarTerminatorLabelStart,
				solarTerminatorLabelEnd,
			])
		}
	}

	function setSolarTerminatorVisible(visible: boolean) {
		if (ctx.solarTerminatorVisible === visible) return
		ctx.solarTerminatorVisible = visible
		rebuildSolarTerminator()
		deps.requestRender()
	}

	function setSolarTerminatorUseMeridiem(enabled: boolean) {
		if (ctx.solarTerminatorUseMeridiem === enabled) return
		ctx.solarTerminatorUseMeridiem = enabled
		if (ctx.solarTerminatorVisible) rebuildSolarTerminator()
		deps.requestRender()
	}

	return {
		rebuildSolarTerminator,
		updateSolarTerminatorLabels,
		setSolarTerminatorVisible,
		setSolarTerminatorUseMeridiem,
	}
}

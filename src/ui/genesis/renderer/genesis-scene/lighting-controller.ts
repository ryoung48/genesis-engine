import * as THREE from "three"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import {
	DEFAULT_AMBIENT_INTENSITY,
	DEFAULT_SUN_INTENSITY,
	DEFAULT_WATER_SPECULAR,
} from "@/ui/genesis/renderer/genesis-scene/scene-setup"
import { isColoredTerrainMode } from "@/ui/genesis/shared/colors"

export interface LightingControllerDeps {
	requestRender: () => void
	rebuildSolarTerminator: () => void
}

const SUN_DIST = 10
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const Z_AXIS = new THREE.Vector3(0, 0, 1)

export function createLightingController(
	ctx: GenesisContext,
	deps: LightingControllerDeps,
) {
	ctx.sun.position.set(SUN_DIST, 0, 0)
	ctx.currentSunDirection.set(1, 0, 0)
	ctx.atmosMat.uniforms.sunDirection.value.set(1, 0, 0)
	const ambient = new THREE.Vector3()
	const sunlight = new THREE.Vector3()
	const worldToMap = new THREE.Matrix3()

	function setAtmospherePressure(pressureBar: number) {
		const clamped = Math.max(
			0.1,
			Math.min(10, Number.isFinite(pressureBar) ? pressureBar : 1),
		)
		const pressureFactor = Math.pow(clamped, 0.4)
		ctx.atmosMat.uniforms.atmosphereStrength.value = 0.7 + pressureFactor * 0.45
		const shellScale = 1.105 + pressureFactor * 0.02
		ctx.atmosMesh.scale.setScalar(shellScale / 1.12)
		deps.requestRender()
	}

	function applyGlobeOrientation(subSolarLatRad: number, spinAngle: number) {
		// Obliquity: north pole tips toward sun (+X) by subSolarLatRad → Y rotation
		const obliquityQ = new THREE.Quaternion().setFromAxisAngle(
			Y_AXIS,
			subSolarLatRad,
		)
		// Spin: planet rotates around its own pole (Z) for time-of-day
		const spinQ = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, spinAngle)
		// Globe = obliquity then spin (spin is in globe-local space)
		ctx.globeGroup.quaternion.copy(obliquityQ).multiply(spinQ)
		// Orbit rings: obliquity tilt only, no spin
		ctx.orbitGroup.quaternion.copy(obliquityQ)
		// Sun direction in globe-local space for the solar terminator
		ctx.currentLocalSunDirection
			.copy(ctx.currentSunDirection)
			.applyQuaternion(ctx.globeGroup.quaternion.clone().invert())
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
		// Spin angle: offset by π so noon (timeOfDay=hoursPerDay/2) faces +X (sun)
		const spinAngle = Math.PI + 2 * Math.PI * (timeOfDay / (hoursPerDay || 24))
		ctx.currentSunHoursPerDay = hoursPerDay || 24
		applyGlobeOrientation(subSolarLat, spinAngle)
		syncLighting()
		if (ctx.solarTerminatorVisible) deps.rebuildSolarTerminator()
		deps.requestRender()
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
		ctx.currentSunHoursPerDay = hoursPerDay || 24
		applyGlobeOrientation(subSolarLatRad, spinAngle)
		syncLighting()
		if (ctx.solarTerminatorVisible) deps.rebuildSolarTerminator()
		deps.requestRender()
	}

	function syncLighting() {
		ambient
			.set(ctx.ambient.color.r, ctx.ambient.color.g, ctx.ambient.color.b)
			.multiplyScalar(ctx.ambient.intensity / Math.PI)
		sunlight
			.set(ctx.sun.color.r, ctx.sun.color.g, ctx.sun.color.b)
			.multiplyScalar(ctx.sun.intensity / Math.PI)
		ctx.clouds.setLighting({
			enabled: ctx.sun.intensity > 0,
			direction: ctx.currentLocalSunDirection,
			ambient,
			sunlight,
		})
		const mat = ctx.mapMesh?.material
		if (!(mat instanceof THREE.ShaderMaterial)) return
		mat.uniforms.uAmbient.value.copy(ambient)
		mat.uniforms.uSunLight.value.copy(sunlight)
		// The terrain shader reads normals in the projection's coordinate frame.
		worldToMap.copy(ctx.clouds.mapRotation).transpose()
		mat.uniforms.uSunDirection.value
			.copy(ctx.currentLocalSunDirection)
			.applyMatrix3(worldToMap)
	}

	function setFullAmbient(enabled: boolean) {
		if (enabled) {
			ctx.ambient.color.set(0xffffff)
			ctx.ambient.intensity = 2.5
			ctx.sun.intensity = 0
			ctx.atmosMesh.visible = false
			ctx.waterMat.specular.set(0x000000)
		} else {
			ctx.ambient.color.set(0x667788)
			ctx.ambient.intensity = DEFAULT_AMBIENT_INTENSITY
			ctx.sun.intensity = DEFAULT_SUN_INTENSITY
			if (ctx.currentViewMode === "globe") ctx.atmosMesh.visible = true
			ctx.waterMat.specular.set(
				isColoredTerrainMode(ctx.currentColorMode)
					? DEFAULT_WATER_SPECULAR
					: 0x000000,
			)
		}
		syncLighting()
		deps.requestRender()
	}

	return {
		setAtmospherePressure,
		setSunPosition,
		setSunDirection,
		syncLighting,
		setFullAmbient,
	}
}

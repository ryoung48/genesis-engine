import * as THREE from "three"
import type {
	CloudDisplay,
	CloudLighting,
	CloudTextureInput,
} from "@/ui/genesis/renderer/clouds/types"
import type { CloudClimateGrid } from "@/ui/genesis/renderer/clouds/vendor/orogen.js"
import {
	CLOUD_GLSL,
	CLOUDS,
	cloudBeltUniforms,
	cloudEdges,
	cloudFields,
	cloudNoiseTexture,
	cloudQuantileList,
	cloudStorms,
	cloudStormsAt,
	driftRadPerS,
	MAX_LOWS,
	MAX_STORMS,
	scaleOf,
} from "@/ui/genesis/renderer/clouds/vendor/orogen.js"
import { rasterizeCloudWeather } from "@/ui/genesis/renderer/clouds/weather"
import { SURFACE_LIGHTING_GLSL } from "@/ui/genesis/renderer/surface-lighting"

export const CLOUD_FRAME_MS = 80

const GLOBE_VERTEX = `
	varying vec3 vCloudPoint;
	void main() {
		vCloudPoint = position;
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const MAP_VERTEX = `
	attribute vec2 lonLat;
	uniform mat3 uCloudMapRotation;
	varying vec3 vCloudPoint;
	void main() {
		vec3 p = uCloudMapRotation * vec3(cos(lonLat.y) * cos(lonLat.x), cos(lonLat.y) * sin(lonLat.x), sin(lonLat.y));
		vCloudPoint = vec3(p.x, p.z, -p.y);
		gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	}
`

const FRAGMENT = `
	${CLOUD_GLSL}
	${SURFACE_LIGHTING_GLSL}
	uniform vec4 uCloudOp;
	uniform vec2 uCloudGrey;
	uniform float uCloudLight, uCloudLit, uCloudShadow, uCloudShadowStep;
	uniform bool uCloudDaylight;
	varying vec3 vCloudPoint;
	vec2 cloudUv(vec3 p) {
		float longitude = atan(-p.z, p.x);
		return vec2(longitude / 6.283185307 + 0.5, asin(clamp(p.y, -1.0, 1.0)) / 3.141592654 + 0.5);
	}
	void main() {
		vec3 p = normalize(vCloudPoint);
		vec2 uv = cloudUv(p);
		float px = length(fwidth(p));
		float daylight = sunlightAt(p);
		float shadow = 0.0;
		#if defined(CLOUD_SHADOW) || defined(CLOUD_MAP)
		float shadowStrength = uCloudShadow * (uCloudDaylight ? daylight : 1.0);
		if (shadowStrength > 0.0) {
			vec3 towardLight = uCloudDaylight
				? normalize(p + uSunDirection * uCloudShadowStep)
				: cloudTowardLight(p, uCloudShadowStep);
			shadow = shadowStrength * cloudShade(towardLight, cloudUv(towardLight), px);
		}
		#endif
		#ifdef CLOUD_SHADOW
		gl_FragColor = vec4(0.0, 0.0, 0.0, shadow);
		#else
		vec4 cloud = cloudColour(p, uv, px, uCloudOp, uCloudGrey, uCloudLight, uCloudLit);
		vec3 rgb = sRGBTransferEOTF(vec4(cloud.rgb, 1.0)).rgb * surfaceLight(daylight);
		float alpha = cloud.a + shadow * (1.0 - cloud.a);
		gl_FragColor = vec4(rgb * cloud.a / max(alpha, 1e-4), alpha);
		#endif
		#include <colorspace_fragment>
	}
`

export function createCloudOverlay() {
	const K = CLOUDS
	const lit = !window.matchMedia?.("(pointer: coarse)").matches
	const mapRotation = new THREE.Matrix3()
	const uniforms = {
		uAmbient: { value: new THREE.Vector3(1, 1, 1) },
		uSunDirection: { value: new THREE.Vector3(1, 0, 0) },
		uSunLight: { value: new THREE.Vector3() },
		uCloudDaylight: { value: false },
		uCloudCover: { value: null as THREE.DataTexture | null },
		uCloudWind: { value: null as THREE.DataTexture | null },
		uCloudNoise: { value: null as THREE.Data3DTexture | null },
		uCloudMapRotation: { value: mapRotation },
		uCloudScale: { value: 0 },
		uCloudRadiusKm: { value: 1 },
		uCloudItcz: { value: 0 },
		uCloudHigh: { value: new THREE.Vector2() },
		uCloudLowsN: { value: new Float32Array(MAX_LOWS) },
		uCloudLowsS: { value: new Float32Array(MAX_LOWS) },
		uCloudLowCount: { value: new THREE.Vector2() },
		uCloudZonal: { value: 0 },
		uCloudStretch: { value: K.stretch },
		uCloudWarp1: { value: K.warp1 },
		uCloudWarp2: { value: K.warp2 },
		uCloudW0: { value: K.w0 },
		uCloudW1: { value: K.w1 },
		uCloudW2: { value: K.w2 },
		uCloudContrast: { value: K.contrast },
		uCloudVeil: { value: K.veil },
		uCloudVeilWidth: { value: K.veilWidth },
		uCloudErosion: { value: K.erosion },
		uCloudDetail: { value: K.detail },
		uCloudSharp: { value: K.sharp },
		uCloudLowScale: { value: K.lowScale },
		uCloudConvScale: { value: K.convScale },
		uCloudCirrusScale: { value: K.cirrusScale },
		uCloudStreakFront: { value: K.streakFrontKm },
		uCloudStreakCirrus: { value: K.streakCirrusKm },
		uCloudWindFull: { value: K.windFull },
		uCloudEvolve: { value: K.evolve },
		uCloudFlowPeriod: { value: K.flowPeriod },
		uCloudFlowKm: { value: K.flowKm },
		uCloudStormKm: { value: K.stormKm },
		uCloudStormTwist: { value: K.stormTwist },
		uCloudStormCover: { value: K.stormCover },
		uCloudTropicalTwist: { value: K.tropicalTwist },
		uCloudCirrusWarp: { value: K.cirrusWarp },
		uCloudCirrusFine: { value: K.cirrusFine },
		uCloudWeatherScale: { value: K.weatherScale },
		uCloudWeatherAmp: { value: K.weatherAmp },
		uCloudStreakVary: { value: K.streakVary },
		uCloudBillow: { value: K.billow },
		uCloudRelief: { value: K.relief },
		uCloudThick: { value: K.thick },
		uCloudThinOp: { value: K.thinOp },
		uCloudThinGrey: { value: K.thinGrey },
		uCloudLight: { value: K.light },
		uCloudEdge: { value: cloudEdges() },
		uCloudAA: { value: new THREE.Vector4().fromArray(K.aa) },
		uCloudQ: { value: cloudQuantileList() },
		uCloudTime: { value: 0 },
		uCloudDrift: { value: driftRadPerS() },
		uCloudFlowLat: { value: new THREE.Vector2().fromArray(K.flowLat) },
		uCloudStreakLat: { value: new THREE.Vector3().fromArray(K.streakLat) },
		uCloudSeason: { value: new THREE.Vector3() },
		uCloudStorm: {
			value: Array.from({ length: MAX_STORMS }, () => new THREE.Vector4()),
		},
		uCloudStormSize: { value: new Float32Array(MAX_STORMS) },
		uCloudStorms: { value: 0 },
		uCloudOp: {
			value: new THREE.Vector4(K.opLow, K.opConv, K.opFront, K.opCirrus),
		},
		uCloudGrey: { value: new THREE.Vector2(K.greyLow, K.greyCirrus) },
		uCloudLit: { value: Number(lit) },
		uCloudShadow: { value: lit ? K.shadow : 0 },
		uCloudShadowStep: { value: 0 },
	}

	const globeMaterial = new THREE.ShaderMaterial({
		uniforms,
		vertexShader: GLOBE_VERTEX,
		fragmentShader: FRAGMENT,
		transparent: true,
		depthWrite: false,
	})
	const shadowMaterial = globeMaterial.clone()
	shadowMaterial.uniforms = uniforms
	shadowMaterial.defines = { CLOUD_SHADOW: 1 }
	const mapMaterial = globeMaterial.clone()
	mapMaterial.uniforms = uniforms
	mapMaterial.defines = { CLOUD_MAP: 1 }
	mapMaterial.vertexShader = MAP_VERTEX
	mapMaterial.side = THREE.DoubleSide
	mapMaterial.forceSinglePass = true

	const globe = new THREE.Group()
	globe.visible = false
	const shell = new THREE.Mesh(
		new THREE.SphereGeometry(1.035, 64, 48),
		globeMaterial,
	)
	const shadow = new THREE.Mesh(
		new THREE.SphereGeometry(1.0015, 64, 48),
		shadowMaterial,
	)
	shell.rotation.x = Math.PI / 2
	shadow.rotation.copy(shell.rotation)
	shell.renderOrder = 2
	shadow.renderOrder = 1
	shadow.visible = lit
	globe.add(shadow, shell)

	let source: CloudDisplay["world"] = null
	let currentMonth = 0
	let ready = false
	let frozen = false
	let started = 0
	let updated = 0
	let storms: ReturnType<typeof cloudStorms> = []
	let belts: CloudClimateGrid["belts"] = null

	function setLighting({
		enabled,
		direction,
		ambient,
		sunlight,
	}: CloudLighting) {
		uniforms.uCloudDaylight.value = enabled
		uniforms.uSunDirection.value.set(direction.x, direction.z, -direction.y)
		if (enabled) {
			uniforms.uAmbient.value.copy(ambient)
			uniforms.uSunLight.value.copy(sunlight)
		} else {
			uniforms.uAmbient.value.setScalar(1)
			uniforms.uSunLight.value.setScalar(0)
		}
	}

	function setTime(time: number) {
		uniforms.uCloudTime.value = time
		const positions = cloudStormsAt(storms, time, belts)
		for (let i = 0; i < positions.length; i++) {
			const [x, y, z, strength, size] = positions[i]
			uniforms.uCloudStorm.value[i].set(x, y, z, strength)
			uniforms.uCloudStormSize.value[i] = size
		}
	}

	function setDisplay({ world, month, visible }: CloudDisplay) {
		ready = visible && !!world?.mesh.numRegions
		if (!ready) {
			if (world !== source) source = null
			return
		}
		if (world === source && month === currentMonth) return

		const weather = rasterizeCloudWeather({ world, month })
		const { w, h, cover, wind } = cloudFields(weather)
		uniforms.uCloudCover.value?.dispose()
		uniforms.uCloudWind.value?.dispose()
		uniforms.uCloudCover.value = createWeatherTexture({ data: cover, w, h })
		uniforms.uCloudWind.value = createWeatherTexture({ data: wind, w, h })
		if (!uniforms.uCloudNoise.value) {
			const { data, N } = cloudNoiseTexture()
			const texture = new THREE.Data3DTexture(data, N, N, N)
			texture.minFilter = THREE.LinearMipmapLinearFilter
			texture.magFilter = THREE.LinearFilter
			texture.generateMipmaps = true
			texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping
			texture.needsUpdate = true
			uniforms.uCloudNoise.value = texture
		}

		const season = month === 0 ? 0 : Math.cos(((month - 1) * Math.PI) / 6)
		uniforms.uCloudSeason.value.set(0.42 * season, -0.3 * season, 0.25 * season)
		const radiusKm = world.params.planetRadiusKm
		uniforms.uCloudScale.value = scaleOf(radiusKm)
		uniforms.uCloudRadiusKm.value = radiusKm
		uniforms.uCloudShadowStep.value = K.shadowKm / radiusKm
		belts = weather.belts
		uniforms.uCloudZonal.value = Number(!!belts)
		const beltUniforms = cloudBeltUniforms(belts)
		uniforms.uCloudItcz.value = beltUniforms.itcz
		uniforms.uCloudHigh.value.fromArray(beltUniforms.high)
		uniforms.uCloudLowsN.value.set(beltUniforms.lowsN)
		uniforms.uCloudLowsS.value.set(beltUniforms.lowsS)
		uniforms.uCloudLowCount.value.fromArray(beltUniforms.lowCount)
		storms = cloudStorms(world.params.seed, weather)
		uniforms.uCloudStorms.value = storms.length
		source = world
		currentMonth = month
		started = updated = performance.now()
		setTime(0)
	}

	function advance() {
		const now = performance.now()
		if (frozen || now - updated < CLOUD_FRAME_MS) return
		updated = now
		setTime((now - started) / 1000)
	}

	function freezeForExport() {
		const before = uniforms.uCloudTime.value
		frozen = true
		setTime(0)
		return () => {
			frozen = false
			setTime(before)
		}
	}

	function dispose() {
		shell.geometry.dispose()
		shadow.geometry.dispose()
		globeMaterial.dispose()
		shadowMaterial.dispose()
		mapMaterial.dispose()
		uniforms.uCloudCover.value?.dispose()
		uniforms.uCloudWind.value?.dispose()
		uniforms.uCloudNoise.value?.dispose()
	}

	return {
		globe,
		mapMaterial,
		mapRotation,
		get ready() {
			return ready
		},
		get frozen() {
			return frozen
		},
		setDisplay,
		setLighting,
		advance,
		freezeForExport,
		dispose,
	}
}

function createWeatherTexture({ data, w, h }: CloudTextureInput) {
	const texture = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
	texture.minFilter = texture.magFilter = THREE.LinearFilter
	texture.wrapS = THREE.RepeatWrapping
	texture.needsUpdate = true
	return texture
}

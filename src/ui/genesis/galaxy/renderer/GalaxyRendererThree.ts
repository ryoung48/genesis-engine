import * as THREE from "three"
import { Galaxy } from "./Galaxy"
import type {
	StarFieldParam,
	StarFieldRequest,
	StarFieldResult,
	TypedStarBuffer,
} from "./star-field.worker"
import { GalaxyParam } from "./Types"

const DECORATIVE_STAR_COUNT = 50_000
const DUST_RENDER_SIZE_BASE = 213.5
const MIN_ZOOM_FACTOR = 0.15
const MAX_ZOOM_FACTOR = 16

/**
 * three.js port of GalaxyRenderer.ts's *rendering* layer only -- Galaxy.ts/
 * Types.ts/Helper.ts/CumulativeDistributionFunction.ts are pure data/math
 * classes with no WebGL calls in them, so they're reused here completely
 * unchanged (imported directly, not re-derived). Only the raw-WebGL2 buffer/
 * shader plumbing (GalaxyRenderer.ts's own gl.* calls, VertexBufferStars.ts,
 * VertexBufferLines.ts, VertexBufferBase.ts) gets replaced with three.js
 * equivalents (THREE.Points/THREE.ShaderMaterial/THREE.OrthographicCamera),
 * so that other three.js content (see PortedGalaxyView.tsx, which adds the
 * old packed-galaxy model's own points/lanes objects straight into this
 * renderer's scene) can share this exact scene/camera instead of needing a
 * second WebGL context kept in sync by hand.
 *
 * Public API intentionally mirrors GalaxyRenderer.ts's own (presets, the
 * show-flag properties, hasDarkMatter/timeStep/fov, selectPreset/
 * applyParams/updateDensityWaveParam, pan+zoom controls,
 * worldToScreen/screenToWorld) so callers don't need to change beyond the
 * import path. GalaxyRenderer.ts's own pickStarIndex has no equivalent here
 * -- PortedGalaxyView.tsx picks from the packed old-model systems instead
 * (see renderer/galaxy-scene/picking.ts's pickNearestSystem), and this
 * renderer's own star field lives only as worker-computed typed arrays on
 * the GPU (see star-field.worker.ts), not as CPU-side Star objects a picker
 * could scan.
 */

const DEG_TO_RAD = Math.PI / 180

// Matches GalaxyRenderer.ts's own fixed top-down camera: always directly
// above panTarget by this distance, up=(0,1,0) -- see its own field
// comments for why rotation was shelved in favor of a plain 2D view.
const CAM_DISTANCE = 5000

interface StarBufferSpec {
	/** Which Star.type values this buffer includes. */
	types: number[]
	pointSizeExpr: string
	colorExpr: string
	alphaExpr: string
}

// Ported from VertexBufferStars.ts's fragment/vertex shader branches --
// stars(type 0), dust(1), filaments(2) share the same simple "orbit
// position + circular soft-edge glow" shape; H2 regions/cores (3/4) need
// their own size formula (distance between two points on the same orbit)
// so they get their own material below instead of trying to force them
// into this table.
const SIMPLE_BUFFERS: Record<"stars" | "dust" | "filaments", StarBufferSpec> = {
	stars: {
		types: [0],
		pointSizeExpr: "mag * 4.0",
		colorExpr: "color * mag",
		alphaExpr: "1.0 - dist",
	},
	dust: {
		types: [1],
		pointSizeExpr: "mag * 5.0 * uDustSize",
		colorExpr: "color * mag",
		alphaExpr: "0.05 * (1.0 - dist)",
	},
	filaments: {
		types: [2],
		pointSizeExpr: "mag * 2.0 * uDustSize",
		colorExpr: "color * mag",
		alphaExpr: "0.07 * (1.0 - dist)",
	},
}

const ORBIT_POSITION_GLSL = /* glsl */ `
	uniform float uTime;
	uniform float uPertN;
	uniform float uPertAmp;

	vec2 orbitPosition(float a, float b, float theta0, float velTheta, float tiltAngle) {
		float thetaDeg = theta0 + velTheta * uTime;
		float alpha = thetaDeg * ${DEG_TO_RAD};
		float beta = -tiltAngle;
		float cosA = cos(alpha);
		float sinA = sin(alpha);
		float cosB = cos(beta);
		float sinB = sin(beta);
		vec2 pos = vec2(
			a * cosA * cosB - b * sinA * sinB,
			a * cosA * sinB + b * sinA * cosB
		);
		if (uPertAmp > 0.0 && uPertN > 0.0) {
			pos.x += (a / uPertAmp) * sin(alpha * 2.0 * uPertN);
			pos.y += (a / uPertAmp) * cos(alpha * 2.0 * uPertN);
		}
		return pos;
	}
`

function buildSimplePointsMaterial(spec: StarBufferSpec): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uPertN: { value: 0 },
			uPertAmp: { value: 0 },
			uDustSize: { value: 1 },
		},
		vertexShader: /* glsl */ `
			uniform float uDustSize;
			attribute float theta0;
			attribute float velTheta;
			attribute float tiltAngle;
			attribute float a;
			attribute float b;
			attribute float mag;
			attribute vec3 color;
			varying vec3 vColor;

			${ORBIT_POSITION_GLSL}

			void main() {
				vec2 pos = orbitPosition(a, b, theta0, velTheta, tiltAngle);
				vColor = ${spec.colorExpr};
				vec4 mvPosition = modelViewMatrix * vec4(pos, 0.0, 1.0);
				gl_Position = projectionMatrix * mvPosition;
				gl_PointSize = ${spec.pointSizeExpr};
			}
		`,
		fragmentShader: /* glsl */ `
			varying vec3 vColor;
			void main() {
				vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
				float dist = length(circCoord);
				if (dist > 1.0) discard;
				float alpha = ${spec.alphaExpr};
				gl_FragColor = vec4(vColor, alpha);
			}
		`,
		transparent: true,
		depthWrite: false,
		depthTest: false,
		blending: THREE.CustomBlending,
		blendSrc: THREE.SrcAlphaFactor,
		blendDst: THREE.OneFactor,
		blendEquation: THREE.AddEquation,
	})
}

// H2 regions (type 3) and their bright cores (type 4) size themselves by
// the on-screen distance between the orbit position at `a` and at
// `a+1000` -- a cheap proxy for "how much does this orbit's arc-length
// change per screen pixel here", ported straight from VertexBufferStars.ts.
function buildH2Material(): THREE.ShaderMaterial {
	return new THREE.ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uPertN: { value: 0 },
			uPertAmp: { value: 0 },
		},
		vertexShader: /* glsl */ `
			attribute float theta0;
			attribute float velTheta;
			attribute float tiltAngle;
			attribute float a;
			attribute float b;
			attribute float mag;
			attribute float isCore;
			attribute vec3 color;
			varying vec3 vColor;
			varying float vIsCore;

			${ORBIT_POSITION_GLSL}

			void main() {
				vec2 pos = orbitPosition(a, b, theta0, velTheta, tiltAngle);
				vec2 pos2 = orbitPosition(a + 1000.0, b, theta0, velTheta, tiltAngle);
				float dst = distance(pos, pos2);
				float regionSize = max(((1000.0 - dst) / 10.0) - 50.0, 0.0);

				vIsCore = isCore;
				if (isCore > 0.5) {
					vColor = vec3(1.0);
					gl_PointSize = regionSize / 10.0;
				} else {
					vColor = color * mag * vec3(2.0, 0.5, 0.5);
					gl_PointSize = regionSize;
				}
				vec4 mvPosition = modelViewMatrix * vec4(pos, 0.0, 1.0);
				gl_Position = projectionMatrix * mvPosition;
			}
		`,
		fragmentShader: /* glsl */ `
			varying vec3 vColor;
			varying float vIsCore;
			void main() {
				vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
				float dist = length(circCoord);
				if (dist > 1.0) discard;
				gl_FragColor = vec4(vColor, 1.0 - dist);
			}
		`,
		transparent: true,
		depthWrite: false,
		depthTest: false,
		blending: THREE.CustomBlending,
		blendSrc: THREE.SrcAlphaFactor,
		blendDst: THREE.OneFactor,
		blendEquation: THREE.AddEquation,
	})
}

/** Builds a simple (non-H2) buffer's geometry directly from a
 * star-field.worker.ts TypedStarBuffer -- the per-star type filtering and
 * temperature->color conversion that used to happen here (iterating a
 * plain Star[]) now happens in the worker instead, so this is just
 * wrapping already-computed typed arrays in BufferAttributes. */
function geometryFromTypedBuffer(buf: TypedStarBuffer): THREE.BufferGeometry {
	const n = buf.theta0.length
	const position = new Float32Array(n * 3)
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(position, 3))
	geometry.setAttribute("theta0", new THREE.BufferAttribute(buf.theta0, 1))
	geometry.setAttribute("velTheta", new THREE.BufferAttribute(buf.velTheta, 1))
	geometry.setAttribute(
		"tiltAngle",
		new THREE.BufferAttribute(buf.tiltAngle, 1),
	)
	geometry.setAttribute("a", new THREE.BufferAttribute(buf.a, 1))
	geometry.setAttribute("b", new THREE.BufferAttribute(buf.b, 1))
	geometry.setAttribute("mag", new THREE.BufferAttribute(buf.mag, 1))
	geometry.setAttribute("color", new THREE.BufferAttribute(buf.color, 3))
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e9)
	return geometry
}

function h2GeometryFromTypedBuffer(
	buf: TypedStarBuffer & { isCore: Float32Array },
): THREE.BufferGeometry {
	const geometry = geometryFromTypedBuffer(buf)
	geometry.setAttribute("isCore", new THREE.BufferAttribute(buf.isCore, 1))
	return geometry
}

/** Static (non-animated) ellipse outline in the XY plane -- used for the
 * density-wave guide rings and the axis grid's circles-of-latitude-esque
 * markers. Ported from GalaxyRenderer.ts's addEllipsisVertices, which has
 * no time/orbit-velocity dependency (unlike the star buffers above), so
 * this is plain CPU geometry rebuilt only when params change, not a
 * shader. */
function buildEllipseLine(
	a: number,
	b: number,
	tiltRad: number,
	color: THREE.Color,
	opacity: number,
): THREE.LineLoop {
	const segments = 128
	const positions = new Float32Array(segments * 3)
	const cosT = Math.cos(tiltRad)
	const sinT = Math.sin(tiltRad)
	for (let i = 0; i < segments; i++) {
		const alpha = (i / segments) * Math.PI * 2
		const ex = a * Math.cos(alpha)
		const ey = b * Math.sin(alpha)
		positions[3 * i] = ex * cosT - ey * sinT
		positions[3 * i + 1] = ex * sinT + ey * cosT
		positions[3 * i + 2] = 0
	}
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	const material = new THREE.LineBasicMaterial({
		color,
		transparent: true,
		opacity,
	})
	return new THREE.LineLoop(geometry, material)
}

export class GalaxyRenderer {
	private canvas: HTMLCanvasElement
	private renderer: THREE.WebGLRenderer
	private _scene: THREE.Scene
	private _camera: THREE.OrthographicCamera

	private _galaxy = new Galaxy()
	private preset: GalaxyParam[] = []
	private _fov = 0
	private _timeStepSize = 100000
	private time = 0

	// Galaxy.ts's own star generation (Galaxy.reset's initStarsAndDust) is a
	// synchronous, trig-heavy loop over tens of thousands of stars -- run
	// off the main thread in star-field.worker.ts (which imports Galaxy.ts
	// completely unchanged) instead of blocking construction/preset
	// switches. `this._galaxy` here is only ever reset with
	// recomputeStars=false (see applyParams), so it stays cheap: it's kept
	// around purely for its bookkeeping getters (rad/coreRad/farFieldRad/
	// exInner/exOuter/getExcentricity/getAngularOffset/dustRenderSize/pertN/
	// pertAmp), which rebuildDensityWaves/adjustCamera/rebuildStars's
	// uniform updates below still need synchronously.
	private starFieldWorker: Worker
	private starFieldRequestId = 0
	private currentParam: StarFieldParam | null = null
	private _hasDarkMatterFlag = true

	private panTarget = new THREE.Vector2(0, 0)
	private _zoomFactor = 1
	private isPanning = false
	private lastPointerX = 0
	private lastPointerY = 0

	private starsGroup: THREE.Group
	private simplePoints: Record<keyof typeof SIMPLE_BUFFERS, THREE.Points>
	private h2Points: THREE.Points
	private densityWaveGroup: THREE.Group
	private axisGroup: THREE.Group

	private dustRenderSizeBase = DUST_RENDER_SIZE_BASE
	private disposed = false
	private animationHandle = 0

	private _showAxis = true
	private _showDensityWaves = false
	private _showDust = true
	private _showDustFilaments = true
	private _showStars = true
	private _showH2 = true
	private _showVelocity = false

	public constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas
		this.renderer = new THREE.WebGLRenderer({
			canvas,
			antialias: true,
			alpha: true,
		})
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
		this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
		this.renderer.setClearColor(0x000000, 0)

		this._scene = new THREE.Scene()
		this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20000)
		this._camera.up.set(0, 1, 0)

		this.starsGroup = new THREE.Group()
		this._scene.add(this.starsGroup)
		this.simplePoints = {
			stars: new THREE.Points(
				new THREE.BufferGeometry(),
				buildSimplePointsMaterial(SIMPLE_BUFFERS.stars),
			),
			dust: new THREE.Points(
				new THREE.BufferGeometry(),
				buildSimplePointsMaterial(SIMPLE_BUFFERS.dust),
			),
			filaments: new THREE.Points(
				new THREE.BufferGeometry(),
				buildSimplePointsMaterial(SIMPLE_BUFFERS.filaments),
			),
		}
		this.h2Points = new THREE.Points(
			new THREE.BufferGeometry(),
			buildH2Material(),
		)
		this.starsGroup.add(
			this.simplePoints.dust,
			this.simplePoints.filaments,
			this.h2Points,
			this.simplePoints.stars,
		)

		this.densityWaveGroup = new THREE.Group()
		this._scene.add(this.densityWaveGroup)
		this.axisGroup = new THREE.Group()
		this._scene.add(this.axisGroup)

		this.starFieldWorker = new Worker(
			new URL("./star-field.worker.ts", import.meta.url),
			{ type: "module" },
		)
		this.starFieldWorker.onmessage = (event: MessageEvent<StarFieldResult>) => {
			this.handleStarFieldResult(event.data)
		}

		this.initOrbitControls()
		this.initSimulation()

		this.animationHandle = requestAnimationFrame(this.tick)
	}

	// --- Preset table -------------------------------------------------

	public get presets(): readonly GalaxyParam[] {
		return this.preset
	}

	public get galaxy(): Galaxy {
		return this._galaxy
	}

	private initSimulation(): void {
		this.preset.push(
			new GalaxyParam(
				13000,
				4000,
				0.0004,
				0.85,
				0.95,
				DECORATIVE_STAR_COUNT,
				true,
				2,
				40,
				70,
				4000,
			),
		)
		this.preset.push(
			new GalaxyParam(
				16000,
				4000,
				0.0003,
				0.8,
				0.85,
				DECORATIVE_STAR_COUNT,
				true,
				0,
				40,
				58,
				4500,
			),
		)
		this.preset.push(
			new GalaxyParam(
				13000,
				4000,
				0.00064,
				0.9,
				0.9,
				DECORATIVE_STAR_COUNT,
				true,
				0,
				0,
				75,
				4100,
			),
		)
		this.preset.push(
			new GalaxyParam(
				13000,
				4000,
				0.0004,
				1.35,
				1.05,
				DECORATIVE_STAR_COUNT,
				true,
				0,
				0,
				70,
				4500,
			),
		)
		this.preset.push(
			new GalaxyParam(
				13000,
				4500,
				0.0002,
				0.65,
				0.95,
				DECORATIVE_STAR_COUNT,
				true,
				3,
				72,
				80,
				4000,
			),
		)
		this.preset.push(
			new GalaxyParam(
				15000,
				4000,
				0.0003,
				1.45,
				1.0,
				DECORATIVE_STAR_COUNT,
				true,
				0,
				0,
				80,
				4500,
			),
		)
		this.preset.push(
			new GalaxyParam(
				14000,
				12500,
				0.0002,
				0.65,
				0.95,
				DECORATIVE_STAR_COUNT,
				true,
				3,
				72,
				85,
				2200,
			),
		)
		this.preset.push(
			new GalaxyParam(
				13000,
				1500,
				0.0004,
				1.1,
				1.0,
				DECORATIVE_STAR_COUNT,
				true,
				1,
				20,
				80,
				2800,
			),
		)
		this.preset.push(
			new GalaxyParam(
				13000,
				4000,
				0.0004,
				0.85,
				0.95,
				DECORATIVE_STAR_COUNT,
				true,
				1,
				20,
				80,
				4500,
			),
		)
		this.applyParams(this.preset[0]!)
	}

	public selectPreset(idx: number): void {
		const preset = this.preset[idx]
		if (preset) this.applyParams(preset)
	}

	public applyParams(param: GalaxyParam): void {
		// recomputeStars=false -- the expensive part (star generation) runs on
		// the worker instead (see requestStarField below); this only updates
		// _galaxy's cheap bookkeeping fields (rad/coreRad/dustRenderSize/pertN/
		// pertAmp/etc.), which reset() sets directly regardless of that flag.
		this._galaxy.reset(param, false)
		this._hasDarkMatterFlag = param.hasDarkMatter
		this.fov = this._galaxy.rad * 3
		this.rebuildDensityWaves()
		this.requestStarField(param)
	}

	/** Sends a star-field.worker.ts generation request, tagged with a
	 * request id so a stale response (e.g. from a preset switched away from
	 * before its worker round-trip finished) can be dropped in
	 * handleStarFieldResult instead of clobbering a newer one. */
	private requestStarField(param: StarFieldParam): void {
		this.currentParam = param
		this.starFieldRequestId += 1
		const request: StarFieldRequest = {
			requestId: this.starFieldRequestId,
			param,
		}
		this.starFieldWorker.postMessage(request)
	}

	private handleStarFieldResult(result: StarFieldResult): void {
		if (result.requestId !== this.starFieldRequestId) return

		this.simplePoints.stars.geometry.dispose()
		this.simplePoints.stars.geometry = geometryFromTypedBuffer(result.stars)
		this.simplePoints.dust.geometry.dispose()
		this.simplePoints.dust.geometry = geometryFromTypedBuffer(result.dust)
		this.simplePoints.filaments.geometry.dispose()
		this.simplePoints.filaments.geometry = geometryFromTypedBuffer(
			result.filaments,
		)
		this.h2Points.geometry.dispose()
		this.h2Points.geometry = h2GeometryFromTypedBuffer(result.h2)

		const uPertN = this._galaxy.pertN
		const uPertAmp = this._galaxy.pertAmp
		const uDustSize = this._galaxy.dustRenderSize
		for (const points of [...Object.values(this.simplePoints), this.h2Points]) {
			const material = points.material as THREE.ShaderMaterial
			material.uniforms.uPertN!.value = uPertN
			material.uniforms.uPertAmp!.value = uPertAmp
			if (material.uniforms.uDustSize)
				material.uniforms.uDustSize.value = uDustSize
		}
	}

	public updateDensityWaveParam(
		coreRad: number,
		rad: number,
		angularOffset: number,
		innerEx: number,
		outterEx: number,
		pertN: number,
		pertAmp: number,
		baseTemp: number,
	): void {
		this._galaxy.coreRad = coreRad
		this._galaxy.rad = rad
		this._galaxy.exInner = innerEx
		this._galaxy.exOuter = outterEx
		this._galaxy.angleOffset = angularOffset
		this._galaxy.pertN = pertN
		this._galaxy.pertAmp = pertAmp
		this._galaxy.baseTemp = baseTemp
		this.rebuildDensityWaves()
	}

	// --- fov / dust render size -----------------------------------------

	public set fov(value: number) {
		this._fov = value
		this._galaxy.dustRenderSize = Math.max(
			this.dustRenderSizeBase - 0.0026 * value,
			0,
		)
		this.adjustCamera()
		this.rebuildAxis()
	}
	public get fov(): number {
		return this._fov
	}

	public set dustRenderSize(value: number) {
		this.dustRenderSizeBase = value
		this._galaxy.dustRenderSize = Math.max(
			this.dustRenderSizeBase - 0.0026 * this._fov,
			0,
		)
	}
	public get dustRenderSize(): number {
		return this.dustRenderSizeBase
	}

	// --- display toggles --------------------------------------------------

	public get showAxis(): boolean {
		return this._showAxis
	}
	public set showAxis(value: boolean) {
		this._showAxis = value
		this.axisGroup.visible = value
	}

	public get showDensityWaves(): boolean {
		return this._showDensityWaves
	}
	public set showDensityWaves(value: boolean) {
		this._showDensityWaves = value
		this.densityWaveGroup.visible = value
	}

	public get showDust(): boolean {
		return this._showDust
	}
	public set showDust(value: boolean) {
		this._showDust = value
		this.simplePoints.dust.visible = value
	}

	public get showDustFilaments(): boolean {
		return this._showDustFilaments
	}
	public set showDustFilaments(value: boolean) {
		this._showDustFilaments = value
		this.simplePoints.filaments.visible = value
	}

	public get showStars(): boolean {
		return this._showStars
	}
	public set showStars(value: boolean) {
		this._showStars = value
		this.simplePoints.stars.visible = value
	}

	public get showH2(): boolean {
		return this._showH2
	}
	public set showH2(value: boolean) {
		this._showH2 = value
		this.h2Points.visible = value
	}

	public get showVelocity(): boolean {
		return this._showVelocity
	}
	public set showVelocity(value: boolean) {
		this._showVelocity = value
		// No velocity-curve visual is built in this port (a debug view, off
		// by default, with no current caller ever turning it on) -- the flag
		// is still tracked for API parity.
	}

	public get hasDarkMatter(): boolean {
		return this._hasDarkMatterFlag
	}
	public set hasDarkMatter(value: boolean) {
		// NOT routed through `this._galaxy.hasDarkMatter`'s own setter --
		// Galaxy.ts's setter unconditionally calls initStarsAndDust()
		// synchronously (the exact main-thread cost this worker split exists
		// to avoid), so the flag is tracked here instead and a fresh
		// worker-side regen is requested with it folded into the current
		// params.
		this._hasDarkMatterFlag = value
		if (!this.currentParam) return
		this.requestStarField({ ...this.currentParam, hasDarkMatter: value })
	}

	public get timeStep(): number {
		return this._timeStepSize
	}
	public set timeStep(value: number) {
		this._timeStepSize = value
	}

	public get zoomFactor(): number {
		return this._zoomFactor
	}

	// Exposes the actual scene/camera so other three.js content (e.g. the
	// old galaxy-scene's points/lanes objects, see PortedGalaxyView.tsx) can
	// be added directly into this same scene/camera instead of needing a
	// second renderer kept in sync by hand.
	public get scene(): THREE.Scene {
		return this._scene
	}
	public get camera(): THREE.OrthographicCamera {
		return this._camera
	}

	/** Recenters the camera on a world-space point, optionally also setting
	 * zoom -- used by the "Find systems" search panel to jump to a match
	 * (see PortedGalaxyView.tsx's focusSearchedSystem). */
	public panTo(worldX: number, worldY: number, zoomFactor?: number): void {
		this.panTarget.set(worldX, worldY)
		if (zoomFactor !== undefined)
			this._zoomFactor = Math.min(
				MAX_ZOOM_FACTOR,
				Math.max(MIN_ZOOM_FACTOR, zoomFactor),
			)
		this.adjustCamera()
	}

	// --- geometry rebuilding ------------------------------------------

	private rebuildDensityWaves(): void {
		for (const child of [...this.densityWaveGroup.children]) {
			this.densityWaveGroup.remove(child)
			if (child instanceof THREE.LineLoop) {
				child.geometry.dispose()
				;(child.material as THREE.Material).dispose()
			}
		}

		const num = 100
		const dr = this._galaxy.farFieldRad / num
		const guideColor = new THREE.Color(1, 1, 1)
		for (let i = 0; i <= num; i++) {
			const r = dr * (i + 1)
			this.densityWaveGroup.add(
				buildEllipseLine(
					r,
					r * this._galaxy.getExcentricity(r),
					this._galaxy.getAngularOffset(r),
					guideColor,
					0.2,
				),
			)
		}
		this.densityWaveGroup.add(
			buildEllipseLine(
				this._galaxy.coreRad,
				this._galaxy.coreRad,
				0,
				new THREE.Color(1, 1, 0),
				0.5,
			),
		)
		this.densityWaveGroup.add(
			buildEllipseLine(
				this._galaxy.rad,
				this._galaxy.rad,
				0,
				new THREE.Color(0, 1, 0),
				0.5,
			),
		)
		this.densityWaveGroup.add(
			buildEllipseLine(
				this._galaxy.farFieldRad,
				this._galaxy.farFieldRad,
				0,
				new THREE.Color(1, 0, 0),
				0.5,
			),
		)
	}

	private rebuildAxis(): void {
		for (const child of [...this.axisGroup.children]) {
			this.axisGroup.remove(child)
			if (child instanceof THREE.Line) {
				child.geometry.dispose()
				;(child.material as THREE.Material).dispose()
			}
		}
		const s = 10 ** Math.floor(Math.log10(this._fov / 2))
		const half = this._fov / 100
		const positions: number[] = []
		for (let p = s; p < this._fov; p += s) {
			positions.push(p, -half, 0, p, half, 0)
			positions.push(-p, -half, 0, -p, half, 0)
			positions.push(-half, p, 0, half, p, 0)
			positions.push(-half, -p, 0, half, -p, 0)
		}
		positions.push(-this._fov, 0, 0, this._fov, 0, 0)
		positions.push(0, -this._fov, 0, 0, this._fov, 0)
		const geometry = new THREE.BufferGeometry()
		geometry.setAttribute(
			"position",
			new THREE.BufferAttribute(Float32Array.from(positions), 3),
		)
		const material = new THREE.LineBasicMaterial({
			color: 0x4d4d4d,
			transparent: true,
			opacity: 0.8,
		})
		this.axisGroup.add(new THREE.LineSegments(geometry, material))
	}

	// --- camera / interaction ------------------------------------------

	// Frustum bounds are fixed at zoomFactor=1's half-height (NOT resized
	// per zoom tick) -- actual zoom goes through three.js's own
	// `camera.zoom`, kept mirrored to _zoomFactor here. This is what lets
	// this camera be shared as-is with the old galaxy-scene's
	// updateClusterPositions (cluster.ts), which reads camera.zoom directly
	// to keep multi-star cluster jitter at a constant screen-space size --
	// a camera whose frustum bounds themselves shrink/grow with zoom
	// instead would leave that always reading zoom=1.
	private adjustCamera(): void {
		const l = this._fov / 2
		const aspect =
			this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight)
		this._camera.left = -l * aspect
		this._camera.right = l * aspect
		this._camera.top = l
		this._camera.bottom = -l
		this._camera.zoom = this._zoomFactor
		this._camera.position.set(this.panTarget.x, this.panTarget.y, CAM_DISTANCE)
		this._camera.lookAt(this.panTarget.x, this.panTarget.y, 0)
		this._camera.updateProjectionMatrix()
	}

	public worldToScreen(worldX: number, worldY: number): [number, number] {
		const rect = this.canvas.getBoundingClientRect()
		const v = new THREE.Vector3(worldX, worldY, 0).project(this._camera)
		return [((v.x + 1) / 2) * rect.width, ((1 - v.y) / 2) * rect.height]
	}

	public screenToWorld(clientX: number, clientY: number): [number, number] {
		const rect = this.canvas.getBoundingClientRect()
		const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
		const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1)
		const aspect = this.canvas.clientWidth / this.canvas.clientHeight
		const l = this._fov / 2 / this._zoomFactor
		return [this.panTarget.x + ndcX * aspect * l, this.panTarget.y + ndcY * l]
	}

	private initOrbitControls(): void {
		const clamp = (v: number, lo: number, hi: number) =>
			Math.min(hi, Math.max(lo, v))

		this.canvas.addEventListener("pointerdown", (event) => {
			if (event.button !== 0) return
			this.isPanning = true
			this.lastPointerX = event.clientX
			this.lastPointerY = event.clientY
			this.canvas.setPointerCapture(event.pointerId)
		})
		this.canvas.addEventListener("pointermove", (event) => {
			if (!this.isPanning) return
			const dx = event.clientX - this.lastPointerX
			const dy = event.clientY - this.lastPointerY
			this.lastPointerX = event.clientX
			this.lastPointerY = event.clientY
			const l = this._fov / 2 / this._zoomFactor
			const aspect = this.canvas.clientWidth / this.canvas.clientHeight
			const worldPerPxX = (l * aspect * 2) / this.canvas.clientWidth
			const worldPerPxY = (l * 2) / this.canvas.clientHeight
			this.panTarget.x -= dx * worldPerPxX
			this.panTarget.y += dy * worldPerPxY
			this.adjustCamera()
		})
		const endDrag = () => {
			this.isPanning = false
		}
		this.canvas.addEventListener("pointerup", endDrag)
		this.canvas.addEventListener("pointercancel", endDrag)
		this.canvas.addEventListener(
			"wheel",
			(event) => {
				event.preventDefault()
				const rect = this.canvas.getBoundingClientRect()
				const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1
				const ndcY = -(((event.clientY - rect.top) / rect.height) * 2 - 1)
				const aspect = this.canvas.clientWidth / this.canvas.clientHeight

				const lBefore = this._fov / 2 / this._zoomFactor
				const factor = Math.exp(-event.deltaY * 0.0015)
				this._zoomFactor = clamp(
					this._zoomFactor * factor,
					MIN_ZOOM_FACTOR,
					MAX_ZOOM_FACTOR,
				)
				const lAfter = this._fov / 2 / this._zoomFactor
				const shrink = lBefore - lAfter

				this.panTarget.x += ndcX * aspect * shrink
				this.panTarget.y += ndcY * shrink
				this.adjustCamera()
			},
			{ passive: false },
		)
	}

	// --- render loop ------------------------------------------------------

	private tick = (): void => {
		if (this.disposed) return
		this.time += this._timeStepSize
		for (const points of [...Object.values(this.simplePoints), this.h2Points]) {
			;(points.material as THREE.ShaderMaterial).uniforms.uTime!.value =
				this.time
		}
		this.renderer.render(this._scene, this._camera)
		this.animationHandle = requestAnimationFrame(this.tick)
	}

	public resize(): void {
		this.renderer.setSize(
			this.canvas.clientWidth,
			this.canvas.clientHeight,
			false,
		)
		this.adjustCamera()
	}

	public dispose(): void {
		this.disposed = true
		cancelAnimationFrame(this.animationHandle)
		this.starFieldWorker.terminate()
		for (const points of [...Object.values(this.simplePoints), this.h2Points]) {
			points.geometry.dispose()
			;(points.material as THREE.Material).dispose()
		}
		for (const group of [this.densityWaveGroup, this.axisGroup]) {
			for (const child of group.children) {
				if (child instanceof THREE.Line) {
					child.geometry.dispose()
					;(child.material as THREE.Material).dispose()
				}
			}
		}
		this.renderer.dispose()
	}
}

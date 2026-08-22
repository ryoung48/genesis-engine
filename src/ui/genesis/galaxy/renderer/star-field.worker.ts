/// <reference lib="webworker" />

import { Galaxy } from "./Galaxy"
import { Helper } from "./Helper"
import { GalaxyParam, type Star } from "./Types"

declare const self: DedicatedWorkerGlobalScope

/** Plain-object mirror of GalaxyParam's fields -- sent across postMessage
 * instead of a class instance so there's no ambiguity about what survives
 * structured cloning (a class instance would arrive here as a plain object
 * anyway, losing its prototype -- this just makes that explicit). */
export interface StarFieldParam {
	rad: number
	radCore: number
	deltaAng: number
	ex1: number
	ex2: number
	numStars: number
	hasDarkMatter: boolean
	pertN: number
	pertAmp: number
	dustRenderSize: number
	baseTemp: number
}

export interface StarFieldRequest {
	requestId: number
	param: StarFieldParam
}

export interface TypedStarBuffer {
	theta0: Float32Array
	velTheta: Float32Array
	tiltAngle: Float32Array
	a: Float32Array
	b: Float32Array
	mag: Float32Array
	color: Float32Array
}

export interface StarFieldResult {
	requestId: number
	stars: TypedStarBuffer
	dust: TypedStarBuffer
	filaments: TypedStarBuffer
	h2: TypedStarBuffer & { isCore: Float32Array }
}

/** Extracts one Star.type subset into the same flat typed-array shape
 * GalaxyRendererThree.ts's buildSimpleGeometry used to build directly on
 * the main thread -- moved here so the per-star color computation (cheap
 * but O(n) over tens of thousands of stars) also happens off the main
 * thread, not just Galaxy.ts's own math. */
function packByType(stars: Star[], types: number[]): TypedStarBuffer {
	const rows = stars.filter((s) => types.includes(s.type))
	const n = rows.length
	const theta0 = new Float32Array(n)
	const velTheta = new Float32Array(n)
	const tiltAngle = new Float32Array(n)
	const a = new Float32Array(n)
	const b = new Float32Array(n)
	const mag = new Float32Array(n)
	const color = new Float32Array(n * 3)
	for (let i = 0; i < n; i++) {
		const s = rows[i]!
		theta0[i] = s.theta0
		velTheta[i] = s.velTheta
		tiltAngle[i] = s.tiltAngle
		a[i] = s.a
		b[i] = s.b
		mag[i] = s.mag
		const col = Helper.colorFromTemperature(s.temp)
		color[3 * i] = col.r
		color[3 * i + 1] = col.g
		color[3 * i + 2] = col.b
	}
	return { theta0, velTheta, tiltAngle, a, b, mag, color }
}

function packH2(stars: Star[]): TypedStarBuffer & { isCore: Float32Array } {
	const rows = stars.filter((s) => s.type === 3 || s.type === 4)
	const n = rows.length
	const theta0 = new Float32Array(n)
	const velTheta = new Float32Array(n)
	const tiltAngle = new Float32Array(n)
	const a = new Float32Array(n)
	const b = new Float32Array(n)
	const mag = new Float32Array(n)
	const isCore = new Float32Array(n)
	const color = new Float32Array(n * 3)
	for (let i = 0; i < n; i++) {
		const s = rows[i]!
		theta0[i] = s.theta0
		velTheta[i] = s.velTheta
		tiltAngle[i] = s.tiltAngle
		a[i] = s.a
		b[i] = s.b
		mag[i] = s.mag
		isCore[i] = s.type === 4 ? 1 : 0
		const col = Helper.colorFromTemperature(s.temp)
		color[3 * i] = col.r
		color[3 * i + 1] = col.g
		color[3 * i + 2] = col.b
	}
	return { theta0, velTheta, tiltAngle, a, b, mag, isCore, color }
}

function transferListFor(buf: TypedStarBuffer): Transferable[] {
	return [
		buf.theta0.buffer,
		buf.velTheta.buffer,
		buf.tiltAngle.buffer,
		buf.a.buffer,
		buf.b.buffer,
		buf.mag.buffer,
		buf.color.buffer,
	]
}

// One Galaxy instance reused across requests (its `reset()` fully
// overwrites shape fields and rebuilds `_stars` from scratch, so there's no
// stale state to worry about between presets/dark-matter toggles).
const galaxy = new Galaxy()

self.onmessage = (event: MessageEvent<StarFieldRequest>) => {
	const { requestId, param } = event.data
	const galaxyParam = new GalaxyParam(
		param.rad,
		param.radCore,
		param.deltaAng,
		param.ex1,
		param.ex2,
		param.numStars,
		param.hasDarkMatter,
		param.pertN,
		param.pertAmp,
		param.dustRenderSize,
		param.baseTemp,
	)
	galaxy.reset(galaxyParam, true)
	const stars = galaxy.stars

	const result: StarFieldResult = {
		requestId,
		stars: packByType(stars, [0]),
		dust: packByType(stars, [1]),
		filaments: packByType(stars, [2]),
		h2: packH2(stars),
	}
	self.postMessage(result, [
		...transferListFor(result.stars),
		...transferListFor(result.dust),
		...transferListFor(result.filaments),
		...transferListFor(result.h2),
		result.h2.isCore.buffer,
	])
}

import React, { useCallback, useEffect, useRef } from "react"
import type { FlowGrid } from "@/model/climate/wind"

const DEG2RAD = Math.PI / 180
const PARTICLE_HALF = 1

export interface FlowSample {
	u: number
	v: number
	speed: number
	scalar: number
}

interface FlowParticleCanvasProps {
	grid: FlowGrid | null
	projectToScreen: (
		xyz: [number, number, number],
		lonOffsetRad?: number,
	) => [number, number] | null
	getGlobeCameraDir: () => [number, number, number] | null
	visible: boolean
	viewMode: "globe" | "map"
	numParticles: number
	minLifetime: number
	maxLifetime: number
	speedScale: number
	trailAlpha: number
	calmSpeedThreshold: number
	calmAgeBoost: number
	getColor: (sample: FlowSample) => string
	randomPosition: (grid: FlowGrid | null) => { lat: number; lon: number }
}

function sampleGrid(grid: FlowGrid, lat: number, lon: number): FlowSample {
	const { width: W, height: H, u, v, speed, scalar } = grid
	const latIdx = Math.max(0, Math.min(H - 1, lat + 90))
	const lonNorm = (((lon + 180) % 360) + 360) % 360

	const l0 = Math.floor(latIdx)
	const l1 = Math.min(l0 + 1, H - 1)
	const c0 = Math.floor(lonNorm)
	const c1 = (c0 + 1) % W
	const tl = latIdx - l0
	const tc = lonNorm - c0

	const w00 = (1 - tl) * (1 - tc)
	const w01 = (1 - tl) * tc
	const w10 = tl * (1 - tc)
	const w11 = tl * tc

	const i00 = l0 * W + c0
	const i01 = l0 * W + c1
	const i10 = l1 * W + c0
	const i11 = l1 * W + c1

	return {
		u: u[i00] * w00 + u[i01] * w01 + u[i10] * w10 + u[i11] * w11,
		v: v[i00] * w00 + v[i01] * w01 + v[i10] * w10 + v[i11] * w11,
		speed:
			speed[i00] * w00 + speed[i01] * w01 + speed[i10] * w10 + speed[i11] * w11,
		scalar: scalar
			? scalar[i00] * w00 +
				scalar[i01] * w01 +
				scalar[i10] * w10 +
				scalar[i11] * w11
			: 0,
	}
}

export const FlowParticleCanvas: React.FC<FlowParticleCanvasProps> = ({
	grid,
	projectToScreen,
	getGlobeCameraDir,
	visible,
	viewMode,
	numParticles,
	minLifetime,
	maxLifetime,
	speedScale,
	trailAlpha,
	calmSpeedThreshold,
	calmAgeBoost,
	getColor,
	randomPosition,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const lats = useRef<Float32Array>(new Float32Array(0))
	const lons = useRef<Float32Array>(new Float32Array(0))
	const ages = useRef<Float32Array>(new Float32Array(0))
	const maxAges = useRef<Float32Array>(new Float32Array(0))

	const gridRef = useRef(grid)
	const visibleRef = useRef(visible)
	const projectRef = useRef(projectToScreen)
	const cameraDirRef = useRef(getGlobeCameraDir)
	const viewModeRef = useRef(viewMode)
	const getColorRef = useRef(getColor)
	const randomPositionRef = useRef(randomPosition)
	const needsClearRef = useRef(false)
	const sentinelAtLastClearRef = useRef<[number, number] | null>(null)

	useEffect(() => {
		gridRef.current = grid
	}, [grid])
	useEffect(() => {
		visibleRef.current = visible
	}, [visible])
	useEffect(() => {
		projectRef.current = projectToScreen
		needsClearRef.current = true
	}, [projectToScreen])
	useEffect(() => {
		cameraDirRef.current = getGlobeCameraDir
	}, [getGlobeCameraDir])
	useEffect(() => {
		viewModeRef.current = viewMode
	}, [viewMode])
	useEffect(() => {
		getColorRef.current = getColor
	}, [getColor])
	useEffect(() => {
		randomPositionRef.current = randomPosition
	}, [randomPosition])

	const respawnParticle = useCallback(
		(index: number) => {
			const activeGrid = gridRef.current
			const { lat, lon } = randomPositionRef.current(activeGrid)
			lats.current[index] = lat
			lons.current[index] = lon
			ages.current[index] = 0
			maxAges.current[index] =
				minLifetime + Math.random() * (maxLifetime - minLifetime)
		},
		[minLifetime, maxLifetime],
	)

	useEffect(() => {
		lats.current = new Float32Array(numParticles)
		lons.current = new Float32Array(numParticles)
		ages.current = new Float32Array(numParticles)
		maxAges.current = new Float32Array(numParticles)
		for (let i = 0; i < numParticles; i++) {
			respawnParticle(i)
			ages.current[i] = Math.random() * maxAges.current[i]
		}
	}, [numParticles, respawnParticle])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
		for (let i = 0; i < numParticles; i++) {
			ages.current[i] = maxAges.current[i]
		}
	}, [numParticles])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext("2d", { alpha: true })
		if (!ctx) return

		const syncSize = () => {
			const p = canvas.parentElement
			if (!p) return
			const w = p.clientWidth
			const h = p.clientHeight
			if (canvas.width !== w || canvas.height !== h) {
				canvas.width = w
				canvas.height = h
				ctx.clearRect(0, 0, w, h)
			}
		}
		const ro = new ResizeObserver(syncSize)
		if (canvas.parentElement) ro.observe(canvas.parentElement)
		syncSize()

		let rafId = 0
		const frame = () => {
			rafId = requestAnimationFrame(frame)

			const w = canvas.width
			const h = canvas.height
			if (w === 0 || h === 0) return

			// Detect pan/zoom by projecting a fixed sentinel point and checking
			// whether its screen position has drifted from when we last cleared.
			const sentinelPos =
				projectRef.current([1, 0, 0]) ??
				projectRef.current([0, 1, 0]) ??
				projectRef.current([0, 0, 1])
			const lastSentinel = sentinelAtLastClearRef.current
			const viewDrifted =
				sentinelPos !== null &&
				lastSentinel !== null &&
				(Math.abs(sentinelPos[0] - lastSentinel[0]) > 2 ||
					Math.abs(sentinelPos[1] - lastSentinel[1]) > 2)

			if (needsClearRef.current || viewDrifted) {
				needsClearRef.current = false
				sentinelAtLastClearRef.current = sentinelPos
				ctx.clearRect(0, 0, w, h)
			} else {
				if (sentinelAtLastClearRef.current === null && sentinelPos !== null) {
					sentinelAtLastClearRef.current = sentinelPos
				}
				ctx.globalCompositeOperation = "destination-out"
				ctx.fillStyle = `rgba(0,0,0,${trailAlpha})`
				ctx.fillRect(0, 0, w, h)
				ctx.globalCompositeOperation = "source-over"
			}

			if (!visibleRef.current || !gridRef.current) {
				if (!gridRef.current) {
					ctx.clearRect(0, 0, w, h)
				}
				return
			}

			const activeGrid = gridRef.current
			const latArr = lats.current
			const lonArr = lons.current
			const ageArr = ages.current
			const maxAgeArr = maxAges.current
			const project = projectRef.current

			for (let i = 0; i < numParticles; i++) {
				ageArr[i]++
				if (ageArr[i] >= maxAgeArr[i]) {
					respawnParticle(i)
					continue
				}

				const sample = sampleGrid(activeGrid, latArr[i]!, lonArr[i]!)
				if (sample.speed < calmSpeedThreshold) {
					ageArr[i] += calmAgeBoost
					continue
				}

				const cosLat = Math.cos(latArr[i]! * DEG2RAD)
				latArr[i]! += sample.v * speedScale
				lonArr[i]! += (sample.u * speedScale) / Math.max(0.06, Math.abs(cosLat))
				lonArr[i]! = ((lonArr[i]! + 540) % 360) - 180
				if (latArr[i]! > 87 || latArr[i]! < -87) {
					latArr[i] = Math.max(-87, Math.min(87, latArr[i]!))
					ageArr[i] = maxAgeArr[i]!
					continue
				}

				const latR = latArr[i]! * DEG2RAD
				const lonR = lonArr[i]! * DEG2RAD
				const cl = Math.cos(latR)
				const px = cl * Math.cos(lonR)
				const py = cl * Math.sin(lonR)
				const pz = Math.sin(latR)
				const xyz: [number, number, number] = [px, py, pz]

				const isMap = viewModeRef.current === "map"
				if (!isMap) {
					const camPos = cameraDirRef.current()
					if (
						camPos &&
						px * camPos[0] + py * camPos[1] + pz * camPos[2] < 1.05
					) {
						ageArr[i] = maxAgeArr[i]!
						continue
					}
				}

				const t = ageArr[i]! / maxAgeArr[i]!
				ctx.globalAlpha = Math.min(1, Math.min(t / 0.08, (1 - t) / 0.08)) * 0.85
				ctx.fillStyle = getColorRef.current(sample)

				const offsets = isMap ? [0, -2 * Math.PI, 2 * Math.PI] : [0]
				for (const offset of offsets) {
					const pos = project(xyz, offset || undefined)
					if (!pos) continue
					const [sx, sy] = pos
					if (sx < -50 || sx > w + 50 || sy < -50 || sy > h + 50) continue
					ctx.fillRect(
						Math.round(sx) - PARTICLE_HALF,
						Math.round(sy) - PARTICLE_HALF,
						PARTICLE_HALF * 2,
						PARTICLE_HALF * 2,
					)
				}
			}

			ctx.globalAlpha = 1
		}

		rafId = requestAnimationFrame(frame)
		return () => {
			cancelAnimationFrame(rafId)
			ro.disconnect()
			ctx.clearRect(0, 0, canvas.width, canvas.height)
		}
	}, [
		numParticles,
		speedScale,
		trailAlpha,
		calmSpeedThreshold,
		calmAgeBoost,
		respawnParticle,
	])

	return (
		<canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
	)
}

import React, { useCallback, useEffect, useRef } from "react"
import type { OceanCurrentGrid } from "@/model/climate/ocean-currents"
import { oceanCurrentColor } from "./colors"

const NUM_PARTICLES = 2500
const MIN_LIFETIME = 100
const MAX_LIFETIME = 260
const SPEED_SCALE = 0.025
const TRAIL_ALPHA = 0.035
const PARTICLE_HALF = 1
const DEG2RAD = Math.PI / 180
const MAX_SPAWN_RETRIES = 12

function sampleGrid(
	grid: OceanCurrentGrid,
	lat: number,
	lon: number,
): { u: number; v: number; warmth: number; isOcean: boolean } {
	const { width: W, height: H, u, v, warmth, isOcean } = grid
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

	const ocean =
		isOcean[i00] > 0 ||
		isOcean[i01] > 0 ||
		isOcean[i10] > 0 ||
		isOcean[i11] > 0

	return {
		u: u[i00] * w00 + u[i01] * w01 + u[i10] * w10 + u[i11] * w11,
		v: v[i00] * w00 + v[i01] * w01 + v[i10] * w10 + v[i11] * w11,
		warmth:
			warmth[i00] * w00 +
			warmth[i01] * w01 +
			warmth[i10] * w10 +
			warmth[i11] * w11,
		isOcean: ocean,
	}
}

function randomLat() {
	return (Math.asin(Math.random() * 2 - 1) / (Math.PI / 2)) * 85
}

function randomLon() {
	return Math.random() * 360 - 180
}

function spawnOcean(
	grid: OceanCurrentGrid,
	lats: Float32Array,
	lons: Float32Array,
	i: number,
) {
	for (let attempt = 0; attempt < MAX_SPAWN_RETRIES; attempt++) {
		const lat = randomLat()
		const lon = randomLon()
		const { isOcean } = sampleGrid(grid, lat, lon)
		if (isOcean) {
			lats[i] = lat
			lons[i] = lon
			return
		}
	}
	// Fallback: random position (will be culled next frame if on land)
	lats[i] = randomLat()
	lons[i] = randomLon()
}

interface OceanCurrentParticleCanvasProps {
	grid: OceanCurrentGrid | null
	projectToScreen: (
		xyz: [number, number, number],
		lonOffsetRad?: number,
	) => [number, number] | null
	getGlobeCameraDir: () => [number, number, number] | null
	visible: boolean
	viewMode: "globe" | "map"
}

export const OceanCurrentParticleCanvas: React.FC<
	OceanCurrentParticleCanvasProps
> = ({ grid, projectToScreen, getGlobeCameraDir, visible, viewMode }) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	const lats = useRef(new Float32Array(NUM_PARTICLES))
	const lons = useRef(new Float32Array(NUM_PARTICLES))
	const ages = useRef(new Float32Array(NUM_PARTICLES))
	const maxAges = useRef(new Float32Array(NUM_PARTICLES))

	const gridRef = useRef(grid)
	const visibleRef = useRef(visible)
	const projectRef = useRef(projectToScreen)
	const cameraDirRef = useRef(getGlobeCameraDir)
	const viewModeRef = useRef(viewMode)

	useEffect(() => { gridRef.current = grid }, [grid])
	useEffect(() => { visibleRef.current = visible }, [visible])
	useEffect(() => { projectRef.current = projectToScreen }, [projectToScreen])
	useEffect(() => { cameraDirRef.current = getGlobeCameraDir }, [getGlobeCameraDir])
	useEffect(() => { viewModeRef.current = viewMode }, [viewMode])

	const clearCanvas = () => {
		const canvas = canvasRef.current
		canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
		for (let i = 0; i < NUM_PARTICLES; i++) ages.current[i] = maxAges.current[i]
	}

	// Flush stale trails whenever the grid swaps (month/world change), the
	// overlay is hidden, or the projection mode switches (screen-space mismatch).
	useEffect(() => { if (!visible) clearCanvas() }, [visible]) // eslint-disable-line react-hooks/exhaustive-deps
	useEffect(clearCanvas, [grid, viewMode]) // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		for (let i = 0; i < NUM_PARTICLES; i++) {
			lats.current[i] = randomLat()
			lons.current[i] = randomLon()
			maxAges.current[i] =
				MIN_LIFETIME + Math.random() * (MAX_LIFETIME - MIN_LIFETIME)
			ages.current[i] = Math.random() * maxAges.current[i]
		}
	}, [])

	const colorLUT = useRef<string[]>([])
	const getColor = useCallback((warmth: number): string => {
		if (colorLUT.current.length === 0) {
			for (let i = 0; i <= 200; i++) {
				const w = i / 100 - 1 // -1..+1
				const [r, g, b] = oceanCurrentColor(w)
				colorLUT.current.push(
					`rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
				)
			}
		}
		const idx = Math.max(0, Math.min(200, Math.round((warmth + 1) * 100)))
		return colorLUT.current[idx]!
	}, [])


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

		const latArr = lats.current
		const lonArr = lons.current
		const ageArr = ages.current
		const maxAgeArr = maxAges.current

		let rafId = 0

		const frame = () => {
			rafId = requestAnimationFrame(frame)

			const w = canvas.width
			const h = canvas.height
			if (w === 0 || h === 0) return

			ctx.globalCompositeOperation = "destination-out"
			ctx.fillStyle = `rgba(0,0,0,${TRAIL_ALPHA})`
			ctx.fillRect(0, 0, w, h)
			ctx.globalCompositeOperation = "source-over"

			if (!visibleRef.current || !gridRef.current) return

			const g = gridRef.current
			const project = projectRef.current

			for (let i = 0; i < NUM_PARTICLES; i++) {
				ageArr[i]++
				if (ageArr[i] >= maxAgeArr[i]) {
					spawnOcean(g, latArr, lonArr, i)
					ageArr[i] = 0
					maxAgeArr[i] =
						MIN_LIFETIME + Math.random() * (MAX_LIFETIME - MIN_LIFETIME)
					continue
				}

				const { u, v, warmth, isOcean } = sampleGrid(g, latArr[i], lonArr[i])

				if (!isOcean) {
					ageArr[i] = maxAgeArr[i]
					continue
				}

				const cosLat = Math.cos(latArr[i] * DEG2RAD)
				latArr[i] += v * SPEED_SCALE
				lonArr[i] += (u * SPEED_SCALE) / Math.max(0.06, Math.abs(cosLat))
				lonArr[i] = ((lonArr[i] + 540) % 360) - 180
				if (latArr[i] > 87) { latArr[i] = 87; ageArr[i] = maxAgeArr[i] }
				if (latArr[i] < -87) { latArr[i] = -87; ageArr[i] = maxAgeArr[i] }

				const latR = latArr[i] * DEG2RAD
				const lonR = lonArr[i] * DEG2RAD
				const cl = Math.cos(latR)
				const px = cl * Math.cos(lonR)
				const py = cl * Math.sin(lonR)
				const pz = Math.sin(latR)
				const xyz: [number, number, number] = [px, py, pz]

				const isMap = viewModeRef.current === "map"

				if (!isMap) {
					const camPos = cameraDirRef.current()
					if (camPos) {
						if (px * camPos[0] + py * camPos[1] + pz * camPos[2] < 1.05) {
							ageArr[i] = maxAgeArr[i]
							continue
						}
					}
				}

				const t = ageArr[i] / maxAgeArr[i]
				const alpha = Math.min(1, Math.min(t / 0.08, (1 - t) / 0.08))
				ctx.globalAlpha = alpha * 0.9
				ctx.fillStyle = getColor(warmth)

				const offsets = isMap ? [0, -2 * Math.PI, 2 * Math.PI] : [0]
				for (const offset of offsets) {
					const pos = project(xyz, offset || undefined)
					if (!pos) continue
					const sx = pos[0]
					const sy = pos[1]
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
	}, [getColor])

	return (
		<canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
	)
}

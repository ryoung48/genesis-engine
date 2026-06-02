import React, { useCallback, useEffect, useRef } from "react"
import type { WindGrid } from "@/model/climate/wind"
import { windSpeedColor } from "./colors"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NUM_PARTICLES = 3000
const MIN_LIFETIME = 80 // frames
const MAX_LIFETIME = 220
const SPEED_SCALE = 0.04 // degrees per frame per m/s
const TRAIL_ALPHA = 0.05 // fraction of trail erased per frame
const PARTICLE_HALF = 1 // half-size of particle square in CSS pixels
const DEG2RAD = Math.PI / 180

// ---------------------------------------------------------------------------
// Grid sampling (bilinear interpolation)
// ---------------------------------------------------------------------------

function sampleGrid(
	grid: WindGrid,
	lat: number,
	lon: number,
): { u: number; v: number; speed: number } {
	const { width: W, height: H, u, v, speed } = grid
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
	}
}

// ---------------------------------------------------------------------------
// Particle initialisation helpers
// ---------------------------------------------------------------------------

function randomLat() {
	// Weight toward lower latitudes (more area near equator on sphere)
	return (Math.asin(Math.random() * 2 - 1) / (Math.PI / 2)) * 85
}

function randomLon() {
	return Math.random() * 360 - 180
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WindParticleCanvasProps {
	windGrid: WindGrid | null
	projectToScreen: (
		xyz: [number, number, number],
		lonOffsetRad?: number,
	) => [number, number] | null
	getGlobeCameraDir: () => [number, number, number] | null
	visible: boolean
	viewMode: "globe" | "map"
}

export const WindParticleCanvas: React.FC<WindParticleCanvasProps> = ({
	windGrid,
	projectToScreen,
	getGlobeCameraDir,
	visible,
	viewMode,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	// Particle state — flat arrays, never triggers re-renders
	const lats = useRef(new Float32Array(NUM_PARTICLES))
	const lons = useRef(new Float32Array(NUM_PARTICLES))
	const ages = useRef(new Float32Array(NUM_PARTICLES))
	const maxAges = useRef(new Float32Array(NUM_PARTICLES))

	// Prop mirrors as refs so animation loop doesn't need restarts
	const gridRef = useRef(windGrid)
	const visibleRef = useRef(visible)
	const projectRef = useRef(projectToScreen)
	const cameraDirRef = useRef(getGlobeCameraDir)
	const viewModeRef = useRef(viewMode)

	useEffect(() => {
		gridRef.current = windGrid
	}, [windGrid])
	useEffect(() => {
		visibleRef.current = visible
	}, [visible])
	useEffect(() => {
		projectRef.current = projectToScreen
	}, [projectToScreen])
	useEffect(() => {
		cameraDirRef.current = getGlobeCameraDir
	}, [getGlobeCameraDir])
	useEffect(() => {
		viewModeRef.current = viewMode
	}, [viewMode])

	// Initialise particles staggered so trails don't all appear at once
	useEffect(() => {
		for (let i = 0; i < NUM_PARTICLES; i++) {
			lats.current[i] = randomLat()
			lons.current[i] = randomLon()
			maxAges.current[i] =
				MIN_LIFETIME + Math.random() * (MAX_LIFETIME - MIN_LIFETIME)
			ages.current[i] = Math.random() * maxAges.current[i]
		}
	}, [])

	// Precomputed colour LUT: speed 0–30 m/s in 0.5 m/s steps → CSS colour string
	const colorLUT = useRef<string[]>([])
	const getColor = useCallback((spd: number): string => {
		if (colorLUT.current.length === 0) {
			for (let i = 0; i <= 60; i++) {
				const [r, g, b] = windSpeedColor(i * 0.5)
				colorLUT.current.push(
					`rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`,
				)
			}
		}
		const idx = Math.max(0, Math.min(60, Math.round(spd * 2)))
		return colorLUT.current[idx]!
	}, [])

	// Clear canvas when the wind grid is replaced (new world / month)
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
		// Re-stagger particles so they don't all burst from the same positions
		for (let i = 0; i < NUM_PARTICLES; i++) {
			ages.current[i] = maxAges.current[i] // force respawn next frame
		}
	}, [])

	// Main animation loop — mounts once, reads everything from refs
	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext("2d", { alpha: true })
		if (!ctx) return

		// Keep canvas CSS-pixel-sized to match projectToScreen coordinates
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

			// Fade existing trails toward transparent
			ctx.globalCompositeOperation = "destination-out"
			ctx.fillStyle = `rgba(0,0,0,${TRAIL_ALPHA})`
			ctx.fillRect(0, 0, w, h)
			ctx.globalCompositeOperation = "source-over"

			if (!visibleRef.current || !gridRef.current) return

			const grid = gridRef.current
			const project = projectRef.current

			for (let i = 0; i < NUM_PARTICLES; i++) {
				ageArr[i]++
				if (ageArr[i] >= maxAgeArr[i]) {
					latArr[i] = randomLat()
					lonArr[i] = randomLon()
					ageArr[i] = 0
					maxAgeArr[i] =
						MIN_LIFETIME + Math.random() * (MAX_LIFETIME - MIN_LIFETIME)
					continue
				}

				const { u, v, speed } = sampleGrid(grid, latArr[i], lonArr[i])

				// Age fast in calm zones (doldrums) so particles respawn to windier areas
				if (speed < 0.5) {
					ageArr[i] += 3
					continue
				}

				// Move particle
				const cosLat = Math.cos(latArr[i] * DEG2RAD)
				latArr[i] += v * SPEED_SCALE
				lonArr[i] += (u * SPEED_SCALE) / Math.max(0.06, Math.abs(cosLat))
				lonArr[i] = ((lonArr[i] + 540) % 360) - 180
				if (latArr[i] > 87) {
					latArr[i] = 87
					ageArr[i] = maxAgeArr[i]
				}
				if (latArr[i] < -87) {
					latArr[i] = -87
					ageArr[i] = maxAgeArr[i]
				}

				// Project to screen via scene — handles globe camera, map pan/tilt/zoom
				const latR = latArr[i] * DEG2RAD
				const lonR = lonArr[i] * DEG2RAD
				const cl = Math.cos(latR)
				const px = cl * Math.cos(lonR)
				const py = cl * Math.sin(lonR)
				const pz = Math.sin(latR)
				const xyz: [number, number, number] = [px, py, pz]

				const isMap = viewModeRef.current === "map"

				// Globe mode: cull particles behind the visible hemisphere.
				if (!isMap) {
					const camPos = cameraDirRef.current()
					if (camPos) {
						if (px * camPos[0] + py * camPos[1] + pz * camPos[2] < 1.05) {
							ageArr[i] = maxAgeArr[i] // kill immediately — no lingering trail
							continue
						}
					}
				}

				// Opacity: ease in during first 8% of life, ease out during last 8%
				const t = ageArr[i] / maxAgeArr[i]
				const alpha = Math.min(1, Math.min(t / 0.08, (1 - t) / 0.08))
				ctx.globalAlpha = alpha * 0.85
				ctx.fillStyle = getColor(speed)

				// In map mode draw at the base position and at ±2π lon copies so
				// particles are continuous across the antimeridian seam.
				const offsets = isMap ? [0, -2 * Math.PI, 2 * Math.PI] : [0]
				let drawn = false
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
					drawn = true
				}
				if (!drawn && !isMap) {
					// Globe: particle projected off-screen — nothing to do
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
	}, [getColor]) // loop mounts once; everything else read from refs

	return (
		<canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />
	)
}

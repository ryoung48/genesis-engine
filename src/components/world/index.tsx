"use client"

import { GeoProjection, geoDistance } from "d3"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { HISTORY } from "@/model/history"
import { PROVINCE } from "@/model/provinces"
import { SHAPER_DISPLAY } from "@/model/shapers/display"
import { START_DATE } from "@/model/utilities/time"
import { Vertex } from "@/model/utilities/voronoi/types"
import { ACTION } from "./actions"

import { ChartPanel } from "./charts"
import { DRAW_LANDMARKS } from "./coast"
import { DRAW_BORDERS } from "./coloration"
import { MapControls } from "./controls"
import { DRAW_EMBELLISHMENTS } from "./embellishments"
import { ScaleOverlay, ScaleOverlayHandle } from "./embellishments/ScaleOverlay"
import { DRAW_HIERARCHY } from "./hierarchy"
import { DRAW_TERRAIN } from "./icons/terrain"
import { MAP_SHAPES } from "./shapes"
import { StatsCard } from "./stats"
import { CachedImages, MapMode, WorldPaintParams } from "./types"

const loadImage = (path: string): Promise<HTMLImageElement> => {
	return new Promise((resolve) => {
		const img = new Image()
		img.onload = () => resolve(img)
		img.onerror = () => resolve(img)
		img.src = path
	})
}

const loadImages = async () =>
	(
		await Promise.all([
			...Object.entries(DRAW_TERRAIN.definitions).map(async ([k, v]) => ({
				img: await loadImage(`${window.location.href}assets/` + v.path),
				index: k,
			})),
		])
	).reduce((dict: Record<string, HTMLImageElement>, { index, img }) => {
		dict[index] = img
		return dict
	}, {})

const visibleProvinces = (
	center: [number, number],
	maxRadius: number,
	scale: number,
) => {
	const threshold = Math.min(
		Math.PI / 2,
		Math.asin(Math.min(1, maxRadius / (scale * MAP_SHAPES.scale.init))),
	)

	const visible = new Set(
		center
			? window.world.provinces
				.filter((p) => {
					const cell = window.world.cells[p.cell]
					return geoDistance(center, [cell.x, cell.y]) < threshold
				})
				.map((p) => p.idx)
			: window.world.provinces.map((p) => p.idx),
	)

	return visible
}

const paint = ({
	ctx,
	projection,
	mapMode,
	hoveredProvince,
	visible,
	selectedNation,
	scale,
	cachedImages,
	time,
	highlightedProvince,
	measureState,
	cursorGeo,
	showTEQ,
}: WorldPaintParams & {
	measureState?: {
		start: [number, number] | null
		end: [number, number] | null
	}
	cursorGeo?: [number, number] | null
	showTEQ?: boolean
}) => {
	ctx.fillStyle = "white"
	ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
	DRAW_LANDMARKS.oceans({ ctx, projection, mapMode, visible })
	DRAW_BORDERS.provinces({
		ctx,
		projection,
		mapMode,
		hoveredProvince,
		visible,
		time,
	})
	DRAW_LANDMARKS.lakes({ ctx, projection, mapMode, visible })
	// DRAW_TERRAIN.icons({ ctx, projection, cachedImages, visible })
	DRAW_EMBELLISHMENTS.graticule({ ctx, projection, mapMode, visible })

	// Draw thermal equator line overlay
	if (showTEQ && (mapMode === "temperature" || mapMode === "rainfall")) {
		const month = time !== undefined ? new Date(time).getMonth() : 0
		DRAW_EMBELLISHMENTS.thermalEquator({ ctx, projection, mapMode, visible, month })
	}
	if (
		(mapMode === "nations" ||
			mapMode === "optimalWealth" ||
			mapMode === "population") &&
		visible.has(selectedNation)
	) {
		DRAW_HIERARCHY.nation({
			ctx,
			projection,
			mapMode,
			cachedImages,
			hoveredProvince,
			visible,
			selectedNation,
			scale,
			time,
		})
	}

	// Draw measurement
	if (measureState?.start) {
		const end = measureState.end || cursorGeo
		if (end) {
			DRAW_EMBELLISHMENTS.measure({
				ctx,
				projection,
				mapMode,
				visible,
				p1: measureState.start,
				p2: end,
				units: "metric",
			})
		}
	}

	// Draw highlight effect for zoomed-to province
	if (highlightedProvince !== null && highlightedProvince !== undefined) {
		const province = window.world.provinces[highlightedProvince]
		if (province) {
			const scaleVal = MAP_SHAPES.scale.derived(projection)
			const linear = MAP_SHAPES.path.linear(projection)

			// Get province border path using SHAPER_DISPLAY
			const borders = SHAPER_DISPLAY.borders.provinces([province])

			ctx.save()
			ctx.strokeStyle = "white"
			ctx.lineWidth = scaleVal * 1
			ctx.shadowColor = "white"
			ctx.shadowBlur = 15

			borders.forEach((border: Vertex[]) => {
				const p = MAP_SHAPES.polygon({
					points: border,
					path: linear,
					direction: "inner",
				})
				ctx.stroke(p)
			})
			ctx.restore()
		}
	}
}

const WorldMap: React.FC = () => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const containerRef = useRef<HTMLDivElement>(null)
	const [cachedImages, setCachedImages] = useState<CachedImages>({})
	const [cursor, setCursor] = useState({ x: 0, y: 0 })
	const [mapMode, setMapMode] = useState<MapMode>("nations")
	const [showTEQ, setShowTEQ] = useState(false)

	const projectionRef = useRef<GeoProjection>(null)
	const scaleOverlayRef = useRef<ScaleOverlayHandle>(null)

	// Selected nation for detail view (clicked province's nation)
	const [selectedNation, setSelectedNation] = useState<number | null>(null)

	// Selected war for detail view (clicked from history)
	const [selectedWar, setSelectedWar] = useState<number | null>(null)

	// Selected time for historical view (undefined = live)
	const [selectedTime, setSelectedTime] = useState<number | undefined>(
		undefined,
	)

	// Animation state - must be before runPaint since timeToRender depends on currentTime
	const [isPlaying, setIsPlaying] = useState(false)
	const [currentTime, setCurrentTime] = useState<number>(START_DATE)

	// If selectedTime is undefined, use currentTime (live mode)
	const timeToRender = selectedTime ?? currentTime

	// Province to highlight with blink effect after zoom
	const [highlightedProvince, setHighlightedProvince] = useState<number | null>(
		null,
	)

	// Measurement state
	const [isMeasuring, setIsMeasuring] = useState(false)
	const [measureState, setMeasureState] = useState<{
		start: [number, number] | null
		end: [number, number] | null
	}>({ start: null, end: null })

	// Reset measurement when toggling mode off
	useEffect(() => {
		if (!isMeasuring) {
			setMeasureState({ start: null, end: null })
		}
	}, [isMeasuring])

	// Handle Esc to cancel
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (measureState.start) {
					setMeasureState({ start: null, end: null })
				} else {
					setIsMeasuring(false)
				}
			}
		}
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [measureState.start])

	// Wrapper to clear cache when navigating to a historical time
	const handleTimeSelect = useCallback((time: number | undefined) => {
		DRAW_BORDERS.clearNationCache()
		setSelectedTime(time)
	}, [])

	// Wrapper to clear cache when toggling play state
	const handleSetIsPlaying = useCallback((playing: boolean) => {
		DRAW_BORDERS.clearNationCache()
		setIsPlaying(playing)
	}, [])

	// Animate zoom to a province location
	const handleZoomToProvince = useCallback((provinceIdx: number) => {
		const canvas = canvasRef.current
		const projection = projectionRef.current
		if (!canvas || !projection) return

		const province = window.world.provinces[provinceIdx]
		if (!province) return

		const cell = window.world.cells[province.cell]
		if (!cell) return

		ACTION.moveTo({
			node: canvas,
			projection,
			scale: 8,
			x: cell.x,
			y: cell.y,
			onComplete: () => {
				runPaintRef.current() // Repaint after jump
				// Two-pulse blink effect
				let pulseCount = 0
				const doPulse = () => {
					setHighlightedProvince(provinceIdx)
					setTimeout(() => {
						setHighlightedProvince(null)
						runPaintRef.current()
						pulseCount++
						if (pulseCount < 2) {
							setTimeout(doPulse, 100) // Gap between pulses
						}
					}, 150) // Pulse duration
				}
				setTimeout(doPulse, 200) // Small delay after zoom
			},
		})
	}, [])

	const runPaint = useCallback(() => {
		if (!Object.keys(cachedImages).length) return
		const canvas = canvasRef.current
		const ctx = canvas.getContext("2d")
		if (!projectionRef.current)
			projectionRef.current = MAP_SHAPES.projection.build(ctx)
		const projection = projectionRef.current

		const cellIdx = window.world.diagram.find(cursor.x, cursor.y)
		const cell = window.world.cells[cellIdx]
		const hoveredProvince = cell?.province

		const center = projection.invert?.([
			ctx.canvas.width / 2,
			ctx.canvas.height / 2,
		])
		const scale = MAP_SHAPES.scale.derived(projection)
		const maxRadius = Math.hypot(ctx.canvas.width, ctx.canvas.height)
		const visible = visibleProvinces(center, maxRadius / 2, scale)

		// Update scale overlay
		scaleOverlayRef.current?.update(projection)

		paint({
			ctx,
			projection,
			mapMode,
			cachedImages,
			hoveredProvince,
			visible,
			selectedNation,
			scale,
			time: timeToRender,
			highlightedProvince,
			measureState,
			cursorGeo: [cursor.x, cursor.y],
			showTEQ,
		})
	}, [
		mapMode,
		cachedImages,
		cursor,
		selectedNation,
		timeToRender,
		highlightedProvince,
		measureState,
		showTEQ,
	])

	// Ref to store latest runPaint for animation loop (avoids dependency issues)
	const runPaintRef = useRef(runPaint)
	useEffect(() => {
		runPaintRef.current = runPaint
	}, [runPaint])

	useEffect(() => {
		const node = canvasRef.current
		const container = containerRef.current
		const ctx = node.getContext("2d")

		// Set canvas dimensions to match its container
		const resizeCanvas = () => {
			const { width, height } = container.getBoundingClientRect()
			node.width = width
			node.height = height
			runPaintRef.current()
		}

		// Initial setup
		resizeCanvas()
		window.addEventListener("resize", resizeCanvas)

		const init = async () => {
			// images
			const loadedImages = await loadImages()
			setCachedImages(loadedImages)
			projectionRef.current = MAP_SHAPES.projection.build(ctx)
			const projection = projectionRef.current
			ACTION.zoom({
				node,
				projection,
				onMove: () => runPaintRef.current(),
			})
			ACTION.mouseover({
				projection,
				node,
				onMove: (params) => setCursor(params),
			})
			ACTION.moveTo({ node, projection, scale: 2, x: 0, y: 0 })
		}
		init()

		// Cleanup function
		return () => {
			window.removeEventListener("resize", resizeCanvas)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []) // Run only once on mount - zoom/pan handlers maintain their own state

	useEffect(() => {
		runPaint()
	}, [runPaint])

	const animationFrameRef = useRef<number | null>(null)
	const lastTickTimeRef = useRef<number>(0)

	// Tab state for chart panel
	const [chartTab, setChartTab] = useState<
		"simulation" | "nation" | "province" | "war"
	>("simulation")

	// Selected province for province detail view
	const [selectedProvinceIdx, setSelectedProvinceIdx] = useState<number | null>(
		null,
	)

	// Animation loop for history simulation
	useEffect(() => {
		if (!isPlaying) {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
			return
		}

		const animate = (timestamp: number) => {
			if (!lastTickTimeRef.current) lastTickTimeRef.current = timestamp

			const elapsed = timestamp - lastTickTimeRef.current

			// Tick once every 100ms (10 ticks per second)
			if (elapsed >= 100) {
				lastTickTimeRef.current = timestamp

				// Process 3000 events per tick
				const newTime = HISTORY.tick(10)

				// Clear nation border cache so borders update
				DRAW_BORDERS.clearNationCache()

				// Display the world time after processing events
				setCurrentTime(newTime)
				runPaintRef.current() // Repaint the map after tick (use ref to avoid stale closure)
			}

			animationFrameRef.current = requestAnimationFrame(animate)
		}

		animationFrameRef.current = requestAnimationFrame(animate)

		return () => {
			if (animationFrameRef.current) {
				cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
		}
	}, [isPlaying]) // Removed runPaint from deps - using ref instead

	const cell = window.world.cells[window.world.diagram.find(cursor.x, cursor.y)]
	const province = window.world.provinces[cell.province]

	return (
		<div ref={containerRef} className="w-full h-full relative">
			<canvas
				ref={canvasRef}
				className="w-full h-full"
				onClick={() => {
					if (isMeasuring) {
						const geo: [number, number] = [cursor.x, cursor.y]
						if (geo) {
							if (!measureState.start) {
								setMeasureState({ start: geo, end: null })
							} else if (!measureState.end) {
								setMeasureState({ ...measureState, end: geo })
							} else {
								// Restart
								setMeasureState({ start: geo, end: null })
							}
						}
						return
					}

					const clickedProvince = province
					if (!clickedProvince) return

					// If on nation tab, clicking opens nation tab for that province's nation
					// Otherwise, clicking opens province tab for that province
					if (chartTab === "nation") {
						const nation = PROVINCE.nation(clickedProvince, timeToRender)
						if (nation && nation.idx !== -1 && !nation.desolate) {
							setSelectedNation(nation.idx)
							// Stay on nation tab
						}
					} else {
						// Open province tab for the clicked province
						setSelectedProvinceIdx(clickedProvince.idx)
						setChartTab("province")
					}
				}}
			></canvas>

			{/* Simulation Controls & Chart - Upper Right */}
			<div className="absolute top-4 right-4 bg-white p-4 border border-slate-200 text-black min-w-[600px] max-w-[150px] shadow-sm">
				{/* Chart Panel */}
				<ChartPanel
					chartTab={chartTab}
					setChartTab={setChartTab}
					selectedNation={selectedNation}
					selectedProvince={selectedProvinceIdx}
					selectedWar={selectedWar}
					setSelectedWar={setSelectedWar}
					currentTime={currentTime}
					renderTime={timeToRender}
					onTimeSelect={handleTimeSelect}
					onZoomToProvince={handleZoomToProvince}
					onNationSelect={(nationIdx) => {
						setSelectedNation(nationIdx)
					}}
				/>
			</div>

			<StatsCard province={province} cursor={cursor} time={timeToRender} />

			<MapControls
				isPlaying={isPlaying}
				setIsPlaying={handleSetIsPlaying}
				selectedTime={selectedTime}
				setSelectedTime={handleTimeSelect}
				currentTime={currentTime}
				mapMode={mapMode}
				setMapMode={setMapMode}
				mapId={window.world?.id}
				isMeasuring={isMeasuring}
				setIsMeasuring={setIsMeasuring}
				showTEQ={showTEQ}
				setShowTEQ={setShowTEQ}
			/>
			<ScaleOverlay ref={scaleOverlayRef} />
		</div>
	)
}

export default WorldMap

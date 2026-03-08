import { WORLD } from "@/model"
import { CoastSegment } from "@/model/shapers/display/types"
import { DRAW_BORDERS } from "../coloration"
import { MAP_SHAPES } from "../shapes"
import { DrawMapParams } from "../shapes/types"

const styles = {
	lakes: { color: MAP_SHAPES.color.water.fresh, waves: "41, 84, 94" },
	oceans: { color: MAP_SHAPES.color.water.salt, waves: "88, 103, 117" },
	waves: [
		{
			strokeWidth: 0.5,
			opacity: 1,
		},
		{
			strokeWidth: 2.5,
			opacity: 0.25,
		},
		{
			strokeWidth: 5,
			opacity: 0.2,
		},
		{
			strokeWidth: 8,
			opacity: 0.1,
		},
	],
}

function drawWaves(params: {
	ctx: CanvasRenderingContext2D
	segments: CoastSegment[]
	scale: number
	linear: (object: d3.GeoPermissibleObjects) => string
	curvePath: (object: d3.GeoPermissibleObjects) => string
	waterStyle: { color: string; waves: string }
	fill: boolean
}) {
	const { ctx, segments, scale, linear, curvePath, waterStyle, fill } = params
	const mod = scale
	const cache: Record<number, Path2D> = {}

	if (fill) {
		// Fill water bodies first
		segments.forEach((seg) => {
			cache[seg.idx] = MAP_SHAPES.polygon({
				points: seg.path,
				path: curvePath,
				direction: "inner",
			})
			ctx.save()
			ctx.fillStyle = waterStyle.color
			ctx.clip(cache[seg.idx])
			ctx.fill(cache[seg.idx])
			ctx.restore()
		})
	}

	// Draw wave rings
	const waveList = fill
		? styles.waves // inner waves (lakes) — thin, drawn inside clip
		: styles.waves.slice().reverse() // outer waves (land coasts) — thick, drawn outside

	waveList.forEach(({ strokeWidth, opacity }, i) => {
		if (!fill) {
			// Land coastline waves: outer glow
			const end = i === styles.waves.length - 1
			const color = end ? waterStyle.waves : `255, 255, 255`
			ctx.strokeStyle = `rgba(${color},${opacity})`
			ctx.lineWidth = strokeWidth * mod * (end ? 1 : 4)
			segments.forEach((seg) => {
				if (end) {
					cache[seg.idx] = MAP_SHAPES.polygon({
						points: seg.path,
						path: linear,
						direction: "inner",
					})
				} else if (!cache[seg.idx]) {
					cache[seg.idx] = MAP_SHAPES.polygon({
						points: seg.path,
						path: curvePath,
						direction: "inner",
					})
				}
				ctx.stroke(cache[seg.idx])
			})
		} else {
			// Water body waves: drawn inside clip
			ctx.lineWidth = strokeWidth * mod
			segments.forEach((seg) => {
				ctx.save()
				ctx.strokeStyle = `rgba(${waterStyle.waves},${opacity})`
				if (!cache[seg.idx]) {
					cache[seg.idx] = MAP_SHAPES.polygon({
						points: seg.path,
						path: curvePath,
						direction: "inner",
					})
				}
				ctx.clip(cache[seg.idx])
				ctx.stroke(cache[seg.idx])
				ctx.restore()
			})
		}
	})
}

function visibleLandmarks(visible: Set<number>, type: "islands" | "lakes") {
	const provinceKey = type === "islands" ? "islands" : "lakes"
	const viz = new Set(
		Array.from(visible)
			.map((i) =>
				Object.keys(window.world.provinces[i][provinceKey]).map((k) =>
					parseInt(k),
				),
			)
			.flat(),
	)
	return viz
}

let cachedWorldId: string | null = null
let cachedMaxDepth = 0
let cachedBgIsWater = true

function ensureLandmarkCache() {
	if (cachedWorldId === window.world.id) return
	cachedWorldId = window.world.id
	const landmarks = window.world.landmarks
	cachedMaxDepth = Math.max(
		...Object.values(landmarks).map((l) => l.depth ?? 0),
		0,
	)
	cachedBgIsWater = Object.values(landmarks).some(
		(l) => (l.depth ?? 0) === 0 && l.water,
	)
}

export const DRAW_LANDMARKS = {
	render: (params: DrawMapParams) => {
		const { ctx, projection, visible } = params
		const landmarks = window.world.landmarks
		const scale = MAP_SHAPES.scale.derived(projection)
		const curvePath = MAP_SHAPES.path.curveClosed(projection)
		const linear = MAP_SHAPES.path.linear(projection)

		ensureLandmarkCache()
		const maxDepth = cachedMaxDepth
		const bgIsWater = cachedBgIsWater

		// Fill background sphere
		ctx.save()
		if (bgIsWater) {
			ctx.fillStyle = styles.oceans.color
		} else {
			ctx.fillStyle = "#c1c1c1" // land gray
		}
		ctx.beginPath()
		ctx.fill(new Path2D(MAP_SHAPES.path.curveClosed(projection)({ type: "Sphere" })))
		ctx.restore()

		// If background is land, fill depth-0 provinces immediately
		if (!bgIsWater) {
			const depth0Land = new Set(
				Object.keys(landmarks)
					.filter(
						(k) =>
							!landmarks[parseInt(k)].water &&
							(landmarks[parseInt(k)].depth ?? 0) === 0,
					)
					.map((k) => parseInt(k)),
			)
			if (depth0Land.size > 0) {
				DRAW_BORDERS.fillProvinces(params, depth0Land)
			}
		}

		// Collect visible landmark indices
		const vizIslands = visibleLandmarks(visible, "islands")
		const vizLakes = visibleLandmarks(visible, "lakes")

		const { islands, lakes } = window.world.display

		// Helper: draw coast waves clipped inside a water polygon
		const drawClippedWaves = (
			waterClip: Path2D,
			coastEdge: Path2D,
			waveStyle: { color: string; waves: string },
		) => {
			// Hard coastline edge
			ctx.save()
			ctx.clip(waterClip)
			ctx.strokeStyle = `rgba(${waveStyle.waves}, 0.6)`
			ctx.lineWidth = scale * 3
			ctx.lineCap = "round"
			ctx.lineJoin = "round"
			ctx.stroke(coastEdge)
			ctx.restore()

			// Wave rings (white, final ring in water color)
			const waveList = styles.waves.slice().reverse()
			waveList.forEach(({ strokeWidth, opacity }, i) => {
				const end = i === waveList.length - 1
				const color = end ? waveStyle.waves : `255, 255, 255`
				ctx.save()
				ctx.clip(waterClip)
				ctx.strokeStyle = `rgba(${color}, ${opacity})`
				ctx.lineWidth = strokeWidth * scale * (end ? 1 : 4)
				ctx.lineCap = "round"
				ctx.stroke(coastEdge)
				ctx.restore()
			})
		}

		// Render each depth layer
		// Order: 1) water fill, 2) water waves (clipped to water), 3) land waves (clipped to water), 4) land fill
		for (let d = 1; d <= maxDepth; d++) {
			const landAtDepth = Object.values(islands).filter(
				(seg) => seg.depth === d && vizIslands.has(seg.idx),
			)
			const waterAtDepth = Object.values(lakes).filter(
				(seg) =>
					seg.depth === d &&
					(vizLakes.has(seg.idx) ||
						landmarks[seg.idx]?.type === "ocean" ||
						landmarks[seg.idx]?.type === "sea"),
			)

			// 1) Fill water bodies (ocean and non-ocean separately)
			if (waterAtDepth.length > 0) {
				const oceanSegs = waterAtDepth.filter((seg) => landmarks[seg.idx]?.type === "ocean")
				const freshSegs = waterAtDepth.filter((seg) => landmarks[seg.idx]?.type !== "ocean")
				if (oceanSegs.length > 0) {
					drawWaves({ ctx, segments: oceanSegs, scale, linear, curvePath, waterStyle: styles.oceans, fill: true })
				}
				if (freshSegs.length > 0) {
					drawWaves({ ctx, segments: freshSegs, scale, linear, curvePath, waterStyle: styles.lakes, fill: true })
				}
			}

			// 2) Ocean/sea coast waves (clipped inside water body)
			waterAtDepth
				.filter((seg) => landmarks[seg.idx]?.type === "ocean")
				.forEach((seg) => {
					const clip = MAP_SHAPES.polygon({ points: seg.path, path: curvePath, direction: "inner" })
					const edge = MAP_SHAPES.polygon({ points: seg.path, path: linear, direction: "inner" })
					drawClippedWaves(clip, edge, styles.oceans)
				})

			// 3) Land feature waves
			if (landAtDepth.length > 0) {
				const withParent: CoastSegment[] = []
				const withoutParent: CoastSegment[] = []

				landAtDepth.forEach((seg) => {
					const parent = landmarks[seg.idx]?.parent
					const parentSeg = parent !== undefined ? lakes[parent] : undefined
					if (parentSeg) withParent.push(seg)
					else withoutParent.push(seg)
				})

				// Islands with a parent water segment: clip waves to water only
				withParent.forEach((seg) => {
					const parent = landmarks[seg.idx]?.parent
					const parentSeg = lakes[parent!]

					const parentClip = MAP_SHAPES.polygon({ points: parentSeg.path, path: curvePath, direction: "inner" })
					const islandClip = MAP_SHAPES.polygon({ points: seg.path, path: curvePath, direction: "inner" })
					const edge = MAP_SHAPES.polygon({ points: seg.path, path: linear, direction: "inner" })
					const segStyle = landmarks[parentSeg.idx]?.type === "ocean"
						? styles.oceans : styles.lakes

					const waterOnly = new Path2D()
					waterOnly.addPath(parentClip)
					waterOnly.addPath(islandClip)
					drawClippedWaves(waterOnly, edge, segStyle)
				})

				// Islands over the background (no parent in display): fill + outward waves
				if (withoutParent.length > 0) {
					const parentWaterStyle = bgIsWater ? styles.oceans : styles.lakes
					ctx.save()
					ctx.lineCap = "round"
					ctx.fillStyle = "#c1c1c1"
					// Fill island polygons with land grey
					withoutParent.forEach((seg) => {
						const p = MAP_SHAPES.polygon({
							points: seg.path,
							path: curvePath,
							direction: "inner",
						})
						ctx.fill(p)
					})
					drawWaves({
						ctx,
						segments: withoutParent,
						scale,
						linear,
						curvePath,
						waterStyle: parentWaterStyle,
						fill: false,
					})
					ctx.restore()
				}
			}

			// 4) Fill land provinces
			if (landAtDepth.length > 0) {
				const landmarkIdxs = new Set(landAtDepth.map((s) => s.idx))
				DRAW_BORDERS.fillProvinces(params, landmarkIdxs)
			}
		}
	},
}

import { WORLD } from "@/model"
import { MAP_SHAPES } from "../shapes"
import { DrawMapParams } from "../shapes/types"
import { DrawOceanParams } from "./types"

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

export const DRAW_LANDMARKS = {
	oceans: ({ ctx, projection, visible }: DrawOceanParams) => {
		const scale = MAP_SHAPES.scale.derived(projection)
		const path = MAP_SHAPES.path.curveClosed(projection)
		const linear = MAP_SHAPES.path.linear(projection)
		const viz = new Set(
			Array.from(visible)
				.map((i) =>
					Object.keys(window.world.provinces[i].islands).map((k) =>
						parseInt(k),
					),
				)
				.flat(),
		)
		const drawnLands = WORLD.landmarks("land").filter((n) => viz.has(n))
		ctx.save()
		// fill the ocean
		ctx.fillStyle = styles.oceans.color
		ctx.beginPath()
		ctx.fill(new Path2D(path({ type: "Sphere" })))
		// draw coastlines
		const mod = scale
		const { islands } = window.world.display
		ctx.lineCap = "round"
		ctx.fillStyle = "#c1c1c1"
		const cache: Record<number, Path2D> = {}
		styles.waves
			.slice()
			.reverse()
			.forEach(({ strokeWidth, opacity }, i) => {
				const end = i === styles.waves.length - 1
				const color = end ? styles.oceans.waves : `255, 255, 255`
				ctx.strokeStyle = `rgba(${color},${opacity})`
				ctx.lineWidth = strokeWidth * mod * (end ? 1 : 4)
				drawnLands.forEach((j) => {
					const island = islands[j]
					if (end) {
						cache[j] = MAP_SHAPES.polygon({
							points: island.path,
							path: linear,
							direction: "inner",
						})
					} else if (!cache[j]) {
						cache[j] = MAP_SHAPES.polygon({
							points: island.path,
							path,
							direction: "inner",
						})
					}
					ctx.stroke(cache[j])
				})
			})
		ctx.restore()
		return new Set(drawnLands)
	},
	lakes: ({ ctx, projection, visible }: DrawMapParams) => {
		const scale = MAP_SHAPES.scale.derived(projection)
		const path = MAP_SHAPES.path.curveClosed(projection)
		const viz = new Set(
			Array.from(visible)
				.map((i) =>
					Object.keys(window.world.provinces[i].lakes).map((k) => parseInt(k)),
				)
				.flat(),
		)
		const drawnLakes = WORLD.landmarks("water").filter(
			(i) => viz.has(i) && window.world.landmarks[i].type !== "ocean",
		)
		const { lakes } = window.world.display
		ctx.lineCap = "round"
		const mod = scale
		const cache: Record<number, Path2D> = {}
		styles.waves.forEach(({ strokeWidth, opacity }, j) => {
			ctx.lineWidth = strokeWidth * mod
			drawnLakes.forEach((i) => {
				ctx.save()
				const lake = lakes[i]
				if (!cache[i])
					cache[i] = MAP_SHAPES.polygon({
						points: lake.path,
						path,
						direction: "inner",
					})
				ctx.fillStyle = styles.lakes.color
				const waves = styles.lakes.waves
				ctx.strokeStyle = `rgba(${waves},${opacity})`
				ctx.clip(cache[i])
				if (j === 0) ctx.fill(cache[i])
				ctx.stroke(cache[i])
				ctx.restore()
			})
		})
	},
}

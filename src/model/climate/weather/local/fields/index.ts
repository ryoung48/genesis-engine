import type { WeatherFieldParams } from "@/model/climate/weather/local/fields/types"
import { HASH } from "@/model/shared/random/hash"

const smooth = (f: number) => f * f * (3 - 2 * f)

function sample({
	seed,
	channel,
	xyz,
	radiusKm,
	seconds,
	driftMs,
}: WeatherFieldParams): number {
	const gust = channel === "gust"
	const event =
		channel === "weather-event" || channel === "weather-precipitation"
	const spacing = gust ? 60 : event ? 150 : 600
	const period = gust ? 600 : event ? 6 * 3600 : 48 * 3600
	const [x, y, z] = xyz
	const horizontal = Math.hypot(x, y)
	const east: [number, number, number] =
		horizontal > 0 ? [-y / horizontal, x / horizontal, 0] : [0, 1, 0]
	const north: [number, number, number] =
		horizontal > 0
			? [(-x * z) / horizontal, (-y * z) / horizontal, horizontal]
			: [1, 0, 0]
	const time = seconds / period
	const firstTime = Math.floor(time)
	const timeBlend = smooth(time - firstTime)
	let sum = 0
	let squares = 0
	for (let step = 0; step < 2; step++) {
		const timeWeight = step ? timeBlend : 1 - timeBlend
		if (timeWeight === 0) continue
		const node = firstTime + step
		const travelKm = (seconds - node * period) / 1000
		const position = xyz.map(
			(value, axis) =>
				(value * radiusKm -
					travelKm * (driftMs[0] * east[axis] + driftMs[1] * north[axis])) /
				spacing,
		)
		const base = position.map(Math.floor)
		const blend = position.map((value, axis) => smooth(value - base[axis]))
		for (let corner = 0; corner < 8; corner++) {
			let weight = timeWeight
			const coordinates = base.map((value, axis) => {
				const high = (corner >> axis) & 1
				weight *= high ? blend[axis] : 1 - blend[axis]
				return value + high
			})
			if (weight === 0) continue
			const key = `${channel}:${coordinates.join(":")}:${node}`
			const a = Math.max(
				2 ** -32,
				HASH.unit({ seed: HASH.keyed({ seed, key }), channel: 0, salt: 0 }),
			)
			const b = HASH.unit({
				seed: HASH.keyed({ seed, key }),
				channel: 1,
				salt: 0,
			})
			const normal = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b)
			sum += weight * normal
			squares += weight * weight
		}
	}
	return sum / Math.sqrt(squares)
}

export const WEATHER_FIELDS = { sample }

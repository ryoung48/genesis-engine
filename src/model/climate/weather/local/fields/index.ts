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
	const channelSeed = HASH.keyed({ seed, key: channel })
	const [x, y, z] = xyz
	const horizontal = Math.hypot(x, y)
	const eastX = horizontal > 0 ? -y / horizontal : 0,
		eastY = horizontal > 0 ? x / horizontal : 1,
		northX = horizontal > 0 ? (-x * z) / horizontal : 1,
		northY = horizontal > 0 ? (-y * z) / horizontal : 0,
		northZ = horizontal > 0 ? horizontal : 0
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
		const px =
			(x * radiusKm - travelKm * (driftMs[0] * eastX + driftMs[1] * northX)) /
			spacing
		const py =
			(y * radiusKm - travelKm * (driftMs[0] * eastY + driftMs[1] * northY)) /
			spacing
		const pz = (z * radiusKm - travelKm * driftMs[1] * northZ) / spacing
		const bx = Math.floor(px),
			by = Math.floor(py),
			bz = Math.floor(pz)
		const fx = smooth(px - bx),
			fy = smooth(py - by),
			fz = smooth(pz - bz)
		const nodeSeed = Math.imul(channelSeed ^ node, 0x9e3779b1)
		for (let corner = 0; corner < 8; corner++) {
			const hx = corner & 1,
				hy = (corner >> 1) & 1,
				hz = (corner >> 2) & 1
			const weight =
				timeWeight *
				(hx ? fx : 1 - fx) *
				(hy ? fy : 1 - fy) *
				(hz ? fz : 1 - fz)
			if (weight === 0) continue
			let h = nodeSeed ^ Math.imul(bx + hx, 0x85ebca6b)
			h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35) ^ Math.imul(by + hy, 0x27d4eb2f)
			h = Math.imul(h ^ (h >>> 13), 0x165667b1) ^ Math.imul(bz + hz, 0x9e3779b1)
			h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
			const a = Math.max(2 ** -32, HASH.unit({ seed: h, channel: 0, salt: 0 }))
			const b = HASH.unit({ seed: h, channel: 1, salt: 0 })
			sum += weight * Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b)
			squares += weight * weight
		}
	}
	return sum / Math.sqrt(squares)
}

export const WEATHER_FIELDS = { sample }

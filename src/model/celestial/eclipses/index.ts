import { ECLIPSE_DISKS } from "@/model/celestial/eclipses/disks"
import { ECLIPSE_SHADOW } from "@/model/celestial/eclipses/shadow"
import type {
	EclipseCategory,
	EclipseConfiguration,
	EclipseGeometry,
	EclipseKind,
	SolarEclipseParams,
} from "@/model/celestial/eclipses/types"

const unavailable: EclipseGeometry = {
	status: "unavailable",
	kind: null,
	coverage: 0,
	margin: -Infinity,
	penetration: -Infinity,
}
const clamp = (v: number) => Math.max(-1, Math.min(1, v))

function solar({
	star,
	moon,
	observer,
	starRadiusM,
	moonRadiusM,
	planetRadiusM,
}: SolarEclipseParams): EclipseGeometry {
	const valid = ECLIPSE_SHADOW.evaluate({
		star,
		occluder: moon,
		target: [0, 0, 0],
		starRadiusM,
		occluderRadiusM: moonRadiusM,
		targetRadiusM: planetRadiusM,
	}).valid
	const s = star.map((v, n) => v - observer[n]),
		m = moon.map((v, n) => v - observer[n])
	const ds = Math.hypot(...s),
		dm = Math.hypot(...m)
	if (!valid || ds <= starRadiusM || dm <= moonRadiusM) return unavailable
	if (dm >= ds)
		return {
			status: "available",
			kind: null,
			coverage: 0,
			margin: -Infinity,
			penetration: -Infinity,
		}
	const a = Math.asin(starRadiusM / ds),
		b = Math.asin(moonRadiusM / dm)
	const separation = Math.acos(
		clamp(s.reduce((sum, v, n) => sum + v * m[n], 0) / (ds * dm)),
	)
	const margin = a + b - separation
	const coverage = ECLIPSE_DISKS.overlap({
		starRadius: a,
		moonRadius: b,
		separation,
	})
	const kind =
		margin <= 0
			? null
			: separation <= Math.abs(b - a)
				? b >= a
					? "solar-total"
					: "solar-annular"
				: "solar-partial"
	return { status: "available", kind, coverage, margin, penetration: coverage }
}

function lunar(input: EclipseConfiguration): EclipseGeometry {
	const shadow = ECLIPSE_SHADOW.evaluate({
		star: input.star,
		occluder: [0, 0, 0],
		target: input.moon,
		starRadiusM: input.starRadiusM,
		occluderRadiusM: input.planetRadiusM,
		targetRadiusM: input.moonRadiusM,
	})
	if (!shadow.valid) return unavailable
	const kind =
		shadow.penumbra <= 0
			? null
			: shadow.umbra <= 0
				? "lunar-penumbral"
				: shadow.contained
					? "lunar-total"
					: "lunar-partial"
	return {
		status: "available",
		kind,
		coverage: 0,
		margin: shadow.penumbra,
		penetration: shadow.umbra > 0 ? shadow.umbra : shadow.penumbra,
	}
}

function global(input: EclipseConfiguration): EclipseGeometry {
	const shadow = ECLIPSE_SHADOW.evaluate({
		star: input.star,
		occluder: input.moon,
		target: [0, 0, 0],
		starRadiusM: input.starRadiusM,
		occluderRadiusM: input.moonRadiusM,
		targetRadiusM: input.planetRadiusM,
	})
	if (!shadow.valid) return unavailable
	const kind =
		shadow.penumbra <= 0
			? null
			: shadow.umbra > 0
				? "solar-total"
				: shadow.antumbra > 0
					? "solar-annular"
					: "solar-partial"
	return {
		status: "available",
		kind,
		coverage: 0,
		margin: shadow.penumbra,
		penetration: shadow.penumbra,
	}
}

const categories: Record<EclipseKind, EclipseCategory> = {
	"solar-partial": "solar",
	"solar-annular": "solar",
	"solar-total": "solar",
	"lunar-penumbral": "lunar",
	"lunar-partial": "lunar",
	"lunar-total": "lunar",
	"shadow-penumbral": "shadow",
	"shadow-partial": "shadow",
	"shadow-total": "shadow",
	"occultation-partial": "occultation",
	"occultation-annular": "occultation",
	"occultation-total": "occultation",
}

function category(kind: EclipseKind): EclipseCategory {
	return categories[kind]
}

export const ECLIPSES = {
	category,
	solar,
	lunar,
	global,
}

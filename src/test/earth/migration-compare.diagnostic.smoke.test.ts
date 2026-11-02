import fs from "node:fs"
import path from "node:path"
import { it } from "vitest"
import { MIGRATION } from "@/model/society/migration"
import { CLIMATE_EARTH } from "./fixtures/climate-earth"

type Reference = {
	name: string
	group: string
	lat: number
	lon: number
	lo: number
	hi: number
}

const OUT = process.env.MIGRATION_COMPARE_OUT
const MAX_MATCH_KM = 350

const REFERENCES: Reference[] = [
	{
		name: "S Africa",
		group: "africa",
		lat: -30,
		lon: 25,
		lo: -300000,
		hi: -75000,
	},
	{
		name: "Ethiopia",
		group: "africa",
		lat: 8,
		lon: 40,
		lo: -300000,
		hi: -75000,
	},
	{
		name: "Levant",
		group: "eurasia-early",
		lat: 32,
		lon: 35,
		lo: -55000,
		hi: -45000,
	},
	{
		name: "Arabia (Nefud)",
		group: "eurasia-early",
		lat: 27,
		lon: 42,
		lo: -85000,
		hi: -55000,
	},
	{
		name: "Peninsular India",
		group: "eurasia-early",
		lat: 15.3,
		lon: 78.2,
		lo: -74000,
		hi: -35000,
	},
	{
		name: "Sri Lanka",
		group: "eurasia-early",
		lat: 7.5,
		lon: 80.7,
		lo: -38000,
		hi: -34000,
	},
	{
		name: "Laos",
		group: "eurasia-early",
		lat: 20.2,
		lon: 102.5,
		lo: -70000,
		hi: -46000,
	},
	{
		name: "N China",
		group: "eurasia-early",
		lat: 39.6,
		lon: 115.9,
		lo: -45000,
		hi: -35000,
	},
	{
		name: "Japan (Honshu)",
		group: "eurasia-early",
		lat: 36,
		lon: 138,
		lo: -38000,
		hi: -30000,
	},
	{
		name: "Balkans",
		group: "europe",
		lat: 42.9,
		lon: 25.4,
		lo: -47000,
		hi: -43000,
	},
	{ name: "France", group: "europe", lat: 45, lon: 1, lo: -46000, hi: -40000 },
	{
		name: "Britain",
		group: "europe",
		lat: 52,
		lon: -1,
		lo: -44000,
		hi: -12000,
	},
	{
		name: "S Scandinavia",
		group: "europe",
		lat: 60,
		lon: 10,
		lo: -12500,
		hi: -9500,
	},
	{
		name: "Iceland",
		group: "late-island",
		lat: 64.9,
		lon: -18,
		lo: 870,
		hi: 874,
	},
	{
		name: "W Siberia",
		group: "siberia",
		lat: 57,
		lon: 71,
		lo: -45000,
		hi: -30000,
	},
	{
		name: "Baikal",
		group: "siberia",
		lat: 53,
		lon: 108,
		lo: -45000,
		hi: -24000,
	},
	{
		name: "NE Siberia",
		group: "siberia",
		lat: 71,
		lon: 136,
		lo: -32000,
		hi: -28000,
	},
	{
		name: "Alaska/Yukon",
		group: "americas",
		lat: 66.5,
		lon: -140.5,
		lo: -24000,
		hi: -14000,
	},
	{
		name: "Oregon",
		group: "americas",
		lat: 43.5,
		lon: -121,
		lo: -15000,
		hi: -13500,
	},
	{
		name: "E North America",
		group: "americas",
		lat: 40.3,
		lon: -80.5,
		lo: -16000,
		hi: -12000,
	},
	{
		name: "Mexico",
		group: "americas",
		lat: 19,
		lon: -99,
		lo: -24000,
		hi: -12000,
	},
	{
		name: "Amazon",
		group: "americas",
		lat: -2,
		lon: -54,
		lo: -13000,
		hi: -10000,
	},
	{
		name: "Peru",
		group: "americas",
		lat: -13,
		lon: -72,
		lo: -14500,
		hi: -11000,
	},
	{
		name: "Monte Verde",
		group: "americas",
		lat: -41.5,
		lon: -73,
		lo: -15000,
		hi: -14000,
	},
	{
		name: "Tierra del Fuego",
		group: "americas",
		lat: -54,
		lon: -69,
		lo: -11500,
		hi: -10000,
	},
	{
		name: "Borneo",
		group: "sunda-sahul",
		lat: 3.8,
		lon: 113.8,
		lo: -50000,
		hi: -40000,
	},
	{
		name: "Java",
		group: "sunda-sahul",
		lat: -7.5,
		lon: 111,
		lo: -70000,
		hi: -35000,
	},
	{
		name: "Luzon",
		group: "sunda-sahul",
		lat: 17,
		lon: 121,
		lo: -67000,
		hi: -40000,
	},
	{
		name: "Taiwan",
		group: "sunda-sahul",
		lat: 23.7,
		lon: 121,
		lo: -30000,
		hi: -20000,
	},
	{
		name: "New Guinea",
		group: "sunda-sahul",
		lat: -6,
		lon: 145,
		lo: -50000,
		hi: -40000,
	},
	{
		name: "New Ireland",
		group: "sunda-sahul",
		lat: -3,
		lon: 152,
		lo: -42000,
		hi: -35000,
	},
	{
		name: "Solomons",
		group: "sunda-sahul",
		lat: -9.5,
		lon: 160,
		lo: -30000,
		hi: -26000,
	},
	{
		name: "N Australia",
		group: "sunda-sahul",
		lat: -12.5,
		lon: 132.9,
		lo: -65000,
		hi: -50000,
	},
	{
		name: "SE Australia",
		group: "sunda-sahul",
		lat: -33.7,
		lon: 143,
		lo: -50000,
		hi: -40000,
	},
	{
		name: "Tasmania",
		group: "sunda-sahul",
		lat: -42,
		lon: 146.5,
		lo: -42000,
		hi: -35000,
	},
	{
		name: "Cyprus",
		group: "mediterranean",
		lat: 35,
		lon: 33,
		lo: -11000,
		hi: -8500,
	},
	{
		name: "Crete",
		group: "mediterranean",
		lat: 35.2,
		lon: 24.9,
		lo: -9000,
		hi: -6000,
	},
	{
		name: "Sardinia",
		group: "mediterranean",
		lat: 40,
		lon: 9,
		lo: -11000,
		hi: -8000,
	},
	{
		name: "Malta",
		group: "mediterranean",
		lat: 35.9,
		lon: 14.4,
		lo: -6000,
		hi: -5000,
	},
	{
		name: "Mallorca",
		group: "mediterranean",
		lat: 39.6,
		lon: 3,
		lo: -2500,
		hi: -2000,
	},
	{ name: "Cuba", group: "caribbean", lat: 22, lon: -79, lo: -5000, hi: -3500 },
	{
		name: "Hispaniola",
		group: "caribbean",
		lat: 19,
		lon: -71,
		lo: -5000,
		hi: -3500,
	},
	{
		name: "Puerto Rico",
		group: "caribbean",
		lat: 18.2,
		lon: -66.5,
		lo: -2500,
		hi: -1500,
	},
	{
		name: "NW Greenland",
		group: "arctic",
		lat: 77,
		lon: -70,
		lo: -2600,
		hi: -2000,
	},
	{
		name: "Madagascar",
		group: "late-island",
		lat: -19,
		lon: 47,
		lo: -2000,
		hi: 1000,
	},
	{
		name: "Canaries",
		group: "late-island",
		lat: 28,
		lon: -16,
		lo: -1000,
		hi: 200,
	},
	{ name: "Fiji", group: "pacific", lat: -17.8, lon: 178, lo: -1100, hi: -700 },
	{ name: "Tonga", group: "pacific", lat: -21, lon: -175, lo: -950, hi: -750 },
	{
		name: "Tahiti",
		group: "pacific",
		lat: -17.6,
		lon: -149.5,
		lo: 900,
		hi: 1150,
	},
	{ name: "Hawaii", group: "pacific", lat: 20, lon: -156, lo: 900, hi: 1300 },
	{
		name: "Easter Island",
		group: "pacific",
		lat: -27,
		lon: -109.4,
		lo: 900,
		hi: 1200,
	},
	{
		name: "New Zealand",
		group: "pacific",
		lat: -40,
		lon: 175,
		lo: 1250,
		hi: 1300,
	},
]

function rangeError(year: number, lo: number, hi: number) {
	return year < lo ? year - lo : year > hi ? year - hi : 0
}

function median(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b)
	return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : 0
}

it("compares the migration arrival field with archaeological first-settlement dates", () => {
	const world = CLIMATE_EARTH.importWorld()
	const provinces = world.provinces
	const population = world.population
	if (!provinces || !population?.arrivalYear || !population.predecessor)
		throw new Error("Earth world has no arrival field")
	const { r_xyz } = world.mesh
	const radius = 6371
	const arrival = population.arrivalYear
	const predecessor = population.predecessor
	const xyz = (p: number) => {
		const r = provinces.seeds[p]
		return [r_xyz[3 * r], r_xyz[3 * r + 1], r_xyz[3 * r + 2]]
	}
	const latLon = (p: number) => {
		const [x, y, z] = xyz(p)
		return {
			lat: +((Math.asin(Math.max(-1, Math.min(1, z))) * 180) / Math.PI).toFixed(
				1,
			),
			lon: +((Math.atan2(y, x) * 180) / Math.PI).toFixed(1),
		}
	}
	const km = (a: number[], b: number[]) =>
		Math.acos(
			Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])),
		) * radius
	const unit = (lat: number, lon: number) => {
		const la = (lat * Math.PI) / 180
		const lo = (lon * Math.PI) / 180
		return [
			Math.cos(la) * Math.cos(lo),
			Math.cos(la) * Math.sin(lo),
			Math.sin(la),
		]
	}
	const habitable: number[] = []
	for (let p = 0; p < provinces.count; p++)
		if (!provinces.desolate[p]) habitable.push(p)

	const origin = habitable.find((p) => arrival[p] === MIGRATION.startYear) ?? -1
	const route = (p: number) => {
		const hops: { to: string; year: number; km: number }[] = []
		let q = p
		let guard = 0
		while (predecessor[q] >= 0 && guard++ < 5000) {
			const from = predecessor[q]
			let adjacent = false
			for (let j = provinces.adjOffset[q]; j < provinces.adjOffset[q + 1]; j++)
				if (provinces.adjList[j] === from) adjacent = true
			if (!adjacent) {
				const ll = latLon(q)
				hops.push({
					to: `${ll.lat},${ll.lon}`,
					year: arrival[q],
					km: Math.round(km(xyz(from), xyz(q))),
				})
			}
			q = from
		}
		return hops.reverse()
	}

	const rows = REFERENCES.map((ref) => {
		const target = unit(ref.lat, ref.lon)
		let best = -1
		let bestKm = Infinity
		for (const p of habitable) {
			const d = km(xyz(p), target)
			if (d < bestKm) {
				bestKm = d
				best = p
			}
		}
		const matched = best >= 0 && bestKm <= MAX_MATCH_KM
		const year = matched ? arrival[best] : null
		const reached = year !== null && year !== MIGRATION.sentinel
		return {
			...ref,
			matchKm: Math.round(bestKm),
			matched,
			modelYear: reached ? year : year === null ? null : "unreached",
			error: reached && year !== null ? rangeError(year, ref.lo, ref.hi) : null,
			hops: matched && reached ? route(best) : [],
		}
	})
	const scored = rows.filter((r) => r.error !== null)
	const byGroup: Record<string, unknown> = {}
	for (const group of new Set(rows.map((r) => r.group))) {
		const g = scored.filter((r) => r.group === group)
		byGroup[group] = {
			n: g.length,
			within: g.filter((r) => r.error === 0).length,
			medianSignedError: median(g.map((r) => r.error as number)),
			meanAbsError: Math.round(
				g.reduce((s, r) => s + Math.abs(r.error as number), 0) /
					Math.max(1, g.length),
			),
		}
	}
	const reachedYears = habitable
		.filter((p) => arrival[p] !== MIGRATION.sentinel)
		.map((p) => arrival[p])
		.sort((a, b) => a - b)
	const share = (year: number) =>
		+(
			reachedYears.filter((y) => y <= year).length /
			Math.max(1, habitable.length)
		).toFixed(3)
	const summary = {
		provinces: provinces.count,
		habitable: habitable.length,
		origin: origin >= 0 ? latLon(origin) : null,
		neverReached: habitable.length - reachedYears.length,
		shareSettledBy: {
			"-50000": share(-50000),
			"-30000": share(-30000),
			"-15000": share(-15000),
			"-10000": share(-10000),
			"-5000": share(-5000),
			"-1000": share(-1000),
			"1": share(1),
			"1500": share(1500),
		},
		diagnostics: population.migrationDiagnostics,
		scored: scored.length,
		unmatched: rows.filter((r) => !r.matched).map((r) => r.name),
		within: scored.filter((r) => r.error === 0).length,
		medianSignedError: median(scored.map((r) => r.error as number)),
		meanAbsError: Math.round(
			scored.reduce((s, r) => s + Math.abs(r.error as number), 0) /
				Math.max(1, scored.length),
		),
		byGroup,
	}
	const adjacencyKm = {
		"<150": 0,
		"150-500": 0,
		"500-1000": 0,
		"1000-2000": 0,
		">2000": 0,
	}
	for (let p = 0; p < provinces.count; p++) {
		if (provinces.desolate[p]) continue
		for (let j = provinces.adjOffset[p]; j < provinces.adjOffset[p + 1]; j++) {
			const q = provinces.adjList[j]
			if (q < p || provinces.desolate[q]) continue
			const d = km(xyz(p), xyz(q))
			if (d < 150) adjacencyKm["<150"]++
			else if (d < 500) adjacencyKm["150-500"]++
			else if (d < 1000) adjacencyKm["500-1000"]++
			else if (d < 2000) adjacencyKm["1000-2000"]++
			else adjacencyKm[">2000"]++
		}
	}
	;(summary as Record<string, unknown>).provinceAdjacencySeedDistanceKm =
		adjacencyKm
	const file =
		OUT ??
		path.join(process.cwd(), "node_modules", ".cache", "migration-compare.json")
	fs.mkdirSync(path.dirname(file), { recursive: true })
	fs.writeFileSync(file, JSON.stringify({ summary, rows }, null, 1))
	console.log(JSON.stringify(summary, null, 1))
	console.log(
		rows
			.map(
				(r) =>
					`${r.name.padEnd(18)} ${String(r.modelYear).padStart(9)}  ref ${r.lo}..${r.hi}  err ${r.error}  match ${r.matchKm}km  hops ${r.hops.length}`,
			)
			.join("\n"),
	)
})

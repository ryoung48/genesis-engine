import { mkdirSync, writeFileSync } from "node:fs"
import { describe, it } from "vitest"
import { DRAINAGE } from "@/model/geography/terrain/drainage"
import { ENDORHEIC } from "@/model/geography/terrain/endorheic"
import { LAKES } from "@/model/geography/terrain/lakes"
import { TIMING } from "@/model/shared/timing"
import { UNITS } from "@/model/shared/units"
import { cachedWorld } from "@/test/tectonics/world-cache"

const SEEDS = (process.env.TERMINAL_LAKE_SEEDS ?? "14963991,20251107,77031")
	.split(",")
	.map(Number)
const FLOOR_FRACTIONS = [0.25, 0.5, 0.75]

interface FloorRow {
	fraction: number
	panRegions: number
	panAreaKm2: number
	panBasins: number
	largestPan: number
}

interface Shares {
	seed: number
	landRegions: number
	depressions: number
	terminal: number
	terminalShare: number
	saltLakes: number
	saltLakeRegions: number
	saltLakeAreaKm2: number
	panRegions: number
	panAreaKm2: number
	panOnlyBasins: number
	openLakeBasins: Record<string, number>
	brackishLakeRegions: number
	brackishLakeAreaKm2: number
	lakeAreaKm2: number
	downstreamLandShare: number
	floorSensitivity: FloorRow[]
	riversMs: number
	lakesMs: number
}

function sharesOf(seed: number): Shares {
	const world = cachedWorld(seed)
	const { mesh, rivers, params } = world
	const N = mesh.numRegions
	const areaKm2 = UNITS.regionAreasKm2({
		mesh,
		planetRadiusKm: params.planetRadiusKm,
	})
	const layout = ENDORHEIC.layout({
		basinId: rivers.basinId,
		elevation: world.elevation,
	})
	const flood = DRAINAGE.order({
		mesh,
		elevation: world.elevation,
		isLand: world.riverLand,
		sinks: new Uint8Array(N),
	})
	const basinCount = layout.cells.length
	const outlets = ENDORHEIC.outlets({
		basinId: rivers.basinId,
		drainTarget: flood.drainTarget,
		basinCount,
	})
	let terminal = 0
	const downstream = new Uint8Array(N)
	for (let bid = 0; bid < basinCount; bid++) {
		if (!rivers.basinTerminal[bid]) continue
		terminal++
		for (const outlet of outlets[bid]) {
			for (
				let r = flood.drainTarget[outlet];
				r >= 0 && world.riverLand[r] && !downstream[r];
				r = flood.drainTarget[r]
			)
				downstream[r] = 1
		}
	}
	let landRegions = 0
	let downstreamLand = 0
	let saltLakeRegions = 0
	let saltLakeAreaKm2 = 0
	let panRegions = 0
	let panAreaKm2 = 0
	let brackishLakeRegions = 0
	let brackishLakeAreaKm2 = 0
	let lakeAreaKm2 = 0
	for (let r = 0; r < N; r++) {
		if (world.riverLand[r]) landRegions++
		if (downstream[r]) downstreamLand++
		const kind = rivers.lakeKind[r]
		if (kind !== LAKES.kindCode.none && kind !== LAKES.kindCode.pan)
			lakeAreaKm2 += areaKm2[r]
		if (kind === LAKES.kindCode.brackish) {
			brackishLakeRegions++
			brackishLakeAreaKm2 += areaKm2[r]
		}
		if (kind === LAKES.kindCode.salt) {
			saltLakeRegions++
			saltLakeAreaKm2 += areaKm2[r]
		}
		if (kind === LAKES.kindCode.pan) {
			panRegions++
			panAreaKm2 += areaKm2[r]
		}
	}
	let saltLakes = 0
	let panOnly = 0
	const openLakeBasins = { fresh: 0, brackish: 0, salt: 0 }
	for (let bid = 0; bid < basinCount; bid++) {
		if (!rivers.basinTerminal[bid]) {
			const wet = layout.cells[bid].find((r) => rivers.lakeKind[r] > 0)
			if (wet === undefined) continue
			const kind = LAKES.kinds[rivers.lakeKind[wet]]
			if (kind === "fresh" || kind === "brackish" || kind === "salt")
				openLakeBasins[kind]++
			continue
		}
		let salt = 0
		let pan = 0
		for (const r of layout.cells[bid]) {
			if (rivers.lakeKind[r] === LAKES.kindCode.salt) salt++
			if (rivers.lakeKind[r] === LAKES.kindCode.pan) pan++
		}
		if (salt > 0) saltLakes++
		else if (pan > 0) panOnly++
	}

	const sill = new Float32Array(basinCount)
	for (let bid = 0; bid < basinCount; bid++)
		sill[bid] = flood.waterLevel[layout.lowest[bid]]
	const secondsPerYear = UNITS.secondsPerYear(params)
	const deficitMm = ENDORHEIC.evaporationDeficit({
		petMonthly: world.climate.pet_monthly,
		rainfallAnnual: world.rainfall.annual,
		numRegions: N,
	})
	const areaM2 = Float64Array.from(areaKm2, (a) => a * 1e6)
	const floorSensitivity = FLOOR_FRACTIONS.map((fraction): FloorRow => {
		const bodies = ENDORHEIC.waterBodies({
			mesh,
			elevation: world.elevation,
			layout,
			terminal: rivers.basinTerminal,
			inflowM3s: rivers.basinInflow,
			sill,
			deficitMm,
			areaM2,
			secondsPerYear,
			floorFraction: fraction,
		})
		let regions = 0
		let area = 0
		let basins = 0
		let largest = 0
		for (const body of bodies) {
			if (body.pan.length === 0) continue
			basins++
			regions += body.pan.length
			largest = Math.max(largest, body.pan.length)
			for (const r of body.pan) area += areaKm2[r]
		}
		return {
			fraction,
			panRegions: regions,
			panAreaKm2: area,
			panBasins: basins,
			largestPan: largest,
		}
	})

	const flat = TIMING.flatten(world.timings ?? [])
	const ms = (stage: string) => flat.find((t) => t.Stage === stage)?.ms ?? 0
	return {
		seed,
		landRegions,
		depressions: basinCount,
		terminal,
		terminalShare: terminal / Math.max(1, basinCount),
		saltLakes,
		saltLakeRegions,
		saltLakeAreaKm2,
		panRegions,
		panAreaKm2,
		panOnlyBasins: panOnly,
		openLakeBasins,
		brackishLakeRegions,
		brackishLakeAreaKm2,
		lakeAreaKm2,
		downstreamLandShare: downstreamLand / Math.max(1, landRegions),
		floorSensitivity,
		riversMs: ms("Post: rivers"),
		lakesMs: ms("Post: lakes"),
	}
}

function table(rows: Shares[]): string {
	const head = `| metric | ${rows.map((r) => r.seed).join(" | ")} |\n|---|${rows.map(() => "---").join("|")}|`
	const line = (label: string, pick: (row: Shares) => number) =>
		`| ${label} | ${rows.map((r) => pick(r).toFixed(3)).join(" | ")} |`
	return [
		head,
		line("land regions (pre-lake)", (r) => r.landRegions),
		line("depressions", (r) => r.depressions),
		line("terminal depressions", (r) => r.terminal),
		line("terminal share of depressions", (r) => r.terminalShare),
		line("terminal basins with a salt lake", (r) => r.saltLakes),
		line("terminal basins with a pan and no lake", (r) => r.panOnlyBasins),
		line("salt lake regions", (r) => r.saltLakeRegions),
		line("salt lake area km2", (r) => r.saltLakeAreaKm2),
		line("open basins with a fresh lake", (r) => r.openLakeBasins.fresh),
		line("open basins with a brackish lake", (r) => r.openLakeBasins.brackish),
		line("open basins with a salt lake", (r) => r.openLakeBasins.salt),
		line("brackish lake regions", (r) => r.brackishLakeRegions),
		line("brackish lake area km2", (r) => r.brackishLakeAreaKm2),
		line("all lake area km2", (r) => r.lakeAreaKm2),
		line("pan regions", (r) => r.panRegions),
		line("pan area km2", (r) => r.panAreaKm2),
		line(
			"land share downstream of a terminal outlet",
			(r) => r.downstreamLandShare,
		),
		...FLOOR_FRACTIONS.flatMap((fraction, i) => [
			line(
				`floor ${fraction}: pan regions`,
				(r) => r.floorSensitivity[i].panRegions,
			),
			line(
				`floor ${fraction}: pan area km2`,
				(r) => r.floorSensitivity[i].panAreaKm2,
			),
			line(
				`floor ${fraction}: basins with a pan`,
				(r) => r.floorSensitivity[i].panBasins,
			),
			line(
				`floor ${fraction}: largest pan regions`,
				(r) => r.floorSensitivity[i].largestPan,
			),
		]),
		line("rivers stage ms", (r) => r.riversMs),
		line("lakes stage ms", (r) => r.lakesMs),
	].join("\n")
}

describe.skipIf(!process.env.TERMINAL_LAKE_SHARES)(
	"terminal lakes: shares against expectations",
	() => {
		it("writes the terminal basin, salt lake and pan shares", () => {
			const rows = SEEDS.map(sharesOf)
			const stamp = new Date().toISOString().replace(/[:.]/g, "-")
			const dir = `stats/terminal-lakes/${stamp}-shares`
			mkdirSync(dir, { recursive: true })
			writeFileSync(`${dir}/shares.json`, JSON.stringify(rows, null, 1))
			writeFileSync(`${dir}/report.md`, table(rows))
		})
	},
)

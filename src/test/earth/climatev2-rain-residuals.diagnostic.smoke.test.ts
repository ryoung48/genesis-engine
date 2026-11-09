import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "vitest"
import { OBSERVED_EARTH } from "@/model/climate/observed-earth"
import { CLIMATEV2_ORBIT } from "@/model/climatev2/orbit"
import { planetClimate } from "@/model/climatev2/vendor/climate.js"
import { setParams } from "@/model/climatev2/vendor/config.js"
import { loadEarthMonthlyRaster } from "@/test/earth/assets"
import { CLIMATE_EARTH } from "@/test/earth/fixtures/climate-earth"

// Where v2's land rain is wrong, over the whole Earth: model against observed by season, latitude band, coast
// exposure and side, and the winter error against the rain stage's own inputs. Log ratios use (P + 10 mm).
// CLIMATE_PARAMS (JSON) overrides v2's settings.

const MONTHS = 12
const DEG = Math.PI / 180
const COAST_KM = 400
const NEAR_KM = 1200
const BANDS = [0, 10, 25, 35, 45, 60, 90]
const EPS_MM = 10

type Cell = {
	c: number
	absLat: number
	weight: number
	exposure: "coast" | "near" | "interior"
	side: "east" | "west" | "pole" | "equator"
	model: Record<Season, number>
	observed: Record<Season, number>
	winter: Record<string, number>
}
type Season = "winter" | "summer" | "annual"
type Group = { w: number; logSum: number; model: number; observed: number }

describe("climatev2 rain residuals (diagnostic)", () => {
	it("groups v2's land rain error by season, latitude, coast and the rain stage's inputs", () => {
		if (process.env.CLIMATE_PARAMS)
			setParams(JSON.parse(process.env.CLIMATE_PARAMS))
		const world = CLIMATE_EARTH.importWorld()
		const { mesh, isLand } = world
		const result = planetClimate(
			{
				xyz: mesh.r_xyz,
				elevKm: world.elevation_km,
				axes: "z-up",
				land: isLand,
			},
			{
				...CLIMATEV2_ORBIT.fromParams(world.params),
				seed: world.params.seed,
				greenhouseWm2: 0,
				onCell: () => undefined,
			},
		)
		const { grid } = result
		const G = grid.size
		const points = new Float32Array(3 * G)
		for (let j = 0; j < grid.h; j++)
			for (let i = 0; i < grid.w; i++) {
				const c = j * grid.w + i
				const la = grid.lat[j] * DEG
				const lo = grid.lon[i] * DEG
				points[3 * c] = Math.cos(la) * Math.cos(lo)
				points[3 * c + 1] = Math.cos(la) * Math.sin(lo)
				points[3 * c + 2] = Math.sin(la)
			}
		const pr = loadEarthMonthlyRaster("earth-real-precipitation")
		const obs = OBSERVED_EARTH.sampleMonthlyFloatRaster({
			mesh: { numRegions: G, r_xyz: points } as typeof mesh,
			raster: pr.monthly,
			rasterW: pr.width,
			rasterH: pr.height,
			months: pr.months,
			scale: pr.scale,
			nodata: pr.nodata,
		})
		const land = result.surface.landFrac
		const P = result.months.P
		const rain = result.stages.rain as unknown as {
			stability: Float32Array
			r: Float32Array
			eady: Float32Array[]
		}
		const { u, v, slp } = result.stages.circulation
		const T = result.stages.temperature.monthly
		const K = result.anchorMonths.length
		const anchorMonth = result.anchorMonths.map(
			(m) => ((Math.round(m) % MONTHS) + MONTHS) % MONTHS,
		)
		const kmPerDeg = (grid.radiusM / 1000) * DEG

		// sea share in each half-disc (east, west, north, south) within a radius, by direct sums over the grid
		const seaShare = (j: number, i: number, km: number) => {
			const out = { all: 0, e: 0, w: 0, n: 0, s: 0 }
			const counts = { all: 0, e: 0, w: 0, n: 0, s: 0 }
			const dj = Math.ceil(km / (kmPerDeg * grid.step))
			for (let d = -dj; d <= dj; d++) {
				const jj = j + d
				if (jj < 0 || jj >= grid.h) continue
				const cl = Math.max(0.05, Math.cos(grid.lat[jj] * DEG))
				const dy = d * grid.step * kmPerDeg
				const di = Math.min(
					grid.w >> 1,
					Math.ceil(km / (kmPerDeg * grid.step * cl)),
				)
				for (let e = -di; e <= di; e++) {
					const dx = e * grid.step * kmPerDeg * cl
					if (dx * dx + dy * dy > km * km) continue
					const s = 1 - land[jj * grid.w + ((i + e + grid.w) % grid.w)]
					out.all += s
					counts.all++
					if (e > 0) {
						out.e += s
						counts.e++
					}
					if (e < 0) {
						out.w += s
						counts.w++
					}
					// rows run north → south: d < 0 is north
					if (d < 0) {
						out.n += s
						counts.n++
					}
					if (d > 0) {
						out.s += s
						counts.s++
					}
				}
			}
			const share = (k: keyof typeof out) =>
				counts[k] ? out[k] / counts[k] : 0
			return {
				all: share("all"),
				e: share("e"),
				w: share("w"),
				n: share("n"),
				s: share("s"),
			}
		}

		const cells: Cell[] = []
		for (let j = 0; j < grid.h; j++) {
			const lat = grid.lat[j]
			const winterM = lat >= 0 ? [11, 0, 1] : [5, 6, 7]
			const summerM = lat >= 0 ? [5, 6, 7] : [11, 0, 1]
			let slpRow = 0
			for (let i = 0; i < grid.w; i++)
				for (const m of winterM) slpRow += slp[m * G + j * grid.w + i]
			slpRow /= grid.w * 3
			for (let i = 0; i < grid.w; i++) {
				const c = j * grid.w + i
				if (land[c] < 0.5 || !Number.isFinite(obs[c])) continue
				const near = seaShare(j, i, COAST_KM)
				const far = near.all > 0.1 ? near : seaShare(j, i, NEAR_KM)
				const exposure =
					near.all > 0.1 ? "coast" : far.all > 0.1 ? "near" : "interior"
				const ew = far.e - far.w
				const ns = lat >= 0 ? far.n - far.s : far.s - far.n
				const side =
					Math.abs(ew) >= Math.abs(ns)
						? ew > 0
							? "east"
							: "west"
						: ns > 0
							? "pole"
							: "equator"
				// seaward unit vector (east, north) → onshore wind is the wind against it
				const sx = far.e - far.w
				const sy = far.n - far.s
				const sn = Math.hypot(sx, sy) || 1
				const model = { winter: 0, summer: 0, annual: 0 }
				const observed = { winter: 0, summer: 0, annual: 0 }
				let onshore = 0
				let slpAnom = 0
				let temp = 0
				for (let m = 0; m < MONTHS; m++) {
					const pm = P[m * G + c]
					const po = obs[m * G + c]
					model.annual += pm
					observed.annual += po
					if (winterM.includes(m)) {
						model.winter += pm
						observed.winter += po
						onshore += -(u[m * G + c] * sx + v[m * G + c] * sy) / sn / 3
						slpAnom += (slp[m * G + c] - slpRow) / 3
						temp += T[m * G + c] / 3
					}
					if (summerM.includes(m)) {
						model.summer += pm
						observed.summer += po
					}
				}
				let stab = 0
				let rh = 0
				let eady = 0
				let n = 0
				for (let k = 0; k < K; k++) {
					if (!winterM.includes(anchorMonth[k])) continue
					stab += rain.stability[k * G + c]
					rh += rain.r[k * G + c]
					const eadyRows = rain.eady[k]
					eady +=
						eadyRows[
							Math.min(
								eadyRows.length - 1,
								Math.floor((j * eadyRows.length) / grid.h),
							)
						]
					n++
				}
				cells.push({
					c,
					absLat: Math.abs(lat),
					weight: Math.cos(lat * DEG),
					exposure,
					side,
					model,
					observed,
					winter: {
						stabilityK: stab / n,
						columnRh: rh / n,
						eadyPerDay: eady / n,
						slpAnomalyHpa: slpAnom,
						onshoreMs: onshore,
						temperatureC: temp,
						observedWinterShare: observed.winter / Math.max(1, observed.annual),
					},
				})
			}
		}

		const logRatio = (m: number, o: number) =>
			Math.log((m + EPS_MM) / (o + EPS_MM))
		const round = (x: number, d = 2) => Number(x.toFixed(d))
		const summarize = (groups: Map<string, Group>, total: number) =>
			[...groups.entries()].map(([key, g]) => ({
				key,
				areaPct: round((100 * g.w) / total, 1),
				ratio: round(Math.exp(g.logSum / g.w)),
				modelMm: round(g.model / g.w, 0),
				observedMm: round(g.observed / g.w, 0),
			}))
		const group = (keyOf: (x: Cell) => string | null, season: Season) => {
			const groups = new Map<string, Group>()
			let total = 0
			for (const x of cells) {
				total += x.weight
				const key = keyOf(x)
				if (key === null) continue
				const g = groups.get(key) ?? { w: 0, logSum: 0, model: 0, observed: 0 }
				g.w += x.weight
				g.logSum += x.weight * logRatio(x.model[season], x.observed[season])
				g.model += x.weight * x.model[season]
				g.observed += x.weight * x.observed[season]
				groups.set(key, g)
			}
			return summarize(groups, total).sort((a, b) => a.key.localeCompare(b.key))
		}
		const band = (x: Cell) => {
			for (let b = 0; b < BANDS.length - 1; b++)
				if (x.absLat < BANDS[b + 1])
					return `${String(BANDS[b]).padStart(2, "0")}-${BANDS[b + 1]}`
			return "60-90"
		}

		const byBand = Object.fromEntries(
			(["winter", "summer", "annual"] as Season[]).map((s) => [
				s,
				group(band, s),
			]),
		)
		const midlat = (x: Cell) => x.absLat >= 25 && x.absLat < 45
		const byExposure = Object.fromEntries(
			(["winter", "summer"] as Season[]).map((s) => [
				s,
				group(
					(x) =>
						midlat(x)
							? `${x.exposure} ${x.exposure === "interior" ? "" : x.side}`.trim()
							: null,
					s,
				),
			]),
		)
		const byHemisphereSide = group(
			(x) =>
				midlat(x) && x.exposure !== "interior"
					? `${x.c < (grid.h / 2) * grid.w ? "N" : "S"} ${x.side}`
					: null,
			"winter",
		)

		// winter log ratio against each input, over midlatitude land: weighted Pearson correlation and the
		// error by input tercile
		const inputs = Object.keys(cells[0].winter)
		const mid = cells.filter(midlat)
		const correlations = inputs.map((name) => {
			let sw = 0
			let sx = 0
			let sy = 0
			for (const x of mid) {
				const y = logRatio(x.model.winter, x.observed.winter)
				sw += x.weight
				sx += x.weight * x.winter[name]
				sy += x.weight * y
			}
			const mx = sx / sw
			const my = sy / sw
			let cxy = 0
			let cxx = 0
			let cyy = 0
			for (const x of mid) {
				const y = logRatio(x.model.winter, x.observed.winter) - my
				const d = x.winter[name] - mx
				cxy += x.weight * d * y
				cxx += x.weight * d * d
				cyy += x.weight * y * y
			}
			const sorted = mid.map((x) => x.winter[name]).sort((a, b) => a - b)
			const t1 = sorted[Math.floor(sorted.length / 3)]
			const t2 = sorted[Math.floor((2 * sorted.length) / 3)]
			const terciles = group(
				(x) =>
					midlat(x)
						? x.winter[name] < t1
							? `1 low (<${round(t1)})`
							: x.winter[name] < t2
								? "2 mid"
								: `3 high (>${round(t2)})`
						: null,
				"winter",
			)
			return { input: name, r: round(cxy / Math.sqrt(cxx * cyy)), terciles }
		})

		const out = { byBand, byExposure, byHemisphereSide, correlations }
		const dir = join(
			"stats",
			"climate",
			`${new Date().toISOString().replace(/[:.]/g, "-")}-rain-residuals`,
		)
		mkdirSync(dir, { recursive: true })
		writeFileSync(join(dir, "results.json"), JSON.stringify(out, null, 2))
	}, 3600000)
})

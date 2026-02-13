import { CELL } from ".."
import { EMB_CONSTANTS } from "../ebm/constants"
import { PRESSURE } from "../pressure"
import { TEMPERATURE } from "../temperature"
import type { Cell } from "../types"

const Rd = 287 // Specific gas constant for dry air [J/(kg·K)]

/**
 * Compute pressure gradient vector at a cell using least-squares
 * fit over Voronoi neighbors. Returns gradient in Pa/m.
 */
function pressureGradient(cell: Cell, month: number) {
	const R = window.world.radius * 1609.34
	const latRad = (cell.y * Math.PI) / 180
	const cosLat = Math.max(0.001, Math.cos(latRad))

	// Compute typical neighbor distance for this cell
	let totalDist = 0
	for (const neighbor of CELL.neighbors(cell)) {
		const dx = (neighbor.x - cell.x) * (Math.PI / 180) * R * cosLat
		const dy = (neighbor.y - cell.y) * (Math.PI / 180) * R
		totalDist += Math.sqrt(dx * dx + dy * dy)
	}
	const avgDist = totalDist / CELL.neighbors(cell).length
	const minDist2 = avgDist * 0.2 * (avgDist * 0.2) // skip if < 20% of avg spacing

	let sumWdx2 = 0
	let sumWdy2 = 0
	let sumWdxdy = 0
	let sumWdxdP = 0
	let sumWdydP = 0

	for (const neighbor of CELL.neighbors(cell)) {
		const dx = (neighbor.x - cell.x) * (Math.PI / 180) * R * cosLat
		const dy = (neighbor.y - cell.y) * (Math.PI / 180) * R
		const dP =
			(PRESSURE.monthly(neighbor, month) - PRESSURE.monthly(cell, month)) * 100 // hPa → Pa

		const dist2 = dx * dx + dy * dy
		if (dist2 < minDist2) continue // skip degenerate neighbors
		if (dist2 === 0) continue
		const w = 1 / dist2 // 1/dist² for tighter locality

		sumWdx2 += w * dx * dx
		sumWdy2 += w * dy * dy
		sumWdxdy += w * dx * dy
		sumWdxdP += w * dx * dP
		sumWdydP += w * dy * dP
	}

	const det = sumWdx2 * sumWdy2 - sumWdxdy * sumWdxdy
	if (Math.abs(det) < 1e-20) return { dPdx: 0, dPdy: 0 }

	return {
		dPdx: (sumWdy2 * sumWdxdP - sumWdxdy * sumWdydP) / det,
		dPdy: (sumWdx2 * sumWdydP - sumWdxdy * sumWdxdP) / det,
	}
}

/**
 * Wind estimation based on atmospheric circulation and moisture transport.
 * Uses rain.east/west values as proxies for wind strength since they decay
 * with distance from ocean (similar to wind friction over land).
 */
export const WIND = {
	/**
	 * Estimate monthly wind vector (u, v) for a cell.
	 * u = east-west component (positive = westerly, blowing from west to east)
	 * v = north-south component (positive = southerly, blowing from south to north)
	 */
	month: (params: { cell: Cell; month: number }) => {
		const { cell, month } = params
		const { dPdx, dPdy } = pressureGradient(cell, month)
		const absLat = Math.abs(cell.y)

		// Coriolis parameter (signed: positive NH, negative SH)
		const Omega = (2 * Math.PI) / (EMB_CONSTANTS.time.HOURS_PER_DAY * 3600)
		const latRad = (cell.y * Math.PI) / 180
		const f = 2 * Omega * Math.sin(latRad)

		// Clamp magnitude near equator, preserve hemisphere sign
		const f_min = 2 * Omega * Math.sin((10 * Math.PI) / 180)
		const f_eff = Math.abs(f) < f_min ? Math.sign(f || 1) * f_min : f

		// Air density from local pressure
		const TmeanK = TEMPERATURE.global.mean() + 273.15
		const rho = (PRESSURE.monthly(cell, month) * 100) / (Rd * TmeanK)

		// Geostrophic wind: signed f handles hemisphere automatically
		//   NH (f>0): low to north (dPdy>0) → u_g westward ✓
		//   SH (f<0): low to south (dPdy<0) → flips correctly ✓
		const u_g = -(1 / (rho * f_eff)) * dPdy // eastward component [m/s]
		const v_g = (1 / (rho * f_eff)) * dPdx // northward component [m/s]

		// Surface friction: reduce speed + rotate toward low pressure
		//   NH: rotate left (CCW, +angle)
		//   SH: rotate right (CW, -angle) — handled by hemisphere sign
		const isWater = cell.isWater
		const frictionFactor = isWater ? 0.7 : 0.5
		const hemisphereSign = f >= 0 ? 1 : -1
		const alpha = (isWater ? 15 : 25) * (Math.PI / 180) * hemisphereSign

		const geoAngle = Math.atan2(v_g, u_g)
		const finalAngle = geoAngle + alpha

		const rawSpeed = Math.sqrt(u_g * u_g + v_g * v_g) * frictionFactor

		// Baroclinic eddy enhancement of westerlies
		// The mean pressure gradient underestimates midlatitude westerlies
		// because baroclinic eddies transfer momentum into the mean flow.
		// Peaks at ~50° latitude.
		const eddyLat = 50
		const eddyBoost = 1 + 1.5 * Math.exp(-Math.pow((absLat - eddyLat) / 15, 2))

		// "Doldrums" damping: force winds to be weak (but not zero) at equator
		// Geostrophic balance fails at f=0, so we must manually damp the
		// otherwise linear pressure gradient.
		// Squared ramp (lat/12)^2 gives a wide, calm equatorial trough.
		// We add a 0.15 floor so it's not "literally zero".
		const dampingEnd = 25
		const t = Math.min(1, absLat / dampingEnd)
		const smoothStep = t * t * (3 - 2 * t)
		const equatorialDamping = 0.15 + 0.85 * smoothStep
		const speed = rawSpeed * equatorialDamping

		const uRaw = speed * Math.cos(finalAngle)
		const vRaw = speed * Math.sin(finalAngle)

		const isWesterly = uRaw > 0
		const boost = isWesterly && speed * eddyBoost < 15 ? eddyBoost : 1

		return {
			u: uRaw * boost, // m/s eastward
			v: vRaw * boost, // m/s northward
			speed: speed * boost,
			// Meteorological convention: 0°=N, 90°=E, wind comes FROM this direction
			direction: (((270 - finalAngle * (180 / Math.PI)) % 360) + 360) % 360,
		}
	},

	/**
	 * Get annual average wind vector
	 */
	annual: (cell: Cell): { u: number; v: number; speed: number } => {
		let uSum = 0
		let vSum = 0
		for (let month = 0; month < 12; month++) {
			const wind = WIND.month({ cell, month })
			uSum += wind.u
			vSum += wind.v
		}
		const u = uSum / 12
		const v = vSum / 12
		return { u, v, speed: Math.sqrt(u ** 2 + v ** 2) }
	},

	/**
	 * Get compass direction from wind vector
	 * Returns the direction wind is blowing FROM (meteorological convention)
	 */
	direction: (u: number, v: number): string => {
		// Wind direction: where wind is coming FROM
		// atan2 gives angle of where wind is going TO, so we flip
		const angle = (Math.atan2(-u, -v) * 180) / Math.PI
		const deg = ((angle % 360) + 360) % 360
		const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
		return dirs[Math.round(deg / 45) % 8]
	},

	/**
	 * Describe wind speed in Beaufort-like terms
	 */
	describe: (speed: number): string => {
		if (speed < 0.5) return "calm"
		if (speed < 2) return "light"
		if (speed < 4) return "gentle"
		if (speed < 6) return "moderate"
		if (speed < 8) return "fresh"
		if (speed < 11) return "strong"
		if (speed < 14) return "gale"
		return "storm"
	},
}

export function calculateWindField(month: number = 0) {
	let maxSpeed = 0
	let minSpeed = Infinity
	let sumSpeed = 0
	let maxSpeedCell: Cell | null = null

	// Band accumulators: track average u,v per latitude band
	const bands: Record<
		string,
		{
			u: number
			v: number
			count: number
			speeds: number[]
			pressures: number[]
		}
	> = {}

	const ranges = ["0-10", "10-20", "20-30", "30-45", "45-60", "60-75", "75-90"]
	for (const hemi of ["NH", "SH"]) {
		for (const range of ranges) {
			bands[`${hemi} ${range}`] = {
				u: 0,
				v: 0,
				count: 0,
				speeds: [],
				pressures: [],
			}
		}
	}

	function getBand(lat: number): string | null {
		const hemi = lat >= 0 ? "NH" : "SH"
		const absLat = Math.abs(lat)
		let range = ""
		if (absLat < 10) range = "0-10"
		else if (absLat < 20) range = "10-20"
		else if (absLat < 30) range = "20-30"
		else if (absLat < 45) range = "30-45"
		else if (absLat < 60) range = "45-60"
		else if (absLat < 75) range = "60-75"
		else range = "75-90"
		return `${hemi} ${range}`
	}

	window.world.cells.forEach((cell) => {
		const wind = WIND.month({ cell, month })

		sumSpeed += wind.speed
		if (wind.speed > maxSpeed) {
			maxSpeed = wind.speed
			maxSpeedCell = cell
		}
		if (wind.speed < minSpeed) minSpeed = wind.speed

		const band = getBand(cell.y)
		if (band && bands[band]) {
			bands[band].u += wind.u
			bands[band].v += wind.v
			bands[band].count++
			bands[band].speeds.push(wind.speed)
			bands[band].pressures.push(PRESSURE.monthly(cell, month))
		}
	})

	const cellCount = window.world.cells.length
	const avgSpeed = sumSpeed / cellCount

	// --- Summary ---
	console.log(
		`[Wind] Month ${month + 1}: ` +
			`Min ${minSpeed.toFixed(1)} m/s, Max ${maxSpeed.toFixed(1)} m/s, Avg ${avgSpeed.toFixed(1)} m/s`,
	)

	if (maxSpeedCell) {
		const pressure = PRESSURE.monthly(maxSpeedCell, month)
		console.log(
			`[Wind] Strongest: ${maxSpeed.toFixed(1)} m/s at ` +
				`lat ${maxSpeedCell.y.toFixed(1)}, lon ${maxSpeedCell.x.toFixed(1)}, ` +
				`pressure ${pressure.toFixed(1)} hPa, ` +
				`water: ${maxSpeedCell.isWater}`,
		)
	}

	// --- Latitude band diagnostics ---
	// Expected (Earth-like NH):
	//   0-10:  weak, u near 0 or slightly negative (doldrums / weak easterlies)
	//  10-30:  u negative (easterly trades), v negative (toward equator) → NE trades
	//  30-45:  u positive (westerlies), v positive (poleward)
	//  45-60:  u strongly positive (strong westerlies)
	//  60-75:  u weakening or turning easterly (polar easterlies)
	//  75-90:  u negative (polar easterlies), weak speeds
	console.log(
		"[Wind] Latitude Bands (avg u, avg v, avg speed, expected pattern):",
	)
	const expectations: Record<string, string> = {
		"NH 0-10": "weak / doldrums",
		"NH 10-20": "u<0 v<0 (NE trades)",
		"NH 20-30": "u<0 v<0 (NE trades)",
		"NH 30-45": "u>0 (westerlies emerging)",
		"NH 45-60": "u>0 strong (westerlies)",
		"NH 60-75": "u weakening (polar transition)",
		"NH 75-90": "u<0 weak (polar easterlies)",
		"SH 0-10": "weak / doldrums",
		"SH 10-20": "u<0 v>0 (SE trades)",
		"SH 20-30": "u<0 v>0 (SE trades)",
		"SH 30-45": "u>0 (westerlies emerging)",
		"SH 45-60": "u>0 strong (westerlies)",
		"SH 60-75": "u weakening (polar transition)",
		"SH 75-90": "u<0 weak (polar easterlies)",
	}

	const sortedBands = Object.entries(bands).sort((a, b) => {
		const getVal = (key: string) => {
			const [hemi, range] = key.split(" ")
			const lat = parseInt(range.split("-")[0])
			// SH values are negative, NH are positive.
			// Add tiny offset to SH to distinguish from NH at the Equator (lat 0)
			return hemi === "NH" ? lat : -lat - 0.1
		}
		return getVal(a[0]) - getVal(b[0])
	})

	for (const [band, data] of sortedBands) {
		if (data.count === 0) continue
		const avgU = data.u / data.count
		const avgV = data.v / data.count
		const avgSpd = data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length
		const avgP =
			data.pressures.reduce((a, b) => a + b, 0) / data.pressures.length
		const maxSpd = Math.max(...data.speeds)

		// Wind direction label from u,v
		const dir = (avgU >= 0 ? "W→E" : "E→W") + " " + (avgV >= 0 ? "S→N" : "N→S")

		console.log(
			`  ${band}°: P=${avgP.toFixed(1)} u=${avgU.toFixed(2)} v=${avgV.toFixed(2)} ` +
				`avg=${avgSpd.toFixed(1)} max=${maxSpd.toFixed(1)} m/s ` +
				`[${dir}] expected: ${expectations[band]}`,
		)
	}

	// --- Sanity checks ---
	if (avgSpeed < 1)
		console.warn("[Wind] ⚠ Avg speed < 1 m/s — pressure gradients too weak?")
	if (avgSpeed > 25)
		console.warn("[Wind] ⚠ Avg speed > 25 m/s — pressure gradients too strong?")
	if (maxSpeed > 50)
		console.warn(
			"[Wind] ⚠ Max speed > 50 m/s — check equatorial clamping or gradient calc",
		)

	const trade = bands["NH 10-20"]
	if (trade && trade.count > 0 && trade.u / trade.count > 0) {
		console.warn(
			"[Wind] ⚠ Trades blowing west→east — friction rotation may be wrong",
		)
	}

	const westerly = bands["NH 45-60"]
	if (westerly && westerly.count > 0 && westerly.u / westerly.count < 0) {
		console.warn(
			"[Wind] ⚠ Westerlies blowing east→west — geostrophic rotation may be wrong",
		)
	}

	// // --- P_lat gradient analysis ---
	// // P = -A(lat) * cos(6θ)  where A(lat) = 20*sin(lat)
	// console.log(
	// 	"[Wind] Theoretical P_lat gradient by latitude (dP/dlat in hPa/degree):",
	// )
	// const checkLats = [
	// 	5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85,
	// ]
	// for (const lat of checkLats) {
	// 	const latRad = (lat * Math.PI) / 180
	// 	// Numerical derivative
	// 	const eps = 0.01 * (Math.PI / 180)
	// 	const lat1 = latRad - eps
	// 	const lat2 = latRad + eps
	// 	const P1 = -20 * Math.sin(Math.abs(lat1)) * Math.cos(6 * lat1)
	// 	const P2 = -20 * Math.sin(Math.abs(lat2)) * Math.cos(6 * lat2)
	// 	const dPdLat = (P2 - P1) / (2 * 0.01) // hPa per degree

	// 	const sign = dPdLat >= 0 ? "+" : ""
	// 	console.log(`  ${lat}°: ${sign}${dPdLat.toFixed(3)} hPa/deg`)
	// }

	// // --- Compare average pressure gradients by band ---
	// console.log("[Wind] Average pressure gradient magnitude by latitude band:")
	// const bandGradients: Record<string, number[]> = {
	// 	"0-10": [],
	// 	"10-20": [],
	// 	"20-30": [],
	// 	"30-45": [],
	// 	"45-60": [],
	// 	"60-75": [],
	// 	"75-90": [],
	// }
	// window.world.cells.forEach((cell) => {
	// 	if (cell.y >= 0) {
	// 		const band = getBand(cell.y)
	// 		if (band && bandGradients[band]) {
	// 			const grad = pressureGradient(cell, month)
	// 			bandGradients[band].push(Math.sqrt(grad.dPdx ** 2 + grad.dPdy ** 2))
	// 		}
	// 	}
	// })
	// for (const [band, grads] of Object.entries(bandGradients)) {
	// 	if (grads.length === 0) continue
	// 	const avgGrad = grads.reduce((a, b) => a + b, 0) / grads.length
	// 	const maxGrad = Math.max(...grads)
	// 	console.log(
	// 		`  ${band}°: avg |∇P|=${avgGrad.toFixed(4)} Pa/m, max=${maxGrad.toFixed(4)} Pa/m`,
	// 	)
	// }

	return { maxSpeed, minSpeed, avgSpeed }
}

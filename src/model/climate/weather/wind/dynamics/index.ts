import type {
	DynamicCorrectionInput,
	SolveDynamicsInput,
} from "@/model/climate/weather/wind/dynamics/types"
import { GRID } from "@/model/climate/weather/wind/grid"
import type { LatLonGrid } from "@/model/climate/weather/wind/grid/types"

// Steady linear shallow-water (Gill-Matsuno) balance on the coarse lat-lon
// grid: solve (I + waveCoupling * div(vel(.))) phi = forcing, where vel is the
// friction + Coriolis response to grad phi. Mass conservation then fills
// convergent lows, drains divergent highs and shifts the response east-west
// (Rossby west of a heat low, Kelvin east of it), which closes basin
// anticyclones and piles cross-equatorial flow against western boundaries.
//
// The discrete operator is a 3x3 stencil: exactly shift-invariant in longitude
// (periodic) and variable-coefficient in latitude. A discrete Fourier
// transform in longitude diagonalises the longitude coupling, leaving one
// complex tridiagonal system in latitude per zonal wavenumber, each solved
// directly by the Thomas algorithm. The result is the exact discrete solution
// with no iteration or convergence tolerance. Longitude is only ~180 points and
// periodic, so the transform is evaluated directly; a mixed-radix FFT would
// matter only on a much finer grid.
const DEG2RAD = Math.PI / 180

function solve({
	forcing,
	friction,
	coriolisScale,
	waveCoupling,
}: SolveDynamicsInput): LatLonGrid {
	const n = forcing.lonBins
	const m = forcing.latBins
	const P0 = forcing.values
	const d = GRID.deg * DEG2RAD
	const eps = friction
	const wc = waveCoupling

	// Row = cell centre, face = northern cell edge. The uFace balance is
	// evaluated at row latitudes, the vFace balance at face latitudes. gu/gv
	// carry the friction term of each face wind, hu/hv the Coriolis term.
	const cosRow = new Float64Array(m)
	const gu = new Float64Array(m)
	const hu = new Float64Array(m)
	const gv = new Float64Array(m)
	const hv = new Float64Array(m)
	for (let j = 0; j < m; j++) {
		const lat = (-90 + (j + 0.5) * GRID.deg) * DEG2RAD
		const c = Math.cos(lat)
		const f = coriolisScale * Math.sin(lat)
		const invRow = 1 / (eps * eps + f * f)
		cosRow[j] = c
		gu[j] = (-eps * invRow) / (d * c)
		hu[j] = (-f * invRow) / (4 * d)
		if (j < m - 1) {
			const latFace = (-90 + (j + 1) * GRID.deg) * DEG2RAD
			const cFace = Math.cos(latFace)
			const fFace = coriolisScale * Math.sin(latFace)
			const invFace = 1 / (eps * eps + fFace * fFace)
			gv[j] = (-eps * invFace * cFace) / d
			hv[j] = (fFace * invFace) / (4 * d)
		}
	}

	// base[t] = e^{i 2*pi*t/n}; the twiddle for (k, i) is base[(k*i) mod n].
	const baseRe = new Float64Array(n)
	const baseIm = new Float64Array(n)
	for (let t = 0; t < n; t++) {
		const angle = (2 * Math.PI * t) / n
		baseRe[t] = Math.cos(angle)
		baseIm[t] = Math.sin(angle)
	}

	// Forward transform of the forcing along longitude. The operator is real, so
	// Phi[n-k] = conj(Phi[k]); only k = 0..K are solved.
	const K = n >> 1
	const nk = K + 1
	const fHatRe = new Float64Array(nk * m)
	const fHatIm = new Float64Array(nk * m)
	for (let k = 0; k < nk; k++) {
		for (let j = 0; j < m; j++) {
			const row = j * n
			let sr = 0
			let si = 0
			let t = 0
			for (let i = 0; i < n; i++) {
				const v = P0[row + i]
				sr += v * baseRe[t]
				si -= v * baseIm[t]
				t += k
				if (t >= n) t -= n
			}
			fHatRe[k * m + j] = sr
			fHatIm[k * m + j] = si
		}
	}

	const phiHatRe = new Float64Array(nk * m)
	const phiHatIm = new Float64Array(nk * m)

	// Complex tridiagonal scratch, reused per zonal wavenumber.
	const aRe = new Float64Array(m)
	const aIm = new Float64Array(m)
	const bRe = new Float64Array(m)
	const bIm = new Float64Array(m)
	const cRe = new Float64Array(m)
	const cIm = new Float64Array(m)
	const cpRe = new Float64Array(m)
	const cpIm = new Float64Array(m)
	const dpRe = new Float64Array(m)
	const dpIm = new Float64Array(m)

	for (let k = 0; k < nk; k++) {
		const th = (2 * Math.PI * k) / n
		const cs = Math.cos(th)
		const sn = Math.sin(th)
		// S = e^{i th}. A1 = S - 1, B1 = 1 + S, W1 = 1 - conj(S),
		// D1 = S - conj(S) = 2 i sn.
		const a1Re = cs - 1
		const a1Im = sn
		const b1Re = 1 + cs
		const b1Im = sn
		const w1Re = 1 - cs
		const w1Im = sn
		const d1Im = 2 * sn

		for (let j = 0; j < m; j++) {
			// uFace[j] as complex coefficients on P[j-1], P[j], P[j+1]:
			// uFace = gu*A1*P[j] + hu*B1*(P[jUp] - P[jDown]), poles clamp to j.
			let um1Re = 0
			let um1Im = 0
			let u0Re = gu[j] * a1Re
			let u0Im = gu[j] * a1Im
			let up1Re = 0
			let up1Im = 0
			if (j === 0) {
				u0Re -= hu[0] * b1Re
				u0Im -= hu[0] * b1Im
				up1Re += hu[0] * b1Re
				up1Im += hu[0] * b1Im
			} else if (j === m - 1) {
				u0Re += hu[m - 1] * b1Re
				u0Im += hu[m - 1] * b1Im
				um1Re -= hu[m - 1] * b1Re
				um1Im -= hu[m - 1] * b1Im
			} else {
				um1Re -= hu[j] * b1Re
				um1Im -= hu[j] * b1Im
				up1Re += hu[j] * b1Re
				up1Im += hu[j] * b1Im
			}
			// W1 * uFace: complex scalar times each coefficient.
			const wm1Re = w1Re * um1Re - w1Im * um1Im
			const wm1Im = w1Re * um1Im + w1Im * um1Re
			const w0Re = w1Re * u0Re - w1Im * u0Im
			const w0Im = w1Re * u0Im + w1Im * u0Re
			const wp1Re = w1Re * up1Re - w1Im * up1Im
			const wp1Im = w1Re * up1Im + w1Im * up1Re

			// North face V[j] on P[j], P[j+1] (j < m-1):
			// V = gv*(P[j+1] - P[j]) + hv*D1*(P[j] + P[j+1]); D1 pure imaginary.
			let n0Re = 0
			let n0Im = 0
			let np1Re = 0
			let np1Im = 0
			if (j < m - 1) {
				n0Re = -gv[j]
				n0Im = hv[j] * d1Im
				np1Re = gv[j]
				np1Im = hv[j] * d1Im
			}
			// South face V[j-1] on P[j-1], P[j] (j > 0), subtracted below.
			let sm1Re = 0
			let sm1Im = 0
			let s0Re = 0
			let s0Im = 0
			if (j > 0) {
				const jm = j - 1
				sm1Re = -gv[jm]
				sm1Im = hv[jm] * d1Im
				s0Re = gv[jm]
				s0Im = hv[jm] * d1Im
			}

			// div[j] = (W1*uFace + V[j] - V[j-1]) / (d * cosRow[j]).
			const scale = 1 / (d * cosRow[j])
			const dm1Re = (wm1Re - sm1Re) * scale
			const dm1Im = (wm1Im - sm1Im) * scale
			const d0Re = (w0Re + n0Re - s0Re) * scale
			const d0Im = (w0Im + n0Im - s0Im) * scale
			const dp1Re = (wp1Re + np1Re) * scale
			const dp1Im = (wp1Im + np1Im) * scale

			// Row of (I + wc*div): sub-diagonal, diagonal, super-diagonal.
			aRe[j] = wc * dm1Re
			aIm[j] = wc * dm1Im
			bRe[j] = 1 + wc * d0Re
			bIm[j] = wc * d0Im
			cRe[j] = wc * dp1Re
			cIm[j] = wc * dp1Im
		}
		aRe[0] = 0
		aIm[0] = 0
		cRe[m - 1] = 0
		cIm[m - 1] = 0

		// Complex Thomas sweep for this wavenumber.
		let denRe = bRe[0]
		let denIm = bIm[0]
		let denAbs = denRe * denRe + denIm * denIm
		cpRe[0] = (cRe[0] * denRe + cIm[0] * denIm) / denAbs
		cpIm[0] = (cIm[0] * denRe - cRe[0] * denIm) / denAbs
		dpRe[0] = (fHatRe[k * m] * denRe + fHatIm[k * m] * denIm) / denAbs
		dpIm[0] = (fHatIm[k * m] * denRe - fHatRe[k * m] * denIm) / denAbs
		for (let j = 1; j < m; j++) {
			const acRe = aRe[j] * cpRe[j - 1] - aIm[j] * cpIm[j - 1]
			const acIm = aRe[j] * cpIm[j - 1] + aIm[j] * cpRe[j - 1]
			denRe = bRe[j] - acRe
			denIm = bIm[j] - acIm
			denAbs = denRe * denRe + denIm * denIm
			cpRe[j] = (cRe[j] * denRe + cIm[j] * denIm) / denAbs
			cpIm[j] = (cIm[j] * denRe - cRe[j] * denIm) / denAbs
			const adRe = aRe[j] * dpRe[j - 1] - aIm[j] * dpIm[j - 1]
			const adIm = aRe[j] * dpIm[j - 1] + aIm[j] * dpRe[j - 1]
			const rRe = fHatRe[k * m + j] - adRe
			const rIm = fHatIm[k * m + j] - adIm
			dpRe[j] = (rRe * denRe + rIm * denIm) / denAbs
			dpIm[j] = (rIm * denRe - rRe * denIm) / denAbs
		}
		phiHatRe[k * m + (m - 1)] = dpRe[m - 1]
		phiHatIm[k * m + (m - 1)] = dpIm[m - 1]
		for (let j = m - 2; j >= 0; j--) {
			const nextRe = phiHatRe[k * m + j + 1]
			const nextIm = phiHatIm[k * m + j + 1]
			phiHatRe[k * m + j] = dpRe[j] - (cpRe[j] * nextRe - cpIm[j] * nextIm)
			phiHatIm[k * m + j] = dpIm[j] - (cpRe[j] * nextIm + cpIm[j] * nextRe)
		}
	}

	// Inverse transform along longitude with Hermitian symmetry: real output.
	const out = new Float32Array(n * m)
	const evenN = n % 2 === 0
	const kLast = evenN ? K - 1 : K
	for (let j = 0; j < m; j++) {
		for (let i = 0; i < n; i++) {
			const step = i % n
			let acc = phiHatRe[j] // k = 0
			let t = 0
			for (let k = 1; k <= kLast; k++) {
				t += step
				if (t >= n) t -= n
				const pr = phiHatRe[k * m + j]
				const pi = phiHatIm[k * m + j]
				acc += 2 * (pr * baseRe[t] - pi * baseIm[t])
			}
			if (evenN) {
				const tn = (K * i) % n
				acc +=
					phiHatRe[K * m + j] * baseRe[tn] - phiHatIm[K * m + j] * baseIm[tn]
			}
			out[j * n + i] = acc / n
		}
	}

	for (let idx = 0; idx < out.length; idx++) {
		if (!Number.isFinite(out[idx])) {
			// A singular wavenumber must not poison the world: fall back to the
			// untouched forcing (zero dynamic correction).
			return { lonBins: n, latBins: m, values: Float32Array.from(P0) }
		}
	}
	return { lonBins: n, latBins: m, values: out }
}

function correction({
	latDeg,
	lonDeg,
	pressure,
	friction,
	coriolisScale,
	waveCoupling,
}: DynamicCorrectionInput): Float32Array {
	const forcing = GRID.build({ latDeg, lonDeg, values: pressure })
	const solved = solve({ forcing, friction, coriolisScale, waveCoupling })
	const delta = new Float32Array(solved.values.length)
	for (let idx = 0; idx < delta.length; idx++) {
		delta[idx] = solved.values[idx] - forcing.values[idx]
	}
	return GRID.sample({
		grid: { lonBins: solved.lonBins, latBins: solved.latBins, values: delta },
		latDeg,
		lonDeg,
	})
}

export const DYNAMICS = {
	correction,
}

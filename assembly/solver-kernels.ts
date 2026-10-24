// AssemblyScript port of the relax and residual kernels of src/model/climatev2/vendor/solver.js (real and complex),
// which is GPL-3.0 (from github.com/raguilar011095/planet_heightmap_generation; see
// src/model/climatev2/vendor/LICENSE). Same arithmetic in the same order, so the results are the same to the bit.
// Every array argument is a byte offset into the imported memory, where the solver keeps its levels.
// Build: pnpm build:solver-wasm (writes src/model/climatev2/vendor/solver-kernels.wasm.js).

@inline function ld(p: usize, i: i32): f64 {
	return load<f64>(p + (<usize>i << 3))
}

@inline function st(p: usize, i: i32, v: f64): void {
	store<f64>(p + (<usize>i << 3), v)
}

export function relaxReal(
	w: i32,
	h: i32,
	dir: i32,
	foldNS: i32,
	Tr: usize,
	fr: usize,
	As: usize,
	An: usize,
	br: usize,
	xr: usize,
	zr: usize,
	rowK: usize,
	knRow: usize,
	ksRow: usize,
	dpr: usize,
	sub: usize,
	mir: usize,
	cpr: usize,
): void {
	for (let jj: i32 = 0; jj < h; jj++) {
		const j: i32 = dir ? h - 1 - jj : jj
		const o: i32 = j * w
		const kn: f64 = foldNS ? 0 : ld(knRow, j)
		const ks: f64 = foldNS ? 0 : ld(ksRow, j)
		for (let i: i32 = 0; i < w; i++) {
			const c: i32 = o + i
			let rr: f64 = ld(fr, c)
			if (j > 0) rr += kn * ld(Tr, c - w)
			if (j < h - 1) rr += ks * ld(Tr, c + w)
			const as: f64 = ld(As, c)
			const an: f64 = ld(An, c)
			if (as > 0) rr += as * ld(Tr, c + w)
			if (an > 0) rr += an * ld(Tr, c - w)
			st(br, i, rr)
		}
		let pr: f64 = 0
		for (let i: i32 = 0; i < w; i++) {
			const c: i32 = o + i
			const a: f64 = i == 0 ? 0 : ld(sub, c)
			pr = (ld(br, i) - a * pr) * ld(mir, c)
			st(dpr, i, pr)
		}
		let x: f64 = ld(dpr, w - 1)
		st(xr, w - 1, x)
		for (let i: i32 = w - 2; i >= 0; i--) {
			x = ld(dpr, i) - ld(cpr, o + i) * x
			st(xr, i, x)
		}
		const k: i32 = j * 4
		const bgr: f64 = ld(rowK, k)
		const idr: f64 = ld(rowK, k + 2)
		const fr2: f64 = (ld(xr, 0) + bgr * ld(xr, w - 1)) * idr
		for (let i: i32 = 0; i < w; i++) {
			const c: i32 = o + i
			st(Tr, c, ld(xr, i) - fr2 * ld(zr, c))
		}
	}
}

export function relax(
	w: i32,
	h: i32,
	dir: i32,
	foldNS: i32,
	Tr: usize,
	Ti: usize,
	fr: usize,
	fi: usize,
	As: usize,
	An: usize,
	br: usize,
	bi: usize,
	xr: usize,
	xi: usize,
	zr: usize,
	zi: usize,
	rowK: usize,
	knRow: usize,
	ksRow: usize,
	dpr: usize,
	dpi: usize,
	sub: usize,
	mir: usize,
	mii: usize,
	cpr: usize,
	cpi: usize,
): void {
	for (let jj: i32 = 0; jj < h; jj++) {
		const j: i32 = dir ? h - 1 - jj : jj
		const o: i32 = j * w
		const kn: f64 = foldNS ? 0 : ld(knRow, j)
		const ks: f64 = foldNS ? 0 : ld(ksRow, j)
		for (let i: i32 = 0; i < w; i++) {
			const c: i32 = o + i
			let rr: f64 = ld(fr, c)
			let ri: f64 = ld(fi, c)
			if (j > 0) {
				rr += kn * ld(Tr, c - w)
				ri += kn * ld(Ti, c - w)
			}
			if (j < h - 1) {
				rr += ks * ld(Tr, c + w)
				ri += ks * ld(Ti, c + w)
			}
			const as: f64 = ld(As, c)
			const an: f64 = ld(An, c)
			if (as > 0) {
				rr += as * ld(Tr, c + w)
				ri += as * ld(Ti, c + w)
			}
			if (an > 0) {
				rr += an * ld(Tr, c - w)
				ri += an * ld(Ti, c - w)
			}
			st(br, i, rr)
			st(bi, i, ri)
		}
		let pr: f64 = 0
		let pi: f64 = 0
		for (let i: i32 = 0; i < w; i++) {
			const c: i32 = o + i
			const a: f64 = i == 0 ? 0 : ld(sub, c)
			const tr: f64 = ld(br, i) - a * pr
			const ti: f64 = ld(bi, i) - a * pi
			pr = tr * ld(mir, c) - ti * ld(mii, c)
			pi = tr * ld(mii, c) + ti * ld(mir, c)
			st(dpr, i, pr)
			st(dpi, i, pi)
		}
		let x: f64 = ld(dpr, w - 1)
		let y: f64 = ld(dpi, w - 1)
		st(xr, w - 1, x)
		st(xi, w - 1, y)
		for (let i: i32 = w - 2; i >= 0; i--) {
			const c: i32 = o + i
			const nr: f64 = ld(dpr, i) - (ld(cpr, c) * x - ld(cpi, c) * y)
			const ni: f64 = ld(dpi, i) - (ld(cpr, c) * y + ld(cpi, c) * x)
			st(xr, i, nr)
			st(xi, i, ni)
			x = nr
			y = ni
		}
		const k: i32 = j * 4
		const bgr: f64 = ld(rowK, k)
		const bgi: f64 = ld(rowK, k + 1)
		const idr: f64 = ld(rowK, k + 2)
		const idi: f64 = ld(rowK, k + 3)
		const x0r: f64 = ld(xr, 0)
		const x0i: f64 = ld(xi, 0)
		const xNr: f64 = ld(xr, w - 1)
		const xNi: f64 = ld(xi, w - 1)
		const nr: f64 = x0r + (bgr * xNr - bgi * xNi)
		const ni: f64 = x0i + (bgr * xNi + bgi * xNr)
		const fr2: f64 = nr * idr - ni * idi
		const fi2: f64 = nr * idi + ni * idr
		for (let i: i32 = 0; i < w; i++) {
			const c: i32 = o + i
			st(Tr, c, ld(xr, i) - (fr2 * ld(zr, c) - fi2 * ld(zi, c)))
			st(Ti, c, ld(xi, i) - (fr2 * ld(zi, c) + fi2 * ld(zr, c)))
		}
	}
}

export function residual(
	w: i32,
	h: i32,
	foldNS: i32,
	Tr: usize,
	Ti: usize,
	fr: usize,
	fi: usize,
	bdr: usize,
	bdi: usize,
	sub: usize,
	sup: usize,
	As: usize,
	An: usize,
	Rr: usize,
	Ri: usize,
	knRow: usize,
	ksRow: usize,
	rowWeight: usize,
): f64 {
	let s: f64 = 0
	for (let j: i32 = 0; j < h; j++) {
		const kn: f64 = foldNS ? 0 : ld(knRow, j)
		const ks: f64 = foldNS ? 0 : ld(ksRow, j)
		const rw: f64 = ld(rowWeight, j)
		for (let i: i32 = 0; i < w; i++) {
			const c: i32 = j * w + i
			const cw: i32 = j * w + (i == 0 ? w - 1 : i - 1)
			const ce: i32 = j * w + (i == w - 1 ? 0 : i + 1)
			let ar: f64 = ld(bdr, c) * ld(Tr, c) - ld(bdi, c) * ld(Ti, c) + ld(sub, c) * ld(Tr, cw) + ld(sup, c) * ld(Tr, ce)
			let ai: f64 = ld(bdr, c) * ld(Ti, c) + ld(bdi, c) * ld(Tr, c) + ld(sub, c) * ld(Ti, cw) + ld(sup, c) * ld(Ti, ce)
			if (j > 0) {
				ar -= kn * ld(Tr, c - w)
				ai -= kn * ld(Ti, c - w)
			}
			if (j < h - 1) {
				ar -= ks * ld(Tr, c + w)
				ai -= ks * ld(Ti, c + w)
			}
			const as: f64 = ld(As, c)
			const an: f64 = ld(An, c)
			if (as > 0) {
				ar -= as * ld(Tr, c + w)
				ai -= as * ld(Ti, c + w)
			}
			if (an > 0) {
				ar -= an * ld(Tr, c - w)
				ai -= an * ld(Ti, c - w)
			}
			const r1: f64 = ld(fr, c) - ar
			const r2: f64 = ld(fi, c) - ai
			st(Rr, c, r1)
			st(Ri, c, r2)
			s += rw * (r1 * r1 + r2 * r2)
		}
	}
	return s
}

export function residualReal(
	w: i32,
	h: i32,
	foldNS: i32,
	Tr: usize,
	fr: usize,
	bdr: usize,
	sub: usize,
	sup: usize,
	As: usize,
	An: usize,
	Rr: usize,
	knRow: usize,
	ksRow: usize,
	rowWeight: usize,
): f64 {
	let s: f64 = 0
	for (let j: i32 = 0; j < h; j++) {
		const kn: f64 = foldNS ? 0 : ld(knRow, j)
		const ks: f64 = foldNS ? 0 : ld(ksRow, j)
		const rw: f64 = ld(rowWeight, j)
		for (let i: i32 = 0; i < w; i++) {
			const c: i32 = j * w + i
			const cw: i32 = j * w + (i == 0 ? w - 1 : i - 1)
			const ce: i32 = j * w + (i == w - 1 ? 0 : i + 1)
			let ar: f64 = ld(bdr, c) * ld(Tr, c) + ld(sub, c) * ld(Tr, cw) + ld(sup, c) * ld(Tr, ce)
			if (j > 0) ar -= kn * ld(Tr, c - w)
			if (j < h - 1) ar -= ks * ld(Tr, c + w)
			const as: f64 = ld(As, c)
			const an: f64 = ld(An, c)
			if (as > 0) ar -= as * ld(Tr, c + w)
			if (an > 0) ar -= an * ld(Tr, c - w)
			const r1: f64 = ld(fr, c) - ar
			st(Rr, c, r1)
			s += rw * (r1 * r1)
		}
	}
	return s
}

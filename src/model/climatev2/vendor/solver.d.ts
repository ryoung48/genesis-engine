export class HelmholtzSolver {
	// [JUSTIFICATION] Dx and opts are optional because the vendored JS defaults Dx to D and opts to {}.
	constructor(
		grid: { w: number; h: number },
		D: number,
		Dx?: number,
		opts?: { conservative?: boolean },
	)
	// [JUSTIFICATION] faces is optional because the vendored JS defaults it to null (every face open).
	setOperator(
		sr: ArrayLike<number>,
		si: ArrayLike<number>,
		u: ArrayLike<number> | null,
		v: ArrayLike<number> | null,
		gamma: number,
		faces?: { e: ArrayLike<number>; n: ArrayLike<number> } | null,
	): void
	// [JUSTIFICATION] options is optional because the vendored JS defaults it.
	solve(
		fr: ArrayLike<number>,
		fi: ArrayLike<number>,
		Tr: Float64Array,
		Ti: Float64Array,
		options?: { maxCycles?: number; tol?: number; deflate?: boolean },
	): { cycles: number; rel: number }
}

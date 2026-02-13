type GenericFunction<T, K extends unknown[]> = (..._args: K) => T

export type MemoCache = { store: Record<string, Record<string, unknown>> }

export type MemoDecorate<T, K extends unknown[]> = {
	f: GenericFunction<T, K>
	dirty?: (..._args: K) => boolean
}

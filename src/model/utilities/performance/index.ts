import * as Performance from "./types"

// in-memory cache for memoized functions
const _cache: Performance.MemoCache = { store: {} }

export const PERFORMANCE = {
	memoize: {
		clear: () =>
			Object.keys(_cache.store).forEach((key) => (_cache.store[key] = {})),
		decorate: <T, K extends unknown[]>({
			f,
			dirty,
		}: Performance.MemoDecorate<T, K>) => {
			if (_cache.store[f.toString()] === undefined)
				_cache.store[f.toString()] = {}
			return (...args: K) => {
				const cache = _cache.store[f.toString()] as Record<string, T>
				const key = PERFORMANCE.memoize.key(args)
				if (dirty !== undefined && dirty(...args)) delete cache[key]
				let result = cache[key]
				if (result !== undefined) return result
				result = f(...args)
				cache[PERFORMANCE.memoize.key(args)] = result
				return result
			}
		},
		key: (args: unknown[]) => JSON.stringify(args),
		remove: <T, K extends unknown[]>(f: Performance.MemoDecorate<T, K>["f"]) =>
			(_cache.store[f.toString()] = {}),
	},
}

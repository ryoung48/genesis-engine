export class MinHeap {
	private _key: Float32Array
	private _data: number[] = []

	constructor(keyArray: Float32Array) {
		this._key = keyArray
	}

	get size() {
		return this._data.length
	}

	clear() {
		this._data.length = 0
	}

	push(cell: number) {
		this._data.push(cell)
		let i = this._data.length - 1
		while (i > 0) {
			const parent = (i - 1) >> 1
			if (this._key[this._data[i]] >= this._key[this._data[parent]]) break
			const tmp = this._data[i]
			this._data[i] = this._data[parent]
			this._data[parent] = tmp
			i = parent
		}
	}

	pop(): number {
		const top = this._data[0]
		const last = this._data.pop()!
		if (this._data.length > 0) {
			this._data[0] = last
			let i = 0
			const n = this._data.length
			for (;;) {
				let smallest = i
				const l = 2 * i + 1,
					r = 2 * i + 2
				if (l < n && this._key[this._data[l]] < this._key[this._data[smallest]])
					smallest = l
				if (r < n && this._key[this._data[r]] < this._key[this._data[smallest]])
					smallest = r
				if (smallest === i) break
				const tmp = this._data[i]
				this._data[i] = this._data[smallest]
				this._data[smallest] = tmp
				i = smallest
			}
		}
		return top
	}
}

// Generic key+payload variant for callers with no natural external key array
// to index into (e.g. Dijkstra keyed by a running distance, not a cell id).
export class PriorityHeap<T> {
	private _keys: number[] = []
	private _values: T[] = []

	get size() {
		return this._keys.length
	}

	push(key: number, value: T) {
		this._keys.push(key)
		this._values.push(value)
		let i = this._keys.length - 1
		while (i > 0) {
			const parent = (i - 1) >> 1
			if (this._keys[parent] <= this._keys[i]) break
			this._swap(i, parent)
			i = parent
		}
	}

	pop(): { key: number; value: T } | undefined {
		const n = this._keys.length
		if (n === 0) return undefined
		const key = this._keys[0]
		const value = this._values[0]
		const lastKey = this._keys.pop()!
		const lastValue = this._values.pop()!
		if (this._keys.length > 0) {
			this._keys[0] = lastKey
			this._values[0] = lastValue
			let i = 0
			const size = this._keys.length
			for (;;) {
				let smallest = i
				const l = 2 * i + 1,
					r = 2 * i + 2
				if (l < size && this._keys[l] < this._keys[smallest]) smallest = l
				if (r < size && this._keys[r] < this._keys[smallest]) smallest = r
				if (smallest === i) break
				this._swap(i, smallest)
				i = smallest
			}
		}
		return { key, value }
	}

	private _swap(a: number, b: number) {
		const tk = this._keys[a]
		const tv = this._values[a]
		this._keys[a] = this._keys[b]
		this._values[a] = this._values[b]
		this._keys[b] = tk
		this._values[b] = tv
	}
}

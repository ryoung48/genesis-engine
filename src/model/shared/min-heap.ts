/** Min-heap keyed on an external Float32Array. */
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

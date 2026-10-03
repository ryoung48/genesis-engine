const evt = {
	SIEGE: 10,
	WAR: 0,
	BATTLE: 1,
	SUCCESSION: 2,
	TAX: 3,
	CENSUS: 4,
	DIPLOMACY: 5,
	REGENCY: 6,
	RAID: 7,
	PEOPLE_YEAR: 8,
	REGENT_DEATH: 9,
} as const

type EventType = (typeof evt)[keyof typeof evt]

const INITIAL_CAPACITY = 1024

const DATA_FIELDS = 4

// Packed storage keeps the simulation event queue small while serving its next event in logarithmic time.
export class EventHeap {
	private _size = 0
	private _capacity: number
	private _time: Float64Array
	private _type: Uint8Array
	private _data: Int32Array
	private _time2: Float64Array

	constructor(capacity = INITIAL_CAPACITY) {
		this._capacity = capacity
		this._time = new Float64Array(capacity)
		this._type = new Uint8Array(capacity)
		this._data = new Int32Array(capacity * DATA_FIELDS)
		this._time2 = new Float64Array(capacity)
	}

	get size(): number {
		return this._size
	}

	isEmpty(): boolean {
		return this._size === 0
	}

	peekTime(): number {
		return this._time[0]
	}

	peekType(): EventType {
		return this._type[0] as EventType
	}

	peekData(out: Int32Array): void {
		const base = 0
		out[0] = this._data[base]
		out[1] = this._data[base + 1]
		out[2] = this._data[base + 2]
		out[3] = this._data[base + 3]
	}

	peekTime2(): number {
		return this._time2[0]
	}

	enqueue(
		time: number,
		type: EventType,
		d0: number,
		d1 = 0,
		d2 = 0,
		d3 = 0,
		time2 = 0,
	): void {
		if (this._size >= this._capacity) this._grow()
		const i = this._size++
		this._time[i] = time
		this._type[i] = type
		const base = i * DATA_FIELDS
		this._data[base] = d0
		this._data[base + 1] = d1
		this._data[base + 2] = d2
		this._data[base + 3] = d3
		this._time2[i] = time2
		this._siftUp(i)
	}

	dequeue(): void {
		if (this._size <= 0) return
		this._size--
		if (this._size > 0) {
			this._swap(0, this._size)
			this._siftDown(0)
		}
	}

	private _grow(): void {
		const newCap = this._capacity * 2
		const newTime = new Float64Array(newCap)
		newTime.set(this._time)
		const newType = new Uint8Array(newCap)
		newType.set(this._type)
		const newData = new Int32Array(newCap * DATA_FIELDS)
		newData.set(this._data)
		const newTime2 = new Float64Array(newCap)
		newTime2.set(this._time2)
		this._time = newTime
		this._type = newType
		this._data = newData
		this._time2 = newTime2
		this._capacity = newCap
	}

	private _swap(a: number, b: number): void {
		// time
		const tA = this._time[a]
		this._time[a] = this._time[b]
		this._time[b] = tA
		// type
		const tyA = this._type[a]
		this._type[a] = this._type[b]
		this._type[b] = tyA
		// data
		const baseA = a * DATA_FIELDS
		const baseB = b * DATA_FIELDS
		for (let k = 0; k < DATA_FIELDS; k++) {
			const tmp = this._data[baseA + k]
			this._data[baseA + k] = this._data[baseB + k]
			this._data[baseB + k] = tmp
		}
		// time2
		const t2A = this._time2[a]
		this._time2[a] = this._time2[b]
		this._time2[b] = t2A
	}

	private _siftUp(i: number): void {
		while (i > 0) {
			const parent = (i - 1) >> 1
			if (this._time[i] >= this._time[parent]) break
			this._swap(i, parent)
			i = parent
		}
	}

	private _siftDown(i: number): void {
		const n = this._size
		while (true) {
			let smallest = i
			const left = 2 * i + 1
			const right = 2 * i + 2
			if (left < n && this._time[left] < this._time[smallest]) smallest = left
			if (right < n && this._time[right] < this._time[smallest])
				smallest = right
			if (smallest === i) break
			this._swap(i, smallest)
			i = smallest
		}
	}
}

export const EVENT_HEAP = {
	evt,
}

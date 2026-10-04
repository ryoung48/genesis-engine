const evt = {
	SIEGE: 10,
	WAR: 0,
	BATTLE: 1,
	DEATH: 2,
	TAX: 3,
	CENSUS: 4,
	DIPLOMACY: 5,
	REGENCY: 6,
	RAID: 7,
	PEOPLE_YEAR: 8,
	BIRTH: 11,
} as const

type EventType = (typeof evt)[keyof typeof evt]

const INITIAL_CAPACITY = 1024

const DATA_FIELDS = 4

// Same-time order: deaths, births, everything else, then the yearly people
// pass; the enqueue sequence settles what remains. Both are folded into one
// number so that a tie on time needs a single further comparison.
const PRIORITY_STEP = 2 ** 44

function priorityOf(type: number): number {
	if (type === evt.DEATH) return 0
	if (type === evt.BIRTH) return 1
	return type === evt.PEOPLE_YEAR ? 3 : 2
}

// Packed storage keeps the simulation event queue small while serving its
// next event in logarithmic time. The heap orders only each event's two sort
// keys and the slot its payload lives in; a payload is written once and never
// moves, so a sift shifts three numbers a level.
export class EventHeap {
	private _size = 0
	private _capacity: number
	private _keyTime: Float64Array
	private _keyOrder: Float64Array
	private _slot: Int32Array
	private _type: Uint8Array
	private _data: Int32Array
	private _time2: Float64Array
	private _free: Int32Array
	private _freeCount = 0
	private _slots = 0
	private _next = 0

	constructor(capacity = INITIAL_CAPACITY) {
		this._capacity = capacity
		this._keyTime = new Float64Array(capacity)
		this._keyOrder = new Float64Array(capacity)
		this._slot = new Int32Array(capacity)
		this._type = new Uint8Array(capacity)
		this._data = new Int32Array(capacity * DATA_FIELDS)
		this._time2 = new Float64Array(capacity)
		this._free = new Int32Array(capacity)
	}

	get size(): number {
		return this._size
	}

	isEmpty(): boolean {
		return this._size === 0
	}

	peekTime(): number {
		return this._keyTime[0]
	}

	peekType(): EventType {
		return this._type[this._slot[0]] as EventType
	}

	peekData(out: Int32Array): void {
		const base = this._slot[0] * DATA_FIELDS
		out[0] = this._data[base]
		out[1] = this._data[base + 1]
		out[2] = this._data[base + 2]
		out[3] = this._data[base + 3]
	}

	peekTime2(): number {
		return this._time2[this._slot[0]]
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
		const slot =
			this._freeCount > 0 ? this._free[--this._freeCount] : this._slots++
		this._type[slot] = type
		const base = slot * DATA_FIELDS
		this._data[base] = d0
		this._data[base + 1] = d1
		this._data[base + 2] = d2
		this._data[base + 3] = d3
		this._time2[slot] = time2
		const order = priorityOf(type) * PRIORITY_STEP + this._next++
		const keyTime = this._keyTime
		const keyOrder = this._keyOrder
		const slots = this._slot
		let i = this._size++
		while (i > 0) {
			const parent = (i - 1) >> 1
			const parentTime = keyTime[parent]
			if (
				time > parentTime ||
				(time === parentTime && order > keyOrder[parent])
			)
				break
			keyTime[i] = parentTime
			keyOrder[i] = keyOrder[parent]
			slots[i] = slots[parent]
			i = parent
		}
		keyTime[i] = time
		keyOrder[i] = order
		slots[i] = slot
	}

	dequeue(): void {
		if (this._size <= 0) return
		const keyTime = this._keyTime
		const keyOrder = this._keyOrder
		const slots = this._slot
		this._free[this._freeCount++] = slots[0]
		const n = --this._size
		if (n === 0) return
		const time = keyTime[n]
		const order = keyOrder[n]
		const slot = slots[n]
		let i = 0
		while (true) {
			let child = 2 * i + 1
			if (child >= n) break
			const right = child + 1
			if (
				right < n &&
				(keyTime[right] < keyTime[child] ||
					(keyTime[right] === keyTime[child] &&
						keyOrder[right] < keyOrder[child]))
			)
				child = right
			const childTime = keyTime[child]
			if (time < childTime || (time === childTime && order < keyOrder[child]))
				break
			keyTime[i] = childTime
			keyOrder[i] = keyOrder[child]
			slots[i] = slots[child]
			i = child
		}
		keyTime[i] = time
		keyOrder[i] = order
		slots[i] = slot
	}

	private _grow(): void {
		const capacity = this._capacity * 2
		const keyTime = new Float64Array(capacity)
		keyTime.set(this._keyTime)
		this._keyTime = keyTime
		const keyOrder = new Float64Array(capacity)
		keyOrder.set(this._keyOrder)
		this._keyOrder = keyOrder
		const slots = new Int32Array(capacity)
		slots.set(this._slot)
		this._slot = slots
		const type = new Uint8Array(capacity)
		type.set(this._type)
		this._type = type
		const data = new Int32Array(capacity * DATA_FIELDS)
		data.set(this._data)
		this._data = data
		const time2 = new Float64Array(capacity)
		time2.set(this._time2)
		this._time2 = time2
		const free = new Int32Array(capacity)
		free.set(this._free)
		this._free = free
		this._capacity = capacity
	}
}

export const EVENT_HEAP = {
	evt,
}

import { describe, expect, it } from "vitest"
import { EVT, EventHeap } from "./event-heap"

describe("EventHeap", () => {
	it("returns events in ascending time order with all payload fields intact", () => {
		const heap = new EventHeap(2)
		const out = new Int32Array(4)

		heap.enqueue(30, EVT.BATTLE, 9, 8, 7, 6, 3.5)
		heap.enqueue(10, EVT.WAR, 1, 2, 3, 4, 1.5)
		heap.enqueue(20, EVT.REGENCY, 5, 6, 7, 8, 2.5)

		expect(heap.peekTime()).toBe(10)
		expect(heap.peekType()).toBe(EVT.WAR)
		heap.peekData(out)
		expect(Array.from(out)).toEqual([1, 2, 3, 4])
		expect(heap.peekTime2()).toBe(1.5)

		heap.dequeue()
		expect(heap.peekTime()).toBe(20)
		expect(heap.peekType()).toBe(EVT.REGENCY)
		heap.peekData(out)
		expect(Array.from(out)).toEqual([5, 6, 7, 8])

		heap.dequeue()
		expect(heap.peekTime()).toBe(30)
		expect(heap.peekType()).toBe(EVT.BATTLE)
		heap.peekData(out)
		expect(Array.from(out)).toEqual([9, 8, 7, 6])
		expect(heap.peekTime2()).toBe(3.5)
	})

	it("grows beyond its initial capacity and handles empty dequeues", () => {
		const heap = new EventHeap(1)

		heap.enqueue(2, EVT.TAX, 1)
		heap.enqueue(1, EVT.CENSUS, 2)
		heap.enqueue(3, EVT.DIPLOMACY, 3)

		expect(heap.size).toBe(3)
		expect(heap.isEmpty()).toBe(false)

		heap.dequeue()
		heap.dequeue()
		heap.dequeue()
		heap.dequeue()

		expect(heap.size).toBe(0)
		expect(heap.isEmpty()).toBe(true)
	})
})

import { describe, expect, it } from "vitest"
import { BUCKET_QUEUE } from "@/model/shared/bucket-queue"
import { LAND_ELIGIBILITY } from "@/model/society/infrastructure/trade/routing/land/eligibility"
import { ROUTE_TUNING } from "@/model/society/infrastructure/trade/routing/route-tuning"

describe("route bucket queue", () => {
	it("preserves queue order after a queued distance decreases", () => {
		const distance = new Float32Array([0, 4, 3])
		const queue = BUCKET_QUEUE.create({ distance, bucketCount: 5 })
		queue.push(0)
		expect(queue.pop()).toBe(0)
		queue.push(1)
		queue.push(2)
		distance[1] = 1
		queue.push(1)
		expect(queue.pop()).toBe(1)
		expect(queue.pop()).toBe(2)
		expect(queue.pop()).toBe(-1)
		expect(queue.size).toBe(0)
	})

	it("wraps buckets and clears entries left by early termination", () => {
		const distance = new Float32Array([0, 44, 45, 88])
		const queue = BUCKET_QUEUE.create({ distance, bucketCount: 45 })
		queue.push(0)
		expect(queue.pop()).toBe(0)
		queue.push(1)
		expect(queue.pop()).toBe(1)
		queue.push(2)
		queue.push(3)
		expect(queue.pop()).toBe(2)
		queue.clear()
		expect(queue.pop()).toBe(-1)
		distance[1] = 0
		queue.push(1)
		expect(queue.pop()).toBe(1)
		expect(queue.size).toBe(0)
	})

	it("has enough buckets for every scaled land and sea edge cost", () => {
		const { search, land, sea } = ROUTE_TUNING
		expect(search.landBucketCount).toBe(
			Math.max(land.newEdgeCost, land.existingEdgeCost) * search.costScale + 1,
		)
		for (const from of [0, sea.nearCoastPenalty, sea.coastalPenalty]) {
			for (const to of [0, sea.nearCoastPenalty, sea.coastalPenalty]) {
				for (const base of [sea.newEdgeCost, sea.existingEdgeCost]) {
					const cost = (base + (from + to) / 2) * search.costScale
					expect(Number.isInteger(cost)).toBe(true)
					expect(cost).toBeGreaterThan(0)
					expect(cost).toBeLessThan(search.seaBucketCount)
				}
			}
		}
	})
})

describe("route land eligibility", () => {
	it("excludes impassable regions and separates landmark/cluster pairs", () => {
		const groupIds = LAND_ELIGIBILITY.computeGroupIds({
			state: {
				P: 3,
				era: "lateMedieval",
				desolate: new Uint8Array(3),
				stateless: new Uint8Array(3),
				regionProvince: new Int32Array([0, 1, 2, -1, 0, 1]),
				regionAdjOffset: new Int32Array(7),
				regionAdjList: new Int32Array(),
				regionIsLand: new Uint8Array(6),
				r_xyz: new Float32Array(18),
				landmarks: {
					regionLandmark: new Int32Array([0, 0, 1, 1, 0, -1]),
					type: new Uint8Array(2),
					size: new Int32Array(2),
					count: 2,
				},
			},
			landPassable: new Uint8Array([1, 1, 1, 1, 0, 1]),
			provinceClusters: new Int32Array([0, 1, 0]),
		})
		expect(Array.from(groupIds)).toEqual([0, 1, 6, -1, -1, -1])
	})
})

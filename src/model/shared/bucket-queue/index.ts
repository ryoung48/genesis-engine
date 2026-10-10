import type {
	BucketQueue,
	CreateBucketQueueParams,
} from "@/model/shared/bucket-queue/types"

function create({
	distance,
	bucketCount,
}: CreateBucketQueueParams): BucketQueue {
	const buckets = Array.from({ length: bucketCount }, (): number[] => [])
	const heads = new Int32Array(bucketCount)
	let cursor = 0
	let size = 0

	return {
		get size() {
			return size
		},
		clear() {
			for (const bucket of buckets) bucket.length = 0
			heads.fill(0)
			cursor = 0
			size = 0
		},
		push(node) {
			const key = distance[node]
			buckets[key % bucketCount].push(node, key)
			size++
		},
		pop() {
			while (size > 0) {
				const index = cursor % bucketCount
				const bucket = buckets[index]
				if (heads[index] < bucket.length) {
					const node = bucket[heads[index]++]
					const key = bucket[heads[index]++]
					size--
					if (distance[node] === key) return node
				} else {
					bucket.length = 0
					heads[index] = 0
					cursor++
				}
			}
			return -1
		},
	}
}

export const BUCKET_QUEUE = { create }

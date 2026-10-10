export interface BucketQueue {
	readonly size: number
	clear: () => void
	push: (node: number) => void
	pop: () => number
}

export interface CreateBucketQueueParams {
	distance: Float32Array
	bucketCount: number
}

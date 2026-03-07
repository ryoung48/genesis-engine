interface PathSegment {
	path: [number, number][]
}

interface CoastSegment extends PathSegment {
	idx: number
}

interface LakeSegment extends CoastSegment {
	border: boolean
}

export interface RegionSegment extends PathSegment {
	r: number
}

export interface Display {
	islands: Record<number, CoastSegment>
	lakes: Record<number, LakeSegment>
}

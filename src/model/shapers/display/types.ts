interface PathSegment {
	path: [number, number][]
}

export interface DisplayIcon {
	type: string
	x: number
	y: number
}

export interface CoastSegment extends PathSegment {
	idx: number
	depth: number
}

export interface RegionSegment extends PathSegment {
	r: number
}

export interface Display {
	islands: Record<number, CoastSegment>
	lakes: Record<number, CoastSegment>
	icons: DisplayIcon[]
}

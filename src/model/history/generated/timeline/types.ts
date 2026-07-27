export type Timeline<T> = Array<{ time: number; value: T }>

export interface ReadTimelineParams<T> {
	timeline: Timeline<T>
	defaultValue: T
	time: number
}

export interface WriteTimelineParams<T> {
	timeline: Timeline<T>
	time: number
	value: T
}

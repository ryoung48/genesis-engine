export type ViewState = "start" | "loading" | "complete" | "names" | "orogen"

export interface LoadingStep {
	name: string
	progress: number
}

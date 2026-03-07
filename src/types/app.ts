export type ViewState = "start" | "loading" | "complete" | "names"

export interface LoadingStep {
	name: string
	progress: number
}

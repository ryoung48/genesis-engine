export interface OutputPathParams {
	env: Record<string, string | undefined>
	years: number
	kind: "report" | "pipeline"
}

export type MarkdownCell = string | number | null
export interface MarkdownTableParams {
	headers: string[]
	rows: MarkdownCell[][]
}

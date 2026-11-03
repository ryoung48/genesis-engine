import type { BenchRequestParams } from "@/ui/bench/request/types"

async function json<T>({ url, signal }: BenchRequestParams): Promise<T> {
	const response = await fetch(url, { signal })
	if (!response.ok) throw new Error(await response.text())
	return response.json()
}
export const BENCH_REQUEST = { json }

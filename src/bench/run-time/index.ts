function parse(timestamp: string): number {
	return Date.parse(
		timestamp.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/, "T$1:$2:$3.$4Z"),
	)
}
export const BENCH_RUN_TIME = { parse }

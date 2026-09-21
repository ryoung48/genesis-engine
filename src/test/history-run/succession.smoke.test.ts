import { afterEach, expect, it, vi } from "vitest"
import type { HistoryState as RecordState } from "@/model/history/record/types"
import { SUCCESSION } from "@/model/history/sim/engine/events/succession"
import type { HistoryState as EngineState } from "@/model/history/sim/engine/state/types"
import { HISTORY_RUN } from "@/test/history-run"
import { SUCCESSION_AUDIT } from "@/test/history-run/succession-audit"
import type { AuditTally } from "@/test/history-run/succession-audit/types"
import { TITLE_INVARIANTS } from "@/test/history-run/title-invariants"

const SEEDS = [14963991, 7, 123]

afterEach(() => vi.restoreAllMocks())

function runAudited(seed: number): {
	tally: AuditTally
	engine: EngineState
	record: RecordState
} {
	const tally: AuditTally = new Map()
	const real = SUCCESSION.runSuccession
	vi.spyOn(SUCCESSION, "runSuccession").mockImplementation((params) => {
		const snapshot = SUCCESSION_AUDIT.before({
			state: params.state,
			province: params.province,
			leaderIdx: params.leaderIdx,
		})
		real(params)
		if (snapshot)
			SUCCESSION_AUDIT.after({ state: params.state, snapshot, tally })
	})
	let last: { engine: EngineState; record: RecordState } | null = null
	HISTORY_RUN.run({
		...HISTORY_RUN.optionsFromEnv({ env: process.env, log: () => undefined }),
		seed,
		numPoints: 20000,
		years: 25,
		onYear: (params) => {
			TITLE_INVARIANTS.check(params)
			last = { engine: params.engine, record: params.record }
		},
	})
	vi.restoreAllMocks()
	if (!last) throw new Error("History did not run")
	const { engine, record } = last
	return { tally, engine, record }
}

it("audits every succession and title change over 25 years", () => {
	const total: AuditTally = new Map()
	for (const seed of SEEDS) {
		const { tally, engine, record } = runAudited(seed)
		SUCCESSION_AUDIT.checkTitleChains({ engine, record })
		for (const [key, count] of tally)
			total.set(key, (total.get(key) ?? 0) + count)
	}
	process.stdout.write(
		`succession audit ${JSON.stringify(Object.fromEntries([...total].sort()))}\n`,
	)
	const count = (key: string): number => total.get(key) ?? 0
	expect(count("successions")).toBeGreaterThan(300)
	expect(count("heir:child")).toBeGreaterThan(count("successions") * 0.6)
	expect(count("heir:sibling")).toBeGreaterThan(0)
	expect(
		count("divided:partition") + count("divided:confederate"),
	).toBeGreaterThan(0)
	expect(count("regency")).toBeGreaterThan(0)
	expect(
		(count("noheir:vassal") + count("noheir:sovereign")) / count("successions"),
	).toBeLessThan(0.05)
	expect(count("law:single_heir")).toBe(0)
}, 3_600_000)

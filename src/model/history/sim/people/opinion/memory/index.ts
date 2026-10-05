import type {
	MemoryAtParams,
	OpinionMemoryReason,
} from "@/model/history/sim/people/opinion/memory/types"

const DURATION_YEARS = 10

// Transport codes: a reason's code is its position here.
const REASONS: readonly OpinionMemoryReason[] = [
	"aid",
	"abandonment",
	"attack",
	"usurpation",
	"grant",
]
const VALUES: Record<OpinionMemoryReason, number> = {
	aid: 15,
	abandonment: -20,
	attack: -25,
	usurpation: -40,
	grant: 15,
}

function codeOf(reason: OpinionMemoryReason): number {
	const code = REASONS.indexOf(reason)
	if (code < 0) throw new Error(`Unknown opinion memory reason "${reason}"`)
	return code
}

function reasonOf(code: number): OpinionMemoryReason {
	const reason = REASONS[code]
	if (reason === undefined)
		throw new Error(`Unknown opinion memory reason code ${code}`)
	return reason
}

function expired({ memory, time }: MemoryAtParams): boolean {
	return time - memory.start >= DURATION_YEARS
}

// Full strength when it happens, fading linearly to nothing; 0 before it.
function contribution({ memory, time }: MemoryAtParams): number {
	if (time < memory.start) return 0
	return (
		VALUES[memory.reason] *
		Math.max(0, 1 - (time - memory.start) / DURATION_YEARS)
	)
}

export const OPINION_MEMORY = {
	reasons: REASONS,
	codeOf,
	reasonOf,
	expired,
	contribution,
}

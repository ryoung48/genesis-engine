import type {
	MemoryAtParams,
	OpinionMemoryReason,
	OpinionMemorySlot,
} from "@/model/history/sim/people/opinion/memory/types"

const DURATION_YEARS = 10

// Transport codes: a reason's code is its position here.
const REASONS: readonly OpinionMemoryReason[] = [
	"aid",
	"abandonment",
	"attack",
	"usurpation",
	"grant",
	"coronation_uncrowned",
	"coronation_humble",
	"coronation_lavish",
	"coronation_magnificent",
]
const VALUES: Record<OpinionMemoryReason, number> = {
	aid: 15,
	abandonment: -20,
	attack: -25,
	usurpation: -40,
	grant: 15,
	coronation_uncrowned: -20,
	coronation_humble: -10,
	coronation_lavish: 10,
	coronation_magnificent: 20,
}
const SLOTS: Record<OpinionMemoryReason, OpinionMemorySlot> = {
	aid: "aid",
	abandonment: "abandonment",
	attack: "attack",
	usurpation: "usurpation",
	grant: "grant",
	coronation_uncrowned: "coronation",
	coronation_humble: "coronation",
	coronation_lavish: "coronation",
	coronation_magnificent: "coronation",
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

function slotOf(reason: OpinionMemoryReason): OpinionMemorySlot {
	return SLOTS[reason]
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
	slotOf,
	expired,
	contribution,
}

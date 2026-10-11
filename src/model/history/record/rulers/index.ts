import type {
	InitializeNamesParams,
	NameContext,
	RulerCommentParams,
	RulerNames,
	RulerNamesParams,
	RulerPayloadParams,
	RulerRef,
} from "@/model/history/record/rulers/types"
import type { HistoryRecord } from "@/model/history/record/types"
import type { Ruler } from "@/model/history/world-frame/types"

const contexts = new WeakMap<HistoryRecord, NameContext>()

function initialize({ record, generator }: InitializeNamesParams): void {
	contexts.set(record, { generator, cache: new Map() })
}

function context(record: HistoryRecord): NameContext {
	const result = contexts.get(record)
	if (!result) throw new Error("Ruler names have no world context")
	return result
}

// Names resolve from the ruler's own origin provinces, never from the realm
// that holds them now, so a ruler copied onto another throne keeps its name.
function names({ record, ref }: RulerNamesParams): RulerNames {
	const resolved = context(record)
	const cached = resolved.cache.get(ref.rulerId)
	if (cached) return cached
	const named = resolved.generator.ruler({
		province: ref.nameOrigin,
		nameSeed: ref.nameSeed,
	})
	const result = {
		name: named.name,
		female: named.female,
		house:
			ref.dynasty < 0
				? null
				: resolved.generator.dynasty({
						dynastyIdx: ref.dynasty,
						province: ref.dynastyOrigin,
					}),
	}
	resolved.cache.set(ref.rulerId, result)
	return result
}

function refOf(payload: Record<string, unknown>): RulerRef | null {
	return typeof payload.rulerId === "number"
		? {
				rulerId: payload.rulerId,
				nameSeed: payload.nameSeed as number,
				nameOrigin: payload.nameOrigin as number,
				sex: payload.sex as number,
				dynasty: payload.dynasty as number,
				dynastyOrigin: payload.dynastyOrigin as number,
			}
		: null
}

function ruler({ record, payload }: RulerPayloadParams): Ruler {
	const ref = refOf(payload)
	if (!ref)
		return {
			name: payload.name as string,
			dynasty: (payload.dynasty as string | undefined) ?? null,
		}
	let resolved: RulerNames | null = null
	return {
		get name() {
			resolved ??= names({ record, ref })
			return resolved.name
		},
		get dynasty() {
			resolved ??= names({ record, ref })
			return resolved.house
		},
	}
}

// A simulated ruler's payload with its resolved name, house and sex.
function payload({
	record,
	payload,
}: RulerPayloadParams): Record<string, unknown> {
	const ref = refOf(payload)
	if (!ref) return payload
	const named = names({ record, ref })
	return {
		...payload,
		name: named.name,
		dynasty: named.house,
		female: named.female,
	}
}

function comment({ record, comment }: RulerCommentParams): string | null {
	if (typeof comment === "string") return comment
	if (comment === null) return null
	const named = comment.ruler
		? names({ record, ref: comment.ruler }).name
		: null
	const late = comment.late ? names({ record, ref: comment.late }).name : null
	if (comment.cause === "partition")
		return `Split from ${comment.nation} in the partition of ${late ? `${late}'s` : "the late ruler's"} realm${named ? `, under ${named}` : ""}`
	if (comment.cause === "interregnum")
		return `Broke away from ${comment.nation} in the interregnum after ${late ? `${late}'s` : "the late ruler's"} death${named ? `, under ${named}` : ""}`
	return `Revolted against ${comment.nation} (${comment.cause}${named ? `, for ${named}` : ""})${comment.throne ? " to seize the throne" : ""}`
}

export const RULER_NAMES = {
	initialize,
	names,
	refOf,
	ruler,
	payload,
	comment,
}

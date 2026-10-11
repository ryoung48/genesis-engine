import type {
	AppendTimingParams,
	AttachTimingParams,
	MeasureTimingParams,
	RecordTimingParams,
	StageTiming,
} from "@/model/shared/timing/types"

function append({ stage, timings, ms, children }: AppendTimingParams): void {
	timings?.push({ Stage: stage, ms, children })
}

function record({ stage, timings, startedAt }: RecordTimingParams): void {
	append({ stage, timings, ms: performance.now() - startedAt, children: [] })
}

function measure<T>({ stage, timings, fn }: MeasureTimingParams<T>): T {
	if (!timings) return fn()
	const startedAt = performance.now()
	try {
		return fn()
	} finally {
		record({ stage, timings, startedAt })
	}
}

function attach({ timings, stage, children }: AttachTimingParams): void {
	const entry = timings.find((entry) => entry.Stage === stage)
	if (entry) entry.children.push(...children)
}

function flatten(timings: StageTiming[]): StageTiming[] {
	return timings.flatMap((entry) => [entry, ...flatten(entry.children)])
}

export const TIMING = { append, record, measure, attach, flatten }

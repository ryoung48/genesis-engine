import { RULER_NAMES } from "@/model/history/record/rulers"
import type { HistoryRecord } from "@/model/history/record/types"
import type { WorldFrame } from "@/model/history/world-frame/types"
import { ANCHORS } from "@/model/people/anchors"
import type { AnchorIndex } from "@/model/people/anchors/types"
import type {
	PeopleStore,
	SnappedFrameParams,
	StoreOfParams,
} from "@/model/people/store/types"
import { TIME } from "@/model/shared/time"

const FRAME_STEP = 25 * TIME.constants.yearMS
const stores = new WeakMap<HistoryRecord, PeopleStore>()

function create(record: HistoryRecord): PeopleStore {
	return {
		record,
		worldSeed: RULER_NAMES.seed(record),
		horizonMs: record.maxTimeMs,
		generator: RULER_NAMES.generator(record),
		context: null,
		index: null,
		stubs: new Map(),
		chains: new Map(),
		claims: new Map(),
		holders: new Map(),
		seats: new Map(),
		rings: new Map(),
		seeded: new Set(),
		pairs: new Set(),
		tiers: new Map(),
		depth: 0,
		baseChains: new Map(),
		kin: new Map(),
		marriages: new Map(),
		names: new Map(),
		houses: new Map(),
		builds: { l1: new Set(), l2: new Set(), l3: new Set() },
	}
}

function of({ record }: StoreOfParams): PeopleStore {
	const existing = stores.get(record)
	if (existing && existing.horizonMs === record.maxTimeMs) return existing
	const store = create(record)
	stores.set(record, store)
	return store
}

function index(store: PeopleStore): AnchorIndex {
	store.index ??= ANCHORS.build({
		record: store.record,
		worldSeed: store.worldSeed,
	})
	return store.index
}

function reset({ record }: StoreOfParams): PeopleStore {
	stores.delete(record)
	return of({ record })
}

function snappedFrame({
	store,
	timeMs,
}: SnappedFrameParams): WorldFrame | null {
	if (!store.context) return null
	const snapped = Math.floor(timeMs / FRAME_STEP) * FRAME_STEP
	return store.context.frameAt(
		Math.min(store.record.maxTimeMs, Math.max(store.record.minTimeMs, snapped)),
	)
}

function resetBuilds(store: PeopleStore): void {
	store.builds.l1.clear()
	store.builds.l2.clear()
	store.builds.l3.clear()
}

export const PEOPLE_STORE = { of, reset, index, resetBuilds, snappedFrame }

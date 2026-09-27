import type { HistoryState } from "@/model/history/record/types"
import type {
	JournalDeath,
	JournalTransaction,
} from "@/model/history/sim/engine/journal/types"
import type { EngineNote } from "@/model/history/sim/engine/state/types"
import type { LanguageNames } from "@/model/society/language/names"
import type { SerializedGenesisWorld } from "@/model/worker-protocol/types"

export interface ActiveTie {
	kind: "alliance" | "rival" | "vassal" | "colony" | "union"
	firstId: number
	secondId: number
}

export interface RebelWar {
	attackerRoot: number
	defenderRoot: number
}

export interface RebelNoteReasons {
	revolts: Map<number, string>
	outcomes: Map<number, string>
	touchedRoots: Set<number>
}

export interface ScanRebelNotesParams {
	translator: ProceduralTranslator
	transaction: JournalTransaction
}

export interface RebelWarOfParams {
	translator: ProceduralTranslator
	root: number
}

export interface ProceduralTranslator {
	state: HistoryState
	world: SerializedGenesisWorld
	names: LanguageNames
	parent: Int32Array
	owner: Int32Array
	controller: Int32Array
	occupation: Int32Array
	rebelWars: Map<number, RebelWar>
	children: Set<number>[]
	identityByRoot: Map<number, number>
	rawColors: Array<[number, number, number]>
	relationCells: Map<number, number>
	relationColumns: Map<number, Set<number>>
	activeTies: Map<number, ActiveTie>
	// Marriage alliances by province pair, ended when their alliance ends.
	royalMarriages: Map<number, RoyalMarriage>
	warCoalitions: Map<number, { attackers: Set<number>; defenders: Set<number> }>
	ownedCount: number[]
	stateless: Uint8Array
}

export interface CreateTranslatorParams {
	state: HistoryState
	world: SerializedGenesisWorld
}

export interface AppendJournalParams {
	translator: ProceduralTranslator
	transactions: JournalTransaction[]
}

export interface ApplyTransactionParams {
	translator: ProceduralTranslator
	transaction: JournalTransaction
}

export interface DescendantsParams {
	children: Set<number>[]
	province: number
}

export interface IdentityForRootParams {
	translator: ProceduralTranslator
	root: number
	timeMs: number
}

export interface ProjectTieParams {
	translator: ProceduralTranslator
	x: number
	y: number
	value: number
}

export interface UpdateTiesParams {
	translator: ProceduralTranslator
	pairs: Set<number>
	timeMs: number
}

export interface AppendNoteParams {
	translator: ProceduralTranslator
	note: JournalTransaction["notes"][number]
	timeMs: number
	coalition: JournalTransaction["coalitions"][number] | null
}

export interface RoyalMarriage {
	firstId: number
	secondId: number
}

export interface RulerDeathParams {
	translator: ProceduralTranslator
	death: JournalDeath
}

export interface PersonNameParams {
	translator: ProceduralTranslator
	person: number
}

export interface ContributionsParams {
	translator: ProceduralTranslator
	data: EngineNote["data"]
}

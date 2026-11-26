import { DEPOSIT_CONFIG } from "@/model/geography/terrain/deposit-config"
import type {
	HostTables,
	HostTerm,
	RockShares,
} from "@/model/geography/terrain/deposits/hosts/types"
import { ROCKS } from "@/model/geography/terrain/rocks"
import type { RockKind } from "@/model/geography/terrain/rocks/types"

const C = DEPOSIT_CONFIG
const COVER_KINDS: readonly RockKind[] = [
	"sandstone",
	"shale",
	"limestone",
	"salt",
]
const BARED_COVER = 0.25
const BARED_YOUNG = 0.3

function sum(s: RockShares, kinds: readonly RockKind[]): number {
	let total = 0
	for (const kind of kinds) total += s.kind[kind]
	return total
}

function or(strong: number, rest: number): number {
	return strong + (1 - strong) * rest
}

function lookup(
	table: Readonly<Record<string, number>>,
	fallback: number,
	s: RockShares,
): number {
	let total = 0
	for (const kind of ROCKS.kinds) {
		if (kind === "sea") continue
		total += s.kind[kind] * (table[kind] ?? fallback)
	}
	return total
}

const FORMULAS: Record<HostTerm, (s: RockShares) => number> = {
	bared: (s) => s.bared,
	young: (s) => s.young,
	epithermal: (s) => or(s.kind.volcanic, s.bared),
	orogenicGold: (s) =>
		or(sum(s, ["slate", "gneiss", "greenstone"]), 0.8 * s.bared),
	vms: (s) =>
		or(
			sum(s, ["volcanic", "basalt", "ophiolite", "greenstone", "slate"]),
			0.4 * s.bared,
		),
	skarn: (s) => or(sum(s, ["granite", "limestone"]), 0.35 * s.bared),
	mvtRock: (s) => 0.6 * s.kind.limestone + 0.4 * s.cover,
	sedex: (s) =>
		or(s.kind.shale + 0.6 * s.kind.sandstone + 0.4 * s.kind.limestone, 0.1),
	tin: (s) => or(s.kind.granite, 0.5 * s.bared),
	magmatic: (s) => or(0.7 * s.kind.basalt, s.bared),
	nativeCopper: (s) => or(s.kind.basalt, 0.3),
	kimberlite: (s) => or(s.base, 0.5),
	greenstone: (s) => s.kind.greenstone,
	bifKeel: (s) => Math.min(1, 2.2 * s.kind.greenstone),
	bifBasin: (s) =>
		Math.min(1, sum(s, ["shield", "slate", "gneiss"]) + 0.5 * s.cover),
	ironVein: (s) =>
		or(
			Math.min(
				1,
				s.kind.limestone +
					s.kind.slate +
					0.5 * s.kind.gneiss +
					0.4 * s.kind.volcanic,
			),
			0.45 * s.bared,
		),
	ioa: (s) =>
		or(Math.min(1, s.kind.volcanic + 0.7 * s.kind.granite), 0.4 * s.bared),
	reef: (s) => s.cover + 0.6 * s.kind.shield,
	petroleum: (s) => s.cover + s.young + 0.1 * s.base,
	bitumen: (s) => s.cover + 0.5 * s.young,
	oilShaleBed: (s) =>
		s.kind.shale +
		0.6 * s.kind.limestone +
		0.3 * (s.kind.sandstone + s.kind.salt + s.young),
	coal: (s) =>
		s.kind.sandstone + s.kind.shale + 0.35 * s.kind.limestone + 0.5 * s.young,
	ironstone: (s) => s.cover + 0.4 * s.young,
	pegmatite: (s) =>
		or(s.kind.granite + s.kind.gneiss + 0.5 * s.kind.slate, 0.4 * s.bared),
	emeraldPegmatite: (s) =>
		Math.min(
			1,
			3 * (s.kind.ophiolite + s.kind.greenstone) + 0.3 * s.kind.slate,
		),
	emeraldShale: (s) => Math.min(1, 2 * s.kind.shale),
	corundum: (s) => or(s.kind.gneiss + s.kind.slate, 0.3 * s.bared),
	lapis: (s) =>
		Math.min(1, 2 * s.kind.granite) *
		or(s.kind.gneiss + s.kind.slate + s.kind.limestone, 0.2),
	basaltGems: (s) => Math.min(1, 1.5 * s.kind.basalt + 0.3 * s.young),
	amethyst: (s) => Math.min(1, 1.2 * s.kind.basalt),
	opal: (s) =>
		Math.min(
			1,
			1.2 * (s.kind.sandstone + 0.7 * s.kind.shale) + 0.4 * s.kind.volcanic,
		),
	garnet: (s) =>
		Math.min(1, s.kind.gneiss + 0.7 * s.kind.slate + 0.3 * s.kind.shield),
	stone: (s) =>
		sum(s, [
			"limestone",
			"sandstone",
			"granite",
			"gneiss",
			"shield",
			"greenstone",
			"basalt",
			"volcanic",
			"ophiolite",
			"slate",
		]),
	stoneHere: (s) => (1 - s.young) * (1 - s.kind.shale - s.kind.salt),
	marble: (s) =>
		Math.min(1, 1.5 * (s.kind.gneiss + s.kind.slate) + 0.3 * s.kind.limestone),
	clay: (s) => 1.1 * s.young + 0.6 * s.kind.shale,
	saltBed: (s) => Math.min(1, 3 * s.kind.salt),
	saltFlats: (s) => 0.5 + 0.5 * s.young,
	bogIron: (s) => 0.35 + 0.5 * (s.young + s.kind.sandstone),
	ironLaterite: (s) => lookup(C.ironHost.host, C.ironHost.default, s),
	saltpeter: (s) => Math.min(1, s.kind.limestone + 0.6 * s.young),
	alumVolcanic: (s) => Math.min(1, 2 * s.kind.volcanic),
	alumShale: (s) => s.kind.shale,
	mercury: (s) =>
		Math.min(1, s.kind.volcanic + s.kind.ophiolite + 0.5 * s.kind.slate),
	amber: (s) => Math.min(1, s.young + s.kind.shale + s.kind.sandstone),
}

function shares(code: number): RockShares {
	const kind = Object.fromEntries(
		ROCKS.kinds.map((name) => [name, ROCKS.code[name] === code ? 1 : 0]),
	) as Record<RockKind, number>
	const cover = sum({ kind } as RockShares, COVER_KINDS)
	const young = kind.young
	const base = Math.max(0, 1 - cover - young)
	return {
		kind,
		cover,
		young,
		base,
		bared: base + BARED_COVER * cover + BARED_YOUNG * young,
	}
}

function buildTables(): HostTables {
	const terms = Object.keys(FORMULAS) as HostTerm[]
	const tables = Object.fromEntries(
		terms.map((term) => [term, new Float32Array(ROCKS.kinds.length)]),
	) as HostTables
	for (let code = 0; code < ROCKS.kinds.length; code++) {
		if (ROCKS.kinds[code] === "sea") continue
		const s = shares(code)
		for (const term of terms) tables[term][code] = FORMULAS[term](s)
	}
	return tables
}

export const HOSTS = { tables: buildTables() }

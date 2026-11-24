import type {
	CrustRaster,
	OrogenyKind,
	RecordOrogenyParams,
	ThickenCoverParams,
} from "@/model/geography/tectonics/crust/types"

const TYPE = { OCEAN: 0, CONTINENT: 1, CRATON: 2, ARC: 3 } as const

const OROGENY = {
	NONE: 0,
	ANDEAN: 1,
	LARAMIDE: 2,
	URAL: 3,
	HIMALAYAN: 4,
	ARC: 5,
	RIFT: 6,
	TRANSPRESSION: 7,
	INTRAPLATE: 8,
} as const

const OROGENY_KINDS: readonly OrogenyKind[] = [
	"none",
	"andean",
	"laramide",
	"ural",
	"himalayan",
	"arc",
	"rift",
	"transpression",
	"intraplate",
]

const SIDE = { NONE: 0, UPPER: 1, LOWER: 2 } as const

const FLAG = {
	SUTURE: 2,
	FAILED_RIFT: 4,
	RIFT_MARGIN: 8,
	LIP: 16,
} as const

const VOLCANIC = { NONE: 0, TRACK: 1, LIP: 2 } as const

const GEO = {
	WAS_ARC: 1,
	FORELAND: 2,
	RIFT_BASIN: 4,
	OPHIOLITE: 8,
	SLAB_CHANGE: 16,
	SHELF: 32,
	EPEIRIC: 64,
} as const

function create(numCells: number): CrustRaster {
	const f32 = () => new Float32Array(numCells)
	const u8 = () => new Uint8Array(numCells)
	return {
		numCells,
		plate: new Int32Array(numCells),
		type: u8(),
		flags: u8(),
		formedAt: f32(),
		terrane: new Int16Array(numCells).fill(-1),
		oroType: u8(),
		oroWork: f32(),
		oroStart: f32(),
		oroLast: f32(),
		thickKm: f32(),
		beltU: f32(),
		beltReach: f32(),
		beltAt: f32(),
		beltSide: u8(),
		beltShear: new Int8Array(numCells),
		prevType: u8(),
		prevLast: f32(),
		prevU: f32(),
		prevReach: f32(),
		prevSide: u8(),
		prevShear: new Int8Array(numCells),
		rootKm: f32(),
		upliftKm: f32(),
		baseKm: f32(),
		rugged: f32(),
		prevRugged: f32(),
		volcType: u8(),
		volcAt: f32(),
		volcKm: f32(),
		volcSource: new Uint16Array(numCells),
		volcWornKm: f32(),
		geoFlags: u8(),
		coverKm: f32(),
		coverMaxKm: f32(),
		coverMaxAt: f32(),
		coverCarb: f32(),
		coverSalt: f32(),
		coverCoal: f32(),
		coverOrganic: f32(),
		exhumKm: f32(),
		unroofKm: f32(),
		floodMyr: f32(),
		floodLast: f32(),
		arcMyr: f32(),
		riftAt: f32(),
		shelfSea: u8(),
	}
}

function recordOrogeny({
	crust,
	cell,
	oroType,
	workKm,
	time,
	quietMyr,
}: RecordOrogenyParams): void {
	const was = crust.oroType[cell]
	if (was === OROGENY.NONE || time - crust.oroLast[cell] > quietMyr) {
		crust.oroStart[cell] = time
		crust.oroWork[cell] = 0
		crust.oroType[cell] = oroType
	} else if (
		(oroType > was || was === OROGENY.INTRAPLATE) &&
		oroType !== OROGENY.ARC &&
		oroType !== OROGENY.TRANSPRESSION &&
		oroType !== OROGENY.INTRAPLATE
	) {
		crust.oroType[cell] = oroType
	}
	crust.oroWork[cell] += workKm
	crust.oroLast[cell] = time
}

function thickenCover({
	crust,
	cell,
	thickenedKm,
	time,
	crustKm,
}: ThickenCoverParams): void {
	const cover = crust.coverKm[cell]
	if (!(cover > 0)) return
	const add = (cover * thickenedKm) / crustKm
	crust.coverKm[cell] = cover + add
	if (cover + add > crust.coverMaxKm[cell]) {
		crust.coverMaxKm[cell] = cover + add
		crust.coverMaxAt[cell] = time
	}
	crust.unroofKm[cell] -= add
}

export const CRUST = {
	TYPE,
	OROGENY,
	OROGENY_KINDS,
	SIDE,
	FLAG,
	VOLCANIC,
	GEO,
	create,
	recordOrogeny,
	thickenCover,
}

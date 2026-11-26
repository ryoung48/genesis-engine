import { describe, expect, it } from "vitest"
import { CRUST } from "@/model/geography/tectonics/crust"
import { RECORD } from "@/model/geography/terrain/deposits/record"
import type { RecordFields } from "@/model/geography/terrain/deposits/record/types"

const SEED = 77031
const HALF_LIFE_MYR = 160
const ARC_MYR = 20
const RATIO_TOLERANCE = 0.02
const MAX_FIELD = 1.2
const HISTORY_MYR = 2000

interface Arc {
	unroofKm: number
	formedAt: number
}

function arcPotential({ unroofKm, formedAt }: Arc): RecordFields {
	const crust = CRUST.create(1)
	crust.type[0] = CRUST.TYPE.ARC
	crust.arcMyr[0] = ARC_MYR
	crust.formedAt[0] = formedAt
	crust.unroofKm[0] = unroofKm
	crust.thickKm[0] = 30
	return RECORD.potential({ crust, seed: SEED, granite: new Float32Array(1) })
}

function porphyry(arc: Arc): number {
	return arcPotential(arc).porphyry[0]
}

describe("record potential", () => {
	it("shows a porphyry in the bared window and none once the arc is worn through", () => {
		const fresh = porphyry({ unroofKm: 0, formedAt: -100 })
		const worn = porphyry({ unroofKm: 8, formedAt: -100 })
		const gone = porphyry({ unroofKm: 30, formedAt: -100 })
		expect(fresh).toBeGreaterThan(0)
		expect(porphyry({ unroofKm: 6, formedAt: -100 })).toBeLessThan(fresh)
		expect(worn).toBe(0)
		expect(gone).toBe(0)
	})

	it("loses half a porphyry for each half-life of age", () => {
		const young = porphyry({ unroofKm: 0, formedAt: -300 })
		const old = porphyry({ unroofKm: 0, formedAt: -300 - HALF_LIFE_MYR })
		expect(old / young).toBeGreaterThan(0.5 * (1 - RATIO_TOLERANCE))
		expect(old / young).toBeLessThan(0.5 * (1 + RATIO_TOLERANCE))
	})

	it("caps age at the length of the record", () => {
		const capped = porphyry({ unroofKm: 0, formedAt: -HISTORY_MYR })
		const beyond = porphyry({ unroofKm: 0, formedAt: -3 * HISTORY_MYR })
		expect(beyond).toBe(capped)
	})

	it("keeps every field finite and within 0 to 1.2 on a mixed crust", () => {
		const n = 400
		const crust = CRUST.create(n)
		const types = [
			CRUST.TYPE.CONTINENT,
			CRUST.TYPE.CRATON,
			CRUST.TYPE.ARC,
			CRUST.TYPE.OCEAN,
		]
		const belts = Object.values(CRUST.OROGENY)
		for (let c = 0; c < n; c++) {
			crust.type[c] = types[c % types.length]
			crust.oroType[c] = belts[c % belts.length]
			crust.beltU[c] = (c % 10) / 10
			crust.beltReach[c] = 200
			crust.arcMyr[c] = (c * 7) % 60
			crust.formedAt[c] = -((c * 37) % 1900)
			crust.oroStart[c] = -((c * 53) % 1500)
			crust.oroLast[c] = -((c * 11) % 400)
			crust.unroofKm[c] = (c % 13) * 0.8
			crust.exhumKm[c] = (c % 17) * 0.7
			crust.thickKm[c] = 20 + (c % 25)
			crust.coverKm[c] = (c % 9) * 0.7
			crust.coverMaxKm[c] = (c % 9) * 0.9
			crust.coverMaxAt[c] = -((c * 29) % 500)
			crust.coverCarb[c] = (c % 5) / 5
			crust.coverSalt[c] = (c % 7) / 14
			crust.coverCoal[c] = (c % 4) / 8
			crust.coverOrganic[c] = (c % 6) / 6
			crust.terrane[c] = c % 12
		}
		const granite = Float32Array.from({ length: n }, (_, c) => (c % 5) / 5)
		const fields = RECORD.potential({ crust, seed: SEED, granite })
		for (const [name, field] of Object.entries(fields))
			for (let c = 0; c < n; c++) {
				expect(Number.isFinite(field[c]), `${name}[${c}]`).toBe(true)
				expect(field[c], `${name}[${c}]`).toBeGreaterThanOrEqual(0)
				if (name !== "coverNow") expect(field[c]).toBeLessThanOrEqual(MAX_FIELD)
			}
	})

	it("treats an active belt (last orogeny at 0) as age zero", () => {
		const crust = CRUST.create(2)
		for (const c of [0, 1]) {
			crust.type[c] = CRUST.TYPE.CONTINENT
			crust.oroType[c] = CRUST.OROGENY.ANDEAN
			crust.beltU[c] = 0.1
			crust.beltReach[c] = 200
			crust.arcMyr[c] = 20
			crust.formedAt[c] = -200
			crust.oroStart[c] = -30
			crust.thickKm[c] = 35
		}
		crust.oroLast[0] = 0
		crust.oroLast[1] = -200
		const fields = RECORD.potential({
			crust,
			seed: SEED,
			granite: new Float32Array(2),
		})
		expect(fields.porphyry[0]).toBeGreaterThan(fields.porphyry[1])
	})
})

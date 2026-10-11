import { expect, it } from "vitest"
import { GENDER_SYSTEM } from "@/model/history/sim/gender-system"
import { RELIGION_GENDER } from "@/model/history/sim/religion/gender"

const MALE = [26, 6, 10, 35, 8]
const EQUAL = [13, 1, 2, 2, 0]
const FLIP_RATE = 0.118
const WORLDS = 800
const RELIGIONS = 25
const COUNT = WORLDS * RELIGIONS
const SIGMAS = 4

// Smoothed weight of a male-dominated family preference for a religion type.
function familyMaleShare(type: number): number {
	const pooled = [...MALE, ...EQUAL].reduce((a, b) => a + b, 0)
	const total = MALE[type] + EQUAL[type]
	const row = (counts: number[]) => counts.reduce((a, b) => a + b, 0)
	return (MALE[type] + row(MALE) / pooled) / (total + 1)
}

// Many small worlds, each of religions of one type that are families of their
// own, so that nearby seeds do not stand in for independent draws.
function assign({ type, seed }: { type: number; seed: number }): Uint8Array {
	const result = new Uint8Array(COUNT)
	for (let world = 0; world < WORLDS; world++)
		result.set(
			RELIGION_GENDER.assign({
				religionTypes: new Uint8Array(RELIGIONS).fill(type),
				religionFamilies: Int32Array.from(
					{ length: RELIGIONS },
					(_, index) => index,
				),
				familyCount: RELIGIONS,
				seed: seed + world * 1013,
			}),
			world * RELIGIONS,
		)
	return result
}

it.each([
	0, 1, 2, 3, 4,
])("shares male-dominated religions of type %i at the CK3 rate", (type) => {
	const result = assign({ type, seed: 31 })
	let male = 0
	for (const preference of result)
		if (preference === RELIGION_GENDER.preference.MALE_DOMINATED) male++
	const family = familyMaleShare(type)
	const expected = family * (1 - FLIP_RATE) + (1 - family) * FLIP_RATE
	const sigma = Math.sqrt((expected * (1 - expected)) / COUNT)
	expect(Math.abs(male / COUNT - expected)).toBeLessThan(SIGMAS * sigma)
	expect(Array.from(assign({ type, seed: 31 }))).toEqual(Array.from(result))
})

it("keeps the religions of one family together except for the flipped ones", () => {
	let kept = 0
	for (let world = 0; world < WORLDS; world++) {
		const result = RELIGION_GENDER.assign({
			religionTypes: new Uint8Array(RELIGIONS).fill(0),
			religionFamilies: new Int32Array(RELIGIONS).fill(0),
			familyCount: 1,
			seed: 5 + world * 1013,
		})
		const counts = [0, 0]
		for (const preference of result) counts[preference]++
		kept += Math.max(...counts)
	}
	expect(kept / COUNT).toBeGreaterThan(1 - FLIP_RATE - 0.03)
})

it("forces patriarchy under male-dominated religions and splits the rest", () => {
	const cultures = 30000
	const religionGender = new Uint8Array([
		RELIGION_GENDER.preference.MALE_DOMINATED,
		RELIGION_GENDER.preference.EQUAL,
	])
	const systems = new Uint8Array(cultures).fill(
		GENDER_SYSTEM.cultureGenderSystem.MATRIARCHAL,
	)
	const cultureToReligion = Int32Array.from(
		{ length: cultures },
		(_, culture) => culture % 2,
	)
	const result = GENDER_SYSTEM.restrict({
		systems,
		cultureToReligion,
		religionGender,
		seed: 9,
	})
	const counts = [0, 0, 0]
	let patriarchalUnderMale = 0
	let maleCultures = 0
	for (let culture = 0; culture < cultures; culture++)
		if (cultureToReligion[culture] === 0) {
			maleCultures++
			if (result[culture] === GENDER_SYSTEM.cultureGenderSystem.PATRIARCHAL)
				patriarchalUnderMale++
		} else counts[result[culture]]++
	expect(patriarchalUnderMale).toBe(maleCultures)
	const equalCultures = cultures / 2
	for (const [system, share] of [0.14, 0.29, 0.57].entries()) {
		const sigma = Math.sqrt((share * (1 - share)) / equalCultures)
		expect(Math.abs(counts[system] / equalCultures - share)).toBeLessThan(
			SIGMAS * sigma,
		)
	}
})

it("leaves the systems alone without a religion preference", () => {
	const systems = new Uint8Array([0, 1, 2])
	expect(
		GENDER_SYSTEM.restrict({
			systems,
			cultureToReligion: new Int32Array([0, 0, 0]),
			religionGender: undefined,
			seed: 1,
		}),
	).toBe(systems)
})

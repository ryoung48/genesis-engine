import { describe, expect, it } from "vitest"
import { ATMOSPHERE } from "@/model/celestial/planet/environment/atmosphere"
import { RNG } from "@/model/shared/random/rng"

function rollProfiles(params: {
	sizeClass: number
	deviation: number
	classification: "tectonic" | "telluric"
	count: number
}) {
	const rng = RNG.createRng({ seed: 1 })
	const profiles = []
	for (let i = 0; i < params.count; i++) {
		const profile = ATMOSPHERE.codeToProfile({
			rng,
			atmosphereCode: 10,
			params: {
				chemistry: "water",
				sizeClass: params.sizeClass,
				deviation: params.deviation,
				hydrosphereCode: 0,
				gravityG: 1,
				classification: params.classification,
				isPrimaryWorld: false,
				starAgeGyr: 5,
				starSpectralClass: "G",
				starLuminosityClass: "V",
			},
		})!
		profiles.push(profile)
	}
	return profiles
}

function subtypeRank(subtype: string | undefined): number {
	return (
		["very thin", "thin", "standard", "dense", "very dense"].indexOf(
			subtype ?? "",
		) + 1
	)
}

describe("Exotic Atmosphere Subtype (book p. 86)", () => {
	it("reaches 'very dense' -- confirms the roll range covers the book's full table", () => {
		const profiles = rollProfiles({
			sizeClass: 8,
			deviation: 0,
			classification: "tectonic",
			count: 500,
		})
		expect(profiles.some((p) => p.subtype === "very dense")).toBe(true)
	})

	it("Size 2-4 DM-2 shifts the distribution lighter", () => {
		const small = rollProfiles({
			sizeClass: 3,
			deviation: 0,
			classification: "tectonic",
			count: 500,
		})
		const mid = rollProfiles({
			sizeClass: 8,
			deviation: 0,
			classification: "tectonic",
			count: 500,
		})
		const meanSmall =
			small.reduce((a, p) => a + subtypeRank(p.subtype), 0) / small.length
		const meanMid =
			mid.reduce((a, p) => a + subtypeRank(p.subtype), 0) / mid.length
		expect(meanSmall).toBeLessThan(meanMid)
	})

	it("the Size DM applies only to sizeClass 2-4, not sizeClass 5+", () => {
		// sizeClass 0-1 is excluded here: unrelated existing logic upstream of
		// this table forces those down to a plain "trace" atmosphere (code 1)
		// regardless of the exotic roll, so they never reach this table at all.
		const size5 = rollProfiles({
			sizeClass: 5,
			deviation: 0,
			classification: "tectonic",
			count: 500,
		})
		const size3 = rollProfiles({
			sizeClass: 3,
			deviation: 0,
			classification: "tectonic",
			count: 500,
		})
		const mean3 =
			size3.reduce((a, p) => a + subtypeRank(p.subtype), 0) / size3.length
		const mean5 =
			size5.reduce((a, p) => a + subtypeRank(p.subtype), 0) / size5.length
		expect(mean3).toBeLessThan(mean5)
	})

	it("Orbit less than HZCO-1 (deviation>=1.5) DM-2 shifts lighter; beyond HZCO+2 (deviation<=-1.5) DM+2 shifts heavier", () => {
		const close = rollProfiles({
			sizeClass: 8,
			deviation: 2,
			classification: "tectonic",
			count: 500,
		})
		const mid = rollProfiles({
			sizeClass: 8,
			deviation: 0,
			classification: "tectonic",
			count: 500,
		})
		const far = rollProfiles({
			sizeClass: 8,
			deviation: -2,
			classification: "tectonic",
			count: 500,
		})
		const meanClose =
			close.reduce((a, p) => a + subtypeRank(p.subtype), 0) / close.length
		const meanMid =
			mid.reduce((a, p) => a + subtypeRank(p.subtype), 0) / mid.length
		const meanFar =
			far.reduce((a, p) => a + subtypeRank(p.subtype), 0) / far.length
		expect(meanClose).toBeLessThan(meanMid)
		expect(meanFar).toBeGreaterThan(meanMid)
	})

	it("a runaway-greenhouse (telluric) world's exotic atmosphere trends heavier (DM+4)", () => {
		const normal = rollProfiles({
			sizeClass: 8,
			deviation: 0,
			classification: "tectonic",
			count: 500,
		})
		const telluric = rollProfiles({
			sizeClass: 8,
			deviation: 0,
			classification: "telluric",
			count: 500,
		})
		const meanNormal =
			normal.reduce((a, p) => a + subtypeRank(p.subtype), 0) / normal.length
		const meanTelluric =
			telluric.reduce((a, p) => a + subtypeRank(p.subtype), 0) / telluric.length
		expect(meanTelluric).toBeGreaterThan(meanNormal)
	})

	it("roll 12 keeps an exotic atmosphere with an occasionally corrosive irritant", () => {
		const profiles = rollProfiles({
			sizeClass: 8,
			deviation: 0,
			classification: "tectonic",
			count: 1000,
		})
		const occasional = profiles.find((profile) =>
			profile.hazards?.some((hazard) => "occasionallyCorrosive" in hazard),
		)
		expect(occasional?.type).toBe("exotic")
		expect(occasional?.code).toBe(10)
		expect(occasional?.subtype).toBe("very dense")
		expect(occasional?.hazards?.[0]).toMatchObject({
			kind: "gas mix",
			occasionallyCorrosive: true,
		})
		const hazard = occasional?.hazards?.[0]
		if (hazard && "occasionallyCorrosive" in hazard) {
			expect(hazard.severity).toBeGreaterThanOrEqual(7)
			expect(hazard.severity).toBeLessThanOrEqual(9)
			expect(hazard.persistence).toBeGreaterThanOrEqual(2)
			expect(hazard.persistence).toBeLessThanOrEqual(7)
		}
	})

	it("roll 6 gives particulates and roll 10 adds another taint", () => {
		const profiles = rollProfiles({
			sizeClass: 8,
			deviation: 0,
			classification: "tectonic",
			count: 2000,
		})
		expect(
			profiles.some(
				(profile) =>
					profile.hazards?.length === 1 &&
					profile.hazards[0]?.kind === "particulates",
			),
		).toBe(true)
		expect(
			profiles.some(
				(profile) =>
					(profile.hazards?.length ?? 0) >= 2 &&
					profile.hazards?.[0]?.kind === "particulates",
			),
		).toBe(true)
		expect(
			profiles.every((profile) => (profile.hazards?.length ?? 0) <= 3),
		).toBe(true)
	})

	it("pulsar radiation preserves another irritant", () => {
		let combined = false
		for (let seed = 1; seed <= 100; seed++) {
			const profile = ATMOSPHERE.codeToProfile({
				rng: RNG.createRng({ seed }),
				atmosphereCode: 7,
				params: {
					chemistry: "water",
					sizeClass: 8,
					deviation: 0,
					hydrosphereCode: 0,
					gravityG: 1,
					classification: "tectonic",
					isPrimaryWorld: false,
					starAgeGyr: 5,
					starSpectralClass: "NS",
					starLuminosityClass: "P",
				},
			})
			if (profile?.hazards?.some((hazard) => hazard.kind !== "radioactive")) {
				combined = true
				expect(
					profile.hazards.some((hazard) => hazard.kind === "radioactive"),
				).toBe(true)
				break
			}
		}
		expect(combined).toBe(true)
	})
})

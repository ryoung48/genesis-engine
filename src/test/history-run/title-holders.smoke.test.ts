import { readdirSync, readFileSync } from "node:fs"
import { expect, it } from "vitest"
import { STATE } from "@/model/history/sim/engine/state"
import { GOVERNMENT } from "@/model/history/sim/nations/government"
import { RULER } from "@/model/history/sim/ruler"
import { SUCCESSION_LAW } from "@/model/history/sim/succession-law"
import { RNG } from "@/model/shared/random/rng"
import { HISTORY_RUN } from "@/test/history-run"
import { DEFAULT_WORLD_PARAMS } from "@/ui/genesis/generation/defaults"

function buildState() {
	const seed = Number(process.env.TITLE_SEED ?? 14963991)
	const { engine: state } = HISTORY_RUN.createEngine({
		seed,
		era: "highMedieval",
		numPoints: Number(
			process.env.TITLE_POINTS ?? DEFAULT_WORLD_PARAMS.numPoints,
		),
	})
	STATE.validateLiveHierarchy({ state, context: "initial title grants" })
	return { state, seed }
}

it("grants titles to living ruler seats inside their realms", () => {
	const { state, seed } = buildState()
	const ownedSize = new Int32Array(state.P)
	for (const realm of state.sovereignCurrent) if (realm >= 0) ownedSize[realm]++
	const direct = [0, 0, 0, 0]
	const duchies = [0, 0, 0, 0]
	const anchored = [0, 0, 0, 0]
	const vassals = new Set<number>()
	const largeRealms = new Set<number>()
	for (let realm = 0; realm < state.P; realm++)
		if (ownedSize[realm] >= 25 && state.parentCurrent[realm] < 0)
			largeRealms.add(realm)
	for (let title = 0; title < state.titles.count; title++) {
		const holder = state.titles.holder[title]
		if (holder < 0) continue
		expect(
			state.leaderNameSeedCurrent[holder],
			`title ${title}`,
		).toBeGreaterThanOrEqual(0)
		const realm = state.sovereignCurrent[holder]
		expect(realm, `title ${title}`).toBeGreaterThanOrEqual(0)
		let inside = 0
		for (
			let i = state.titleMembers.offset[title];
			i < state.titleMembers.offset[title + 1];
			i++
		)
			if (state.sovereignCurrent[state.titleMembers.list[i]] === realm) inside++
		expect(inside * 2, `title ${title}`).toBeGreaterThan(
			state.titleMembers.offset[title + 1] - state.titleMembers.offset[title],
		)
		if (holder !== realm) vassals.add(holder)
		if (state.titles.tier[title] !== 2) continue
		const size = ownedSize[realm]
		const row = size <= 4 ? 0 : size <= 9 ? 1 : size <= 24 ? 2 : 3
		duchies[row]++
		if (state.titles.seat[title] === realm) anchored[row]++
		if (holder === realm) direct[row]++
	}
	for (let nation = 0; nation < state.P; nation++) {
		if (ownedSize[nation] === 0 || state.parentCurrent[nation] >= 0) continue
		if (GOVERNMENT.govFamilyOfIndex(state.governmentType[nation]) === "tribal")
			expect(state.successionLaw[nation]).toBe(0)
		expect(state.genderLaw[nation]).toBe(0)
	}
	for (const vassal of vassals) {
		const parent = state.parentCurrent[vassal]
		expect(parent, `vassal ${vassal}`).toBeGreaterThanOrEqual(0)
		expect(state.seatRank[parent], `vassal ${vassal}`).toBeGreaterThanOrEqual(
			state.seatRank[vassal],
		)
		let highest = -1
		for (let title = 0; title < state.titles.count; title++)
			if (
				state.titles.holder[title] === vassal &&
				(highest < 0 || state.titles.tier[title] > state.titles.tier[highest])
			)
				highest = title
		expect(highest).toBeGreaterThanOrEqual(0)
		expect(state.titles.seat[highest]).toBe(vassal)
	}
	const largeVassals = [...vassals].filter((vassal) =>
		largeRealms.has(state.sovereignCurrent[vassal]),
	).length
	process.stdout.write(
		`title holders ${JSON.stringify({ seed, direct, duchies, anchored, vassals: vassals.size, largeRealms: largeRealms.size, largeVassals })}\n`,
	)
	expect(vassals.size).toBeGreaterThan(0)
	expect(direct[2] / duchies[2]).toBeGreaterThanOrEqual(0.25)
	expect(direct[2] / duchies[2]).toBeLessThanOrEqual(0.45)
	expect(direct[3] / duchies[3]).toBeLessThanOrEqual(0.15)
	expect(largeVassals).toBeGreaterThan(0)
}, 3_600_000)

it("keeps a vassal ruler when the vassal breaks away", () => {
	const { state } = buildState()
	let vassal = -1
	for (let p = 0; p < state.P && vassal < 0; p++)
		if (state.leaderNameSeedCurrent[p] >= 0 && state.parentCurrent[p] >= 0)
			vassal = p
	expect(vassal).toBeGreaterThanOrEqual(0)
	const person = state.people?.holderOfSeat[vassal] ?? -1
	const nameSeed = state.leaderNameSeedCurrent[vassal]
	const dynasty = state.leaderDynCurrent[vassal]
	const idx = state.leaderRuntime.idx[vassal]
	const heap = state.heap.size
	const former = state.sovereignCurrent[vassal]
	expect(RULER.releaseMode({ state, seat: vassal })).toBe("keep")
	STATE.releaseProvince({
		state,
		p: vassal,
		rng: RNG.createRng({ seed: 5 }),
		leader: "keep",
	})
	expect(state.parentCurrent[vassal]).toBe(-1)
	expect(state.leaderNameSeedCurrent[vassal]).toBe(nameSeed)
	expect(state.leaderDynCurrent[vassal]).toBe(dynasty)
	expect(state.leaderRuntime.idx[vassal]).toBe(idx)
	expect(state.heap.size).toBe(heap)
	expect(state.people?.holderOfSeat[vassal] ?? -1).toBe(person)
	expect(state.sovereignCurrent[vassal]).toBe(vassal)
	expect(state.sovereignCurrent[vassal]).not.toBe(former)
	STATE.validateLiveHierarchy({ state, context: "vassal breakaway" })
	const tribal =
		GOVERNMENT.govFamilyOfIndex(state.governmentType[vassal]) === "tribal"
	expect(state.successionLaw[vassal]).toBe(
		tribal ? 0 : state.successionLaw[former],
	)
	expect(SUCCESSION_LAW.genderOf({ state, nation: vassal })).toBe(
		"male_preference",
	)
}, 3_600_000)

it("spawns a new ruler and dynasty for a released province without one", () => {
	const { state } = buildState()
	let province = -1
	for (let p = 0; p < state.P && province < 0; p++)
		if (
			!state.desolate[p] &&
			state.leaderNameSeedCurrent[p] < 0 &&
			state.parentCurrent[p] >= 0
		)
			province = p
	expect(province).toBeGreaterThanOrEqual(0)
	expect(RULER.releaseMode({ state, seat: province })).toBe("spawn")
	const dynasty = state.nextDynasty
	STATE.releaseProvince({
		state,
		p: province,
		rng: RNG.createRng({ seed: 6 }),
		leader: "spawn",
	})
	expect(state.leaderNameSeedCurrent[province]).toBeGreaterThanOrEqual(0)
	expect(state.leaderDynCurrent[province]).toBe(dynasty)
	expect(state.people?.holderOfSeat[province]).toBe(
		state.leaderNameSeedCurrent[province],
	)
	STATE.validateLiveHierarchy({ state, context: "released province" })
}, 3_600_000)

it("moves a displaced vassal ruler to the seat of its highest remaining title", () => {
	const { state } = buildState()
	const people = state.people
	if (!people) throw new Error("History has no people")
	const highest = (ruler: number): number => {
		let best = -1
		for (let title = 0; title < state.titles.count; title++)
			if (
				state.titles.holder[title] === ruler &&
				(best < 0 || state.titles.tier[title] > state.titles.tier[best])
			)
				best = title
		return best
	}
	const vassals: number[] = []
	for (let p = 0; p < state.P; p++)
		if (state.leaderNameSeedCurrent[p] >= 0 && state.parentCurrent[p] >= 0)
			vassals.push(p)
	let lost = -1
	let given = -1
	let taker = -1
	let loser = -1
	for (const candidate of vassals) {
		const top = highest(candidate)
		if (top < 0 || state.titles.seat[top] !== candidate) continue
		for (const other of vassals) {
			if (
				other === candidate ||
				state.sovereignCurrent[other] !== state.sovereignCurrent[candidate]
			)
				continue
			const otherTop = highest(other)
			if (
				otherTop >= 0 &&
				state.titles.tier[otherTop] < state.titles.tier[top]
			) {
				lost = top
				given = other
				taker = other
				loser = candidate
				break
			}
		}
		if (lost >= 0) break
	}
	expect(lost).toBeGreaterThanOrEqual(0)
	const takerPerson = people.holderOfSeat[taker]
	const loserPerson = people.holderOfSeat[loser]
	const target = state.titles.seat[lost]
	state.titles.holder[lost] = given
	RULER.reseat({ state, rulers: [loser, taker] })
	expect(state.leaderNameSeedCurrent[target]).toBe(takerPerson)
	expect(people.holderOfSeat[target]).toBe(takerPerson)
	expect(state.titles.holder[lost]).toBe(target)
	if (target !== taker) expect(people.holderOfSeat[taker]).toBe(-1)
	for (let title = 0; title < state.titles.count; title++) {
		const holder = state.titles.holder[title]
		if (holder >= 0)
			expect(state.leaderNameSeedCurrent[holder], `title ${title}`).toBe(
				people.holderOfSeat[holder],
			)
	}
	const remaining = state.leaderNameSeedCurrent.some(
		(seed, seat) => seed === loserPerson && seat !== target,
	)
	expect(people.persons.seat[loserPerson] >= 0).toBe(remaining)
}, 3_600_000)

it("creates and removes rulers only through RULER", () => {
	const offenders: string[] = []
	const visit = (directory: string): void => {
		for (const entry of readdirSync(directory, { withFileTypes: true })) {
			const path = `${directory}/${entry.name}`
			if (entry.isDirectory()) visit(path)
			else if (
				path.endsWith(".ts") &&
				!path.endsWith("/ruler/index.ts") &&
				!path.endsWith("/engine/state/index.ts") &&
				readFileSync(path, "utf8").includes("spawnLeader")
			)
				offenders.push(path)
		}
	}
	visit("src/model")
	expect(offenders).toEqual([])
})

import { STATE } from "@/model/history/sim/engine/state"
import { PEOPLE } from "@/model/history/sim/people"
import { SUCCESSION_LAW } from "@/model/history/sim/succession-law"
import { DEJURE } from "@/model/society/dejure"
import type {
	AfterSuccessionParams,
	BeforeSuccessionParams,
	BumpParams,
	DemesneParams,
	DivisionAuditParams,
	EqualTierParams,
	ExpectedBranch,
	ExpectedBranchParams,
	FailParams,
	KinParams,
	LineParams,
	OrderParams,
	RealmShareParams,
	SuccessionSnapshot,
	TitleChainParams,
	TitleShareParams,
} from "@/test/history-run/succession-audit/types"

function bump({ tally, key }: BumpParams): void {
	tally.set(key, (tally.get(key) ?? 0) + 1)
}

function fail({ snapshot, message }: FailParams): never {
	throw new Error(
		`succession of seat ${snapshot.province} in ${snapshot.time.toFixed(2)} (${snapshot.law}): ${message}`,
	)
}

function ordered({ people, persons, gender }: OrderParams): number[] {
	const table = people.persons
	const first = gender === "male_preference" ? 0 : 1
	return [...new Set(persons)].sort((a, b) => {
		if (gender !== "equal" && table.sex[a] !== table.sex[b])
			return table.sex[a] === first ? -1 : 1
		return table.birth[a] - table.birth[b] || a - b
	})
}

function line({ people, person }: LineParams): Set<number> {
	const found = new Set<number>([person])
	const queue = [person]
	while (queue.length > 0) {
		const next = queue.pop() as number
		for (const child of PEOPLE.childrenOf({ people, parent: next }))
			if (!found.has(child)) {
				found.add(child)
				queue.push(child)
			}
	}
	return found
}

function siblingsOf({ people, person }: LineParams): number[] {
	const table = people.persons
	const found: number[] = []
	for (const parent of [table.father[person], table.mother[person]])
		if (parent >= 0)
			for (const child of PEOPLE.childrenOf({ people, parent }))
				if (child !== person) found.push(child)
	return found
}

function unclesOf({ people, person }: LineParams): number[] {
	const table = people.persons
	const found: number[] = []
	for (const parent of [table.father[person], table.mother[person]])
		if (parent >= 0) found.push(...siblingsOf({ people, person: parent }))
	return found
}

function expectedBranch({
	people,
	dying,
	time,
	gender,
}: ExpectedBranchParams): ExpectedBranch {
	const groups: [ExpectedBranch["kind"], number[]][] = [
		["child", PEOPLE.childrenOf({ people, parent: dying })],
		["sibling", siblingsOf({ people, person: dying })],
		["uncle", unclesOf({ people, person: dying })],
	]
	for (const [kind, members] of groups)
		for (const member of ordered({ people, persons: members, gender })) {
			const family = line({ people, person: member })
			for (const relative of family)
				if (PEOPLE.aliveAt({ people, person: relative, time }))
					return { kind, line: family }
		}
	return { kind: "none", line: new Set() }
}

function livingKin({ people, person, time, gender }: KinParams): number[] {
	const kin = new Set<number>()
	const groups = [
		PEOPLE.childrenOf({ people, parent: person }),
		siblingsOf({ people, person }),
		unclesOf({ people, person }),
	]
	for (const group of groups)
		for (const member of ordered({ people, persons: group, gender }))
			for (const relative of line({ people, person: member }))
				if (PEOPLE.aliveAt({ people, person: relative, time }))
					kin.add(relative)
	return [...kin]
}

function demesneOf({ state, holder, realm }: DemesneParams): number {
	let count = 0
	for (let province = 0; province < state.P; province++) {
		if (state.sovereignCurrent[province] !== realm) continue
		let owner = realm
		for (let tier = 1; tier <= 5; tier++) {
			const title = DEJURE.titleAt({
				titles: state.titles,
				provinceCount: state.P,
				tier,
				province,
			})
			if (title < 0 || state.titles.holder[title] < 0) continue
			const candidate = state.titles.holder[title]
			if (state.sovereignCurrent[candidate] === realm) {
				owner = candidate
				break
			}
		}
		if (owner === holder) count++
	}
	return count
}

function before({
	state,
	province,
	leaderIdx,
}: BeforeSuccessionParams): SuccessionSnapshot | null {
	if (state.leaderRuntime.idx[province] !== leaderIdx || !state.people)
		return null
	const sovereign = STATE.isSovereign({ state, p: province })
	if (!sovereign && !state.titles.holder.includes(province)) return null
	const realm = state.sovereignCurrent[province]
	const law = SUCCESSION_LAW.lawOf({ state, nation: realm })
	const held: number[] = []
	for (let title = 0; title < state.titles.count; title++)
		if (state.titles.holder[title] === province) held.push(title)
	return {
		province,
		leaderIdx,
		sovereign,
		realm,
		law,
		gender: SUCCESSION_LAW.genderOf({ state, nation: realm }),
		time: state.time / STATE.yearMs,
		person: state.people.holderOfSeat[province],
		nextDynasty: state.nextDynasty,
		liege: state.parentCurrent[province],
		held,
		holders: state.titles.holder.slice(0, state.titles.count),
		eventCount: state.events.length,
		demesne:
			law === "high_partition"
				? demesneOf({ state, holder: province, realm })
				: 0,
	}
}

function primarySeatOf({ state, snapshot }: RealmShareParams): number {
	let seat = snapshot.province
	for (const event of state.events.slice(snapshot.eventCount)) {
		const data = event.data as { from?: number; to?: number; cause?: string }
		if (
			event.tag === "title passed" &&
			data.cause === "reseat" &&
			data.from === seat &&
			data.to !== undefined
		)
			seat = data.to
	}
	return seat
}

function checkNoHeir({ state, snapshot, tally }: AfterSuccessionParams): void {
	const people = state.people
	if (!people) return
	const holder = people.holderOfSeat[snapshot.province]
	if (!snapshot.sovereign) {
		if (holder >= 0 || state.leaderNameSeedCurrent[snapshot.province] >= 0)
			fail({ snapshot, message: "vassal without heirs kept a ruler" })
		for (const title of snapshot.held)
			if (state.titles.holder[title] !== snapshot.liege)
				fail({
					snapshot,
					message: `title ${title} did not revert to the liege`,
				})
		const escheats = state.events
			.slice(snapshot.eventCount)
			.filter(
				(event) =>
					event.tag === "title passed" &&
					(event.data as { cause?: string }).cause === "escheat",
			).length
		if (escheats !== snapshot.held.length)
			fail({ snapshot, message: "escheat events do not match held titles" })
		bump({ tally, key: "noheir:vassal" })
		return
	}
	const table = people.persons
	if (holder < 0 || table.father[holder] >= 0 || table.mother[holder] >= 0)
		fail({ snapshot, message: "sovereign without heirs got a related ruler" })
	if (table.dynasty[holder] < snapshot.nextDynasty)
		fail({ snapshot, message: "new sovereign ruler has an old dynasty" })
	if (state.leaderClaimCurrent[snapshot.province] !== 1)
		fail({ snapshot, message: "outsider ruler claim is not weak" })
	bump({ tally, key: "noheir:sovereign" })
}

function shareBucket(share: number): string {
	if (share < 0.1) return "lt10"
	if (share < 0.25) return "10to25"
	if (share < 0.5) return "25to50"
	return "ge50"
}

function realmProvinces({ state, snapshot }: RealmShareParams): number {
	let count = 0
	for (let province = 0; province < state.P; province++)
		if (state.sovereignCurrent[province] === snapshot.realm) count++
	return Math.max(1, count)
}

function titleProvinces({ state, snapshot, title }: TitleShareParams): number {
	let count = 0
	for (
		let i = state.titleMembers.offset[title];
		i < state.titleMembers.offset[title + 1];
		i++
	)
		if (state.sovereignCurrent[state.titleMembers.list[i]] === snapshot.realm)
			count++
	return count
}

function tallyEqualTier({
	state,
	snapshot,
	tally,
	juniors,
}: EqualTierParams): void {
	if (snapshot.law === "single_heir" || snapshot.held.length < 2) return
	const top = Math.max(
		...snapshot.held.map((title) => state.titles.tier[title]),
	)
	const equal = snapshot.held.filter(
		(title) => state.titles.tier[title] === top,
	)
	if (equal.length < 2) return
	const prefix = `equalTier:${snapshot.law}`
	bump({ tally, key: `${prefix}:exposed` })
	bump({ tally, key: `${prefix}:tier${top}` })
	bump({
		tally,
		key: `${prefix}:${snapshot.sovereign ? "sovereign" : "vassal"}`,
	})
	if (juniors.length === 0) return
	bump({ tally, key: `${prefix}:withJuniors` })
	const sizes = equal.map((title) => titleProvinces({ state, snapshot, title }))
	const spill = sizes.reduce((a, b) => a + b, 0) - Math.max(...sizes)
	bump({
		tally,
		key: `${prefix}:spill:${shareBucket(spill / realmProvinces({ state, snapshot }))}`,
	})
}

function checkDivision({
	state,
	snapshot,
	tally,
	branch,
}: DivisionAuditParams): void {
	const people = state.people
	if (!people) return
	const primarySeat = primarySeatOf({ state, snapshot })
	const holder = people.holderOfSeat[primarySeat]
	const refounded = state.events
		.slice(snapshot.eventCount)
		.some(
			(event) =>
				event.tag === "title created" || event.tag === "title destroyed",
		)
	const juniors =
		branch.kind === "child"
			? PEOPLE.childrenOf({ people, parent: snapshot.person }).filter(
					(child) =>
						child !== holder &&
						PEOPLE.aliveAt({ people, person: child, time: snapshot.time }),
				)
			: []
	const maxTier = Math.max(
		-1,
		...snapshot.held.map((title) => state.titles.tier[title]),
	)
	const primaryTitle = snapshot.held
		.filter((title) => state.titles.tier[title] === maxTier)
		.sort(
			(a, b) =>
				Number(
					snapshot.holders[b] === snapshot.province &&
						state.titles.seat[b] === snapshot.province,
				) -
					Number(
						snapshot.holders[a] === snapshot.province &&
							state.titles.seat[a] === snapshot.province,
					) ||
				titleProvinces({ state, snapshot, title: b }) -
					titleProvinces({ state, snapshot, title: a }) ||
				a - b,
		)[0]
	tallyEqualTier({ state, snapshot, tally, juniors })
	const divided: number[] = []
	const seats = new Set<number>()
	for (let title = 0; title < snapshot.holders.length; title++) {
		const now = state.titles.holder[title]
		if (now === snapshot.holders[title]) continue
		if (snapshot.holders[title] !== snapshot.province) {
			if (!refounded)
				fail({ snapshot, message: `unrelated title ${title} changed holder` })
			continue
		}
		if (now === primarySeat) continue
		if (now < 0 && refounded) continue
		if (title === primaryTitle)
			fail({ snapshot, message: `primary title ${title} was divided` })
		const person = people.holderOfSeat[now]
		if (person < 0 || !juniors.includes(person))
			fail({ snapshot, message: `title ${title} went to a non-junior` })
		if (seats.has(now))
			fail({ snapshot, message: "two titles share a junior seat" })
		seats.add(now)
		divided.push(title)
		if (state.titles.tier[title] === maxTier)
			bump({ tally, key: `equalTier:${snapshot.law}:divided` })
	}
	if (seats.size > juniors.length)
		fail({ snapshot, message: "more junior seats than juniors" })
	if (snapshot.law === "single_heir" && seats.size > 0)
		fail({ snapshot, message: "single heir divided titles" })
	if (snapshot.law === "high_partition") {
		const remaining = demesneOf({
			state,
			holder: primarySeat,
			realm: snapshot.realm,
		})
		if (remaining < Math.ceil(snapshot.demesne / 2))
			fail({
				snapshot,
				message: `demesne fell from ${snapshot.demesne} to ${remaining}`,
			})
	}
	if (seats.size > 0) {
		bump({ tally, key: `divided:${snapshot.law}` })
		const moved = divided.reduce(
			(sum, title) => sum + titleProvinces({ state, snapshot, title }),
			0,
		)
		bump({
			tally,
			key: `divided:share:${shareBucket(moved / realmProvinces({ state, snapshot }))}`,
		})
	} else if (juniors.length > 0 && snapshot.held.length > 1)
		bump({ tally, key: `undivided:${snapshot.law}` })
}

function after(params: AfterSuccessionParams): void {
	const { state, snapshot, tally } = params
	const people = state.people
	if (!people) return
	if (state.leaderRuntime.idx[snapshot.province] === snapshot.leaderIdx) return
	bump({ tally, key: "successions" })
	bump({ tally, key: `law:${snapshot.law}` })
	const branch = expectedBranch({
		people,
		dying: snapshot.person,
		time: snapshot.time,
		gender: snapshot.gender,
	})
	if (branch.kind === "none") {
		checkNoHeir(params)
		return
	}
	const primarySeat = primarySeatOf({ state, snapshot })
	const holder = people.holderOfSeat[primarySeat]
	const refounded = state.events
		.slice(snapshot.eventCount)
		.some((event) => event.tag === "title created")
	if (holder < 0 && refounded) {
		bump({ tally, key: "heir:landlessAfterFounding" })
		return
	}
	if (holder < 0 || holder === snapshot.person)
		fail({
			snapshot,
			message: `no new holder although ${branch.kind} kin are alive`,
		})
	if (!PEOPLE.aliveAt({ people, person: holder, time: snapshot.time }))
		fail({ snapshot, message: "heir is dead" })
	if (!branch.line.has(holder))
		fail({ snapshot, message: `heir is outside the ${branch.kind} line` })
	if (people.persons.dynasty[holder] !== state.leaderDynCurrent[primarySeat])
		fail({ snapshot, message: "leader dynasty differs from the person's" })
	const child =
		people.persons.father[holder] === snapshot.person ||
		people.persons.mother[holder] === snapshot.person
	if (state.leaderClaimCurrent[primarySeat] !== (child ? 3 : 2))
		fail({ snapshot, message: "claim does not match the relation" })
	const minor = snapshot.time - people.persons.birth[holder] < 16
	const regency = state.events
		.slice(snapshot.eventCount)
		.some((event) => event.tag === "regency started")
	if (regency !== (minor && snapshot.sovereign))
		fail({ snapshot, message: "regency does not match the heir's age" })
	bump({ tally, key: `heir:${branch.kind}` })
	if (people.persons.sex[holder] === 1) bump({ tally, key: "heir:female" })
	if (regency) bump({ tally, key: "regency" })
	checkDivision({ ...params, branch })
}

function checkTitleChains({ engine, record }: TitleChainParams): void {
	const base = record.record.titles
	if (!base) throw new Error("Record has no title base")
	const current = new Map<number, number>()
	for (let title = 0; title < base.count; title++)
		current.set(title, base.holder[title])
	for (const event of record.record.events.titleEvents) {
		if (event.kind === "created") current.set(event.title, event.holder)
		else if (event.kind === "destroyed") current.set(event.title, -1)
		else if (event.kind === "passed") {
			if (current.get(event.title) !== event.from)
				throw new Error(
					`title ${event.title} passed from ${event.from} but was held by ${current.get(event.title)}`,
				)
			current.set(event.title, event.to)
		}
	}
	for (let title = 0; title < engine.titles.count; title++)
		if (current.get(title) !== engine.titles.holder[title])
			throw new Error(`record chain of title ${title} ends at the wrong holder`)
}

export const SUCCESSION_AUDIT = {
	before,
	after,
	expectedBranch,
	livingKin,
	checkTitleChains,
}

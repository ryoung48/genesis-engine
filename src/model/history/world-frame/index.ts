import type {
	DirectReport,
	DirectReportsParams,
	HreMemberNationsParams,
	IsOccupiedParams,
	NationEconomy,
	NationFrameParams,
	NationRelations,
	OrgForeignHoldersParams,
	OrgMemberProvincesParams,
	ToRenderInputsParams,
} from "@/model/history/world-frame/types"

function emptyRelations(): NationRelations {
	return {
		overlord: -1,
		vassals: [],
		vassalSubjectTypes: [],
		unionSeniorOf: [],
		unionJuniorPartner: -1,
		allies: [],
		guarantees: [],
		royalMarriages: [],
		rivals: [],
	}
}

function isOccupied({ frame, province }: IsOccupiedParams): boolean {
	return (
		frame.provinceNation[province] >= 0 &&
		frame.provinceController[province] !== frame.provinceNation[province]
	)
}

function hreMemberNations({ frame }: HreMemberNationsParams): Set<number> {
	const nations = new Set<number>()
	for (let province = 0; province < frame.provinceCount; province++) {
		const nationId = frame.provinceNation[province]
		if (frame.provinceHre[province] && nationId >= 0) nations.add(nationId)
	}
	return nations
}

function nationEconomy({
	frame,
	nationId,
}: NationFrameParams): NationEconomy | null {
	if (!frame.economy) return null
	const { roots, treasury, revenue, manpower } = frame.economy
	for (let index = 0; index < roots.length; index++) {
		const root = roots[index]
		if (
			frame.provinceNation[root] === nationId &&
			frame.provinceParent[root] < 0
		)
			return {
				treasury: treasury[index],
				revenue: revenue[index],
				manpower: manpower[index],
			}
	}
	return null
}

function heldTitles({ frame, nationId }: NationFrameParams): number[] {
	const held: number[] = []
	if (!frame.titles) return held
	for (let title = 0; title < frame.titles.count; title++)
		if (frame.titles.holder[title] === nationId) held.push(title)
	return held
}

function directReports({ frame }: DirectReportsParams): DirectReport[] {
	const { titles } = frame
	if (!titles) return []
	const bestAtSeat = new Map<number, number>()
	for (let title = 0; title < titles.count; title++) {
		const seat = titles.seat[title]
		if (
			seat < 0 ||
			titles.holder[title] < 0 ||
			titles.holder[title] !== frame.provinceNation[seat]
		)
			continue
		const best = bestAtSeat.get(seat)
		if (best === undefined || titles.tier[title] > titles.tier[best])
			bestAtSeat.set(seat, title)
	}
	const reports: DirectReport[] = []
	for (const [seat, title] of bestAtSeat) {
		const nation = titles.holder[title]
		const capital = frame.nations.get(nation)?.capitalProvince ?? -1
		if (capital >= 0 && frame.provinceParent[seat] === capital)
			reports.push({ seat, title, nation })
	}
	return reports
}

function orgMemberProvinces({
	frame,
	orgId,
}: OrgMemberProvincesParams): Set<number> {
	const provinces = new Set<number>()
	if (orgId === "HRE") {
		for (let province = 0; province < frame.provinceCount; province++) {
			if (frame.provinceHre[province]) provinces.add(province)
		}
		return provinces
	}
	const memberNations = new Set<number>()
	for (const nation of frame.nations.values()) {
		if (
			nation.organizations.some((organization) => organization.orgId === orgId)
		) {
			memberNations.add(nation.id)
		}
	}
	for (let province = 0; province < frame.provinceCount; province++) {
		if (memberNations.has(frame.provinceNation[province]))
			provinces.add(province)
	}
	for (const organization of frame.organizations) {
		if (organization.orgId === orgId && organization.role === "member_seat") {
			provinces.add(organization.province)
		}
	}
	return provinces
}

function orgForeignHolders({
	frame,
	orgId,
}: OrgForeignHoldersParams): Set<number> {
	const foreignHolders = new Set<number>()
	if (orgId !== "HRE") return foreignHolders
	for (const nationId of hreMemberNations({ frame })) {
		const capital = frame.nations.get(nationId)?.capitalProvince ?? -1
		if (capital < 0 || !frame.provinceHre[capital]) foreignHolders.add(nationId)
	}
	return foreignHolders
}

function toRenderInputs({ frame }: ToRenderInputsParams) {
	const nationCapacity = Math.max(
		0,
		...Array.from(frame.nations.keys(), (nationId) => nationId + 1),
	)
	const seeds = new Int32Array(nationCapacity).fill(-1)
	const names = new Array<string>(nationCapacity).fill("")
	for (const nation of frame.nations.values()) {
		// A nation that only occupies foreign land (no owned province) has no
		// anchor and gets no label.
		if (nation.capitalProvince < 0) continue
		seeds[nation.id] = nation.capitalProvince
		names[nation.id] = nation.name
	}
	return {
		assignment: frame.provinceNation,
		seeds,
		names,
		cultureAssignment: frame.provinceCulture,
		cultureCount: frame.cultures.length,
		cultureNames: frame.cultures.map((culture) => culture.name),
		religionAssignment: frame.provinceReligion,
		religionCount: frame.religions.length,
		religionNames: frame.religions.map((religion) => religion.name),
		cultureByProvince: Array.from(frame.provinceCulture, (id) =>
			id < 0 ? null : (frame.cultures[id]?.key ?? null),
		),
		religionByProvince: Array.from(frame.provinceReligion, (id) =>
			id < 0 ? null : (frame.religions[id]?.key ?? null),
		),
	}
}

export const FRAME = {
	nationEconomy,
	emptyRelations,
	isOccupied,
	hreMemberNations,
	heldTitles,
	directReports,
	orgMemberProvinces,
	orgForeignHolders,
	toRenderInputs,
}

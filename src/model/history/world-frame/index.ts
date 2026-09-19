import type {
	HreMemberNationsParams,
	IsOccupiedParams,
	NationRelations,
	OrgForeignHoldersParams,
	OrgMemberProvincesParams,
	ProvinceDepthParams,
	ToRenderInputsParams,
} from "@/model/history/world-frame/types"

const depthByFrame = new WeakMap<ProvinceDepthParams["frame"], Int32Array>()

function provinceDepth({ frame }: ProvinceDepthParams): Int32Array {
	const cached = depthByFrame.get(frame)
	if (cached) return cached
	const depth = new Int32Array(frame.provinceCount).fill(-1)
	for (let province = 0; province < frame.provinceCount; province++) {
		if (depth[province] >= 0) continue
		const path: number[] = []
		const seen = new Set<number>()
		let current = province
		while (
			current >= 0 &&
			current < frame.provinceCount &&
			depth[current] < 0 &&
			!seen.has(current)
		) {
			seen.add(current)
			path.push(current)
			current = frame.provinceParent[current]
		}
		let nextDepth =
			current >= 0 && current < frame.provinceCount ? depth[current] + 1 : 0
		while (path.length > 0) depth[path.pop() as number] = nextDepth++
	}
	depthByFrame.set(frame, depth)
	return depth
}

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
	provinceDepth,
	emptyRelations,
	isOccupied,
	hreMemberNations,
	orgMemberProvinces,
	orgForeignHolders,
	toRenderInputs,
}

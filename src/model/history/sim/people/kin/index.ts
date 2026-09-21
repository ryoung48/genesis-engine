import type {
	KinChildrenParams,
	KinLinkParams,
} from "@/model/history/sim/people/kin/types"

function link({ kin, child }: KinLinkParams): void {
	const father = kin.father[child]
	const mother = kin.mother[child]
	if (father >= 0) {
		kin.nextSiblingFather[child] = kin.firstChild[father]
		kin.firstChild[father] = child
	}
	if (mother >= 0) {
		kin.nextSiblingMother[child] = kin.firstChild[mother]
		kin.firstChild[mother] = child
	}
}

function childrenOf({ kin, parent }: KinChildrenParams): number[] {
	const children: number[] = []
	if (parent < 0 || parent >= kin.count) return children
	const next =
		kin.sex[parent] === 0 ? kin.nextSiblingFather : kin.nextSiblingMother
	let child = kin.firstChild[parent]
	while (child >= 0) {
		children.push(child)
		child = next[child]
	}
	return children
}

export const KIN = { link, childrenOf }

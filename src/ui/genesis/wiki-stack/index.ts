import type {
	BackTitleParams,
	OpenWikiParams,
	RecordRefParams,
	WikiRef,
	WikiSelection,
	WikiStackParams,
} from "@/ui/genesis/wiki-stack/types"

const STACK_LIMIT = 30

function keyOf(ref: WikiRef): string {
	return `${ref.kind}:${ref.id}`
}

function top({ stack }: WikiStackParams): WikiRef | null {
	return stack.length > 0 ? stack[stack.length - 1] : null
}

function open({ stack, ref }: OpenWikiParams): WikiRef[] {
	const current = top({ stack })
	if (current && keyOf(current) === keyOf(ref)) return stack
	return [...stack, ref].slice(-STACK_LIMIT)
}

function back({ stack }: WikiStackParams): WikiRef[] {
	return stack.slice(0, -1)
}

function backTitle({ stack, planetTitle }: BackTitleParams): string {
	return stack.length > 1 ? stack[stack.length - 2].title : planetTitle
}

function selection({ stack }: WikiStackParams): WikiSelection {
	const current = top({ stack })
	return {
		nationId: current?.kind === "nation" ? current.id : null,
		organizationId: current?.kind === "organization" ? current.id : null,
		warId: current?.kind === "war" ? current.id : null,
		personId: current?.kind === "person" ? current.id : null,
	}
}

function nationRef({ record, id }: RecordRefParams): WikiRef {
	return {
		kind: "nation",
		id,
		title: record.nations[id]?.name ?? `Nation ${id}`,
	}
}

function warRef({ record, id }: RecordRefParams): WikiRef {
	return {
		kind: "war",
		id,
		title: record.events.wars[id]?.name ?? `War ${id}`,
	}
}

export const WIKI_STACK = {
	keyOf,
	top,
	open,
	back,
	backTitle,
	selection,
	nationRef,
	warRef,
}

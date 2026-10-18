import type {
	ChildKeyParams,
	HolderKeyParams,
	InjectedKeyParams,
	MarriageKeyParams,
	ParentKeyParams,
	ParsedKey,
	ParsedMarriage,
	PersonKey,
	PersonSeedParams,
	SpouseKeyParams,
} from "@/model/people/keys/types"

function ruler(rulerId: number): PersonKey {
	return `R(${rulerId})`
}

function spouse({ owner, index }: SpouseKeyParams): PersonKey {
	return `S(${owner},${index})`
}

function child({ marriage, index }: ChildKeyParams): PersonKey {
	return `C(${marriage},${index})`
}

function injected({ anchor, role }: InjectedKeyParams): PersonKey {
	return `A(${anchor},${role})`
}

function parent({ child, side }: ParentKeyParams): PersonKey {
	return `P(${child},${side})`
}

function holder({ seat, bucket }: HolderKeyParams): PersonKey {
	return `V(${seat},${bucket})`
}

function marriage({ husband, wife, startMs }: MarriageKeyParams): string {
	return `M(${husband},${wife},${Math.round(startMs)})`
}

function split(inner: string): string[] {
	const parts: string[] = []
	let depth = 0
	let start = 0
	for (let index = 0; index < inner.length; index++) {
		const char = inner[index]
		if (char === "(") depth++
		else if (char === ")") depth--
		else if (char === "," && depth === 0) {
			parts.push(inner.slice(start, index))
			start = index + 1
		}
	}
	parts.push(inner.slice(start))
	return parts
}

function parse(key: PersonKey): ParsedKey {
	const parts = split(key.slice(2, -1))
	const tag = key[0]
	if (tag === "R") return { tag, rulerId: Number(parts[0]) }
	if (tag === "S") return { tag, owner: parts[0], index: Number(parts[1]) }
	if (tag === "C") return { tag, marriage: parts[0], index: Number(parts[1]) }
	if (tag === "A") return { tag, anchor: parts[0], role: parts[1] }
	if (tag === "V") return { tag, seat: parts[0], bucket: Number(parts[1]) }
	return { tag: "P", child: parts[0], side: parts[1] as "f" | "m" }
}

function parseMarriage(key: string): ParsedMarriage {
	const parts = split(key.slice(2, -1))
	return { husband: parts[0], wife: parts[1], startMs: Number(parts[2]) }
}

function fnv1a(text: string): number {
	let hash = 0x811c9dc5
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}

function seed({ worldSeed, key }: PersonSeedParams): number {
	return (Math.imul(worldSeed | 0, 0x9e3779b1) ^ fnv1a(key)) | 0
}

export const PERSON_KEY = {
	ruler,
	spouse,
	child,
	injected,
	parent,
	holder,
	marriage,
	parse,
	parseMarriage,
	seed,
}

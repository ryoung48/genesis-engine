import { createHash } from "node:crypto"
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import { deserialize, serialize } from "node:v8"
import { GENERATE_WORLD } from "@/model/pipelines/generate-world"
import type { GenesisWorld } from "@/model/pipelines/types"
import type {
	CachedWorldParams,
	ResolveImportParams,
} from "@/test/history-run/world-cache/types"

const CACHE_DIR = "node_modules/.cache/history-worlds"
const ENTRY = "src/model/pipelines/generate-world/index.ts"
const LOCKFILE = "pnpm-lock.yaml"
const IMPORT =
	/\b(?:import|export)\s+(type\s+)?[^"';]*?from\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|^\s*import\s*["']([^"']+)["']/gm
const SUFFIXES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]

const loaded = new Map<string, Buffer>()
let source: string | null = null

function resolveImport({
	from,
	specifier,
}: ResolveImportParams): string | null {
	const bare = specifier.split("?")[0]
	const base = bare.startsWith("@/")
		? join("src", bare.slice(2))
		: bare.startsWith(".")
			? join(dirname(from), bare)
			: null
	if (base === null) return null
	for (const suffix of SUFFIXES) {
		const candidate = `${base}${suffix}`.replaceAll("\\", "/")
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
	}
	return null
}

// Deserializing hands back typed arrays that are views into the one input
// buffer, so a write to a world would corrupt the cached bytes and transferring
// one array would detach them all. This gives every array its own memory.
function ownArrays(root: unknown): void {
	const copies = new Map<ArrayBufferView, ArrayBufferView>()
	const own = (view: ArrayBufferView): ArrayBufferView => {
		const copy = copies.get(view) ?? (view as Uint8Array).slice()
		copies.set(view, copy)
		return copy
	}
	const seen = new Set<object>()
	const stack = [root]
	while (stack.length > 0) {
		const node = stack.pop()
		if (typeof node !== "object" || node === null || seen.has(node)) continue
		seen.add(node)
		if (node instanceof Map) {
			for (const [key, value] of node)
				if (ArrayBuffer.isView(value)) node.set(key, own(value))
				else stack.push(value)
		} else if (node instanceof Set) {
			for (const value of node) stack.push(value)
		} else {
			const record = node as Record<string, unknown>
			for (const key of Object.keys(record)) {
				const value = record[key]
				if (ArrayBuffer.isView(value)) record[key] = own(value)
				else if (typeof value === "object") stack.push(value)
			}
		}
	}
}

// Hashes every file world generation can run, found by following runtime
// imports from the pipeline entry, so a cached world is dropped as soon as any
// of them changes.
function sourceHash(): string {
	if (source !== null) return source
	const seen = new Set([ENTRY])
	const queue = [ENTRY]
	for (let head = 0; head < queue.length; head++) {
		const text = readFileSync(queue[head], "utf8")
		for (const match of text.matchAll(IMPORT)) {
			if (match[1]) continue
			const file = resolveImport({
				from: queue[head],
				specifier: match[2] ?? match[3] ?? match[4],
			})
			if (file === null || seen.has(file) || !/\.tsx?$/.test(file)) continue
			seen.add(file)
			queue.push(file)
		}
	}
	const hash = createHash("sha256").update(readFileSync(LOCKFILE))
	for (const file of [...seen].sort())
		hash.update(file).update(readFileSync(file))
	source = hash.digest("hex").slice(0, 16)
	return source
}

// Generating a world takes seconds and reloading one takes milliseconds, so
// each distinct world is generated once and kept on disk. Every call returns
// its own copy.
function generate({ params }: CachedWorldParams): GenesisWorld {
	const key = createHash("sha256")
		.update(JSON.stringify(params))
		.digest("hex")
		.slice(0, 16)
	const name = `${key}-${sourceHash()}.bin`
	const path = resolve(CACHE_DIR, name)
	let buffer = loaded.get(name)
	if (buffer === undefined && existsSync(path)) buffer = readFileSync(path)
	if (buffer === undefined) {
		buffer = serialize(GENERATE_WORLD.generateGenesisWorld({ params }))
		mkdirSync(dirname(path), { recursive: true })
		for (const stale of readdirSync(dirname(path)))
			if (
				stale !== name &&
				stale.startsWith(`${key}-`) &&
				stale.endsWith(".bin")
			)
				rmSync(join(dirname(path), stale), { force: true })
		// Another worker may be writing the same world; whichever rename lands
		// first wins and the rest discard their copy.
		const partial = `${path}.${process.pid}.tmp`
		writeFileSync(partial, buffer)
		try {
			renameSync(partial, path)
		} catch {
			rmSync(partial, { force: true })
		}
	}
	loaded.set(name, buffer)
	const world = deserialize(buffer) as GenesisWorld
	ownArrays(world)
	return world
}

export const WORLD_CACHE = { generate }

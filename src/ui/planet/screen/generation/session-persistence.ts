import type { MoonBody } from "@/model/celestial/moons/moon-types"
import type { SystemBody } from "@/model/celestial/system/generate-system-bodies"
import type { SolarSystemState } from "@/model/celestial/system/sol-system"
import { GENERATION_SESSION_STORAGE_KEY } from "./defaults"
import {
	GENERATION_PREVIEW_TABS,
	type GenerationPreviewTab,
} from "./generation-preview"

type FocusTarget = {
	bodyIndex: number
	moonIndex?: number
} | null

interface GenerationSessionSnapshot {
	solarSystem: SolarSystemState
	solarSystemViewActive: boolean
	currentFocus: FocusTarget
	generationPanelOpen: boolean
	generationPreviewTab: GenerationPreviewTab
}

type StoredGenerationSession = {
	version: 4
	snapshot: GenerationSessionSnapshot
}

type SupportedTypedArray =
	| Float32Array
	| Float64Array
	| Int8Array
	| Int16Array
	| Int32Array
	| Uint8Array
	| Uint16Array
	| Uint32Array
	| Uint8ClampedArray

type SerializedTypedArray = {
	__typedArray: keyof typeof typedArrayConstructors
	data: string
}

const typedArrayConstructors = {
	Float32Array,
	Float64Array,
	Int8Array,
	Int16Array,
	Int32Array,
	Uint8Array,
	Uint16Array,
	Uint32Array,
	Uint8ClampedArray,
} as const

function isSupportedTypedArray(value: unknown): value is SupportedTypedArray {
	return (
		ArrayBuffer.isView(value) &&
		!(value instanceof DataView) &&
		value.constructor.name in typedArrayConstructors
	)
}

function encodeBytes(bytes: Uint8Array): string {
	let binary = ""
	const chunkSize = 0x8000
	for (let index = 0; index < bytes.length; index += chunkSize) {
		const chunk = bytes.subarray(index, index + chunkSize)
		binary += String.fromCharCode(...chunk)
	}
	return btoa(binary)
}

function decodeBytes(encoded: string): Uint8Array {
	const binary = atob(encoded)
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index++) {
		bytes[index] = binary.charCodeAt(index)
	}
	return bytes
}

function serializeValue(value: unknown): unknown {
	if (isSupportedTypedArray(value)) {
		return {
			__typedArray: value.constructor
				.name as keyof typeof typedArrayConstructors,
			data: encodeBytes(
				new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
			),
		} satisfies SerializedTypedArray
	}
	if (Array.isArray(value)) {
		return value.map((entry) => serializeValue(entry))
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]),
		)
	}
	return value
}

function deserializeValue<T>(value: unknown): T {
	if (Array.isArray(value)) {
		return value.map((entry) => deserializeValue(entry)) as T
	}
	if (value && typeof value === "object") {
		if ("__typedArray" in value && "data" in value) {
			const typed = value as SerializedTypedArray
			const Constructor = typedArrayConstructors[typed.__typedArray]
			if (!Constructor) throw new Error("Unsupported typed array in snapshot")
			const bytes = decodeBytes(typed.data)
			return new Constructor(bytes.buffer.slice(0) as ArrayBuffer) as T
		}
		return Object.fromEntries(
			Object.entries(value).map(([key, entry]) => [
				key,
				deserializeValue(entry),
			]),
		) as T
	}
	return value as T
}

async function decompressString(value: string): Promise<string | null> {
	if (!value.startsWith("gzip:")) return value
	if (typeof DecompressionStream === "undefined") return null
	const bytes = decodeBytes(value.slice("gzip:".length))
	const stream = new Blob([Uint8Array.from(bytes).buffer])
		.stream()
		.pipeThrough(new DecompressionStream("gzip"))
	return await new Response(stream).text()
}

function isMoonBodyArray(value: unknown): value is MoonBody[] {
	return Array.isArray(value)
}

function isSystemBodyArray(
	value: unknown,
): value is SolarSystemState["orbits"] {
	if (!Array.isArray(value)) return false
	return value.every((body) => {
		if (!body || typeof body !== "object") return false
		const candidate = body as Partial<SystemBody>
		return (
			typeof candidate.idx === "number" &&
			typeof candidate.seed === "string" &&
			isMoonBodyArray(candidate.moons)
		)
	})
}

function isFocusTarget(value: unknown): value is FocusTarget {
	return (
		value === null ||
		(() => {
			if (!value || typeof value !== "object") return false
			const candidate = value as { bodyIndex?: unknown; moonIndex?: unknown }
			return (
				typeof candidate.bodyIndex === "number" &&
				(candidate.moonIndex === undefined ||
					typeof candidate.moonIndex === "number")
			)
		})()
	)
}

function isGenerationSessionSnapshot(
	value: unknown,
): value is GenerationSessionSnapshot {
	if (!value || typeof value !== "object") return false
	const candidate = value as Record<string, unknown>
	const validGenerationPreviewTabs = new Set(
		GENERATION_PREVIEW_TABS.map(([tab]) => tab),
	)
	return (
		(() => {
			const solarSystem = candidate.solarSystem
			if (!solarSystem || typeof solarSystem !== "object") return false
			const typedSolarSystem = solarSystem as Record<string, unknown>
			const star = typedSolarSystem.star
			if (!star || typeof star !== "object") return false
			const typedStar = star as Record<string, unknown>
			return (
				typeof typedStar.class === "string" &&
				typeof typedStar.subtype === "number" &&
				typeof typedStar.seed === "string" &&
				isSystemBodyArray(typedSolarSystem.orbits)
			)
		})() &&
		typeof candidate.solarSystemViewActive === "boolean" &&
		isFocusTarget(candidate.currentFocus) &&
		typeof candidate.generationPanelOpen === "boolean" &&
		validGenerationPreviewTabs.has(
			candidate.generationPreviewTab as GenerationPreviewTab,
		)
	)
}

function parseStoredGenerationSession(
	stored: string,
): GenerationSessionSnapshot | null {
	const parsed = deserializeValue<StoredGenerationSession>(JSON.parse(stored))
	if (parsed.version !== 4 || !isGenerationSessionSnapshot(parsed.snapshot)) {
		return null
	}
	return parsed.snapshot
}

export function loadGenerationSessionSnapshotSync(): GenerationSessionSnapshot | null {
	const stored = window.localStorage.getItem(GENERATION_SESSION_STORAGE_KEY)
	if (!stored || stored.startsWith("gzip:")) return null
	try {
		return parseStoredGenerationSession(stored)
	} catch {
		return null
	}
}

export async function saveGenerationSessionSnapshot(
	snapshot: GenerationSessionSnapshot,
): Promise<void> {
	const payload: StoredGenerationSession = {
		version: 4,
		snapshot,
	}
	const serialized = JSON.stringify(serializeValue(payload))
	window.localStorage.setItem(GENERATION_SESSION_STORAGE_KEY, serialized)
}

export async function loadGenerationSessionSnapshot(): Promise<GenerationSessionSnapshot | null> {
	const stored = window.localStorage.getItem(GENERATION_SESSION_STORAGE_KEY)
	if (!stored) return null
	const decompressed = await decompressString(stored)
	if (!decompressed) return null
	return parseStoredGenerationSession(decompressed)
}

import type { MoonBody } from "@/model/celestial/moons/types"
import type { MainWorldMode } from "@/model/celestial/system/generation/types"
import type {
	SolarSystemState,
	SystemBody,
} from "@/model/celestial/system/types"
import { GENERATION_SESSION_STORAGE_KEY } from "@/ui/genesis/generation/defaults"
import {
	GENERATION_PREVIEW_TABS,
	type GenerationPreviewTab,
} from "@/ui/genesis/generation/generation-preview"
import type { OrbitAddress } from "@/ui/genesis/solar-system/overlay"

type FocusTarget = OrbitAddress | null

const VALID_MAIN_WORLD_MODES = new Set<MainWorldMode>([
	"earth-clone",
	"moon-system",
	"gas-giant-moon",
	"procedural",
])

/** Present only when this system was opened from galaxy mode (see
 * GenesisView's handleOpenGalaxySystem) -- its presence is what lets the
 * solar-system view show a "back to galaxy" control. PortedGalaxyView owns
 * its own seed/systemCount/radius state and regenerates fresh on re-entry,
 * so nothing beyond the originating system's index needs to be carried. */
export interface GalaxyOrigin {
	systemIndex: number
}

interface GenerationSessionSnapshot {
	solarSystem: SolarSystemState
	solarSystemViewActive: boolean
	currentFocus: FocusTarget
	generationPanelOpen: boolean
	generationPreviewTab: GenerationPreviewTab
	/** [JUSTIFICATION] Absent from snapshots saved before this field existed
	 * -- treated as "earth-clone" (the pre-existing default) wherever it's
	 * read, so old sessions keep restoring exactly as they did before. */
	mainWorldMode?: MainWorldMode
	/** [JUSTIFICATION] Absent for any session not opened from the galaxy
	 * view -- absence itself is the signal to hide the "back to galaxy"
	 * control. */
	galaxyOrigin?: GalaxyOrigin
}

type StoredGenerationSession = {
	version: 5
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
	if (value === null) return true
	if (!value || typeof value !== "object") return false
	const candidate = value as Record<string, unknown>
	if (typeof candidate.starIndex !== "number") return false
	switch (candidate.kind) {
		case "star":
			return true
		case "body":
			return typeof candidate.bodyIdx === "number"
		case "moon":
			return (
				typeof candidate.bodyIdx === "number" &&
				typeof candidate.moonIdx === "number"
			)
		default:
			return false
	}
}

function isGalaxyOrigin(value: unknown): value is GalaxyOrigin {
	if (!value || typeof value !== "object") return false
	const candidate = value as Record<string, unknown>
	return typeof candidate.systemIndex === "number"
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
		) &&
		(candidate.mainWorldMode === undefined ||
			VALID_MAIN_WORLD_MODES.has(candidate.mainWorldMode as MainWorldMode)) &&
		(candidate.galaxyOrigin === undefined ||
			isGalaxyOrigin(candidate.galaxyOrigin))
	)
}

function parseStoredGenerationSession(
	stored: string,
): GenerationSessionSnapshot | null {
	const parsed = deserializeValue<StoredGenerationSession>(JSON.parse(stored))
	if (parsed.version !== 5 || !isGenerationSessionSnapshot(parsed.snapshot)) {
		return null
	}
	return parsed.snapshot
}

/** Distinguishes independent solar-system-view instances (e.g. the
 * earth/sol-centric Genesis page vs. a future `/galaxy` drill-in view) so
 * they don't read/write the same localStorage entry. Defaults to the
 * original unnamespaced key so existing Genesis sessions keep restoring
 * unchanged. */
function storageKeyFor(namespace?: string): string {
	return namespace
		? `${GENERATION_SESSION_STORAGE_KEY}:${namespace}`
		: GENERATION_SESSION_STORAGE_KEY
}

export function loadGenerationSessionSnapshotSync(
	namespace?: string,
): GenerationSessionSnapshot | null {
	const stored = window.localStorage.getItem(storageKeyFor(namespace))
	if (!stored || stored.startsWith("gzip:")) return null
	try {
		return parseStoredGenerationSession(stored)
	} catch {
		return null
	}
}

export async function saveGenerationSessionSnapshot(
	snapshot: GenerationSessionSnapshot,
	namespace?: string,
): Promise<void> {
	const payload: StoredGenerationSession = {
		version: 5,
		snapshot,
	}
	const serialized = JSON.stringify(serializeValue(payload))
	window.localStorage.setItem(storageKeyFor(namespace), serialized)
}

export async function loadGenerationSessionSnapshot(
	namespace?: string,
): Promise<GenerationSessionSnapshot | null> {
	const stored = window.localStorage.getItem(storageKeyFor(namespace))
	if (!stored) return null
	const decompressed = await decompressString(stored)
	if (!decompressed) return null
	return parseStoredGenerationSession(decompressed)
}

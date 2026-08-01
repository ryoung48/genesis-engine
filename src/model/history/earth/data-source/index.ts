import type {
	Eu4ProvinceBorderGeometry,
	Eu4ProvinceFillGeometry,
	RawDiplomacyEvent,
	RawHeritage,
	RawNationEvents,
	RawNationReference,
	RawOrganizationEvent,
	RawOrganizationReference,
	RawProvinceEvents,
	RawProvinceGeography,
	RawReligionGroup,
	RawWar,
} from "@/model/history/earth/data-source/types"

const EARTH_HISTORY_BASE = "/earth-history"

const cache = new Map<string, Promise<unknown>>()

function loadJson<T>(path: string): Promise<T> {
	let promise = cache.get(path) as Promise<T> | undefined
	if (!promise) {
		promise = fetch(`${EARTH_HISTORY_BASE}/${path}`, {
			cache: "no-store",
		}).then((res) => {
			if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`)
			return res.json() as Promise<T>
		})
		cache.set(path, promise)
	}
	return promise
}

const loadProvinceEvents = () =>
	loadJson<RawProvinceEvents>("events/provinces.json")

const loadNationEvents = () => loadJson<RawNationEvents>("events/nations.json")

const loadWars = () => loadJson<RawWar[]>("events/wars.json")

const loadDiplomacyEvents = () =>
	loadJson<RawDiplomacyEvent[]>("events/diplomacy.json")

const loadOrganizationEvents = () =>
	loadJson<RawOrganizationEvent[]>("events/organizations.json")
const loadGeography = () =>
	loadJson<Record<string, RawProvinceGeography>>("reference/geography.json")

const loadNationReference = () =>
	loadJson<RawNationReference[]>("reference/nations.json")

const loadOrganizationReference = () =>
	loadJson<RawOrganizationReference[]>("reference/organizations.json")

const loadHeritages = () => loadJson<RawHeritage[]>("reference/heritages.json")

const loadReligionGroups = () =>
	loadJson<RawReligionGroup[]>("reference/religion-groups.json")

let provinceCoordinatesPromise: Promise<
	Map<string, { lon: number; lat: number }>
> | null = null

function loadProvinceCoordinates(): Promise<
	Map<string, { lon: number; lat: number }>
> {
	if (!provinceCoordinatesPromise) {
		provinceCoordinatesPromise = fetch("/earth-data/eu4-provinces-seeds.json", {
			cache: "no-store",
		})
			.then((res) => {
				if (!res.ok)
					throw new Error(
						`Failed to load eu4-provinces-seeds.json: ${res.status}`,
					)
				return res.json() as Promise<{ id: number; lon: number; lat: number }[]>
			})
			.then((seeds) => {
				const map = new Map<string, { lon: number; lat: number }>()
				for (const seed of seeds)
					map.set(String(seed.id), { lon: seed.lon, lat: seed.lat })
				return map
			})
	}
	return provinceCoordinatesPromise
}

let provinceBorderGeometryPromise: Promise<Eu4ProvinceBorderGeometry> | null =
	null

function loadEu4ProvinceBorderGeometry(): Promise<Eu4ProvinceBorderGeometry> {
	if (!provinceBorderGeometryPromise) {
		provinceBorderGeometryPromise = fetch(
			`${EARTH_HISTORY_BASE}/reference/eu4-province-borders.json`,
			{ cache: "no-store" },
		)
			.then((res) => {
				if (!res.ok)
					throw new Error(
						`Failed to load eu4-province-borders.json: ${res.status}`,
					)
				return res.json() as Promise<{ segmentCount: number; bin: string }>
			})
			.then(async (meta) => {
				const binRes = await fetch(
					`${EARTH_HISTORY_BASE}/reference/${meta.bin}`,
					{ cache: "no-store" },
				)
				if (!binRes.ok)
					throw new Error(`Failed to load ${meta.bin}: ${binRes.status}`)
				const buffer = await binRes.arrayBuffer()
				const view = new DataView(buffer)
				const segmentProvinceA = new Int32Array(meta.segmentCount)
				const segmentProvinceB = new Int32Array(meta.segmentCount)
				const segmentLonLatDeg = new Float32Array(meta.segmentCount * 4)
				for (let i = 0; i < meta.segmentCount; i++) {
					const offset = i * 24
					segmentProvinceA[i] = view.getInt32(offset, true)
					segmentProvinceB[i] = view.getInt32(offset + 4, true)
					segmentLonLatDeg[4 * i] = view.getFloat32(offset + 8, true)
					segmentLonLatDeg[4 * i + 1] = view.getFloat32(offset + 12, true)
					segmentLonLatDeg[4 * i + 2] = view.getFloat32(offset + 16, true)
					segmentLonLatDeg[4 * i + 3] = view.getFloat32(offset + 20, true)
				}
				return {
					segmentCount: meta.segmentCount,
					segmentProvinceA,
					segmentProvinceB,
					segmentLonLatDeg,
				}
			})
	}
	return provinceBorderGeometryPromise
}

let provinceFillGeometryPromise: Promise<Eu4ProvinceFillGeometry> | null = null

function loadEu4ProvinceFillGeometry(): Promise<Eu4ProvinceFillGeometry> {
	if (!provinceFillGeometryPromise) {
		provinceFillGeometryPromise = fetch(
			`${EARTH_HISTORY_BASE}/reference/eu4-province-borders-fills.json`,
			{ cache: "no-store" },
		)
			.then((res) => {
				if (!res.ok)
					throw new Error(
						`Failed to load eu4-province-borders-fills.json: ${res.status}`,
					)
				return res.json() as Promise<{
					ringCount: number
					triangleGroupCount?: number
					bin?: string
					ringsBin?: string
					trianglesBin?: string
				}>
			})
			.then(async (meta) => {
				const ringsBin = meta.ringsBin ?? meta.bin
				if (!ringsBin)
					throw new Error("EU4 fill geometry metadata missing rings bin")
				const ringsRes = await fetch(
					`${EARTH_HISTORY_BASE}/reference/${ringsBin}`,
					{ cache: "no-store" },
				)
				if (!ringsRes.ok)
					throw new Error(`Failed to load ${ringsBin}: ${ringsRes.status}`)
				const ringsBuffer = await ringsRes.arrayBuffer()
				const view = new DataView(ringsBuffer)

				const ringProvinceId = new Int32Array(meta.ringCount)
				const ringPolygonIndex = new Int32Array(meta.ringCount)
				const ringIsHole = new Uint8Array(meta.ringCount)
				const ringPointOffset = new Int32Array(meta.ringCount + 1)

				// Records are variable-length (pointCount differs per ring), so
				// a first pass reads only headers to size the flat point buffer,
				// then a second pass fills it in.
				let byteOffset = 0
				let pointTotal = 0
				const pointCounts = new Int32Array(meta.ringCount)
				for (let i = 0; i < meta.ringCount; i++) {
					ringProvinceId[i] = view.getInt32(byteOffset, true)
					ringPolygonIndex[i] = view.getInt32(byteOffset + 4, true)
					ringIsHole[i] = view.getInt32(byteOffset + 8, true)
					const pointCount = view.getInt32(byteOffset + 12, true)
					pointCounts[i] = pointCount
					ringPointOffset[i] = pointTotal
					pointTotal += pointCount
					byteOffset += 16 + pointCount * 8
				}
				ringPointOffset[meta.ringCount] = pointTotal

				const pointsLonLatDeg = new Float32Array(pointTotal * 2)
				byteOffset = 0
				for (let i = 0; i < meta.ringCount; i++) {
					const pointCount = pointCounts[i]
					let pointByteOffset = byteOffset + 16
					const base = ringPointOffset[i] * 2
					for (let p = 0; p < pointCount; p++) {
						pointsLonLatDeg[base + 2 * p] = view.getFloat32(
							pointByteOffset,
							true,
						)
						pointsLonLatDeg[base + 2 * p + 1] = view.getFloat32(
							pointByteOffset + 4,
							true,
						)
						pointByteOffset += 8
					}
					byteOffset += 16 + pointCount * 8
				}

				const triangleGroupCount = meta.triangleGroupCount ?? 0
				const triangleProvinceId = new Int32Array(triangleGroupCount)
				const trianglePointOffset = new Int32Array(triangleGroupCount + 1)
				let trianglePointsLonLatDeg = new Float32Array(0)
				if (triangleGroupCount > 0) {
					const trianglesBin = meta.trianglesBin
					if (!trianglesBin)
						throw new Error("EU4 fill geometry metadata missing triangles bin")
					const trianglesRes = await fetch(
						`${EARTH_HISTORY_BASE}/reference/${trianglesBin}`,
						{ cache: "no-store" },
					)
					if (!trianglesRes.ok)
						throw new Error(
							`Failed to load ${trianglesBin}: ${trianglesRes.status}`,
						)
					const trianglesBuffer = await trianglesRes.arrayBuffer()
					const trianglesView = new DataView(trianglesBuffer)
					let triangleByteOffset = 0
					let trianglePointTotal = 0
					const trianglePointCounts = new Int32Array(triangleGroupCount)
					for (let i = 0; i < triangleGroupCount; i++) {
						triangleProvinceId[i] = trianglesView.getInt32(
							triangleByteOffset,
							true,
						)
						const pointCount = trianglesView.getInt32(
							triangleByteOffset + 4,
							true,
						)
						trianglePointCounts[i] = pointCount
						trianglePointOffset[i] = trianglePointTotal
						trianglePointTotal += pointCount
						triangleByteOffset += 8 + pointCount * 8
					}
					trianglePointOffset[triangleGroupCount] = trianglePointTotal
					trianglePointsLonLatDeg = new Float32Array(trianglePointTotal * 2)
					triangleByteOffset = 0
					for (let i = 0; i < triangleGroupCount; i++) {
						const pointCount = trianglePointCounts[i]
						let pointByteOffset = triangleByteOffset + 8
						const base = trianglePointOffset[i] * 2
						for (let p = 0; p < pointCount; p++) {
							trianglePointsLonLatDeg[base + 2 * p] = trianglesView.getFloat32(
								pointByteOffset,
								true,
							)
							trianglePointsLonLatDeg[base + 2 * p + 1] =
								trianglesView.getFloat32(pointByteOffset + 4, true)
							pointByteOffset += 8
						}
						triangleByteOffset += 8 + pointCount * 8
					}
				}

				return {
					ringCount: meta.ringCount,
					ringProvinceId,
					ringPolygonIndex,
					ringIsHole,
					ringPointOffset,
					pointsLonLatDeg,
					triangleGroupCount,
					triangleProvinceId,
					trianglePointOffset,
					trianglePointsLonLatDeg,
				}
			})
	}
	return provinceFillGeometryPromise
}

export const DATA_SOURCE = {
	loadProvinceEvents,
	loadNationEvents,
	loadWars,
	loadDiplomacyEvents,
	loadOrganizationEvents,
	loadGeography,
	loadNationReference,
	loadOrganizationReference,
	loadHeritages,
	loadReligionGroups,
	loadProvinceCoordinates,
	loadEu4ProvinceBorderGeometry,
	loadEu4ProvinceFillGeometry,
}

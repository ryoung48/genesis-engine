import type {
	MigrationWorld,
	MigrationWorldParams,
} from "@/test/history-run/fixtures/migration/types"

const SHELF_KM = -0.03
const DEEP_KM = -0.5

function world({
	layout,
	stepDegrees,
	habitability,
	horizonYear,
}: MigrationWorldParams): MigrationWorld {
	const regions = layout.length
	const r_xyz = new Float32Array(regions * 3)
	for (let r = 0; r < regions; r++) {
		const angle = (r * stepDegrees * Math.PI) / 180
		r_xyz[r * 3] = Math.cos(angle)
		r_xyz[r * 3 + 1] = Math.sin(angle)
	}
	const mesh = {
		numRegions: regions,
		r_xyz,
		adjOffset: Int32Array.from({ length: regions + 1 }, (_, r) =>
			Math.max(0, 2 * r - 1 - (r === regions ? 1 : 0)),
		),
		adjList: Int32Array.from(
			Array.from({ length: regions }, (_, r) =>
				[r - 1, r + 1].filter((q) => q >= 0 && q < regions),
			).flat(),
		),
		regionArea: new Float32Array(regions).fill(1e-4),
	}
	const land = [...layout].map((c) => (c === "L" ? 1 : 0))
	const regionProvince = new Int32Array(regions).fill(-1)
	const seeds: number[] = []
	for (let r = 0; r < regions; r++)
		if (land[r]) {
			regionProvince[r] = seeds.length
			seeds.push(r)
		}
	const count = seeds.length
	const landmassId = new Int32Array(count)
	for (let p = 1; p < count; p++)
		landmassId[p] =
			seeds[p] === seeds[p - 1] + 1 ? landmassId[p - 1] : landmassId[p - 1] + 1
	const adjacency = seeds.map((region, p) =>
		[region - 1, region + 1]
			.filter((q) => q >= 0 && q < regions && land[q])
			.map((q) => regionProvince[q] as number)
			.filter((q) => q !== p),
	)
	const adjOffset = new Int32Array(count + 1)
	for (let p = 0; p < count; p++)
		adjOffset[p + 1] = adjOffset[p] + adjacency[p].length
	return {
		provinces: {
			regionProvince,
			seeds: Int32Array.from(seeds),
			count,
			desolate: new Uint8Array(count),
			landmassId,
			adjOffset,
			adjList: Int32Array.from(adjacency.flat()),
			size: new Int32Array(count).fill(1),
			colors: new Float32Array(count * 3),
			waterAccess: new Uint8Array(count),
			riverAccess: new Uint8Array(count),
			lakeAccess: new Uint8Array(count),
		},
		habitability: Float32Array.from(habitability),
		mesh,
		isLand: Uint8Array.from(land),
		elevationKm: Float32Array.from(
			[...layout].map((c) =>
				c === "L" ? 0.1 : c === "~" ? SHELF_KM : DEEP_KM,
			),
		),
		planetRadiusKm: 6371,
		seed: 1,
		horizonYear,
	}
}

export const MIGRATION_FIXTURE = { world }

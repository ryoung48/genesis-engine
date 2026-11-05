import type {
	EclipseDiskParams,
	EclipseDiskUnion,
	EclipseDiskUnionParams,
} from "@/model/celestial/eclipses/disks/types"

const UNION_RINGS = 128
const UNION_SECTORS = 256

const clamp = (v: number) => Math.max(-1, Math.min(1, v))
function overlap({
	starRadius: a,
	moonRadius: b,
	separation: d,
}: EclipseDiskParams): number {
	if (d >= a + b) return 0
	if (d <= Math.abs(a - b)) return Math.min(1, (b * b) / (a * a))
	const x = (d * d + a * a - b * b) / (2 * d * a)
	const y = (d * d + b * b - a * a) / (2 * d * b)
	const lens =
		a * a * Math.acos(clamp(x)) +
		b * b * Math.acos(clamp(y)) -
		0.5 *
			Math.sqrt(
				Math.max(0, (-d + a + b) * (d + a - b) * (d - a + b) * (d + a + b)),
			)
	return Math.max(0, Math.min(1, lens / (Math.PI * a * a)))
}

function union({
	starRadius,
	disks,
}: EclipseDiskUnionParams): EclipseDiskUnion {
	const touching = disks.filter(
		(disk) => Math.hypot(disk.x, disk.y) < starRadius + disk.radius,
	)
	if (touching.length <= 1) {
		const disk = touching[0]
		if (!disk) return { coverage: 0, total: false }
		const separation = Math.hypot(disk.x, disk.y)
		return {
			coverage: overlap({ starRadius, moonRadius: disk.radius, separation }),
			total: separation + starRadius <= disk.radius,
		}
	}
	let covered = 0
	for (let ring = 0; ring < UNION_RINGS; ring++) {
		const r = starRadius * Math.sqrt((ring + 0.5) / UNION_RINGS)
		for (let sector = 0; sector < UNION_SECTORS; sector++) {
			const angle = (2 * Math.PI * (sector + 0.5)) / UNION_SECTORS
			const x = r * Math.cos(angle),
				y = r * Math.sin(angle)
			if (
				touching.some(
					(disk) => (x - disk.x) ** 2 + (y - disk.y) ** 2 < disk.radius ** 2,
				)
			)
				covered++
		}
	}
	const samples = UNION_RINGS * UNION_SECTORS
	return { coverage: covered / samples, total: covered === samples }
}

export const ECLIPSE_DISKS = { overlap, union }

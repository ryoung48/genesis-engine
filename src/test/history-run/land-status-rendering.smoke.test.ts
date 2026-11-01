import { expect, it } from "vitest"
import { DISTRIBUTION_STATUS } from "@/model/history/distribution/status"
import { PROVINCE_STATUS } from "@/model/history/record/status"
import { LAND_STATUS } from "@/ui/genesis/shared/land-status"

it("uses fast history ownership for land status while preserving desolate land", () => {
	const provinceStatus = Uint8Array.of(
		PROVINCE_STATUS.code.stateless,
		PROVINCE_STATUS.code.uninhabited,
		PROVINCE_STATUS.code.uninhabited,
		PROVINCE_STATUS.code.desolate,
	)
	const distributionOwner = Int32Array.of(
		DISTRIBUTION_STATUS.uninhabited,
		DISTRIBUTION_STATUS.stateless,
		0,
		DISTRIBUTION_STATUS.uninhabited,
	)
	expect(
		[0, 1, 2, 3].map((province) => {
			return LAND_STATUS.statusAt({
				provinceStatus,
				distributionOwner,
				province,
			})
		}),
	).toEqual(["uninhabited", "stateless", "state", "desolate"])
	expect(
		LAND_STATUS.statusAt({
			provinceStatus,
			distributionOwner: null,
			province: 0,
		}),
	).toBe("stateless")
})

it("paints only currently uninhabited fast-history regions gray", () => {
	const rgb = Float32Array.of(1, 0, 0, 1, 1, 1, 0.2, 0.3, 0.4, 0, 0, 1)
	const original = rgb.slice()
	const painted = LAND_STATUS.paintUninhabited({
		rgb,
		provinceStatus: Uint8Array.of(
			PROVINCE_STATUS.code.stateless,
			PROVINCE_STATUS.code.uninhabited,
			PROVINCE_STATUS.code.desolate,
		),
		distributionOwner: Int32Array.of(-1, -2, -1),
		regionProvince: Int32Array.of(0, 1, 2, -1),
		elevationKm: new Float32Array(4),
	})
	expect(Array.from(painted.slice(0, 3))).toEqual(
		LAND_STATUS.color({ status: "uninhabited" }),
	)
	expect(painted.slice(3)).toEqual(original.slice(3))
	expect(rgb).toEqual(original)
})

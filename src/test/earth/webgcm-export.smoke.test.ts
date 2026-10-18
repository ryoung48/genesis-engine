import { expect, test, vi } from "vitest"
import { WEBGCM_EXPORT } from "@/model/climate/export/webgcm"

test("WebGCM terrain uses north-to-south rows, west-to-east columns and signed little-endian metres", async () => {
	const numRegions = 360 * 180
	const r_xyz = new Float32Array(numRegions * 3)
	const elevationKm = new Float32Array(numRegions)
	for (let row = 0; row < 180; row++) {
		const latitude = 89.5 - row
		const lat = (latitude * Math.PI) / 180
		for (let column = 0; column < 360; column++) {
			const longitude = column - 179.5
			const lon = (longitude * Math.PI) / 180
			const region = row * 360 + column
			r_xyz[region * 3] = Math.cos(lat) * Math.cos(lon)
			r_xyz[region * 3 + 1] = Math.cos(lat) * Math.sin(lon)
			r_xyz[region * 3 + 2] = Math.sin(lat)
			elevationKm[region] =
				latitude > 0
					? longitude < 0
						? 1.234
						: -4.321
					: longitude < 0
						? 0.0002
						: -0.0002
		}
	}
	let percent = 0
	const buffer = await WEBGCM_EXPORT.createRaster({
		mesh: { numRegions, r_xyz },
		elevationKm,
		onProgress: (progress) => {
			percent = progress.percent
		},
	})
	expect(buffer.byteLength).toBe(2073600)
	expect(percent).toBe(100)
	const output = new DataView(buffer)
	for (const [row, column, expected] of [
		[180, 360, 1234],
		[180, 1080, -4321],
		[540, 360, 1],
		[540, 1080, -1],
	]) {
		expect(output.getInt16((row * 1440 + column) * 2, true)).toBe(expected)
	}
})

test("WebGCM terrain rejects missing geometry and unrepresentable heights", async () => {
	const mesh = { numRegions: 1, r_xyz: new Float32Array([1, 0, 0]) }
	const onProgress = vi.fn()
	await expect(
		WEBGCM_EXPORT.createRaster({
			mesh,
			elevationKm: new Float32Array(),
			onProgress,
		}),
	).rejects.toThrow("incomplete world geometry")
	for (const height of [NaN, Infinity, 40, -40]) {
		await expect(
			WEBGCM_EXPORT.createRaster({
				mesh,
				elevationKm: new Float32Array([height]),
				onProgress,
			}),
		).rejects.toThrow("finite elevations")
	}
	expect(onProgress).not.toHaveBeenCalled()
})

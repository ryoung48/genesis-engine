import type {
	SampleBilinearParams,
	SampleCategoricalRasterParams,
	SampleCoastlineMaskParams,
	SampleHeightmapParams,
	SampleSingleBandFloatRasterParams,
} from "@/model/pipelines/import-heightmap/sampling/types"

function sampleBilinear({
	pixels,
	imgW,
	imgH,
	px,
	py,
}: SampleBilinearParams): number {
	py = Math.max(0, Math.min(py, imgH - 1))
	const x0 = Math.floor(px)
	const y0 = Math.floor(py)
	const x1 = (x0 + 1) % imgW
	const y1 = Math.min(y0 + 1, imgH - 1)
	const fx = px - x0
	const fy = py - y0
	const v00 = pixels[y0 * imgW + (((x0 % imgW) + imgW) % imgW)]
	const v10 = pixels[y0 * imgW + x1]
	const v01 = pixels[y1 * imgW + (((x0 % imgW) + imgW) % imgW)]
	const v11 = pixels[y1 * imgW + x1]
	return (
		v00 * (1 - fx) * (1 - fy) +
		v10 * fx * (1 - fy) +
		v01 * (1 - fx) * fy +
		v11 * fx * fy
	)
}

function grayscaleToElevation(v: number): number {
	if (v < 1) return -0.5
	return Math.sqrt((v - 1) / 254)
}

function sampleHeightmap({
	mesh,
	grayscale,
	imgW,
	imgH,
}: SampleHeightmapParams): Float32Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const elevation = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)

		const px = (lon / Math.PI + 1) * 0.5 * imgW
		const py = (0.5 - lat / Math.PI) * imgH

		const gray = sampleBilinear({ pixels: grayscale, imgW, imgH, px, py })
		elevation[r] = grayscaleToElevation(gray)
	}

	return elevation
}

function sampleSingleBandFloatRaster({
	mesh,
	raster,
	rasterW,
	rasterH,
	scale,
	nodata,
}: SampleSingleBandFloatRasterParams): Float32Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const out = new Float32Array(N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)
		const px = (lon / Math.PI + 1) * 0.5 * rasterW
		const py = (0.5 - lat / Math.PI) * rasterH

		const x0 = Math.floor(px)
		const y0 = Math.floor(py)
		const x1 = (x0 + 1) % rasterW
		const y1 = Math.min(y0 + 1, rasterH - 1)
		const fx = px - x0
		const fy = py - y0
		const xi0 = (((x0 % rasterW) + rasterW) % rasterW) | 0
		const yi0 = Math.max(0, Math.min(rasterH - 1, y0)) | 0

		const q00 = raster[yi0 * rasterW + xi0]
		const q10 = raster[yi0 * rasterW + x1]
		const q01 = raster[y1 * rasterW + xi0]
		const q11 = raster[y1 * rasterW + x1]
		const v00 = q00 === nodata ? NaN : q00 * scale
		const v10 = q10 === nodata ? NaN : q10 * scale
		const v01 = q01 === nodata ? NaN : q01 * scale
		const v11 = q11 === nodata ? NaN : q11 * scale

		let weighted = 0
		let weightSum = 0
		if (Number.isFinite(v00)) {
			const w = (1 - fx) * (1 - fy)
			weighted += v00 * w
			weightSum += w
		}
		if (Number.isFinite(v10)) {
			const w = fx * (1 - fy)
			weighted += v10 * w
			weightSum += w
		}
		if (Number.isFinite(v01)) {
			const w = (1 - fx) * fy
			weighted += v01 * w
			weightSum += w
		}
		if (Number.isFinite(v11)) {
			const w = fx * fy
			weighted += v11 * w
			weightSum += w
		}

		out[r] = weightSum > 0 ? weighted / weightSum : NaN
	}

	return out
}

function sampleCoastlineMask({
	mesh,
	mask,
	maskW,
	maskH,
}: SampleCoastlineMaskParams): Uint8Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const isLand = new Uint8Array(N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)

		const px = ((((lon / Math.PI + 1) * 0.5 * maskW) % maskW) + maskW) % maskW
		const py = Math.max(0, Math.min(maskH - 1, (0.5 - lat / Math.PI) * maskH))

		const xi = Math.min(maskW - 1, Math.round(px))
		const yi = Math.min(maskH - 1, Math.round(py))
		isLand[r] = mask[yi * maskW + xi] >= 128 ? 1 : 0
	}

	return isLand
}

function sampleCategoricalRaster({
	mesh,
	raster,
	rasterW,
	rasterH,
	nodata,
}: SampleCategoricalRasterParams): Int16Array {
	const N = mesh.numRegions
	const { r_xyz } = mesh
	const out = new Int16Array(N)

	for (let r = 0; r < N; r++) {
		const x = r_xyz[3 * r]
		const y = r_xyz[3 * r + 1]
		const z = r_xyz[3 * r + 2]

		const lat = Math.asin(Math.max(-1, Math.min(1, z)))
		const lon = Math.atan2(y, x)

		const px =
			((((lon / Math.PI + 1) * 0.5 * rasterW) % rasterW) + rasterW) % rasterW
		const py = Math.max(
			0,
			Math.min(rasterH - 1, (0.5 - lat / Math.PI) * rasterH),
		)

		const xi = Math.min(rasterW - 1, Math.round(px))
		const yi = Math.min(rasterH - 1, Math.round(py))
		const value = raster[yi * rasterW + xi]
		out[r] = value === nodata ? -1 : value
	}

	return out
}

export const SAMPLING = {
	sampleBilinear,
	grayscaleToElevation,
	sampleHeightmap,
	sampleSingleBandFloatRaster,
	sampleCoastlineMask,
	sampleCategoricalRaster,
}

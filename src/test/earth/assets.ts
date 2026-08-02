import { readFileSync } from "node:fs"
import { join } from "node:path"
import { gunzipSync } from "node:zlib"
import { NODE_PNG } from "@/model/shared/node-png"

const HEIGHTMAP_DIR = join(process.cwd(), "public", "earth-data")

type MonthlyRasterMetadata = {
	bin: string
	width: number
	height: number
	months: number
	scale: number
	nodata: number
	compression: "gzip" | undefined
}

type ElevationRasterMetadata = {
	bin: string
	width: number
	height: number
	scale: number
	nodata: number
	compression: "gzip" | undefined
}

function loadInt16Raster(params: {
	filename: string
	expectedValues: number
	compression: "gzip" | undefined
}): Int16Array {
	const { filename, expectedValues, compression } = params
	const compressed = readFileSync(join(HEIGHTMAP_DIR, filename))
	const bytes = compression === "gzip" ? gunzipSync(compressed) : compressed
	const expectedBytes = expectedValues * Int16Array.BYTES_PER_ELEMENT
	if (bytes.byteLength !== expectedBytes) {
		throw new Error(
			`Expected ${filename} to contain ${expectedBytes} bytes, got ${bytes.byteLength}`,
		)
	}
	return new Int16Array(
		bytes.buffer,
		bytes.byteOffset,
		bytes.byteLength / Int16Array.BYTES_PER_ELEMENT,
	)
}

function loadEarthMonthlyRaster(prefix: string) {
	const meta = JSON.parse(
		readFileSync(join(HEIGHTMAP_DIR, `${prefix}.json`), "utf8"),
	) as MonthlyRasterMetadata
	return {
		monthly: loadInt16Raster({
			filename: meta.bin,
			expectedValues: meta.width * meta.height * meta.months,
			compression: meta.compression,
		}),
		width: meta.width,
		height: meta.height,
		months: meta.months,
		scale: meta.scale,
		nodata: meta.nodata,
	}
}

function loadEarthElevationRaster() {
	const meta = JSON.parse(
		readFileSync(join(HEIGHTMAP_DIR, "earth-real-elevation.json"), "utf8"),
	) as ElevationRasterMetadata
	return {
		raster: loadInt16Raster({
			filename: meta.bin,
			expectedValues: meta.width * meta.height,
			compression: meta.compression,
		}),
		width: meta.width,
		height: meta.height,
		scale: meta.scale,
		nodata: meta.nodata,
	}
}

function loadEarthGrayscale(filename: string) {
	return NODE_PNG.decodePng(readFileSync(join(HEIGHTMAP_DIR, filename)))
}

function loadEarthRiverLines() {
	const json = JSON.parse(
		readFileSync(join(HEIGHTMAP_DIR, "river-lines.json"), "utf8"),
	) as { lines: { points: number[]; strokeweig: number }[] }
	return json.lines
}

export {
	loadEarthElevationRaster,
	loadEarthGrayscale,
	loadEarthMonthlyRaster,
	loadEarthRiverLines,
}

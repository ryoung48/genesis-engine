#!/usr/bin/env node
/**
 * Rasterizes a Natural Earth "land" GeoJSON (equirectangular WGS84 polygons)
 * into an 8-bit grayscale land/ocean mask PNG: 255 = land, 0 = ocean.
 *
 * Uses even-odd scanline polygon fill — no image/geo npm deps required.
 *
 * Usage:
 *   node scripts/rasterize-coastline.mjs <input.geojson> <output.png> [width] [height]
 */

import { readFileSync, writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"

const [, , inPath, outPath, widthArg, heightArg] = process.argv
if (!inPath || !outPath) {
	console.error(
		"Usage: node rasterize-coastline.mjs <input.geojson> <output.png> [width] [height]",
	)
	process.exit(1)
}

const width = widthArg ? Number.parseInt(widthArg, 10) : 4096
const height = heightArg ? Number.parseInt(heightArg, 10) : 2048

const geojson = JSON.parse(readFileSync(inPath, "utf8"))

// lon in [-180,180] -> x in [0,width); lat in [90,-90] -> y in [0,height)
function toPixel([lon, lat]) {
	const x = ((lon + 180) / 360) * width
	const y = ((90 - lat) / 180) * height
	return [x, y]
}

const mask = new Uint8Array(width * height) // 0 = ocean, 255 = land

// Even-odd scanline fill for a single ring (list of [x,y] pixel coords).
// Accumulates x-crossings per scanline into `crossingsByRow`.
function fillRing(ring, crossingsByRow) {
	for (let i = 0; i < ring.length; i++) {
		const [x0, y0] = ring[i]
		const [x1, y1] = ring[(i + 1) % ring.length]
		if (y0 === y1) continue
		const yTop = Math.min(y0, y1)
		const yBot = Math.max(y0, y1)
		const yStart = Math.max(0, Math.ceil(yTop))
		const yEnd = Math.min(height - 1, Math.floor(yBot - 1e-9))
		for (let y = yStart; y <= yEnd; y++) {
			const t = (y - y0) / (y1 - y0)
			const x = x0 + t * (x1 - x0)
			let arr = crossingsByRow[y]
			if (!arr) arr = crossingsByRow[y] = []
			arr.push(x)
		}
	}
}

// Rings whose vertices cross the antimeridian (lon jumps from ~+180 to
// ~-180 between consecutive points) would otherwise produce a pixel-space
// edge that spans almost the entire raster width, corrupting the fill.
// Unwrap each ring's x so it's a continuous sequence (allowing values
// outside [0, width)), then rasterize it three times at x offsets of
// -width/0/+width — exactly one copy lands correctly in [0, width) for
// any given scanline, including ones that genuinely straddle the seam.
function unwrapRingX(ring) {
	const unwrapped = ring.map((p) => [...p])
	for (let i = 1; i < unwrapped.length; i++) {
		while (unwrapped[i][0] - unwrapped[i - 1][0] > width / 2)
			unwrapped[i][0] -= width
		while (unwrapped[i][0] - unwrapped[i - 1][0] < -width / 2)
			unwrapped[i][0] += width
	}
	return unwrapped
}

function rasterizePolygon(rings) {
	// rings[0] = outer, rings[1..] = holes. Even-odd rule handles both
	// in one pass if we feed all rings' crossings together per scanline.
	const crossingsByRow = new Array(height)
	for (const ring of rings) {
		const unwrapped = unwrapRingX(ring.map(toPixel))
		for (const offset of [-width, 0, width]) {
			fillRing(
				unwrapped.map(([x, y]) => [x + offset, y]),
				crossingsByRow,
			)
		}
	}
	for (let y = 0; y < height; y++) {
		const xs = crossingsByRow[y]
		if (!xs || xs.length < 2) continue
		xs.sort((a, b) => a - b)
		for (let i = 0; i + 1 < xs.length; i += 2) {
			const xStart = Math.max(0, Math.round(xs[i]))
			const xEnd = Math.min(width - 1, Math.round(xs[i + 1]) - 1)
			const rowOff = y * width
			for (let x = xStart; x <= xEnd; x++) mask[rowOff + x] = 255
		}
	}
}

let polyCount = 0
for (const feature of geojson.features) {
	const g = feature.geometry
	const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates
	for (const poly of polys) {
		rasterizePolygon(poly)
		polyCount++
	}
}
console.log(`Rasterized ${polyCount} polygons at ${width}x${height}`)

let landPx = 0
for (let i = 0; i < mask.length; i++) if (mask[i] === 255) landPx++
console.log(`Land coverage: ${((landPx / mask.length) * 100).toFixed(2)}%`)

// ── Encode as an 8-bit grayscale PNG (color type 0, bit depth 8), Paeth-filtered ──

function paethPredictor(a, b, c) {
	const p = a + b - c
	const pa = Math.abs(p - a)
	const pb = Math.abs(p - b)
	const pc = Math.abs(p - c)
	if (pa <= pb && pa <= pc) return a
	if (pb <= pc) return b
	return c
}

const stride = width
const raw = Buffer.alloc(height * (1 + stride))
const prevRow = Buffer.alloc(stride)
for (let y = 0; y < height; y++) {
	const rowStart = y * (1 + stride)
	raw[rowStart] = 4 // Paeth
	for (let x = 0; x < width; x++) {
		const cur = mask[y * width + x]
		const a = x > 0 ? mask[y * width + x - 1] : 0
		const b = prevRow[x]
		const c = x > 0 ? prevRow[x - 1] : 0
		raw[rowStart + 1 + x] = (cur - paethPredictor(a, b, c)) & 0xff
	}
	for (let x = 0; x < width; x++) prevRow[x] = mask[y * width + x]
}

function crc32(buf) {
	let c
	const table = (crc32.table ??= (() => {
		const t = new Uint32Array(256)
		for (let n = 0; n < 256; n++) {
			c = n
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
			t[n] = c >>> 0
		}
		return t
	})())
	let crc = 0xffffffff
	for (let i = 0; i < buf.length; i++)
		crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
	return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
	const typeBuf = Buffer.from(type, "ascii")
	const len = Buffer.alloc(4)
	len.writeUInt32BE(data.length, 0)
	const crcBuf = Buffer.alloc(4)
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
	return Buffer.concat([len, typeBuf, data, crcBuf])
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(width, 0)
ihdr.writeUInt32BE(height, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 0 // color type: grayscale
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const idatData = deflateSync(raw, { level: 9 })
const png = Buffer.concat([
	sig,
	chunk("IHDR", ihdr),
	chunk("IDAT", idatData),
	chunk("IEND", Buffer.alloc(0)),
])
writeFileSync(outPath, png)
console.log(`Wrote ${outPath} (${png.length} bytes)`)

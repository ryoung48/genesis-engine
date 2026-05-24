import { describe, expect, it } from "vitest"
import { PngStreamWriter } from "./PngStreamWriter"

function readUint32BE(data: Uint8Array, offset: number): number {
	return (
		((data[offset] << 24) |
			(data[offset + 1] << 16) |
			(data[offset + 2] << 8) |
			data[offset + 3]) >>>
		0
	)
}

function parsePngChunks(data: Uint8Array): Array<{
	type: string
	data: Uint8Array
}> {
	const chunks: Array<{ type: string; data: Uint8Array }> = []
	let offset = 8
	while (offset < data.length) {
		const length = readUint32BE(data, offset)
		const type = new TextDecoder().decode(data.slice(offset + 4, offset + 8))
		const chunkData = data.slice(offset + 8, offset + 8 + length)
		chunks.push({ type, data: chunkData })
		offset += 12 + length
	}
	return chunks
}

describe("PngStreamWriter", () => {
	it("encodes a 1x1 RGBA image with correct PNG signature and IHDR", async () => {
		const writer = new PngStreamWriter(1, 1)
		const rgba = new Uint8Array([255, 128, 64, 255])
		await writer.writeBand(rgba, 1)
		const blob = await writer.finalize()
		const buffer = new Uint8Array(await blob.arrayBuffer())

		expect(buffer[0]).toBe(0x89)
		expect(buffer[1]).toBe(0x50)
		expect(buffer[2]).toBe(0x4e)
		expect(buffer[3]).toBe(0x47)

		const chunks = parsePngChunks(buffer)
		expect(chunks[0]?.type).toBe("IHDR")
		expect(readUint32BE(chunks[0]!.data, 0)).toBe(1)
		expect(readUint32BE(chunks[0]!.data, 4)).toBe(1)
		expect(chunks.some((c) => c.type === "IDAT")).toBe(true)
		expect(chunks.at(-1)?.type).toBe("IEND")
	})

	it("encodes a multi-row image with distinct colors", async () => {
		const width = 4
		const height = 3
		const writer = new PngStreamWriter(width, height)
		const rgba = new Uint8Array(width * height * 4)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const offset = (y * width + x) * 4
				rgba[offset] = (x * 64) % 256
				rgba[offset + 1] = (y * 85) % 256
				rgba[offset + 2] = ((x + y) * 50) % 256
				rgba[offset + 3] = 255
			}
		}
		await writer.writeBand(rgba, height)
		const blob = await writer.finalize()
		const buffer = new Uint8Array(await blob.arrayBuffer())

		const chunks = parsePngChunks(buffer)
		const ihdr = chunks.find((c) => c.type === "IHDR")!
		expect(readUint32BE(ihdr.data, 0)).toBe(width)
		expect(readUint32BE(ihdr.data, 4)).toBe(height)
	})

	it("encodes multiple bands and produces a valid PNG", async () => {
		const width = 8
		const height = 16
		const bandHeight = 4
		const writer = new PngStreamWriter(width, height)

		for (let band = 0; band < height / bandHeight; band++) {
			const rgba = new Uint8Array(width * bandHeight * 4)
			for (let y = 0; y < bandHeight; y++) {
				for (let x = 0; x < width; x++) {
					const offset = (y * width + x) * 4
					const globalY = band * bandHeight + y
					rgba[offset] = (x * 32) % 256
					rgba[offset + 1] = (globalY * 16) % 256
					rgba[offset + 2] = ((x + globalY) * 20) % 256
					rgba[offset + 3] = 255
				}
			}
			await writer.writeBand(rgba, bandHeight)
		}

		const blob = await writer.finalize()
		const buffer = new Uint8Array(await blob.arrayBuffer())

		const chunks = parsePngChunks(buffer)
		const ihdr = chunks.find((c) => c.type === "IHDR")!
		expect(readUint32BE(ihdr.data, 0)).toBe(width)
		expect(readUint32BE(ihdr.data, 4)).toBe(height)
		expect(
			chunks.filter((c) => c.type === "IDAT").length,
		).toBeGreaterThanOrEqual(1)
	})

	it("rejects writing too many rows", async () => {
		const writer = new PngStreamWriter(4, 4)
		const rgba = new Uint8Array(4 * 3 * 4)
		await writer.writeBand(rgba, 3)
		const overflow = new Uint8Array(4 * 2 * 4)
		await expect(writer.writeBand(overflow, 2)).rejects.toThrow(
			"exceeds image height",
		)
	})

	it("rejects finalization before all rows are written", async () => {
		const writer = new PngStreamWriter(4, 8)
		const rgba = new Uint8Array(4 * 4 * 4)
		await writer.writeBand(rgba, 4)
		await expect(writer.finalize()).rejects.toThrow("rows written")
	})

	it("produces a valid PNG structure with correct chunks", async () => {
		const width = 3
		const height = 2
		const writer = new PngStreamWriter(width, height)
		const rgba = new Uint8Array(width * height * 4)
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const offset = (y * width + x) * 4
				rgba[offset] = x * 80
				rgba[offset + 1] = y * 120
				rgba[offset + 2] = (x + y) * 60
				rgba[offset + 3] = 255
			}
		}
		await writer.writeBand(rgba, height)
		const blob = await writer.finalize()
		const buffer = new Uint8Array(await blob.arrayBuffer())

		expect(buffer[0]).toBe(0x89)
		expect(buffer[1]).toBe(0x50)
		expect(buffer[2]).toBe(0x4e)
		expect(buffer[3]).toBe(0x47)

		const chunks = parsePngChunks(buffer)
		const ihdr = chunks.find((c) => c.type === "IHDR")!
		expect(readUint32BE(ihdr.data, 0)).toBe(width)
		expect(readUint32BE(ihdr.data, 4)).toBe(height)
		expect(ihdr.data[8]).toBe(8)
		expect(ihdr.data[9]).toBe(6)
		expect(
			chunks.filter((c) => c.type === "IDAT").length,
		).toBeGreaterThanOrEqual(1)
		expect(chunks.at(-1)?.type).toBe("IEND")
	})
})

import { inflateSync } from "node:zlib"
import type { DecodedPng, PaethParams } from "@/model/pipelines/node-png/types"

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

function channelsForColorType(colorType: number): number {
	switch (colorType) {
		case 0:
			return 1 // gray
		case 2:
			return 3 // rgb
		case 4:
			return 2 // gray + alpha
		case 6:
			return 4 // rgba
		default:
			throw new Error(`Unsupported PNG color type: ${colorType}`)
	}
}

function paeth({ a, b, c }: PaethParams): number {
	const p = a + b - c
	const pa = Math.abs(p - a)
	const pb = Math.abs(p - b)
	const pc = Math.abs(p - c)
	if (pa <= pb && pa <= pc) return a
	if (pb <= pc) return b
	return c
}

function decodePng(buffer: Buffer): DecodedPng {
	for (let i = 0; i < PNG_SIGNATURE.length; i++) {
		if (buffer[i] !== PNG_SIGNATURE[i]) throw new Error("Not a PNG file")
	}

	let offset = PNG_SIGNATURE.length
	let width = 0
	let height = 0
	let bitDepth = 0
	let colorType = 0
	let interlace = 0
	const idatChunks: Buffer[] = []

	while (offset < buffer.length) {
		const length = buffer.readUInt32BE(offset)
		const type = buffer.toString("ascii", offset + 4, offset + 8)
		const dataStart = offset + 8
		const data = buffer.subarray(dataStart, dataStart + length)

		if (type === "IHDR") {
			width = data.readUInt32BE(0)
			height = data.readUInt32BE(4)
			bitDepth = data.readUInt8(8)
			colorType = data.readUInt8(9)
			interlace = data.readUInt8(12)
		} else if (type === "IDAT") {
			idatChunks.push(Buffer.from(data))
		} else if (type === "IEND") {
			break
		}

		offset = dataStart + length + 4 // skip CRC
	}

	if (bitDepth !== 8) {
		throw new Error(`Unsupported PNG bit depth: ${bitDepth}`)
	}
	if (interlace !== 0) {
		throw new Error("Interlaced PNGs are not supported")
	}

	const channels = channelsForColorType(colorType)
	const raw = inflateSync(Buffer.concat(idatChunks))
	const stride = width * channels
	const grayscale = new Uint8Array(width * height)

	const prevRow = new Uint8Array(stride)
	const curRow = new Uint8Array(stride)
	let rawOffset = 0

	for (let y = 0; y < height; y++) {
		const filterType = raw[rawOffset]
		rawOffset += 1
		for (let x = 0; x < stride; x++) {
			const rawValue = raw[rawOffset + x]
			const a = x >= channels ? curRow[x - channels] : 0
			const b = prevRow[x]
			const c = x >= channels ? prevRow[x - channels] : 0
			let value: number
			switch (filterType) {
				case 0:
					value = rawValue
					break
				case 1:
					value = rawValue + a
					break
				case 2:
					value = rawValue + b
					break
				case 3:
					value = rawValue + Math.floor((a + b) / 2)
					break
				case 4:
					value = rawValue + paeth({ a, b, c })
					break
				default:
					throw new Error(`Unsupported PNG filter type: ${filterType}`)
			}
			curRow[x] = value & 0xff
		}
		rawOffset += stride

		for (let x = 0; x < width; x++) {
			const base = x * channels
			if (channels === 1 || channels === 2) {
				grayscale[y * width + x] = curRow[base]
			} else {
				grayscale[y * width + x] = Math.round(
					0.299 * curRow[base] +
						0.587 * curRow[base + 1] +
						0.114 * curRow[base + 2],
				)
			}
		}
		prevRow.set(curRow)
	}

	return { grayscale, width, height }
}

export const NODE_PNG = {
	decodePng,
}

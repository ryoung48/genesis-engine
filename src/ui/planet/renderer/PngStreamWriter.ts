const PNG_SIGNATURE = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

const CRC_TABLE = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
	let c = i
	for (let j = 0; j < 8; j++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	}
	CRC_TABLE[i] = c >>> 0
}

function crc32(data: Uint8Array): number {
	let c = 0xffffffff
	for (let i = 0; i < data.length; i++) {
		c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
	}
	return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = new TextEncoder().encode(type)
	const length = new Uint8Array(4)
	new DataView(length.buffer).setUint32(0, data.length, false)
	const crcData = new Uint8Array(typeBytes.length + data.length)
	crcData.set(typeBytes)
	crcData.set(data, typeBytes.length)
	const crc = crc32(crcData)
	const crcBytes = new Uint8Array(4)
	new DataView(crcBytes.buffer).setUint32(0, crc, false)
	const chunk = new Uint8Array(4 + typeBytes.length + data.length + 4)
	chunk.set(length)
	chunk.set(typeBytes, 4)
	chunk.set(data, 8)
	chunk.set(crcBytes, 8 + data.length)
	return chunk
}

function makeIHDR(width: number, height: number): Uint8Array {
	const data = new Uint8Array(13)
	const view = new DataView(data.buffer)
	view.setUint32(0, width, false)
	view.setUint32(4, height, false)
	data[8] = 8
	data[9] = 6
	data[10] = 0
	data[11] = 0
	data[12] = 0
	return makeChunk("IHDR", data)
}

export class PngStreamWriter {
	private readonly width: number
	private readonly height: number
	private readonly onProgress?: (
		rowsCompleted: number,
		totalRows: number,
	) => void
	private readonly pngParts: Uint8Array[] = []
	private readonly compressor = new CompressionStream("deflate")
	private readonly input = this.compressor.writable.getWriter()
	private readonly output = this.compressor.readable.getReader()
	private nextRow = 0
	private drainDone = false
	private drainResolve?: () => void
	private drainReject?: (reason: unknown) => void

	constructor(
		width: number,
		height: number,
		onProgress?: (rowsCompleted: number, totalRows: number) => void,
	) {
		this.width = width
		this.height = height
		this.onProgress = onProgress
		this.pngParts.push(PNG_SIGNATURE)
		this.pngParts.push(makeIHDR(width, height))
		this.startDrain()
	}

	private startDrain() {
		const promise = new Promise<void>((resolve, reject) => {
			this.drainResolve = resolve
			this.drainReject = reject
		})
		void this.drainLoop()
			.then(() => {
				this.drainDone = true
				this.drainResolve?.()
			})
			.catch((err) => {
				this.drainReject?.(err)
			})
		return promise
	}

	private async drainLoop() {
		while (true) {
			const { value, done } = await this.output.read()
			if (done) break
			if (value && value.length > 0) {
				this.pngParts.push(makeChunk("IDAT", value))
			}
		}
	}

	async writeBand(rgba: Uint8Array, rowCount: number): Promise<void> {
		if (this.nextRow + rowCount > this.height) {
			throw new Error(
				`PngStreamWriter: writing ${rowCount} rows at row ${this.nextRow} exceeds image height ${this.height}`,
			)
		}
		const bytesPerRow = this.width * 4
		const filtered = new Uint8Array(rowCount * (bytesPerRow + 1))
		for (let row = 0; row < rowCount; row++) {
			const srcOffset = row * bytesPerRow
			const destOffset = row * (bytesPerRow + 1)
			filtered[destOffset] = 0
			filtered.set(
				rgba.subarray(srcOffset, srcOffset + bytesPerRow),
				destOffset + 1,
			)
		}
		await this.input.write(filtered)
		this.nextRow += rowCount
		this.onProgress?.(this.nextRow, this.height)
	}

	async finalize(): Promise<Blob> {
		if (this.nextRow !== this.height) {
			throw new Error(
				`PngStreamWriter: cannot finalize with ${this.nextRow}/${this.height} rows written`,
			)
		}
		await this.input.close()
		await new Promise<void>((resolve, reject) => {
			if (this.drainDone) {
				resolve()
			} else {
				this.drainResolve = resolve
				this.drainReject = reject
			}
		})
		this.pngParts.push(makeChunk("IEND", new Uint8Array()))
		const totalLength = this.pngParts.reduce((sum, p) => sum + p.length, 0)
		const combined = new Uint8Array(totalLength)
		let offset = 0
		for (const part of this.pngParts) {
			combined.set(part, offset)
			offset += part.length
		}
		return new Blob([combined], { type: "image/png" })
	}
}

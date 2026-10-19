const MAGIC = "CHGCM001"
const TYPES = {
	Float64Array,
	Float32Array,
	Int32Array,
	Uint32Array,
	Uint8Array,
}
const align = (value) => Math.ceil(value / 8) * 8

function encode({ value }) {
	const arrays = [],
		blocks = []
	let bytes = 0
	const visit = (node) => {
		if (
			Array.isArray(node) &&
			node.length > 0 &&
			node.every((item) => typeof item === "number")
		)
			node = Float64Array.from(node)
		if (ArrayBuffer.isView(node)) {
			if (!(node.constructor.name in TYPES))
				throw new Error("Unsupported packet array type")
			const index = arrays.length
			arrays.push({
				type: node.constructor.name,
				offset: bytes,
				length: node.length,
			})
			blocks.push(new Uint8Array(node.buffer, node.byteOffset, node.byteLength))
			bytes = align(bytes + node.byteLength)
			return { $array: index }
		}
		if (node === null || typeof node !== "object") {
			if (typeof node === "number" && !Number.isFinite(node))
				throw new Error("Non-finite packet metadata")
			return node
		}
		if (Array.isArray(node)) return node.map(visit)
		return Object.fromEntries(
			Object.entries(node).map(([key, item]) => [key, visit(item)]),
		)
	}
	const tree = visit(value)
	const header = new TextEncoder().encode(
		JSON.stringify({ version: 1, arrays, tree }),
	)
	const start = align(12 + header.length),
		result = new ArrayBuffer(start + bytes),
		output = new Uint8Array(result)
	output.set(new TextEncoder().encode(MAGIC))
	new DataView(result).setUint32(8, header.length, true)
	output.set(header, 12)
	blocks.forEach((block, i) => output.set(block, start + arrays[i].offset))
	return result
}

function decode({ buffer }) {
	if (
		!(buffer instanceof ArrayBuffer) ||
		buffer.byteLength < 16 ||
		new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== MAGIC
	)
		throw new Error("Not a native GCM packet")
	const length = new DataView(buffer).getUint32(8, true),
		start = align(12 + length)
	if (length > 1024 * 1024 || start > buffer.byteLength)
		throw new Error("Invalid native GCM header")
	const header = JSON.parse(
		new TextDecoder().decode(new Uint8Array(buffer, 12, length)),
	)
	if (header.version !== 1 || !Array.isArray(header.arrays))
		throw new Error("Unsupported native GCM packet")
	const arrays = header.arrays.map((entry) => {
		const Type = Object.hasOwn(TYPES, entry.type) ? TYPES[entry.type] : null
		if (
			!Type ||
			!Number.isSafeInteger(entry.offset) ||
			entry.offset < 0 ||
			entry.offset % 8 ||
			!Number.isSafeInteger(entry.length) ||
			entry.length < 0 ||
			entry.length * Type.BYTES_PER_ELEMENT >
				buffer.byteLength - start - entry.offset
		)
			throw new Error("Invalid native GCM array")
		return new Type(
			buffer.slice(
				start + entry.offset,
				start + entry.offset + entry.length * Type.BYTES_PER_ELEMENT,
			),
		)
	})
	const visit = (node) => {
		if (node === null || typeof node !== "object") return node
		if (Object.hasOwn(node, "$array")) {
			if (
				Object.keys(node).length !== 1 ||
				!Number.isInteger(node.$array) ||
				node.$array < 0 ||
				node.$array >= arrays.length
			)
				throw new Error("Invalid native GCM array reference")
			return arrays[node.$array]
		}
		if (Array.isArray(node)) return node.map(visit)
		return Object.fromEntries(
			Object.entries(node).map(([key, item]) => [key, visit(item)]),
		)
	}
	return visit(header.tree)
}

export const NATIVE_PACKET = { encode, decode }

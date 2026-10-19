export interface EncodeNativePacketInput {
	value: unknown
}

export interface DecodeNativePacketInput {
	buffer: ArrayBuffer
}

export interface NativePacketApi {
	encode: (input: EncodeNativePacketInput) => ArrayBuffer
	decode: (input: DecodeNativePacketInput) => unknown
}

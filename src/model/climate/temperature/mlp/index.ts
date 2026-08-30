import type {
	MlpModel,
	TemperatureMlpFeatures,
} from "@/model/climate/temperature/mlp/types"
import { MLP_WEIGHTS } from "@/model/climate/temperature/mlp/weights"

function decodeFloat32(base64: string): Float32Array {
	const binary =
		typeof Buffer !== "undefined"
			? Buffer.from(base64, "base64").toString("binary")
			: atob(base64)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
}

const MODEL: MlpModel = {
	featureCount: MLP_WEIGHTS.features.length,
	scalerMean: decodeFloat32(MLP_WEIGHTS.scalerMeanB64),
	scalerScale: decodeFloat32(MLP_WEIGHTS.scalerScaleB64),
	layers: MLP_WEIGHTS.layers.map((layer) => ({
		inDim: layer.inDim,
		outDim: layer.outDim,
		weights: decodeFloat32(layer.weightsB64),
		bias: decodeFloat32(layer.biasB64),
	})),
}

function featureVector(f: TemperatureMlpFeatures): number[] {
	const latRad = (f.latDeg * Math.PI) / 180
	const monthAngle = (2 * Math.PI * f.month) / 12
	const west = f.distCoastWestKm
	const east = f.distCoastEastKm
	return [
		f.latDeg,
		Math.abs(f.latDeg),
		Math.cos(latRad),
		Math.sin(monthAngle),
		Math.cos(monthAngle),
		f.elevationKm,
		f.distCoastKm,
		f.landmassExtentKm,
		west,
		east,
		(west - east) / (west + east + 1e-6),
		f.nearbyMaxElevKm,
		f.terrainRoughnessKm,
	]
}

function predict(features: TemperatureMlpFeatures): number {
	const input = featureVector(features)
	let activations = new Float32Array(MODEL.featureCount)
	for (let i = 0; i < MODEL.featureCount; i++) {
		activations[i] = (input[i] - MODEL.scalerMean[i]) / MODEL.scalerScale[i]
	}

	for (let l = 0; l < MODEL.layers.length; l++) {
		const layer = MODEL.layers[l]
		const isOutput = l === MODEL.layers.length - 1
		const next = new Float32Array(layer.outDim)
		for (let o = 0; o < layer.outDim; o++) {
			let sum = layer.bias[o]
			const rowBase = o * layer.inDim
			for (let i = 0; i < layer.inDim; i++) {
				sum += activations[i] * layer.weights[rowBase + i]
			}
			next[o] = isOutput ? sum : sum > 0 ? sum : 0
		}
		activations = next
	}

	return activations[0]
}

export const TEMPERATURE_MLP = { predict }

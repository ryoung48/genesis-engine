import type { SverdrupPlanet } from "@/model/climate/ocean/currents/sverdrup/circulation/types"

export type ThermoclineDepthParams = {
	interior: Float32Array
	ocean: Uint8Array
	planet: SverdrupPlanet
}

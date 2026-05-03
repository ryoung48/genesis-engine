function shadeColorAtElevation(
	color: [number, number, number],
	heightKm: number,
	maxDarken: number,
	darkenRate: number,
	postShade = 1,
): [number, number, number] {
	const h = Math.max(0, heightKm)
	const shade = (1 - Math.min(maxDarken, h * darkenRate)) * postShade
	return [color[0] * shade, color[1] * shade, color[2] * shade]
}

export function darkenVegetationAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	return shadeColorAtElevation(color, heightKm, 0.55, 0.075)
}

export function darkenClimateAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	return shadeColorAtElevation(color, heightKm, 0.45, 0.06)
}

export function darkenPoliticalAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	return darkenVegetationAtElevation(color, heightKm)
}

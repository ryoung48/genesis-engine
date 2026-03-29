export function darkenVegetationAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	const h = Math.max(0, heightKm)
	const shade = 1 - Math.min(0.55, h * 0.075)
	return [color[0] * shade, color[1] * shade, color[2] * shade]
}

export function darkenClimateAtElevation(
	color: [number, number, number],
	heightKm: number,
): [number, number, number] {
	const h = Math.max(0, heightKm)
	const shade = 1 - Math.min(0.45, h * 0.06)
	return [color[0] * shade, color[1] * shade, color[2] * shade]
}

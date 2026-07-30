export function repeatMapPositions(
	positions: number[],
	repeatWidth: number,
): number[] {
	if (positions.length === 0) return positions
	const repeated = positions.slice()
	for (let index = 0; index < positions.length; index += 3) {
		repeated.push(
			positions[index] - repeatWidth,
			positions[index + 1],
			positions[index + 2],
		)
	}
	for (let index = 0; index < positions.length; index += 3) {
		repeated.push(
			positions[index] + repeatWidth,
			positions[index + 1],
			positions[index + 2],
		)
	}
	return repeated
}

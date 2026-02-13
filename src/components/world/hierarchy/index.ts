import { interpolateSpectral } from "d3"
import { NATION } from "@/model/nations"
import { PROVINCE } from "@/model/provinces"
import { WorldPaintParams } from "../types"

export const DRAW_HIERARCHY = {
	nation: ({
		ctx,
		projection,
		selectedNation,
		scale,
		time,
	}: WorldPaintParams) => {
		// Draw hierarchy lines for selected nation when zoomed in
		if (selectedNation !== null && selectedNation !== undefined && scale >= 2) {
			const nationCapital = window.world.provinces[selectedNation]
			const overlord = PROVINCE.parent.get(nationCapital, time) ?? nationCapital
			if (nationCapital && overlord === nationCapital) {
				const nationProvinces = NATION.provinces(nationCapital, time)

				// Helper to get hierarchy depth (0 = capital, 1 = direct vassal, etc.)
				const getDepth = (provinceIdx: number): number => {
					if (provinceIdx === selectedNation) return 0
					const province = window.world.provinces[provinceIdx]
					const overlord = PROVINCE.parent.get(province, time) ?? province
					if (overlord === province) return 0
					return 1 + getDepth(overlord.idx)
				}

				// Draw lines from each province to its overlord
				nationProvinces.forEach((province) => {
					const overlord = PROVINCE.parent.get(province, time) ?? province
					if (overlord === province) return // Skip the capital

					const pCell = window.world.cells[province.cell]
					const oCell = window.world.cells[overlord.cell]
					const pCoords = projection([pCell.x, pCell.y])
					const oCoords = projection([oCell.x, oCell.y])

					if (!pCoords || !oCoords) return

					const depth = getDepth(province.idx)
					const color = interpolateSpectral(Math.min(1, depth / 6))
					const lineWidth = scale * 0.25

					ctx.beginPath()
					ctx.moveTo(pCoords[0], pCoords[1])
					ctx.lineTo(oCoords[0], oCoords[1])
					ctx.strokeStyle = color
					ctx.lineWidth = lineWidth
					ctx.stroke()
				})

				// Draw circles at province centers
				nationProvinces.forEach((province) => {
					const pCell = window.world.cells[province.cell]
					const coords = projection([pCell.x, pCell.y])
					if (!coords) return

					const depth = getDepth(province.idx)

					if (province.idx === selectedNation) {
						// Capital: Diamond with white center
						const size = Math.max(4, 6 * scale * 0.25)
						ctx.beginPath()
						ctx.moveTo(coords[0], coords[1] - size / 2)
						ctx.lineTo(coords[0] + size / 2, coords[1])
						ctx.lineTo(coords[0], coords[1] + size / 2)
						ctx.lineTo(coords[0] - size / 2, coords[1])
						ctx.closePath()

						ctx.fillStyle = "white"
						ctx.fill()
						ctx.strokeStyle = nationCapital.color
						ctx.lineWidth = scale * 0.25
						ctx.stroke()
					} else {
						// Vassals: Circles
						const radius = Math.max(2, 4 * scale * 0.125)
						const color = interpolateSpectral(Math.min(1, depth / 10))

						ctx.beginPath()
						ctx.arc(coords[0], coords[1], radius, 0, Math.PI * 2)
						ctx.fillStyle = `rgba(255, 255, 255, 0.9)`
						ctx.fill()
						ctx.strokeStyle = color
						ctx.lineWidth = scale * 0.25
						ctx.stroke()
					}
				})
			}
		}
	},
}

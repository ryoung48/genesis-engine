import * as THREE from "three"
import type { GenesisContext } from "@/ui/genesis/renderer/genesis-scene/context"
import type {
	GridLineParams,
	GridPoint,
	LabelParams,
	ProjectionParams,
} from "@/ui/genesis/renderer/grid-labels/types"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import { GRID_SPACING_DEG } from "@/ui/genesis/shared/constants"

export function createGridLabels(ctx: GenesisContext) {
	const canvas = document.createElement("canvas")
	canvas.style.cssText =
		"position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1"
	ctx.canvas.insertAdjacentElement("afterend", canvas)
	const context = canvas.getContext("2d")
	const occupied: GridPoint[] = []

	function draw() {
		if (!context) return
		const width = ctx.canvas.clientWidth
		const height = ctx.canvas.clientHeight
		const ratio = window.devicePixelRatio || 1
		if (
			canvas.width !== Math.round(width * ratio) ||
			canvas.height !== Math.round(height * ratio)
		) {
			canvas.width = Math.round(width * ratio)
			canvas.height = Math.round(height * ratio)
		}
		context.setTransform(ratio, 0, 0, ratio, 0, 0)
		context.clearRect(0, 0, width, height)
		if (
			!ctx.coordinateTicksVisible ||
			ctx.solarSystemActive ||
			!width ||
			!height
		)
			return
		occupied.length = 0
		context.font = "bold 11px sans-serif"
		context.textAlign = "center"
		context.textBaseline = "middle"
		context.lineWidth = 3
		context.strokeStyle = "rgba(0,0,0,0.9)"
		context.fillStyle = "white"
		ctx.camera.updateMatrixWorld()
		ctx.mapCamera.updateMatrixWorld()
		ctx.globeGroup.updateMatrixWorld()
		const projection = createMapProjection(
			ctx.currentMapCenterLongitudeDeg,
			ctx.currentMapProjectionLatitudeDeg,
		)
		const map = ctx.currentViewMode === "map"
		const edge = 16
		const mapTop = new THREE.Vector3(0, 1, 0).project(ctx.mapCamera)
		const mapBottom = new THREE.Vector3(0, -1, 0).project(ctx.mapCamera)
		const top = map
			? Math.max(edge, ((1 - mapTop.y) * height) / 2 + edge)
			: edge
		const bottom = map
			? Math.min(height - edge, ((1 - mapBottom.y) * height) / 2 - edge)
			: height - edge

		function project({ point, copy }: ProjectionParams): GridPoint | null {
			if (map) {
				const p = projection.projectCartesian(point.x, point.y, point.z)
				const coords = projection.projectRadians(p.lon, p.lat)
				point
					.set(
						coords[0] + copy * 4 + (ctx.mapMesh?.position.x ?? 0),
						coords[1] + (ctx.mapMesh?.position.y ?? 0),
						0,
					)
					.project(ctx.mapCamera)
			} else {
				point.applyMatrix4(ctx.globeGroup.matrixWorld)
				const normal = point
					.clone()
					.sub(
						new THREE.Vector3().setFromMatrixPosition(
							ctx.globeGroup.matrixWorld,
						),
					)
					.normalize()
				if (normal.dot(ctx.camera.position.clone().sub(point)) <= 0) return null
				point.project(ctx.camera)
			}
			return { x: ((point.x + 1) * width) / 2, y: ((1 - point.y) * height) / 2 }
		}

		function label({ text, x, y }: LabelParams) {
			if (x < edge || x > width - edge || y < edge || y > height - edge) return
			if (
				occupied.some(
					(point) => Math.abs(point.x - x) < 40 && Math.abs(point.y - y) < 18,
				)
			)
				return
			occupied.push({ x, y })
			context?.strokeText(text, x, y)
			context?.fillText(text, x, y)
		}

		const spacing = GRID_SPACING_DEG
		const stride = Math.ceil(30 / spacing)
		if (!map) {
			const camera = ctx.camera.position
				.clone()
				.applyMatrix4(ctx.globeGroup.matrixWorld.clone().invert())
			const cameraLongitude = THREE.MathUtils.radToDeg(
				Math.atan2(camera.y, camera.x),
			)
			const meridian =
				Math.round((cameraLongitude + 180) / spacing) * spacing - 180
			for (
				let index = 1, latitude = -90 + spacing;
				latitude < 90;
				index++, latitude += spacing
			) {
				if (index % stride !== 0) continue
				const lat = THREE.MathUtils.degToRad(latitude)
				const lon = THREE.MathUtils.degToRad(meridian)
				const point = project({
					point: new THREE.Vector3(
						Math.cos(lat) * Math.cos(lon),
						Math.cos(lat) * Math.sin(lon),
						Math.sin(lat),
					),
					copy: 0,
				})
				if (point)
					label({
						...point,
						y: point.y - 10,
						text:
							latitude === 0
								? "0°"
								: `${Math.abs(latitude)}°${latitude < 0 ? "S" : "N"}`,
					})
			}
			for (
				let index = 0, longitude = -180;
				longitude < 180;
				index++, longitude += spacing
			) {
				if (index % stride !== 0) continue
				const lon = THREE.MathUtils.degToRad(longitude)
				const point = project({
					point: new THREE.Vector3(Math.cos(lon), Math.sin(lon), 0),
					copy: 0,
				})
				if (point)
					label({
						...point,
						y: point.y + 10,
						text:
							longitude === 0
								? "0°"
								: Math.abs(longitude) === 180
									? "180°"
									: `${Math.abs(longitude)}°${longitude < 0 ? "W" : "E"}`,
					})
			}
			return
		}

		function drawLine({ longitude, latitude }: GridLineParams) {
			const value = longitude ?? latitude ?? 0
			const text =
				value === 0
					? "0°"
					: longitude !== null && Math.abs(value) === 180
						? "180°"
						: `${Math.abs(value)}°${longitude !== null ? (value < 0 ? "W" : "E") : value < 0 ? "S" : "N"}`
			for (const copy of map ? [-1, 0, 1] : [0]) {
				let previous: GridPoint | null = null
				for (
					let angle = longitude !== null ? -90 : -180;
					angle <= (longitude !== null ? 90 : 180);
					angle += 2
				) {
					const lon = THREE.MathUtils.degToRad(longitude ?? angle)
					const lat = THREE.MathUtils.degToRad(latitude ?? angle)
					const point = project({
						point: new THREE.Vector3(
							Math.cos(lat) * Math.cos(lon),
							Math.cos(lat) * Math.sin(lon),
							Math.sin(lat),
						),
						copy,
					})
					if (!point) {
						previous = null
						continue
					}
					if (
						previous &&
						Math.abs(point.x - previous.x) <
							(width * ctx.mapCamera.zoom * 2) /
								(ctx.mapCamera.right - ctx.mapCamera.left)
					) {
						for (const boundary of longitude !== null
							? [top, bottom]
							: [edge, width - edge]) {
							const a = longitude !== null ? previous.y : previous.x
							const b = longitude !== null ? point.y : point.x
							if (a === b || (a - boundary) * (b - boundary) > 0) continue
							const t = (boundary - a) / (b - a)
							label({
								text,
								x: previous.x + (point.x - previous.x) * t,
								y: previous.y + (point.y - previous.y) * t,
							})
						}
					}
					previous = point
				}
			}
		}
		for (
			let index = 1, latitude = -90 + spacing;
			latitude < 90;
			index++, latitude += spacing
		) {
			if (index % stride === 0) drawLine({ longitude: null, latitude })
		}
		for (
			let index = 0, longitude = -180;
			longitude < 180;
			index++, longitude += spacing
		) {
			if (index % stride === 0) drawLine({ longitude, latitude: null })
		}
	}

	return { draw, dispose: () => canvas.remove() }
}

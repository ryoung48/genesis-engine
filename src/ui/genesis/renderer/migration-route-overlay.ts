import * as THREE from "three"
import { DATE } from "@/model/history/earth/date"
import { createMapProjection } from "@/ui/genesis/renderer/map-projection"
import type {
	ArrowBuffers,
	ArrowMeshInput,
	BuildMigrationRoutesInput,
	MigrationRoutesOverlay,
	TrunkAnchor,
	TrunkArrowInput,
	TrunkCurve,
	TrunkCurveInput,
} from "@/ui/genesis/renderer/types"

const EARLY_COLOR = new THREE.Color(0x8e1b12)
const LATE_COLOR = new THREE.Color(0xf3a69c)
const ARROW_OPACITY = 0.8
const LATEST_SHADE_BP = 300
const ARROW_RENDER_ORDER = 996
const LABEL_RENDER_ORDER = 999
const MIN_HALF_WIDTH_RAD = 0.004
const MAX_HALF_WIDTH_RAD = 0.024
const HEAD_WIDTH_RATIO = 2.2
const MIN_HEAD_HALF_WIDTH_RAD = 0.011
const HEAD_LENGTH_RATIO = 1.7
const SMOOTH_PASSES = 2
const SIMPLIFY_TOLERANCE_RAD = 0.009
const MIN_TRUNK_ARC_RAD = 0.02
const SAMPLES_PER_SPAN = 12
const MIN_SAMPLES = 24
const GLOBE_LIFT = 0.012
const MAP_LIFT = 0.012
const MIN_LABEL_COS = 0.9962
const LABEL_HEIGHT = 0.024
const LABEL_CANVAS_WIDTH = 360
const LABEL_CANVAS_HEIGHT = 80
const BP_ANCHOR_YEAR = 1950
const BP_THRESHOLD_YEAR = -1000
const BP_ROUND_COARSE = 500
const BP_ROUND_FINE = 100
const MAP_UP = new THREE.Vector3(0, 0, 1)

function formatArrival(year: number): string {
	if (year > BP_THRESHOLD_YEAR) return DATE.formatEu4Year(year)
	const before = BP_ANCHOR_YEAR - year
	const step = before >= 10000 ? BP_ROUND_COARSE : BP_ROUND_FINE
	return `${(Math.round(before / step) * step).toLocaleString("en-US")} BP`
}

function createLabel(params: { text: string; aspect: number }): THREE.Sprite {
	const { text, aspect } = params
	const canvas = document.createElement("canvas")
	canvas.width = LABEL_CANVAS_WIDTH
	canvas.height = LABEL_CANVAS_HEIGHT
	const context = canvas.getContext("2d")
	if (context) {
		context.font = "bold 52px sans-serif"
		context.textAlign = "center"
		context.textBaseline = "middle"
		context.lineJoin = "round"
		context.lineWidth = 12
		context.strokeStyle = "#ffffff"
		context.strokeText(text, canvas.width / 2, canvas.height / 2)
		context.fillStyle = "#7b241c"
		context.fillText(text, canvas.width / 2, canvas.height / 2)
	}
	const texture = new THREE.CanvasTexture(canvas)
	texture.colorSpace = THREE.SRGBColorSpace
	const material = new THREE.SpriteMaterial({
		map: texture,
		depthWrite: false,
		sizeAttenuation: false,
		transparent: true,
	})
	const sprite = new THREE.Sprite(material)
	const ratio = LABEL_CANVAS_WIDTH / LABEL_CANVAS_HEIGHT
	sprite.scale.set(LABEL_HEIGHT * ratio, LABEL_HEIGHT * aspect, 1)
	sprite.center.set(0.5, -0.35)
	sprite.renderOrder = LABEL_RENDER_ORDER
	return sprite
}

function smoothUnits(units: THREE.Vector3[]): THREE.Vector3[] {
	let current = units
	for (let pass = 0; pass < SMOOTH_PASSES; pass++) {
		const previous = current
		current = previous.map((unit, i) =>
			i === 0 || i === previous.length - 1
				? unit
				: previous[i - 1]
						.clone()
						.add(unit)
						.add(previous[i + 1])
						.normalize(),
		)
	}
	return current
}

function simplify(units: THREE.Vector3[]): number[] {
	const last = units.length - 1
	const keep = new Uint8Array(units.length)
	keep[0] = 1
	keep[last] = 1
	const stack: [number, number][] = [[0, last]]
	const normal = new THREE.Vector3()
	while (stack.length) {
		const [a, b] = stack.pop() as [number, number]
		const span = units[a].angleTo(units[b])
		normal.crossVectors(units[a], units[b])
		const normalLength = normal.length()
		let worst = -1
		let worstDistance = SIMPLIFY_TOLERANCE_RAD
		for (let i = a + 1; i < b; i++) {
			const toA = units[i].angleTo(units[a])
			const toB = units[i].angleTo(units[b])
			const distance =
				normalLength > 1e-9 && toA <= span && toB <= span
					? Math.asin(
							Math.min(1, Math.abs(units[i].dot(normal)) / normalLength),
						)
					: Math.min(toA, toB)
			if (distance > worstDistance) {
				worst = i
				worstDistance = distance
			}
		}
		if (worst < 0) continue
		keep[worst] = 1
		stack.push([a, worst], [worst, b])
	}
	const kept: number[] = []
	for (let i = 0; i <= last; i++) if (keep[i]) kept.push(i)
	return kept
}

function sampleTrunk(input: TrunkCurveInput): TrunkCurve {
	const { controls, halfWidths, shades, spherical } = input
	const curve = new THREE.CatmullRomCurve3(controls, false, "centripetal")
	const spans = controls.length - 1
	const count = Math.max(MIN_SAMPLES, spans * SAMPLES_PER_SPAN)
	const points = curve.getPoints(count)
	const widths: number[] = []
	const sampledShades: number[] = []
	points.forEach((point, i) => {
		const u = (i / count) * spans
		const k = Math.min(Math.floor(u), spans - 1)
		const f = u - k
		if (spherical)
			point.setLength(
				THREE.MathUtils.lerp(controls[k].length(), controls[k + 1].length(), f),
			)
		widths.push(THREE.MathUtils.lerp(halfWidths[k], halfWidths[k + 1], f))
		sampledShades.push(THREE.MathUtils.lerp(shades[k], shades[k + 1], f))
	})
	return { points, halfWidths: widths, shades: sampledShades }
}

function appendArrow(input: TrunkArrowInput): void {
	const { curve, spherical, scale, buffers } = input
	const { positions, colors, indices } = buffers
	const { points, halfWidths, shades } = curve
	const color = new THREE.Color()
	const pushColor = (shade: number) => {
		color.lerpColors(EARLY_COLOR, LATE_COLOR, shade)
		colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
	}
	const n = points.length
	const toTip = new Array<number>(n).fill(0)
	for (let i = n - 2; i >= 0; i--)
		toTip[i] = toTip[i + 1] + points[i].distanceTo(points[i + 1])
	let headHalf = Math.max(
		MIN_HEAD_HALF_WIDTH_RAD * scale,
		halfWidths[n - 1] * HEAD_WIDTH_RATIO,
	)
	let headLength = headHalf * HEAD_LENGTH_RATIO
	if (headLength > toTip[0] / 2) {
		headLength = toTip[0] / 2
		headHalf = headLength / HEAD_LENGTH_RATIO
	}
	let j = 0
	while (j < n - 2 && toTip[j + 1] >= headLength) j++
	const f = (toTip[j] - headLength) / Math.max(1e-12, toTip[j] - toTip[j + 1])
	const base = points[j].clone().lerp(points[j + 1], f)
	const tip = points[n - 1]
	const direction = tip.clone().sub(base).normalize()
	const body = [...points.slice(0, j + 1), base]
	const bodyHalf = [
		...halfWidths.slice(0, j + 1),
		THREE.MathUtils.lerp(halfWidths[j], halfWidths[j + 1], f),
	]
	const side = new THREE.Vector3()
	const tangent = new THREE.Vector3()
	const start = positions.length / 3
	body.forEach((point, i) => {
		if (i === body.length - 1) tangent.copy(direction)
		else tangent.subVectors(body[i + 1], body[Math.max(0, i - 1)]).normalize()
		const up = spherical ? point.clone().normalize() : MAP_UP
		side.crossVectors(up, tangent).normalize()
		const left = point.clone().addScaledVector(side, bodyHalf[i])
		const right = point.clone().addScaledVector(side, -bodyHalf[i])
		positions.push(left.x, left.y, left.z, right.x, right.y, right.z)
		pushColor(i === body.length - 1 ? shades[n - 1] : shades[i])
		if (i > 0) {
			const a = start + (i - 1) * 2
			indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
		}
	})
	const headLeft = base.clone().addScaledVector(side, headHalf)
	const headRight = base.clone().addScaledVector(side, -headHalf)
	const headStart = positions.length / 3
	positions.push(
		headLeft.x,
		headLeft.y,
		headLeft.z,
		headRight.x,
		headRight.y,
		headRight.z,
		tip.x,
		tip.y,
		tip.z,
	)
	pushColor(shades[n - 1])
	colors.push(color.r, color.g, color.b)
	indices.push(headStart, headStart + 1, headStart + 2)
}

function arrowMesh(params: ArrowMeshInput): THREE.Mesh {
	const { buffers } = params
	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(buffers.positions, 3),
	)
	geometry.setAttribute(
		"color",
		new THREE.Float32BufferAttribute(buffers.colors, 3),
	)
	geometry.setIndex(buffers.indices)
	const material = new THREE.MeshBasicMaterial({
		vertexColors: true,
		side: THREE.DoubleSide,
		depthTest: params.depthTest,
		depthWrite: false,
		transparent: true,
		opacity: ARROW_OPACITY,
	})
	const mesh = new THREE.Mesh(geometry, material)
	mesh.renderOrder = ARROW_RENDER_ORDER
	return mesh
}

function build(input: BuildMigrationRoutesInput): MigrationRoutesOverlay {
	const { routes, seeds, r_xyz, elevation, canvasSize } = input
	const projection = createMapProjection(
		input.centerLongitudeDeg,
		input.projectionLatitudeDeg,
	)
	const mapScale = projection.repeatWidth / (2 * Math.PI)
	const aspect = canvasSize[0] / Math.max(1, canvasSize[1])
	const globe = new THREE.Group()
	const map = new THREE.Group()
	const total = routes.trunks.reduce(
		(largest, trunk) => Math.max(largest, trunk.sizes[0]),
		1,
	)
	let earliest = Infinity
	let latest = -Infinity
	for (const trunk of routes.trunks)
		for (const year of trunk.years) {
			earliest = Math.min(earliest, year)
			latest = Math.max(latest, year)
		}
	const logBp = (year: number) =>
		Math.log(Math.max(LATEST_SHADE_BP, BP_ANCHOR_YEAR - year))
	const logRange = Math.max(1e-6, logBp(earliest) - logBp(latest))
	const shade = (year: number) =>
		THREE.MathUtils.clamp((logBp(earliest) - logBp(year)) / logRange, 0, 1)
	const halfWidth = (size: number) =>
		MIN_HALF_WIDTH_RAD +
		(MAX_HALF_WIDTH_RAD - MIN_HALF_WIDTH_RAD) * Math.sqrt(size / total)

	const unit = (province: number) => {
		const region = seeds[province]
		const x = r_xyz[region * 3]
		const y = r_xyz[region * 3 + 1]
		const z = r_xyz[region * 3 + 2]
		const length = Math.hypot(x, y, z) || 1
		return new THREE.Vector3(x / length, y / length, z / length)
	}
	const lift = (province: number) => {
		const elev = elevation?.[seeds[province]] ?? 0
		return elev > 0 ? elev * 0.04 : elev * 0.04 * 0.3
	}
	const globePoint = (province: number) =>
		unit(province).multiplyScalar(1 + lift(province) + GLOBE_LIFT)
	const mapPoint = (params: {
		normal: THREE.Vector3
		lift: number
		previousX: number | null
	}) => {
		const { normal } = params
		const projected = projection.projectCartesian(normal.x, normal.y, normal.z)
		const [x, y] = projection.projectRadians(projected.lon, projected.lat, 0)
		let unwrapped = x
		if (params.previousX !== null) {
			while (unwrapped - params.previousX > projection.repeatWidth / 2)
				unwrapped -= projection.repeatWidth
			while (unwrapped - params.previousX < -projection.repeatWidth / 2)
				unwrapped += projection.repeatWidth
		}
		return new THREE.Vector3(unwrapped, y, MAP_LIFT + params.lift * 0.5)
	}

	const globeBuffers: ArrowBuffers = { positions: [], colors: [], indices: [] }
	const mapBuffers: ArrowBuffers = { positions: [], colors: [], indices: [] }
	const anchors = new Map<number, TrunkAnchor>()
	for (const trunk of routes.trunks) {
		if (trunk.provinces.length < 2) continue
		const anchor = anchors.get(trunk.provinces[0])
		const units = smoothUnits(trunk.provinces.map(unit))
		if (anchor) units[0] = anchor.globe.clone().normalize()
		const kept = simplify(units)
		let arc = 0
		for (let i = 1; i < kept.length; i++)
			arc += units[kept[i - 1]].angleTo(units[kept[i]])
		if (arc < MIN_TRUNK_ARC_RAD) continue
		const widths = kept.map((i) => halfWidth(trunk.sizes[i]))
		const shades = kept.map((i) => shade(trunk.years[i]))
		const lifts = kept.map((i) => lift(trunk.provinces[i]))
		const globeControls = kept.map((i, k) =>
			units[i].clone().multiplyScalar(1 + lifts[k] + GLOBE_LIFT),
		)
		const mapControls: THREE.Vector3[] = []
		let previousX: number | null = null
		kept.forEach((i, k) => {
			const point = mapPoint({ normal: units[i], lift: lifts[k], previousX })
			mapControls.push(point)
			previousX = point.x
		})
		if (anchor) {
			globeControls[0] = anchor.globe.clone()
			mapControls[0] = anchor.map.clone()
			widths[0] = Math.min(widths[0], anchor.halfWidth)
			while (mapControls[1].x - mapControls[0].x > projection.repeatWidth / 2)
				mapControls[0].x += projection.repeatWidth
			while (mapControls[1].x - mapControls[0].x < -projection.repeatWidth / 2)
				mapControls[0].x -= projection.repeatWidth
		}
		const globeCurve = sampleTrunk({
			controls: globeControls,
			halfWidths: widths,
			shades,
			spherical: true,
		})
		const mapCurve = sampleTrunk({
			controls: mapControls,
			halfWidths: widths.map((width) => width * mapScale),
			shades,
			spherical: false,
		})
		const spans = kept.length - 1
		const samples = globeCurve.points.length - 1
		for (let k = 0; k < spans; k++)
			for (let i = kept[k]; i <= kept[k + 1]; i++) {
				const u = k + (i - kept[k]) / (kept[k + 1] - kept[k])
				const sample = Math.round((u / spans) * samples)
				anchors.set(trunk.provinces[i], {
					globe: globeCurve.points[sample],
					map: mapCurve.points[sample],
					halfWidth: globeCurve.halfWidths[sample],
				})
			}
		appendArrow({
			curve: globeCurve,
			spherical: true,
			scale: 1,
			buffers: globeBuffers,
		})
		appendArrow({
			curve: mapCurve,
			spherical: false,
			scale: mapScale,
			buffers: mapBuffers,
		})
	}
	if (globeBuffers.indices.length)
		globe.add(arrowMesh({ buffers: globeBuffers, depthTest: true }))
	if (mapBuffers.indices.length)
		map.add(arrowMesh({ buffers: mapBuffers, depthTest: false }))

	const placed: THREE.Vector3[] = []
	for (const milestone of routes.milestones) {
		const place = unit(milestone.province)
		if (placed.some((other) => other.dot(place) > MIN_LABEL_COS)) continue
		placed.push(place)
		const text = formatArrival(milestone.year)
		const globeLabel = createLabel({ text, aspect })
		globeLabel.position.copy(globePoint(milestone.province))
		globe.add(globeLabel)
		const mapLabel = createLabel({ text, aspect })
		mapLabel.material.depthTest = false
		mapLabel.position.copy(
			mapPoint({
				normal: place,
				lift: lift(milestone.province),
				previousX: null,
			}),
		)
		map.add(mapLabel)
	}

	globe.visible = input.viewMode === "globe"
	map.visible = input.viewMode !== "globe"
	return { globe, map }
}

export const MIGRATION_ROUTE_OVERLAY = { build }

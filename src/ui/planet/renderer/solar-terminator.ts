import * as THREE from "three"
import { formatClockTimeDisplay } from "@/ui/planet/clock"
import { createMapProjection } from "@/ui/planet/renderer/map-projection"

export function createSolarTerminatorBand(
	points: THREE.Vector3[],
	radius: number,
	halfWidth: number,
): THREE.BufferGeometry {
	const positions = new Float32Array(points.length * 2 * 3)
	const indices: number[] = []

	for (let index = 0; index < points.length; index++) {
		const direction = points[index]!.clone().normalize()
		const inner = direction.clone().multiplyScalar(radius - halfWidth)
		const outer = direction.clone().multiplyScalar(radius + halfWidth)
		const offset = index * 6
		positions[offset] = inner.x
		positions[offset + 1] = inner.y
		positions[offset + 2] = inner.z
		positions[offset + 3] = outer.x
		positions[offset + 4] = outer.y
		positions[offset + 5] = outer.z
	}

	for (let index = 0; index < points.length - 1; index++) {
		const base = index * 2
		indices.push(base, base + 1, base + 3, base, base + 3, base + 2)
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
	geometry.setIndex(indices)
	return geometry
}

export function createSolarTerminatorLabelSprite(label: string): {
	sprite: THREE.Sprite
	aspect: number
} | null {
	if (typeof document === "undefined") return null
	const canvas = document.createElement("canvas")
	const ctx = canvas.getContext("2d")
	if (!ctx) return null
	const textureScale = SOLAR_TERMINATOR_LABEL_TEXTURE_SCALE
	const scaledFontPx = SOLAR_TERMINATOR_LABEL_BASE_FONT_PX * textureScale
	ctx.font = `500 ${scaledFontPx}px ui-monospace, SFMono-Regular, Menlo, monospace`
	const textMetrics = ctx.measureText(label)
	const width = Math.ceil(textMetrics.width / textureScale + 14)
	const height = 22
	canvas.width = width * textureScale
	canvas.height = height * textureScale
	ctx.setTransform(textureScale, 0, 0, textureScale, 0, 0)
	ctx.font = `500 ${SOLAR_TERMINATOR_LABEL_BASE_FONT_PX}px ui-monospace, SFMono-Regular, Menlo, monospace`
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.fillStyle = SOLAR_TERMINATOR_LABEL_BG_FILL
	drawRoundedRect(ctx, 0.5, 0.5, width - 1, height - 1, 6)
	ctx.fill()
	ctx.strokeStyle = SOLAR_TERMINATOR_LABEL_BG_STROKE
	ctx.lineWidth = 1
	ctx.stroke()
	ctx.fillStyle = SOLAR_TERMINATOR_LABEL_TEXT_COLOR
	ctx.fillText(label, width / 2, height / 2 + 0.5)
	const texture = new THREE.CanvasTexture(canvas)
	texture.needsUpdate = true
	texture.colorSpace = THREE.SRGBColorSpace
	const material = new THREE.SpriteMaterial({
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	})
	const sprite = new THREE.Sprite(material)
	sprite.renderOrder = SOLAR_TERMINATOR_LABEL_RENDER_ORDER
	return { sprite, aspect: width / height }
}

export function getSolarTerminatorLabelText(params: {
	anchor: THREE.Vector3
	sunDirection: THREE.Vector3
	hoursPerDay: number
	useMeridiem: boolean
}) {
	const { anchor, sunDirection, hoursPerDay, useMeridiem } = params
	const latitude = Math.asin(anchor.z)
	const declination = Math.asin(sunDirection.z)
	const h0 = THREE.MathUtils.degToRad(SOLAR_TERMINATOR_ALTITUDE_DEG)
	const sinH0 = Math.sin(h0)
	const denom = Math.max(
		1e-6,
		Math.abs(Math.cos(latitude) * Math.cos(declination)),
	)
	const cosHourAngle = THREE.MathUtils.clamp(
		(sinH0 - Math.sin(latitude) * Math.sin(declination)) / denom,
		-1,
		1,
	)
	const hourAngleMagnitude = Math.acos(cosHourAngle)
	const east = new THREE.Vector3(-anchor.y, anchor.x, 0)
	if (east.lengthSq() < 1e-6) east.set(0, 1, 0)
	east.normalize()
	const isSunrise = east.dot(sunDirection) > 0
	const localHours =
		12 +
		((isSunrise ? -hourAngleMagnitude : hourAngleMagnitude) * hoursPerDay) /
			(2 * Math.PI)
	return `${isSunrise ? "↑" : "↓"} ${formatClockTimeDisplay(
		localHours,
		hoursPerDay,
		useMeridiem,
	)}`
}

export function buildSolarTerminatorRingPoints(
	sunDirection: THREE.Vector3,
	radius: number,
): THREE.Vector3[] | null {
	const sunDir = sunDirection.clone().normalize()
	if (sunDir.lengthSq() === 0) return null
	const reference =
		Math.abs(sunDir.z) > 0.9
			? new THREE.Vector3(1, 0, 0)
			: new THREE.Vector3(0, 0, 1)
	const uAxis = new THREE.Vector3().crossVectors(reference, sunDir).normalize()
	const vAxis = new THREE.Vector3().crossVectors(sunDir, uAxis).normalize()
	const h0 = THREE.MathUtils.degToRad(SOLAR_TERMINATOR_ALTITUDE_DEG)
	const sinH0 = Math.sin(h0)
	const cosH0 = Math.cos(h0)
	const sampleCount = 192
	const points: THREE.Vector3[] = []
	for (let index = 0; index <= sampleCount; index++) {
		const t = (index / sampleCount) * Math.PI * 2
		const ring = uAxis
			.clone()
			.multiplyScalar(Math.cos(t))
			.addScaledVector(vAxis, Math.sin(t))
		points.push(
			sunDir
				.clone()
				.multiplyScalar(sinH0)
				.addScaledVector(ring, cosH0)
				.normalize()
				.multiplyScalar(radius),
		)
	}
	return points
}

export function projectSolarTerminatorPointsToMap(
	points: THREE.Vector3[],
	centerLongitudeDeg: number,
	projectionLatitudeDeg: number,
	zOffset: number,
): THREE.Vector3[][] {
	const projection = createMapProjection(
		centerLongitudeDeg,
		projectionLatitudeDeg,
	)
	const segments: THREE.Vector3[][] = []
	let currentSegment: THREE.Vector3[] = []
	const seamThreshold = projection.repeatWidth * 0.5

	for (let index = 0; index < points.length; index++) {
		const point = points[index]!
		const lon = Math.atan2(point.y, point.x)
		const lat = Math.asin(
			THREE.MathUtils.clamp(point.z / Math.max(point.length(), 1e-6), -1, 1),
		)
		const projected = projection.projectRadians(lon, lat, zOffset)
		const nextPoint = new THREE.Vector3(
			projection.clampX(projected[0]),
			projection.clampY(projected[1]),
			projected[2],
		)
		const previousPoint = currentSegment[currentSegment.length - 1]

		if (
			previousPoint &&
			Math.abs(nextPoint.x - previousPoint.x) > seamThreshold
		) {
			if (currentSegment.length > 1) segments.push(currentSegment)
			currentSegment = [nextPoint]
			continue
		}

		currentSegment.push(nextPoint)
	}

	if (currentSegment.length > 1) segments.push(currentSegment)
	return segments
}

function drawRoundedRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
) {
	ctx.beginPath()
	ctx.moveTo(x + radius, y)
	ctx.lineTo(x + width - radius, y)
	ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
	ctx.lineTo(x + width, y + height - radius)
	ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
	ctx.lineTo(x + radius, y + height)
	ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
	ctx.lineTo(x, y + radius)
	ctx.quadraticCurveTo(x, y, x + radius, y)
	ctx.closePath()
}

const SOLAR_TERMINATOR_LABEL_TEXT_COLOR = "#0f172a"

const SOLAR_TERMINATOR_LABEL_BG_FILL = "rgba(248, 250, 252, 0.94)"

const SOLAR_TERMINATOR_LABEL_BG_STROKE = "rgba(148, 163, 184, 0.55)"

const SOLAR_TERMINATOR_LABEL_BASE_FONT_PX = 12

const SOLAR_TERMINATOR_LABEL_TEXTURE_SCALE = 2

export const SOLAR_TERMINATOR_ALTITUDE_DEG = -0.833

export const SOLAR_TERMINATOR_LINE_COLOR = 0xf8fafc

export const SOLAR_TERMINATOR_HAIRLINE_COLOR = 0x0f172a

export const SOLAR_TERMINATOR_BAND_COLOR = 0xe2e8f0

export const SOLAR_TERMINATOR_RADIUS = 1.02

export const SOLAR_TERMINATOR_ELEVATED_RADIUS = 1.05

export const SOLAR_TERMINATOR_BAND_HALF_WIDTH = 0.008

export const SOLAR_TERMINATOR_LABEL_COUNT = 24

export const SOLAR_TERMINATOR_LABEL_RENDER_ORDER = 1002

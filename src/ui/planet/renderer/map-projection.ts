import * as THREE from "three"

const MAP_X_SCALE = 2 / Math.PI
export const MAX_MAP_PROJECTION_LATITUDE_DEG = 90

function wrapLongitudeRadians(longitude: number, centerLongitude = 0): number {
	let wrapped = longitude - centerLongitude
	if (wrapped > Math.PI) wrapped -= 2 * Math.PI
	else if (wrapped < -Math.PI) wrapped += 2 * Math.PI
	return wrapped
}

function rotateForProjection(
	x: number,
	y: number,
	z: number,
	centerLongitude: number,
	centerLatitude: number,
) {
	const cosLon = Math.cos(centerLongitude)
	const sinLon = Math.sin(centerLongitude)
	const xLon = cosLon * x + sinLon * y
	const yLon = -sinLon * x + cosLon * y
	const cosLat = Math.cos(centerLatitude)
	const sinLat = Math.sin(centerLatitude)
	return {
		x: cosLat * xLon + sinLat * z,
		y: yLon,
		z: -sinLat * xLon + cosLat * z,
	}
}

export function createMapProjection(
	centerLongitudeDeg: number,
	projectionLatitudeDeg = 0,
) {
	const centerLongitude = THREE.MathUtils.degToRad(centerLongitudeDeg)
	const centerLatitude = THREE.MathUtils.degToRad(
		THREE.MathUtils.clamp(
			projectionLatitudeDeg,
			-MAX_MAP_PROJECTION_LATITUDE_DEG,
			MAX_MAP_PROJECTION_LATITUDE_DEG,
		),
	)
	const halfWidth = 2
	const repeatWidth = 4

	return {
		centerLongitude,
		projectionLatitudeDeg,
		halfWidth,
		repeatWidth,
		clampX(value: number) {
			return THREE.MathUtils.clamp(value, -halfWidth, halfWidth)
		},
		clampY(value: number) {
			return THREE.MathUtils.clamp(value, -1, 1)
		},
		wrapLongitude(longitude: number) {
			return wrapLongitudeRadians(longitude, centerLongitude)
		},
		projectCartesian(x: number, y: number, z: number) {
			const rotated = rotateForProjection(
				x,
				y,
				z,
				centerLongitude,
				centerLatitude,
			)
			return {
				lon: Math.atan2(rotated.y, rotated.x),
				lat: Math.asin(THREE.MathUtils.clamp(rotated.z, -1, 1)),
			}
		},
		projectRadians(lon: number, lat: number, z = 0) {
			return [lon * MAP_X_SCALE, lat * MAP_X_SCALE, z] as const
		},
		projectDegrees(lonDeg: number, latDeg: number, z = 0) {
			const lon = THREE.MathUtils.degToRad(lonDeg)
			const lat = THREE.MathUtils.degToRad(latDeg)
			const cosLat = Math.cos(lat)
			const projected = this.projectCartesian(
				cosLat * Math.cos(lon),
				cosLat * Math.sin(lon),
				Math.sin(lat),
			)
			return this.projectRadians(projected.lon, projected.lat, z)
		},
	}
}

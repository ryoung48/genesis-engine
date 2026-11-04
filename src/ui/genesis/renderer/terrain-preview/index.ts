import {
	BufferAttribute,
	BufferGeometry,
	DoubleSide,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
} from "three"
import type { PreparedGeometry } from "@/ui/genesis/renderer/geometry-preparation/types"

function create(prepared: PreparedGeometry) {
	const globeGeometry = new BufferGeometry()
	globeGeometry.setAttribute(
		"position",
		new BufferAttribute(prepared.terrain.positions, 3),
	)
	globeGeometry.setAttribute(
		"normal",
		new BufferAttribute(prepared.terrain.normals, 3),
	)
	globeGeometry.setAttribute(
		"color",
		new BufferAttribute(prepared.terrain.colors, 3),
	)
	const mapGeometry = new BufferGeometry()
	mapGeometry.setAttribute(
		"position",
		new BufferAttribute(prepared.map.positions, 3),
	)
	mapGeometry.setAttribute("color", new BufferAttribute(prepared.map.colors, 3))
	return {
		globe: new Mesh(
			globeGeometry,
			new MeshLambertMaterial({ vertexColors: true, dithering: true }),
		),
		map: new Mesh(
			mapGeometry,
			new MeshBasicMaterial({ vertexColors: true, side: DoubleSide }),
		),
	}
}

export const TERRAIN_PREVIEW = { create }

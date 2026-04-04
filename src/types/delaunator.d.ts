declare module "delaunator" {
	export default class Delaunator {
		triangles: Uint32Array
		halfedges: Int32Array
		hull: Uint32Array

		constructor(coords: ArrayLike<number>)
	}
}

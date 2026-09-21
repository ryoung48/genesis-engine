export interface KinColumns {
	count: number
	sex: Uint8Array
	father: Int32Array
	mother: Int32Array
	firstChild: Int32Array
	nextSiblingFather: Int32Array
	nextSiblingMother: Int32Array
}

export interface KinLinkParams {
	kin: KinColumns
	child: number
}

export interface KinChildrenParams {
	kin: KinColumns
	parent: number
}

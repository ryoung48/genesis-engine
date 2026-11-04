import type { BufferGeometry } from "three"
import { InterleavedBuffer, InterleavedBufferAttribute } from "three"
import { CONTOUR_SURFACE } from "@/ui/genesis/renderer/contours/surface"
import type { ContourField } from "@/ui/genesis/renderer/contours/surface/types"
import type {
	ContourJob,
	ContourSource,
	ContourWorkerRequest,
	ContourWorkerResponse,
	ContourWorkerState,
	PrepareContoursInput,
	SetContourControlsInput,
	SetContoursVisibleInput,
} from "@/ui/genesis/renderer/contours/worker/types"

const FIELD_INDEX: Record<ContourField, number> = { elevation: 0, tidal: 1 }
const CONTROL_ATTRIBUTES = [
	["contourControl0", 4, 0],
	["contourControl1", 3, 4],
	["contourControl2", 3, 7],
	["contourMask", 1, 10],
] as const

const states = new WeakMap<ContourSource, ContourWorkerState>()
const jobs = new WeakMap<BufferGeometry, ContourJob>()

function prepare(input: PrepareContoursInput) {
	let state = states.get(input.world)
	if (!state) {
		const { mesh, elevation_km, isLand, tidalRange } = input.world
		const ocean = new Uint8Array(mesh.numRegions)
		for (let r = 0; r < mesh.numRegions; r++) ocean[r] = isLand[r] ? 0 : 1
		state = {
			worker: null,
			jobs: new Map(),
			users: 0,
			nextId: 0,
			world: {
				elevation_km,
				tidalRange: tidalRange ?? null,
				ocean,
				mesh: {
					numRegions: mesh.numRegions,
					numTriangles: mesh.numTriangles,
					adjOffset: mesh.adjOffset,
					adjList: mesh.adjList,
					neighborDist: mesh.neighborDist,
					r_xyz: mesh.r_xyz,
					t_xyz: mesh.t_xyz,
					s_begin_r: mesh.s_begin_r,
					s_inner_t: mesh.s_inner_t,
					s_outer_t: mesh.s_outer_t,
				},
			},
		}
		states.set(input.world, state)
	}
	const job: ContourJob = {
		geometry: input.geometry,
		sides: input.sides,
		mapOrder: input.mapOrder,
		state,
		material: null,
		requestRender: null,
		visible: false,
		field: "elevation",
		readyField: null,
		pendingField: null,
	}
	state.users++
	jobs.set(input.geometry, job)
	const dispose = () => {
		input.geometry.removeEventListener("dispose", dispose)
		jobs.delete(input.geometry)
		for (const [id, pending] of job.state.jobs)
			if (pending === job) job.state.jobs.delete(id)
		job.state.users--
		if (job.state.users === 0) {
			job.state.worker?.terminate()
			job.state.worker = null
		}
	}
	input.geometry.addEventListener("dispose", dispose)
}

function setControls(input: SetContourControlsInput) {
	const { geometry } = input.job
	const existing = geometry.getAttribute("contourControl0")
	if (
		existing instanceof InterleavedBufferAttribute &&
		existing.data.array.length === input.controls.length
	) {
		existing.data.array.set(input.controls)
		existing.data.needsUpdate = true
		return
	}
	const buffer = new InterleavedBuffer(input.controls, CONTOUR_SURFACE.stride)
	for (const [name, size, offset] of CONTROL_ATTRIBUTES)
		geometry.setAttribute(
			name,
			new InterleavedBufferAttribute(buffer, size, offset),
		)
}

function start(state: ContourWorkerState): Worker {
	if (state.worker) return state.worker
	const worker = new Worker(new URL("./contours.worker.ts", import.meta.url), {
		type: "module",
	})
	state.worker = worker
	worker.onmessage = (event: MessageEvent<ContourWorkerResponse>) => {
		const { id, field, controls } = event.data
		const job = state.jobs.get(id)
		state.jobs.delete(id)
		if (!job || !job.material) return
		setControls({ job, controls })
		job.pendingField = null
		job.readyField = field
		job.material.userData.contourReady = true
		job.material.needsUpdate = true
		sync(job)
		job.requestRender?.()
	}
	worker.onerror = (event) => {
		console.error("Contour worker failed", event.message)
		for (const job of state.jobs.values()) job.pendingField = null
		state.jobs.clear()
		worker.terminate()
		state.worker = null
	}
	worker.postMessage({
		type: "initialize",
		world: state.world,
	} satisfies ContourWorkerRequest)
	return worker
}

function sync(job: ContourJob) {
	const material = job.material
	if (!material) return
	const ready = job.readyField === job.field
	material.userData.contourVisibility.value = ready && job.visible ? 1 : 0
	material.userData.contourField.value = FIELD_INDEX[job.field]
	if (!job.visible || ready || job.pendingField === job.field) return
	const worker = start(job.state)
	const id = job.state.nextId++
	job.pendingField = job.field
	job.state.jobs.set(id, job)
	worker.postMessage({
		type: "generate",
		id,
		field: job.field,
		sides: job.sides,
		mapOrder: job.mapOrder,
	} satisfies ContourWorkerRequest)
}

function setVisible(input: SetContoursVisibleInput) {
	const job = jobs.get(input.mesh.geometry)
	if (!job) return
	const material = input.mesh.material
	if (Array.isArray(material)) return
	job.material = material
	job.visible = input.visible
	job.field = input.field
	job.requestRender = input.requestRender
	sync(job)
}

export const CONTOUR_WORKER = { prepare, setVisible }

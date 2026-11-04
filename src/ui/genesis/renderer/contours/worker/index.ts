import type { BufferGeometry } from "three"
import { InterleavedBuffer, InterleavedBufferAttribute } from "three"
import type { ContourWorld } from "@/ui/genesis/renderer/contours/surface/types"
import type {
	ContourJob,
	ContourWorkerRequest,
	ContourWorkerResponse,
	ContourWorkerState,
	PrepareContoursInput,
	SetContoursVisibleInput,
} from "@/ui/genesis/renderer/contours/worker/types"

const states = new WeakMap<ContourWorld, ContourWorkerState>()
const jobs = new WeakMap<BufferGeometry, ContourJob>()

function prepare(input: PrepareContoursInput) {
	let state = states.get(input.world)
	if (!state) {
		const { mesh, elevation_km } = input.world
		state = {
			worker: null,
			jobs: new Map(),
			users: 0,
			nextId: 0,
			world: {
				elevation_km,
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
		ready: false,
		pending: false,
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

function start(state: ContourWorkerState): Worker {
	if (state.worker) return state.worker
	const worker = new Worker(new URL("./contours.worker.ts", import.meta.url), {
		type: "module",
	})
	state.worker = worker
	worker.onmessage = (event: MessageEvent<ContourWorkerResponse>) => {
		const { id, controls } = event.data
		const job = state.jobs.get(id)
		state.jobs.delete(id)
		if (!job || !job.material) return
		const buffer = new InterleavedBuffer(controls, 10)
		job.geometry.setAttribute(
			"contourControl0",
			new InterleavedBufferAttribute(buffer, 4, 0),
		)
		job.geometry.setAttribute(
			"contourControl1",
			new InterleavedBufferAttribute(buffer, 3, 4),
		)
		job.geometry.setAttribute(
			"contourControl2",
			new InterleavedBufferAttribute(buffer, 3, 7),
		)
		job.pending = false
		job.ready = true
		job.material.userData.contourReady = true
		job.material.userData.contourVisibility.value = job.visible ? 1 : 0
		job.material.needsUpdate = true
		job.requestRender?.()
	}
	worker.onerror = (event) => {
		console.error("Contour worker failed", event.message)
		for (const job of state.jobs.values()) job.pending = false
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

function setVisible(input: SetContoursVisibleInput) {
	const job = jobs.get(input.mesh.geometry)
	if (!job) return
	const material = input.mesh.material
	if (Array.isArray(material)) return
	job.material = material
	job.visible = input.visible
	job.requestRender = input.requestRender
	material.userData.contourVisibility.value = job.ready && input.visible ? 1 : 0
	if (!input.visible || job.ready || job.pending) return
	const worker = start(job.state)
	const id = job.state.nextId++
	job.pending = true
	job.state.jobs.set(id, job)
	worker.postMessage({
		type: "generate",
		id,
		sides: job.sides,
		mapOrder: job.mapOrder,
	} satisfies ContourWorkerRequest)
}

export const CONTOUR_WORKER = { prepare, setVisible }

# Workerization Plan

This document captures the practical path for moving the Orogen generation pipeline off the main thread without overcommitting to the full source-app worker architecture up front.

## Goal

Keep rendering and interaction on the main thread, but move CPU-heavy world generation into a Web Worker so the UI remains responsive during generation.

## Current State

- Orogen generation runs synchronously on the main thread in `src/components/orogen/OrogenView.tsx`.
- `generateOrogenWorld(...)` in `src/model/orogen/pipeline.ts` performs the full pipeline inline.
- The app already benefits from a clear separation between:
  - generation/model code in `src/model/orogen`
  - rendering/UI code in `src/components/orogen`
- The current feature set does not yet need the full retained-state worker model used by the source app.

## Recommendation

Implement worker support in phases.

1. Phase 1: workerize `generate` only.
2. Phase 2: clean up the worker boundary with transfer-friendly result types.
3. Phase 3: add retained worker state only if terrain reapply, edit recompute, or deferred climate become real requirements.

## Phase 1: Generate In Worker

### Scope

Move only full world generation into a worker.

### Files To Add

- `src/model/orogen/orogen.worker.ts`
- `src/model/orogen/worker-types.ts`

### Files To Update

- `src/components/orogen/OrogenView.tsx`
- `src/model/orogen/pipeline.ts`

### Worker API

Start with a minimal message contract.

Request:

```ts
type OrogenWorkerRequest =
	| {
			type: "generate"
			params: OrogenParams
	  }
```

Response:

```ts
type OrogenWorkerResponse =
	| {
			type: "progress"
			label: string
			pct?: number
	  }
	| {
			type: "done"
			world: OrogenWorld
	  }
	| {
			type: "error"
			message: string
			stack?: string
	  }
```

### UI Changes

Replace the direct `generateOrogenWorld(...)` call in `OrogenView.tsx` with:

- create worker
- post `generate`
- set `generating = true`
- receive `done` and update world state
- receive `error` and surface failure cleanly
- terminate worker on unmount

### Pipeline Changes

Keep `generateOrogenWorld(...)` as the main orchestration entry point.

Small improvement:

- add an optional progress callback argument so the worker can emit stage updates without duplicating pipeline logic

Example:

```ts
type ProgressFn = (label: string, pct?: number) => void

generateOrogenWorld(params, onProgress?)
```

This keeps the pipeline reusable from both the worker and any future test harnesses.

### Why Phase 1 Is Worth Doing

- Immediate UX improvement
- Smallest architectural change
- Keeps renderer untouched
- Preserves a simple mental model

## Phase 2: Clean Worker Boundary

### Problem

`OrogenWorld` currently contains rich structures such as `Set` and `Map`. These can be cloned across the worker boundary, but they are not an ideal contract for long-term performance or maintainability.

### Recommendation

Define a serialized worker result shape built from:

- typed arrays
- plain arrays
- plain objects
- primitives

### Likely Changes

- convert region sets like `mountain_r`, `coastline_r`, `ocean_r` into `Int32Array` or `number[]`
- avoid shipping `regions: Set<number>` for each plate unless a real consumer needs it
- prefer plain arrays or object records over `Map`
- explicitly transfer large typed-array buffers with `postMessage(..., transferList)`

### Suggested Types

```ts
type SerializedOrogenWorld = {
	mesh: SerializedSphereMesh
	elevation: Float32Array
	plateAssignment: Int32Array
	params: OrogenParams
	// additional renderer-facing/plain fields only
}
```

### Outcome

The worker result becomes cheaper to send, easier to version, and less coupled to internal model implementation details.

## Phase 3: Retained Worker State

Only do this if the product needs more source-app parity.

### Trigger Conditions

- terrain reapply controls
- plate edit/recompute workflow
- deferred climate computation
- multi-step generation commands where recomputing from scratch is too expensive

### What Changes

Split pipeline responsibilities into reusable stages:

- base mesh + plate generation
- collision/elevation
- post-processing
- climate

Then keep retained state inside the worker, similar to the source app, so follow-up commands can reuse prior computation.

### Additional Worker Commands

Potential future commands:

- `generate`
- `reapplyTerrain`
- `computeClimate`
- `editRecompute`

### Cost

This is the step where complexity materially increases:

- more command types
- more retained state lifecycle concerns
- more serialization discipline
- more edge-case handling when params change

Do not start here unless those features are actually needed.

## Open Questions For Later

- Does the UI need progress labels only, or percent plus stage detail?
- Should the worker return `OrogenWorld` directly in Phase 1, or should serialization happen immediately?
- Will climate be added soon enough that Phase 2 should happen immediately after Phase 1?
- Are there any renderer assumptions today that depend on `Set`/`Map` structures and would complicate a serialized shape?

## Recommended Next Step When This Is Revisited

Implement Phase 1 only:

1. Add worker message types.
2. Add `orogen.worker.ts`.
3. Route `Generate World` through the worker.
4. Add optional pipeline progress callback.
5. Verify the UI stays responsive during generation.

If that lands cleanly, evaluate whether Phase 2 is justified before adding more worker features.

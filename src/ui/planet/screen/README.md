# `src\planet\screen`

This folder owns the **planet screen's application-layer logic**.

It sits between:

- `src\model` — simulation, world generation, climate/history data, worker payloads
- `src\planet\renderer` and presentational React components — drawing the globe/map and rendering UI

Code in this folder should answer questions like:

- What should the planet screen display for the current world and selected modes?
- How do generation controls translate into worker requests and preview state?
- How do we reconstruct a displayable history view for a specific time slice?
- What small shared constants/types/formatters are specific to the planet screen?

## Subfolders

- `display` — derives UI-facing display models, region colors, stats, and nation detail data
- `generation` — generation/import workflow glue, defaults, sliders, and preview helpers
- `history` — history timeline queries and time conversion helpers for the screen
- `shared` — small screen-local constants, types, and formatting helpers

## What does not belong here

- Core simulation and generation algorithms
- Renderer internals, meshes, shaders, and scene management
- Generic UI components with no planet-screen-specific behavior
- Broad cross-app utilities that should live in a shared module

If a module mainly adapts model data for the planet experience, coordinates screen workflows, or defines screen-local display behavior, it belongs here.

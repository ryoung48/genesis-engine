# Native-grid GCM implementation

See [the native GCM guide](webgcm-native-grid.md) for operation and file formats.

## Geometry

`geometry.mjs` builds unique edges from the existing halfedges. It retains the original `r_xyz` cell centers, `t_xyz` polygon vertices, region ordering and neighbor graph. The existing vertices are normalized triangle averages, not true Voronoi circumcenters. Edge normals therefore come from the actual boundary arc, rather than assuming the center connection is perpendicular to it.

Cell areas are recomputed with signed spherical fan pieces. The original builder sums absolute pieces, which can overcount a polygon that is not star-shaped about its center. The adapter verifies total area against the sphere with relative tolerance `1e-5`, allowing source single-precision coordinates while rejecting substantial geometry errors. Least-squares reconstruction rejects a normalized determinant below `1e-12` as effectively singular in double precision.

`layout.mjs` adds model vertex partitions, Coriolis fields and tangential reconstruction stencils. The per-edge capacity is bounded by `2 * maxCellDegree - 1`, including its own velocity degree of freedom. Stencils are built one edge at a time to avoid retaining a Map for every edge on large worlds.

## Operators

`operators.mjs` and `engine-operators.mjs` provide cell scalar gradients, corrected edge-normal gradients, shared-flux divergence, velocity reconstruction, circulation and reference Laplacians. Tangent vectors are parallel-transported between cell centers and edge midpoints.

The corrected scalar gradient subtracts the tangential center-offset contribution before dividing by the normal center separation. `stencils.mjs` precomputes its sparse linear form and the circulation operator. Zero-weight padding supports variable degree on the GPU. Gradient accumulation uses scalar differences to reduce cancellation of a large constant background in float32.

`gpu-transform.mjs` adapts the installed model's buffer layouts, uploads and WGSL functions. It replaces fixed six/ten-edge capacities and wires native gradients, circulation, kinetic energy and wind reconstruction into atmospheric and isopycnal-ocean kernels. Source anchors fail explicitly if the installed GCM changes. The server transforms a separate module URL tree; the original checkout files and running application are not rewritten.

The dedicated browser check executes the production helper functions on GPU and compares them with CPU operators using identical float32 inputs. The sampled relative L2 differences have been around `1e-7`. This checks operator implementation agreement, not agreement with observations or climate realism.

## Sessions and execution

The CPU reference uses a process-local Node module fork. The browser uses a dedicated WebGPU worker. Both retain WebGCM's 36-layer `bl36` atmosphere and 47-layer isopycnal ocean, with moisture, radiation, surface exchange, land and ice routines active.

Initialization uses the existing analytic initializer and default radiative-convective column profile, with winds at rest. The column calculation is not a global climate spin-up. Skin temperature and lowest-layer air temperature are separate outputs; neither is relabeled as a 2 m diagnostic. Browser rain fields are rates in mm/day.

The trial atmosphere step bound is `0.1 * min(cellArea / cellPerimeter) / sqrt(CP_DRY * 350 K)`. The coefficient supplies a conservative trial CFL margin, and the speed uses the model's dry-air heat capacity and a 350 K reference atmospheric enthalpy scale. This is not a demonstrated all-state stability bound. The ocean retains its existing substep limit, which depends on the minimum center spacing across all edges, including land. Very close inland centers can therefore increase global ocean work.

GPU advancement is submitted in bounded batches, with `max(1, floor(24 * sqrt(2562 / cellCount)))` steps per batch. This follows the existing application's 24-step budget at N=16 (2,562 cells) and its inverse-subdivision scaling. It avoids queuing an arbitrarily long command buffer for a requested simulated minute. Pause requests are handled between batches and return fields at the actual completed simulation time.

Atmospheric hyperdiffusion, divergence damping, ocean diffusion/eddy closures, the zonal sponge, parameterized orographic drag and non-orographic gravity-wave drag are disabled in the current native configuration. Their orthogonal-grid forms have not been validated here. Surface friction and boundary-layer exchange remain active.

## State and rendering

The shared packet codec stores explicit typed-array descriptors and binary payloads. Native world files carry the actual mesh and masks. Checkpoints additionally carry full GPU buffers, land state and host scheduling counters; matching mesh/configuration identity and layout are checked before restoration. The GPU tests compare all returned field arrays after restoration and resumed advancement.

The viewer draws the existing boundary arcs with great-circle sampling at canvas-pixel angular spacing. Longitude unwrapping handles the date line and winding polygons close over their pole. An ID buffer provides hover lookup using the same polygons. Shared UI palette and formatting helpers are served from Chaos Machine's existing modules.

## Validation limits

Shared edge fluxes conserve mass, and the tests check the core mass tendency under nonzero winds. They do not prove consistent pressure work, kinetic energy or nonlinear potential-vorticity balance. The least-squares momentum reconstruction is not a proven mimetic replacement for the original orthogonal C-grid discretization.

A small CPU model has completed a simulated hour without non-finite state. GPU smoke tests cover short coupled advancement and resume. Long integrations, balanced rotating states, bounded tracer behavior, energy/moisture budgets and comparison with observed climate remain necessary before treating this as a validated climate backend. Default-size throughput and memory use are not established by the small fixtures; short fixture timings must not be extrapolated to a 204,001-cell world.

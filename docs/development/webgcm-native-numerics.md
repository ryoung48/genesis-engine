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

CPU and GPU field reads share atmospheric finite-state and positive pressure/temperature checks. The GPU also checks water-cell surface temperature, sea level and current components while allowing intentionally undefined dry-cell ocean output. A failed check halts the session, and checkpoint downloads validate the fields before capturing GPU buffers. These checks detect invalid state, not excessive but finite winds or unrealistic climate.

## Validation limits

Shared edge fluxes conserve mass, and the tests check the core mass tendency under nonzero winds. They do not prove consistent pressure work, kinetic energy or nonlinear potential-vorticity balance. The least-squares momentum reconstruction is not a proven mimetic replacement for the original orthogonal C-grid discretization.

A dry isothermal hydrostatic rest test over the model's resolved terrain checks zero mass tendency and maximum momentum tendency below `1e-12 m/s²` in the double-precision CPU core. This uses surface pressure proportional to `exp(-surfaceGeopotential / (R * 288 K))` and temperatures consistent with the core's layer Exner values. It does not establish balance for the moist, vertically varying production initializer.

The 49-cell GPU fixture completed 24 simulated hours without non-finite state, but the retained dynamics failed during hour six on a cached 3,001-cell procedural world with terrain. Peak winds exceeded 1,600 m/s before failure. The baseline is `stats/climate/2026-10-19T00-54-51.506Z-native-validation/report.json`. The mesh has center spacing down to 6.4 km and boundary nonorthogonality up to 69 degrees despite much larger typical cells. These are measured geometry properties, not a reason to change cell IDs or masks.

A trial that antisymmetrized rotation weights satisfied an isolated zero-work check under the original diagonal edge metric but failed the coupled terrain run earlier, during hour three (`stats/climate/2026-10-19T00-59-09.533Z-native-validation/report.json`). It was rolled back. The reconstructed kinetic energy and corrected pressure gradient use a different geometry from that diagonal metric, so fixing the rotation operator alone does not establish consistent momentum or energy balance. In that trial, the same world without atmospheric terrain completed six hours (`stats/climate/2026-10-19T01-00-23.144Z-native-validation/report.json`). A one-hour terrain trace located the fastest wind in layer 0 at an edge joining cells 722 and 667, with elevations about 2,443 m and 908 m and 23.2 km normal center separation (`stats/climate/2026-10-19T01-02-23.098Z-native-validation/report.json`). This supports investigating terrain pressure coupling and initialization; it does not prove one isolated cause.

After the rollback, a control using the retained dynamics and the same original mesh, labels and water depths, with atmospheric terrain set to zero, also completed six hours. Its peak wind was 100.7 m/s and its largest relative mean-pressure drift was `1.42e-6` (`stats/climate/2026-10-19T01-05-53.552Z-native-validation/report.json`). Finite state in this control is evidence of terrain sensitivity, not evidence of realistic upper-atmosphere winds or a stable multi-year climate.

`validate.mjs` retains hourly samples and failure details, records source hashes for new runs, and scans the full downloaded atmospheric and ocean restart state for non-finite numbers. The reports above are local and gitignored. Longer integrations, balanced rotating states, bounded tracer behavior, consistent pressure/kinetic-energy work and comparison with observed climate remain necessary. Default-size throughput and memory use are not established by these fixtures; short fixture timings must not be extrapolated to a 204,001-cell world.

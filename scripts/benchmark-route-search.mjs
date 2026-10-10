import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { deserialize, serialize } from "node:v8"
import { createServer } from "vite"
import { buildVariant } from "./routes/search-variants.mjs"
import { createOracle } from "./routes/search-oracle.mjs"

const started = new Date().toISOString().replaceAll(":", "-").replace(".", "-")
const output = resolve(`stats/routes/${started}-bidirectional-production`)
mkdirSync(output, { recursive: true })
const baseline = execFileSync("git", ["rev-parse", process.env.ROUTE_BASELINE ?? "b24992d3"], { encoding: "utf8" }).trim()
const root = "src/model/society/infrastructure/trade/routing"
const repetitions = Number(process.env.ROUTE_REPETITIONS ?? 5)
const seed = Number(process.env.ROUTE_SEED ?? 14963991)
assert(Number.isInteger(repetitions) && repetitions >= 3)
const variants = ["baseline", "production"]

const server = await createServer({
    configFile: false,
    resolve: { alias: { "@": resolve("src") } },
    server: { middlewareMode: true, watch: null },
    appType: "custom",
})

try {
    const modules = {}
    const originals = Object.fromEntries(["land", "sea", "network"].map(domain => [domain, execFileSync("git", ["show", `${baseline}:${root}/${domain}/index.ts`], { encoding: "utf8" }).replaceAll("\r\n", "\n")]))
    const originalPathfinding = execFileSync("git", ["show", `${baseline}:src/model/society/infrastructure/pathfinding/index.ts`], { encoding: "utf8" })
    writeFileSync(`${output}/baseline-pathfinding.ts`, originalPathfinding)
    for (const domain of ["land", "sea", "network"]) {
        originals[domain] = originals[domain].replace('"@/model/society/infrastructure/pathfinding"', JSON.stringify(`${output.replaceAll("\\", "/")}/baseline-pathfinding.ts`))
    }
    const current = Object.fromEntries(["land", "sea", "network", "search"].map(domain => [domain, readFileSync(`${root}/${domain}/index.ts`, "utf8").replaceAll("\r\n", "\n")]))
    for (const variant of variants) {
        for (const diagnostic of [false, true]) {
            const generated = buildVariant({ variant, sources: variant === "baseline" ? originals : current, output: output.replaceAll("\\", "/"), diagnostic })
            const prefix = diagnostic ? `check-${variant}` : variant
            for (const domain of ["land", "sea", "network", "search"]) {
                if (generated[domain]) writeFileSync(`${output}/${prefix}-${domain}.ts`, generated[domain])
            }
            modules[prefix] = (await server.ssrLoadModule(`${output}/${prefix}-network.ts`)).ROUTES
        }
    }
    const { PriorityHeap } = await server.ssrLoadModule("/src/model/shared/min-heap/index.ts")
    const { GENERATE_WORLD } = await server.ssrLoadModule("/src/model/pipelines/generate-world/index.ts")
    const { DEFAULT_WORLD_PARAMS } = await server.ssrLoadModule("/src/ui/genesis/generation/defaults.ts")
    console.info(`${process.env.ROUTE_WORLD ? "Loading" : "Generating"} full 204000-point planet, seed ${seed}`)
    const generationStart = performance.now()
    const table = console.table
    console.table = () => {}
    let world
    try {
        world = process.env.ROUTE_WORLD
            ? deserialize(readFileSync(process.env.ROUTE_WORLD))
            : GENERATE_WORLD.generateGenesisWorld({ params: { ...DEFAULT_WORLD_PARAMS, numPoints: 204000, seed, era: "lateMedieval", tideLock: null } })
    } finally {
        console.table = table
    }
    const preparationMs = performance.now() - generationStart
    assert.equal(world.params.numPoints, 204000)
    assert.equal(world.params.seed, seed)
    assert.equal(world.params.era, "lateMedieval")
    assert(world.mesh.numRegions >= 204000)
    assert(world.urbanPopulation && world.provinces && world.nations && world.landmarks)
    writeFileSync(`${output}/world.bin`, serialize(world))
    const inputs = {
        urbanPopulation: world.urbanPopulation,
        settlementRegions: world.settlementRegions,
        settlementWaterLandmarks: world.settlementWaterLandmarks,
        settlementPortRegions: world.settlementPortRegions,
    }
    const waterLandmarks = new Set(Array.from(world.settlementWaterLandmarks).filter(landmark => landmark >= 0))
    let landOnWaterLandmarks = 0
    for (let region = 0; region < world.mesh.numRegions; region++) {
        if (world.isLand[region] && waterLandmarks.has(world.landmarks.regionLandmark[region])) landOnWaterLandmarks++
    }
    assert.equal(landOnWaterLandmarks, 0, "Water landmarks must exclude land")
    globalThis.routeVerify = null
    const fingerprint = value => createHash("sha256").update(JSON.stringify(value)).digest("hex")
    const results = Object.fromEntries(variants.map(variant => [variant, { runs: [] }]))
    function run(variant) {
        const timings = []
        const start = performance.now()
        const computation = modules[globalThis.routeVerify ? `check-${variant}` : variant].computeRoutes({ world, inputs: { ...inputs, timings } })
        return { ms: performance.now() - start, timings, computation }
    }
    for (const variant of variants) {
        console.info(`Warmup ${variant}`)
        run(variant)
    }
    let reference = null
    for (let repetition = 0; repetition < repetitions; repetition++) {
        const order = variants.slice(repetition % variants.length).concat(variants.slice(0, repetition % variants.length))
        for (const variant of order) {
            const { computation, ...sample } = run(variant)
            const result = results[variant]
            const hash = fingerprint(computation)
            if (result.hash) assert.equal(hash, result.hash, `${variant} determinism`)
            else {
                result.hash = hash
                result.routes = computation.routes.length
                result.edges = computation.network.length
                result.byKind = Object.fromEntries([0, 1, 2].map(kind => [kind, computation.routes.filter(route => route.kind === kind).length]))
                if (variant === variants[0]) reference = computation
                const original = new Map(reference.routes.map(route => [`${route.kind}:${route.fromProvince}:${route.toProvince}`, route.pathRegions]))
                const currentPairs = new Set(computation.routes.map(route => `${route.kind}:${route.fromProvince}:${route.toProvince}`))
                result.changedPaths = computation.routes.filter(route => JSON.stringify(route.pathRegions) !== JSON.stringify(original.get(`${route.kind}:${route.fromProvince}:${route.toProvince}`))).length
                result.removedRoutes = [...original.keys()].filter(key => !currentPairs.has(key)).length
                result.addedRoutes = [...currentPairs].filter(key => !original.has(key)).length
            }
            result.runs.push(sample)
            console.info(`${variant} ${repetition + 1}/${repetitions}: ${sample.ms.toFixed(1)}ms`)
        }
    }
    if (process.env.ROUTE_EXPECTED_REPORT) {
        const expected = JSON.parse(readFileSync(process.env.ROUTE_EXPECTED_REPORT))
        assert.equal(expected.seed, seed)
        assert.equal(expected.points, world.params.numPoints)
        assert.equal(results.production.hash, expected.results.bidirectional.hash, "Production must match the tested unrestricted bidirectional output")
    }
    const { computeLandPassableMask, computeProvinceLandClusters } = await server.ssrLoadModule(`/${root}/land/index.ts`)
    const state = { P: world.provinces.count, era: world.params.era, desolate: world.provinces.desolate,
        stateless: Uint8Array.from(world.nations.sovereign, (owner, province) => !world.provinces.desolate[province] && owner < 0 ? 1 : 0),
        regionProvince: world.provinces.regionProvince, regionAdjOffset: world.mesh.adjOffset,
        regionAdjList: world.mesh.adjList, regionIsLand: world.isLand, r_xyz: world.mesh.r_xyz, landmarks: world.landmarks }
    const landPassable = computeLandPassableMask(state)
    globalThis.routeOriginalEligibility = { landPassable, provinceClusters: computeProvinceLandClusters({ state, landPassable }) }
    for (const variant of variants) {
        const oracle = createOracle({ PriorityHeap, regionCount: world.mesh.numRegions })
        globalThis.routeVerify = oracle.verify
        globalThis.routeOrderIssues = { land: 0, sea: 0 }
        globalThis.routeMetrics = Object.fromEntries(["land", "sea", "neighbors"].map(kind => [kind, { settled: 0, relaxations: 0 }]))
        console.info(`Independent shortest-path and settlement-order verification: ${variant}`)
        const checked = run(variant)
        assert.equal(fingerprint(checked.computation), results[variant].hash)
        results[variant].verification = oracle.result
        results[variant].orderIssues = { ...globalThis.routeOrderIssues }
        results[variant].metrics = structuredClone(globalThis.routeMetrics)
        globalThis.routeVerify = null
    }
    const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)]
    for (const variant of variants) {
        const result = results[variant]
        result.medianMs = median(result.runs.map(run => run.ms))
        result.medianLandMs = median(result.runs.map(run => run.timings.filter(timing => timing.Stage.includes("appendLandRoutes")).reduce((sum, timing) => sum + Number(timing.ms), 0)))
        result.medianSeaMs = median(result.runs.map(run => Number(run.timings.find(timing => timing.Stage.includes("appendSeaRoutes")).ms)))
        result.rangeMs = [Math.min(...result.runs.map(run => run.ms)), Math.max(...result.runs.map(run => run.ms))]
        result.pairedSpeedups = result.runs.map((run, index) => results[variants[0]].runs[index].ms / run.ms)
        result.medianPairedSpeedup = median(result.pairedSpeedups)

    }
    const sources = ["land/index.ts", "land/eligibility/index.ts", "sea/index.ts", "network/index.ts", "search/index.ts", "search/types.ts", "route-tuning.ts", "edge-usage/index.ts", "edge-usage/types.ts"]
    const report = {
        started, baseline, referenceVariant: variants[0], seed, points: world.params.numPoints, regions: world.mesh.numRegions,
        provinces: world.provinces.count, era: world.params.era, repetitions,
        sourceHashes: Object.fromEntries(sources.map(file => [file, createHash("sha256").update(readFileSync(`${root}/${file}`)).digest("hex")])),
        worldSource: process.env.ROUTE_WORLD ?? "fresh", preparationMs, node: process.version, results,
    }
    writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2))
    console.table(variants.map(variant => ({ variant, ms: results[variant].medianMs.toFixed(1), landMs: results[variant].medianLandMs.toFixed(1), seaMs: results[variant].medianSeaMs.toFixed(1), pairedSpeedup: results[variant].medianPairedSpeedup.toFixed(2), nonoptimal: results[variant].verification.nonoptimal, orderIssues: results[variant].orderIssues.land + results[variant].orderIssues.sea })))
    console.info(`Report: ${output}/report.json`)
    for (const variant of variants.filter(variant => variant !== "baseline")) {
        assert.equal(results[variant].verification.nonoptimal, 0, `${variant}: minimum cost`)
        assert.equal(results[variant].verification.missedPaths, 0, `${variant}: reachability`)
        assert.equal(results[variant].orderIssues.land + results[variant].orderIssues.sea, 0, `${variant}: settlement order`)
    }
} finally {
    await server.close()
}

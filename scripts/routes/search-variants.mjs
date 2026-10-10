import assert from "node:assert/strict"

function replace({ source, before, after }) {
    assert(source.includes(before), `Source pattern missing: ${before}`)
    return source.replace(before, after)
}

export function buildVariant({ variant, sources, output, diagnostic }) {
    let { land, sea, network, search } = sources
    if (diagnostic) {
        const neighborStart = sea.indexOf("function collectSeaNeighborPairs")
        let neighborSource = sea.slice(neighborStart)
        neighborSource = neighborSource.replace("const stamp = workspace.stamp", "let lastSettledDistance = -Infinity\n\tconst stamp = workspace.stamp")
        neighborSource = neighborSource.replace("workspace.settled[current] = stamp", 'globalThis.routeMetrics.neighbors.settled++\n\t\tif (workspace.distance[current] < lastSettledDistance) globalThis.routeOrderIssues.sea++\n\t\tlastSettledDistance = workspace.distance[current]\n\t\tworkspace.settled[current] = stamp')
        neighborSource = neighborSource.replace("const neighbor = state.regionAdjList[i]", 'globalThis.routeMetrics.neighbors.relaxations++\n\t\t\tconst neighbor = state.regionAdjList[i]')
        sea = sea.slice(0, neighborStart) + neighborSource
        if (variant === "baseline") {
            land = land.replace("const stamp = workspace.stamp", "let lastSettledDistance = -Infinity\n\tconst stamp = workspace.stamp")
            land = land.replace("workspace.settled[current] = stamp", 'globalThis.routeMetrics.land.settled++\n\t\tif (workspace.distance[current] < lastSettledDistance) globalThis.routeOrderIssues.land++\n\t\tlastSettledDistance = workspace.distance[current]\n\t\tworkspace.settled[current] = stamp')
            land = land.replace("const neighbor = regionAdjList[i]", 'globalThis.routeMetrics.land.relaxations++\n\t\t\tconst neighbor = regionAdjList[i]')
            land = replace({ source: land, before: `return PATHFIND.reconstructPathFromTree({
\t\tworkspace,
\t\tstartRegion,
\t\tendRegion,
\t\tstamp,
\t})`, after: `const path = PATHFIND.reconstructPathFromTree({ workspace, startRegion, endRegion, stamp })
\tglobalThis.routeVerify({ kind: "land", state, startRegion, endRegion, cluster, landmark, landPassable, provinceClusters, edgeUsed: landEdgeUsed, path })
\treturn path` })
            const split = sea.indexOf("function findSeaPathsToTargets")
            let seaPaths = sea.slice(split)
            seaPaths = seaPaths.replace("const stamp = workspace.stamp", "let lastSettledDistance = -Infinity\n\tconst stamp = workspace.stamp")
            seaPaths = seaPaths.replace("workspace.settled[current] = stamp", 'globalThis.routeMetrics.sea.settled++\n\t\tif (workspace.distance[current] < lastSettledDistance) globalThis.routeOrderIssues.sea++\n\t\tlastSettledDistance = workspace.distance[current]\n\t\tworkspace.settled[current] = stamp')
            seaPaths = seaPaths.replace("const neighbor = state.regionAdjList[i]", 'globalThis.routeMetrics.sea.relaxations++\n\t\t\tconst neighbor = state.regionAdjList[i]')
            seaPaths = replace({ source: seaPaths, before: "return stamp", after: `for (const endRegion of targetRegions) {
\t\tconst path = PATHFIND.reconstructPathFromTree({ workspace, startRegion, endRegion, stamp })
\t\tglobalThis.routeVerify({ kind: "sea", state, startRegion, endRegion, waterLandmark, waterDepthPenalty, edgeUsed: waterEdgeUsed, path })
\t}
\treturn stamp` })
            sea = sea.slice(0, split) + seaPaths
        } else {
            search = replace({ source: search, before: "const stamp = workspace.stamp", after: `const stamp = workspace.stamp
\tlet lastForward = -Infinity
\tlet lastBackward = -Infinity
\tfunction finish(path: number[]): number[] {
\t\tconst eligibility = kind === "land"
\t\t\t? { cluster: groupId % state.regionProvince.length, landmark: Math.floor(groupId / state.regionProvince.length), ...globalThis.routeOriginalEligibility }
\t\t\t: { waterLandmark: groupId, waterDepthPenalty }
\t\tglobalThis.routeVerify({ kind, state, startRegion, endRegion, edgeUsed, path, ...eligibility })
\t\treturn path
\t}` })
            search = search.replaceAll("return []", "return finish([])")
            search = replace({ source: search, before: "\treturn path\n}", after: "\treturn finish(path)\n}" })
            search = replace({ source: search, before: "active.settled[current] = stamp", after: `globalThis.routeMetrics[kind].settled++
\t\tif (active.distance[current] < (forward ? lastForward : lastBackward)) globalThis.routeOrderIssues[kind]++
\t\tif (forward) lastForward = active.distance[current]
\t\telse lastBackward = active.distance[current]
\t\tactive.settled[current] = stamp` })
            search = replace({ source: search, before: "const neighbor = regionAdjList[slot]", after: "globalThis.routeMetrics[kind].relaxations++\n\t\t\tconst neighbor = regionAdjList[slot]" })
        }
    }
    const prefix = diagnostic ? `check-${variant}` : variant
    if (variant === "production") {
        for (const domain of ["land", "sea"]) {
            const before = '"@/model/society/infrastructure/trade/routing/search"'
            const after = `"${output}/${prefix}-search.ts"`
            if (domain === "land") land = replace({ source: land, before, after })
            else sea = replace({ source: sea, before, after })
        }
    }
    for (const domain of ["land", "sea"]) {
        network = replace({ source: network, before: `"@/model/society/infrastructure/trade/routing/${domain}/index"`, after: `"${output}/${prefix}-${domain}.ts"` })
    }
    return { land, sea, network, search }
}

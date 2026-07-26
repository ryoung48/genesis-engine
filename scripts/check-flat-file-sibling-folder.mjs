// Flags a flat file `foo.ts` that sits next to a same-named sibling folder
// `foo/`. Per AGENTS.md's "Nest sub-folders only for real sub-domains" and
// "types.ts = shape, index.ts = behavior": once a concept has grown a real
// submodule folder, its own logic belongs at `foo/index.ts`, not in a
// dangling `foo.ts` beside it — otherwise the concept has two disconnected
// homes (a flat file for its top-level logic, a folder for its internals)
// instead of one `{index.ts, types.ts, sub-folders...}` submodule.
//
// Two shapes get reported differently:
//   folder-has-no-index - `foo/` has no index.ts of its own (just types.ts
//     and/or sub-folders). Fix: move foo.ts's contents into foo/index.ts.
//   folder-has-index    - `foo/` already has its own index.ts too, so there
//     are two competing entry points for the same concept. Fix: merge them.
//
// --fix moves `foo.ts` -> `foo/index.ts` for every folder-has-no-index case
// (via `git mv`, so history follows the file) and rewrites the moved file's
// own relative imports to compensate for now living one directory deeper.
// That's the safe, mechanical part only: it does NOT split types out into
// `foo/types.ts`, and it never touches folder-has-index cases (those need a
// human to reconcile two real entry points). External consumers need no
// changes — bundler resolution already treats `@/model/x/foo` as resolving
// to `foo/index.ts`.

import fs from "node:fs"
import path from "node:path"
import { movePathAndRewriteImports } from "./lib/move-and-rewrite-imports.mjs"

const projectRoot = process.cwd()
const defaultRoot = path.join(projectRoot, "src", "model")

const args = process.argv.slice(2)
const shouldFix = args.includes("--fix")
const filterArg = args.find((a) => a !== "--fix")
const scanRoot = filterArg ? path.resolve(projectRoot, filterArg) : defaultRoot

/** @type {{flatFile: string, folder: string, shape: string}[]} */
const violations = []

function walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true })
	if (["node_modules", "dist", "coverage"].includes(path.basename(dir))) return

	const fileNames = new Set(entries.filter((e) => e.isFile()).map((e) => e.name))
	const dirNames = new Set(entries.filter((e) => e.isDirectory()).map((e) => e.name))

	for (const fileName of fileNames) {
		const match = fileName.match(/^(.+)\.tsx?$/)
		if (!match) continue
		const baseName = match[1]
		if (baseName === "index" || baseName === "types") continue
		if (!dirNames.has(baseName)) continue

		const flatFile = path.join(dir, fileName)
		const folder = path.join(dir, baseName)
		const folderHasIndex =
			fs.existsSync(path.join(folder, "index.ts")) || fs.existsSync(path.join(folder, "index.tsx"))

		violations.push({
			flatFile,
			folder,
			shape: folderHasIndex ? "folder-has-index" : "folder-has-no-index",
		})
	}

	for (const entry of entries) {
		if (entry.isDirectory() && !["node_modules", "dist", "coverage"].includes(entry.name)) {
			walk(path.join(dir, entry.name))
		}
	}
}

walk(scanRoot)

violations.sort((a, b) => a.flatFile.localeCompare(b.flatFile))

const shapeLabel = {
	"folder-has-no-index":
		"FOLDER HAS NO INDEX (fold the flat file's contents into <folder>/index.ts)",
	"folder-has-index":
		"FOLDER ALREADY HAS AN INDEX (two competing entry points for the same concept - merge them)",
}

console.log(`=== Flat file with same-named sibling folder (${violations.length}) ===`)
for (const v of violations) {
	console.log(
		`${path.relative(projectRoot, v.flatFile)} <-> ${path.relative(projectRoot, v.folder)}/ [${v.shape}]`,
	)
}
if (violations.length === 0) console.log("none")

console.log("\n--- summary ---")
for (const shape of Object.keys(shapeLabel)) {
	const count = violations.filter((v) => v.shape === shape).length
	console.log(`${shapeLabel[shape]}: ${count}`)
}

if (shouldFix) {
	console.log("\n--- applying fixes ---")
	let fixedCount = 0
	for (const v of violations) {
		if (v.shape !== "folder-has-no-index") {
			console.log(`skip (needs manual merge): ${path.relative(projectRoot, v.flatFile)}`)
			continue
		}
		const ext = path.extname(v.flatFile)
		const dest = path.join(v.folder, `index${ext}`)
		if (fs.existsSync(dest)) {
			console.log(`skip (destination already exists): ${path.relative(projectRoot, dest)}`)
			continue
		}
		try {
			movePathAndRewriteImports(v.flatFile, dest, projectRoot)
		} catch (err) {
			console.log(`skip (move failed): ${path.relative(projectRoot, v.flatFile)} - ${err.message}`)
			continue
		}
		console.log(`moved ${path.relative(projectRoot, v.flatFile)} -> ${path.relative(projectRoot, dest)}`)
		fixedCount++
	}
	console.log(`\n${fixedCount} file(s) moved. Type-extraction into types.ts and any further splitting still needs manual review.`)
}

process.exit(violations.length === 0 ? 0 : 1)

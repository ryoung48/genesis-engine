// Phase 1 of the two-phase "types live at the lowest level that needs
// them" refactor (see enforcer.mjs for phase 2).
//
// Moves every top-level flat file in a directory (skipping index.ts and
// types.ts) into its own `<name>/index.ts` submodule folder — a pure file
// move, no splitting. This alone never requires fixing any consumer: a
// folder's index.ts resolves at exactly the same import specifier
// (relative or @-alias) that the flat file it replaces did, and every
// export the file had keeps the same name. Only the file's own *relative*
// imports need adjusting, since it's now one directory level deeper.
//
// Usage:
//   node scripts/quality/flatten-files-to-submodules.mjs --dir=src/model/society          # apply
//   node scripts/quality/flatten-files-to-submodules.mjs --check --dir=src/model/society   # dry run
import path from "node:path"
import { Project } from "ts-morph"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "..", "src")
const CHECK_ONLY = process.argv.includes("--check")
const dirArg = process.argv.find((a) => a.startsWith("--dir="))
if (!dirArg) {
	console.error("Usage: node scripts/quality/flatten-files-to-submodules.mjs --dir=src/path/to/domain")
	process.exit(1)
}
const SCOPE_DIR = path.resolve(import.meta.dirname, "..", "..", dirArg.slice(6)).replace(/\\/g, "/")

const project = new Project({
	tsConfigFilePath: path.resolve(import.meta.dirname, "..", "..", "tsconfig.app.json"),
})
project.addSourceFilesAtPaths(path.join(SRC_ROOT, "**/*.{ts,tsx}"))

function adjustSpecifierDepth(specifier) {
	if (!specifier.startsWith(".")) return specifier
	return specifier === ".." || specifier.startsWith("../")
		? `../${specifier}`
		: `..${specifier.slice(1)}` // "./x" -> "../x"
}

const candidates = project
	.getSourceFiles()
	.filter((sf) => path.dirname(sf.getFilePath()) === SCOPE_DIR)
	.filter((sf) => !["index.ts", "index.tsx", "types.ts"].includes(sf.getBaseName()))

if (candidates.length === 0) {
	console.log("No flat files to move in this directory.")
	process.exit(0)
}

const movedIndexPaths = []

for (const sourceFile of candidates) {
	const baseName = sourceFile.getBaseNameWithoutExtension()
	const ext = sourceFile.getExtension()
	const newDir = `${SCOPE_DIR}/${baseName}`
	const newIndexPath = `${newDir}/index${ext}`

	if (project.getDirectory(newDir)) {
		console.log(`[skip] ${baseName}${ext}: ${newDir} already exists`)
		continue
	}

	console.log(
		`${CHECK_ONLY ? "[dry-run] " : ""}${path.relative(SRC_ROOT, sourceFile.getFilePath()).replace(/\\/g, "/")} -> ${path.relative(SRC_ROOT, newIndexPath).replace(/\\/g, "/")}`,
	)
	if (CHECK_ONLY) continue

	const importLines = sourceFile
		.getImportDeclarations()
		.map((imp) => {
			const specifier = adjustSpecifierDepth(imp.getModuleSpecifierValue())
			const text = imp.getText()
			// Replace only the quoted specifier, preserving the rest of the
			// declaration's formatting (named imports, type-only, etc.) verbatim.
			return text.replace(/(["'])(?:(?!\1).)*\1(?=\s*$)/, `"${specifier}"`)
		})
		.join("\n")

	const bodyLines = sourceFile
		.getStatements()
		.filter((s) => !sourceFile.getImportDeclarations().includes(s))
		.map((s) => s.getText())
		.join("\n\n")

	const newContent = `${importLines}${importLines ? "\n\n" : ""}${bodyLines}\n`

	project.createSourceFile(newIndexPath, newContent)
	sourceFile.delete()
	movedIndexPaths.push(newIndexPath)
}

if (!CHECK_ONLY) {
	await project.save()
	if (movedIndexPaths.length > 0) {
		const { execFileSync } = await import("node:child_process")
		execFileSync("npx", ["biome", "format", "--write", ...movedIndexPaths], {
			stdio: "inherit",
			shell: true,
		})
	}
}

console.log(`\n${CHECK_ONLY ? "Would move" : "Moved"} ${CHECK_ONLY ? candidates.length : movedIndexPaths.length} file(s).`)

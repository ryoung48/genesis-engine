// Promotes a flat file that owns its own types (per AGENTS.md rule 39: "A
// type used by exactly one file counts as that file owning a real
// sub-domain") into a proper `<name>/{index.ts,types.ts}` submodule instead
// of leaving its types in the parent domain's types.ts.
//
// Splits the file's own interface/type-alias/enum declarations into a new
// types.ts, and everything else into a new index.ts (which imports the
// moved types back from "./types"). The old flat file is removed.
//
// Value imports from the old path (`from "./name"` / `from "@/.../name"`)
// keep working unchanged, since a folder's index.ts resolves at the same
// specifier a same-named file did. Only checks — doesn't yet rewrite — any
// external type-only imports of the promoted file's types (there are none
// in the test case this was built against; see below).
//
// Usage:
//   node scripts/promote-flat-file-to-submodule.mjs --file=src/model/society/hierarchy.ts          # apply
//   node scripts/promote-flat-file-to-submodule.mjs --check --file=...                              # dry run
import path from "node:path"
import { Node, Project } from "ts-morph"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "src")
const CHECK_ONLY = process.argv.includes("--check")
const fileArg = process.argv.find((a) => a.startsWith("--file="))
if (!fileArg) {
	console.error("Usage: node scripts/promote-flat-file-to-submodule.mjs --file=src/path/to/file.ts")
	process.exit(1)
}
const TARGET_FILE = path.resolve(import.meta.dirname, "..", fileArg.slice(7))

const project = new Project({
	tsConfigFilePath: path.resolve(import.meta.dirname, "..", "tsconfig.app.json"),
})
project.addSourceFilesAtPaths(path.join(SRC_ROOT, "**/*.{ts,tsx}"))

const sourceFile = project.getSourceFileOrThrow(
	(sf) => sf.getFilePath() === TARGET_FILE.replace(/\\/g, "/"),
)
const baseName = sourceFile.getBaseNameWithoutExtension()
const dir = path.dirname(sourceFile.getFilePath())
const newDir = `${dir}/${baseName}`
const newIndexPath = `${newDir}/index.ts`
const newTypesPath = `${newDir}/types.ts`

// Sanity checks before doing anything.
if (sourceFile.getBaseName() === "index.ts" || sourceFile.getBaseName() === "types.ts") {
	console.error(`${fileArg} is already an index.ts/types.ts — nothing to promote.`)
	process.exit(1)
}
if (project.getDirectory(newDir)) {
	console.error(`${newDir} already exists — aborting.`)
	process.exit(1)
}

const typeDecls = [
	...sourceFile.getInterfaces(),
	...sourceFile.getTypeAliases(),
	...sourceFile.getEnums(),
]
if (typeDecls.length === 0) {
	console.log("No type declarations in this file — nothing to split out; promoting anyway (index.ts + empty types.ts would be pointless, so this just moves the whole file to <name>/index.ts).")
}

const typeNames = new Set(typeDecls.map((d) => d.getName()))

// Any consumer project-wide that imports one of this file's types by name,
// from this file's current module specifier — these would need their
// import path updated to point at the new types.ts. Detected but NOT
// auto-fixed yet (kept out of scope until a real case exists to test against).
const externalTypeConsumers = []
for (const consumer of project.getSourceFiles()) {
	if (consumer === sourceFile) continue
	for (const imp of consumer.getImportDeclarations()) {
		if (imp.getModuleSpecifierSourceFile() !== sourceFile) continue
		for (const named of imp.getNamedImports()) {
			if (typeNames.has(named.getName())) {
				externalTypeConsumers.push({
					name: named.getName(),
					consumer: path.relative(SRC_ROOT, consumer.getFilePath()).replace(/\\/g, "/"),
				})
			}
		}
	}
}

if (externalTypeConsumers.length > 0) {
	console.log("External consumers import this file's types directly — not auto-fixing import paths for these (out of scope for this test run):")
	for (const { name, consumer } of externalTypeConsumers) console.log(`  ${consumer}: ${name}`)
}

console.log(
	`${CHECK_ONLY ? "[dry-run] " : ""}${path.relative(SRC_ROOT, TARGET_FILE).replace(/\\/g, "/")} -> ${path.relative(SRC_ROOT, newIndexPath).replace(/\\/g, "/")} + ${path.relative(SRC_ROOT, newTypesPath).replace(/\\/g, "/")}`,
)
console.log(`  types moving: ${[...typeNames].join(", ") || "(none)"}`)

if (CHECK_ONLY) process.exit(0)

// The file is moving one directory level deeper (society/hierarchy.ts ->
// society/hierarchy/index.ts), so any of its own relative imports need one
// more "../" — @-alias imports are unaffected since they're absolute.
function adjustSpecifierDepth(specifier) {
	if (!specifier.startsWith(".")) return specifier
	return specifier === ".." || specifier.startsWith("../")
		? `../${specifier}`
		: `..${specifier.slice(1)}` // "./x" -> "../x"
}

const typesText = typeDecls
	.map((d) => (d.getText().startsWith("export ") ? d.getText() : `export ${d.getText()}`))
	.join("\n\n")
const behaviorStatements = sourceFile
	.getStatements()
	.filter((s) => !Node.isImportDeclaration(s) && !typeDecls.includes(s))
	.map((s) => s.getText())
	.join("\n\n")

// Rebuild each original import, adjusted for the new depth, but only for
// the two new files that actually reference something from it.
function usesName(text, name) {
	return new RegExp(`\\b${name}\\b`).test(text)
}

function buildImportsFor(contentText) {
	const lines = []
	for (const imp of sourceFile.getImportDeclarations()) {
		const specifier = adjustSpecifierDepth(imp.getModuleSpecifierValue())
		const isTypeOnly = imp.isTypeOnly()
		const defaultImport = imp.getDefaultImport()?.getText()
		const namespaceImport = imp.getNamespaceImport()?.getText()
		const namedImports = imp
			.getNamedImports()
			.filter((n) => usesName(contentText, n.getName()))
			.map((n) => n.getText())

		if (!defaultImport && !namespaceImport && namedImports.length === 0) continue

		const parts = []
		if (defaultImport && usesName(contentText, defaultImport)) parts.push(defaultImport)
		if (namespaceImport) parts.push(`* as ${namespaceImport}`)
		if (namedImports.length > 0) parts.push(`{ ${namedImports.join(", ")} }`)
		if (parts.length === 0) continue

		lines.push(`import ${isTypeOnly ? "type " : ""}${parts.join(", ")} from "${specifier}"`)
	}
	return lines.join("\n")
}

const typesUsedInBehavior = [...typeNames].filter((name) =>
	behaviorStatements.includes(name),
)
const typesSelfImport =
	typesUsedInBehavior.length > 0
		? `import type { ${typesUsedInBehavior.join(", ")} } from "./types"\n`
		: ""

const typesImports = buildImportsFor(typesText)
const indexImports = buildImportsFor(behaviorStatements)

const typesFileContent = `${typesImports}${typesImports ? "\n\n" : ""}${typesText}\n`
const indexFileContent = `${indexImports}${indexImports ? "\n" : ""}${typesSelfImport}\n${behaviorStatements}\n`

project.createSourceFile(newTypesPath, typesFileContent)
project.createSourceFile(newIndexPath, indexFileContent)
sourceFile.delete()

await project.save()

const { execFileSync } = await import("node:child_process")
execFileSync("npx", ["biome", "format", "--write", newIndexPath, newTypesPath], {
	stdio: "inherit",
	shell: true,
})

console.log("\nDone. Re-run typecheck to verify.")

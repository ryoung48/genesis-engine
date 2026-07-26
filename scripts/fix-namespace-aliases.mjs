// Auto-fixes namespace object aliases (e.g. `export const MOON_MECHANICS =
// MECHANICS`): removes the alias export and rewrites every usage/import
// across the project to the original namespace's own name and module.
//
// Ported to ts-morph: `identifier.rename()` walks the language service to
// update every reference (including through renamed imports) and rewrite
// import specifiers/named-import lists automatically and correctly, instead
// of the hand-rolled regex + import-clause text surgery this used before.
//
// Usage:
//   node scripts/fix-namespace-aliases.mjs          # apply fixes
//   node scripts/fix-namespace-aliases.mjs --check   # dry run, report only
import path from "node:path"
import { Node, Project } from "ts-morph"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "src")
const CHECK_ONLY = process.argv.includes("--check")

const project = new Project({ tsConfigFilePath: path.resolve(import.meta.dirname, "..", "tsconfig.app.json") })
project.addSourceFilesAtPaths(path.join(SRC_ROOT, "**/*.{ts,tsx}"))

function isFunctionValued(prop) {
	if (Node.isMethodDeclaration(prop)) return true
	if (Node.isShorthandPropertyAssignment(prop)) {
		const decl = prop.getNameNode().getDefinitionNodes()[0]
		return Node.isFunctionDeclaration(decl) || Node.isArrowFunction(decl) || Node.isFunctionExpression(decl)
	}
	if (Node.isPropertyAssignment(prop)) {
		const init = prop.getInitializer()
		if (!init) return false
		if (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) return true
		if (Node.isIdentifier(init)) {
			const decl = init.getSymbol()?.getValueDeclaration()
			return Node.isFunctionDeclaration(decl) || Node.isArrowFunction(decl) || Node.isFunctionExpression(decl)
		}
	}
	return false
}

// Names of exported consts whose initializer is a namespace-object literal.
const namespaceObjectNames = new Set()
for (const sourceFile of project.getSourceFiles()) {
	for (const stmt of sourceFile.getVariableStatements()) {
		if (!stmt.hasExportKeyword()) continue
		for (const decl of stmt.getDeclarations()) {
			const name = decl.getName()
			if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue
			const init = decl.getInitializer()
			if (!init || !Node.isObjectLiteralExpression(init)) continue
			const properties = init.getProperties()
			const functionCount = properties.filter(isFunctionValued).length
			if (properties.length > 0 && functionCount / properties.length > 0.5)
				namespaceObjectNames.add(name)
		}
	}
}

// Alias declarations: `export const ALIAS = ORIGINAL` where ORIGINAL is a
// known namespace object.
const aliasDecls = []
for (const sourceFile of project.getSourceFiles()) {
	for (const stmt of sourceFile.getVariableStatements()) {
		if (!stmt.hasExportKeyword()) continue
		for (const decl of stmt.getDeclarations()) {
			const name = decl.getName()
			if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue
			const init = decl.getInitializer()
			if (!init || !Node.isIdentifier(init)) continue
			const original = init.getText()
			if (original === name) continue
			if (!namespaceObjectNames.has(original)) continue
			aliasDecls.push({ decl, alias: name, original })
		}
	}
}

if (aliasDecls.length === 0) {
	console.log("No namespace object aliases found.")
	process.exit(0)
}

for (const { decl, alias, original } of aliasDecls) {
	const file = path.relative(SRC_ROOT, decl.getSourceFile().getFilePath()).replace(/\\/g, "/")
	console.log(`${CHECK_ONLY ? "[dry-run] " : ""}${alias} = ${original}  (${file})`)

	if (CHECK_ONLY) continue

	const nameNode = decl.getNameNode()
	// Rewrites every reference project-wide (call sites, import specifiers,
	// named-import lists) from ALIAS to ORIGINAL.
	nameNode.rename(original)

	// The alias declaration is now `export const ORIGINAL = ORIGINAL`,
	// which is a self-referencing dead statement — remove it. Its own
	// import (if the declaring file imports ORIGINAL to define the alias)
	// stays untouched since it's needed elsewhere in that file, or gets
	// cleaned up as an unused import below.
	const stmt = decl.getVariableStatement()
	stmt.remove()

	console.log(`  removed alias export, rewrote usages to ${original}`)
}

if (!CHECK_ONLY) {
	// Drop now-unused imports left behind by the rename (e.g. a file that
	// only imported ORIGINAL to build the alias no longer needs to import
	// its own now-deleted declaration).
	for (const sourceFile of project.getSourceFiles()) {
		sourceFile.fixUnusedIdentifiers()
	}
	await project.save()
}

console.log(
	`\n${CHECK_ONLY ? "Would fix" : "Fixed"} ${aliasDecls.length} namespace alias(es).`,
)

// Finds UPPERCASE namespace *objects* that get re-exported under a second
// name (e.g. `export const MOON_MECHANICS = MECHANICS` in a barrel file).
// AGENTS.md calls for one namespace object per domain as its public API;
// aliasing gives callers two names for the same thing.
//
// Plain constant re-exports (e.g. `export const FOO = FOO_VALUE`) are not
// namespace objects and are intentionally not flagged.
import { readFileSync, globSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "src")

const files = globSync("**/*.{ts,tsx}", { cwd: SRC_ROOT }).map((f) =>
	path.join(SRC_ROOT, f),
)

/** @type {{ alias: string, original: string, file: string, line: number }[]} */
const aliasCandidates = []
// Names of exported consts whose initializer is a namespace-object literal
// (majority-function object), e.g. `export const MECHANICS = { hillSphereM, ... }`.
const namespaceObjectNames = new Set()

for (const file of files) {
	const text = readFileSync(file, "utf8")
	const sourceFile = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	)

	const localFunctionNames = new Set()
	ts.forEachChild(sourceFile, (node) => {
		if (ts.isFunctionDeclaration(node) && node.name)
			localFunctionNames.add(node.name.text)
		if (ts.isVariableStatement(node)) {
			for (const decl of node.declarationList.declarations) {
				if (
					ts.isIdentifier(decl.name) &&
					decl.initializer &&
					(ts.isArrowFunction(decl.initializer) ||
						ts.isFunctionExpression(decl.initializer))
				)
					localFunctionNames.add(decl.name.text)
			}
		}
	})

	function isFunctionValued(prop) {
		if (ts.isShorthandPropertyAssignment(prop))
			return localFunctionNames.has(prop.name.text)
		if (ts.isMethodDeclaration(prop)) return true
		if (ts.isPropertyAssignment(prop)) {
			const init = prop.initializer
			return (
				ts.isArrowFunction(init) ||
				ts.isFunctionExpression(init) ||
				(ts.isIdentifier(init) && localFunctionNames.has(init.text))
			)
		}
		return false
	}

	ts.forEachChild(sourceFile, (node) => {
		if (!ts.isVariableStatement(node)) return
		const isExported = node.modifiers?.some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		)
		if (!isExported) return

		for (const decl of node.declarationList.declarations) {
			if (!ts.isIdentifier(decl.name)) continue
			const name = decl.name.text
			if (!/^[A-Z][A-Z0-9_]*$/.test(name)) continue
			if (!decl.initializer) continue

			// Candidate alias: `export const ALIAS = SOME_IDENTIFIER`
			if (ts.isIdentifier(decl.initializer)) {
				const original = decl.initializer.text
				if (/^[A-Z][A-Z0-9_]*$/.test(original) && original !== name) {
					const { line } = sourceFile.getLineAndCharacterOfPosition(
						decl.getStart(sourceFile),
					)
					aliasCandidates.push({ alias: name, original, file, line: line + 1 })
				}
				continue
			}

			// Namespace object: `export const NAME = { fn1, fn2, ... }`
			if (ts.isObjectLiteralExpression(decl.initializer)) {
				const properties = decl.initializer.properties
				const functionCount = properties.filter(isFunctionValued).length
				if (properties.length > 0 && functionCount / properties.length > 0.5)
					namespaceObjectNames.add(name)
			}
		}
	})
}

const aliases = aliasCandidates.filter((a) =>
	namespaceObjectNames.has(a.original),
)

if (aliases.length === 0) {
	console.log("No namespace object aliases found.")
} else {
	console.log(`Namespace object aliases (${aliases.length}):`)
	for (const { alias, original, file, line } of aliases) {
		console.log(
			`  ${path.relative(SRC_ROOT, file).replace(/\\/g, "/")}:${line}  ${alias} = ${original}`,
		)
	}
}

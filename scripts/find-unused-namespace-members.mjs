// Finds members of exported UPPERCASE namespace objects (e.g. `export const TEMPERATURE = {...}`)
// that are never referenced as `NAMESPACE.member` anywhere in src/. Object properties aren't
// visible to knip's export analysis, so this fills that gap.
import { readFileSync } from "node:fs"
import { globSync } from "node:fs"
import path from "node:path"
import ts from "typescript"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "src")

const files = globSync("**/*.{ts,tsx}", { cwd: SRC_ROOT }).map((f) =>
	path.join(SRC_ROOT, f),
)

/** @type {{ namespace: string, member: string, file: string, line: number }[]} */
const declarations = []
const fileTexts = new Map()

for (const file of files) {
	const text = readFileSync(file, "utf8")
	fileTexts.set(file, text)
	const sourceFile = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	)

	// Local functions/arrow-functions declared in this file, so shorthand
	// properties (`{ deviationToCelsius }`) can be recognized as function-valued.
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
			const namespace = decl.name.text
			if (!/^[A-Z][A-Z0-9_]*$/.test(namespace)) continue
			if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer))
				continue

			const properties = decl.initializer.properties
			// Heuristic: only treat this as a namespace-object API (vs. a data
			// lookup table accessed via dynamic bracket indexing) when most of
			// its members are functions.
			const functionCount = properties.filter(isFunctionValued).length
			if (properties.length === 0 || functionCount / properties.length <= 0.5)
				continue

			for (const prop of properties) {
				let member
				if (ts.isShorthandPropertyAssignment(prop)) member = prop.name.text
				else if (
					(ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) &&
					ts.isIdentifier(prop.name)
				)
					member = prop.name.text
				if (!member) continue

				const { line } = sourceFile.getLineAndCharacterOfPosition(
					prop.getStart(sourceFile),
				)
				declarations.push({ namespace, member, file, line: line + 1 })
			}
		}
	})
}

const unused = []
for (const { namespace, member, file, line } of declarations) {
	const usagePattern = new RegExp(`\\b${namespace}\\.${member}\\b`, "g")
	let usedElsewhere = false
	for (const [otherFile, text] of fileTexts) {
		const matches = text.match(usagePattern)
		if (!matches) continue
		if (otherFile !== file) {
			usedElsewhere = true
			break
		}
		// same file: usage must be a real call site, not the declaration itself
		// (the declaration site never spells `NAMESPACE.member`, so any match here is real usage)
		usedElsewhere = true
		break
	}
	if (!usedElsewhere) {
		unused.push(
			`${path.relative(SRC_ROOT, file).replace(/\\/g, "/")}:${line}  ${namespace}.${member}`,
		)
	}
}

if (unused.length === 0) {
	console.log("No unused namespace members found.")
} else {
	console.log(`Unused namespace members (${unused.length}):`)
	for (const line of unused.sort()) console.log("  " + line)
}

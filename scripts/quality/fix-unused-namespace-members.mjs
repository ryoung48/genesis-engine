// Auto-fixes unused namespace-object members: drops the member from its
// namespace object's export, and deletes the underlying function
// declaration too if that leaves it fully unreferenced within the file.
//
// Ported to ts-morph (from a hand-rolled text-splice version) so usage
// detection goes through the real language service — findReferences()
// resolves through import aliases (e.g. `import { MECHANICS as
// MOON_MECHANICS }`), which a plain `NAMESPACE.member` text/regex search
// cannot do. Edits (property removal, function deletion) are also
// structure-aware, so ts-morph handles trailing commas / surrounding
// whitespace correctly instead of manual position math.
//
// Usage:
//   node scripts/quality/fix-unused-namespace-members.mjs          # apply fixes
//   node scripts/quality/fix-unused-namespace-members.mjs --check   # dry run, report only
import path from "node:path"
import { Node, Project, SyntaxKind } from "ts-morph"

const SRC_ROOT = path.resolve(import.meta.dirname, "..", "..", "src")
const CHECK_ONLY = process.argv.includes("--check")

const project = new Project({ tsConfigFilePath: path.resolve(import.meta.dirname, "..", "..", "tsconfig.app.json") })
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

function propName(prop) {
	if (Node.isMethodDeclaration(prop) || Node.isPropertyAssignment(prop))
		return prop.getNameNode().getText()
	if (Node.isShorthandPropertyAssignment(prop)) return prop.getName()
	return null
}

// Find every exported UPPERCASE_NAME = { ...mostly functions... } namespace
// object across the project.
const namespaces = []
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
			if (properties.length === 0 || functionCount / properties.length <= 0.5) continue
			namespaces.push({ sourceFile, decl, objectLiteral: init })
		}
	}
}

let totalMembersRemoved = 0
let totalFunctionsDeleted = 0

for (const { objectLiteral } of namespaces) {
	// Re-fetch properties each loop since earlier removals in this same
	// object literal shift indices/positions.
	for (const prop of [...objectLiteral.getProperties()]) {
		const member = propName(prop)
		if (!member) continue

		const nameNode = prop.getNameNode()
		const refs = nameNode.findReferencesAsNodes()
		// findReferencesAsNodes() includes every declaration-site occurrence
		// of the symbol too (the property's own name, and — for a shorthand
		// property — the underlying function/const's own name identifier),
		// not just call sites. Exclude those before judging "used elsewhere".
		const selfNodes = new Set([nameNode])
		if (Node.isShorthandPropertyAssignment(prop)) {
			const defNode = nameNode.getDefinitionNodes()[0]
			const defName =
				Node.isFunctionDeclaration(defNode) || Node.isVariableDeclaration(defNode)
					? defNode.getNameNode()
					: null
			if (defName) selfNodes.add(defName)
		}
		const usedElsewhere = refs.some((r) => !selfNodes.has(r))

		if (usedElsewhere) continue

		const file = path.relative(SRC_ROOT, prop.getSourceFile().getFilePath()).replace(/\\/g, "/")
		console.log(`${CHECK_ONLY ? "[dry-run] " : ""}removed member ${member} from ${file}`)
		totalMembersRemoved++

		// Resolve the underlying function (if a shorthand/identifier
		// reference) before removing the property, so we can check whether
		// it becomes fully unreferenced afterward.
		let underlyingFunction = null
		if (Node.isShorthandPropertyAssignment(prop)) {
			const decl = prop.getNameNode().getDefinitionNodes()[0]
			if (Node.isFunctionDeclaration(decl)) underlyingFunction = decl
		} else if (Node.isPropertyAssignment(prop)) {
			const init = prop.getInitializer()
			if (Node.isIdentifier(init)) {
				const decl = init.getSymbol()?.getValueDeclaration()
				if (Node.isFunctionDeclaration(decl)) underlyingFunction = decl
			}
		}

		if (!CHECK_ONLY) prop.remove()

		if (underlyingFunction && !CHECK_ONLY) {
			const remainingRefs = underlyingFunction
				.getNameNode()
				.findReferencesAsNodes()
				.filter((r) => r.getSourceFile() === underlyingFunction.getSourceFile())
			if (remainingRefs.length === 0) {
				console.log(
					`${CHECK_ONLY ? "[dry-run] " : ""}deleted now-unused function ${member} from ${file}`,
				)
				underlyingFunction.remove()
				totalFunctionsDeleted++
			}
		}
	}
}

if (!CHECK_ONLY) await project.save()

console.log(
	`\n${CHECK_ONLY ? "Would remove" : "Removed"} ${totalMembersRemoved} namespace member(s), ${CHECK_ONLY ? "would delete" : "deleted"} ${totalFunctionsDeleted} now-unused function(s).`,
)

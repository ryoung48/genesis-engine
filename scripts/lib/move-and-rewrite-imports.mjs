// Shared by check-flat-file-sibling-folder.mjs and check-loose-files-in-domain.mjs's
// --fix modes: physically moves a file (via `git mv` when tracked, plain
// rename otherwise), then rewrites that file's own relative import/export
// specifiers so they still point at the same targets from its new,
// one-level-deeper location. External consumers need no changes — bundler
// module resolution already treats `@/model/x/foo` as `foo/index.ts` — but
// the moved file's own `../sibling` and `./old-folder/thing` specifiers
// silently point at the wrong (or a different, still-existing) file
// otherwise.

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { Project } from "ts-morph"

export function isGitTracked(file, projectRoot) {
	try {
		execFileSync("git", ["ls-files", "--error-unmatch", file], { cwd: projectRoot, stdio: "pipe" })
		return true
	} catch {
		return false
	}
}

function toPosix(p) {
	return p.split(path.sep).join("/")
}

function rewriteRelativeImports(newFilePath, oldDir, newDir) {
	const project = new Project({ useInMemoryFileSystem: false, skipAddingFilesFromTsConfig: true })
	const sourceFile = project.addSourceFileAtPath(newFilePath)

	const declarations = [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]

	for (const decl of declarations) {
		const specifier = decl.getModuleSpecifierValue?.()
		if (!specifier || !specifier.startsWith(".")) continue

		const absoluteTarget = path.resolve(oldDir, specifier)
		let newSpecifier = toPosix(path.relative(newDir, absoluteTarget))
		if (!newSpecifier.startsWith(".")) newSpecifier = `./${newSpecifier}`

		decl.setModuleSpecifier(newSpecifier)
	}

	sourceFile.saveSync()
}

/**
 * Moves `src` to `dest` and rewrites `dest`'s own relative import/export
 * specifiers to compensate for the directory change. Both paths must be
 * absolute.
 */
export function movePathAndRewriteImports(src, dest, projectRoot) {
	const oldDir = path.dirname(src)
	const newDir = path.dirname(dest)

	if (isGitTracked(src, projectRoot)) {
		execFileSync("git", ["mv", src, dest], { cwd: projectRoot })
	} else {
		fs.renameSync(src, dest)
	}

	if (oldDir !== newDir) {
		rewriteRelativeImports(dest, oldDir, newDir)
	}
}

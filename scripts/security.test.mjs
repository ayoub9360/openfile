import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

// Resolve the actual transitive dependency used by Next's lint tooling.
const configRequire = createRequire(
  new URL("../packages/eslint-config/package.json", import.meta.url)
)
const nextRequire = createRequire(
  configRequire.resolve("@next/eslint-plugin-next")
)
const globRequire = createRequire(nextRequire.resolve("fast-glob"))
const matchRequire = createRequire(globRequire.resolve("micromatch"))
const braces = matchRequire("braces")
const depthError = { name: "SyntaxError", message: /maximum depth of 128/ }

test("braces preserves normal glob compilation, expansion and literals", () => {
  assert.equal(
    braces.compile("src/{app,lib}/**/*.{ts,tsx}"),
    "src/(app|lib)/**/*.(ts|tsx)"
  )
  assert.deepEqual(braces.expand("file-{1..3}.{js,ts}"), [
    "file-1.js",
    "file-1.ts",
    "file-2.js",
    "file-2.ts",
    "file-3.js",
    "file-3.ts",
  ])
  assert.equal(braces.stringify("{a,{b,c}}"), "{a,{b,c}}")
  assert.deepEqual(braces.expand("{".repeat(64) + "x" + "}".repeat(64)), [
    "{".repeat(64) + "x" + "}".repeat(64),
  ])
  assert.doesNotThrow(() => braces.compile("\\{".repeat(200)))
  assert.doesNotThrow(() => braces.compile('"' + "{".repeat(200) + '"'))
})

test("braces rejects excessive brace, parenthesis and mixed nesting before stack exhaustion", () => {
  for (const [open, close] of [
    ["{", "}"],
    ["(", ")"],
    ["{(", ")}"],
  ]) {
    for (const pattern of [
      open.repeat(4000),
      open.repeat(2000) + "a,b" + close.repeat(2000),
    ]) {
      for (const operation of [
        braces,
        braces.parse,
        braces.compile,
        braces.expand,
        braces.stringify,
      ]) {
        assert.throws(() => operation(pattern), depthError)
      }
    }
  }
})

test("braces also bounds caller-supplied ASTs in every recursive walker", () => {
  for (const operation of [braces.compile, braces.expand, braces.stringify]) {
    const root = { type: "root", nodes: [] }
    let parent = root
    for (let i = 0; i < 4000; i++) {
      const child = { type: "paren", nodes: [], parent }
      parent.nodes.push(child)
      parent = child
    }
    parent.nodes.push({ type: "text", value: "x", parent })
    assert.throws(() => operation(root), depthError)
  }
})

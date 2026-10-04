import { test } from "node:test"
import assert from "node:assert/strict"
import { collectionTags, matchesCollection } from "../domain/workspace"
import { createFixture } from "../infrastructure/fixtures"

test("legacy collections retain their tag; multiple tags match any, not all", () => {
  const base = { id: "trip", name: "Trip", description: "", color: "blue" }
  const document = { ...createFixture().documents[0]!, tags: ["Travel"] }
  assert.deepEqual(collectionTags({ ...base, tag: "Travel" }), ["Travel"])
  assert.equal(matchesCollection(document, { ...base, tag: "Travel" }), true)
  assert.equal(
    matchesCollection(document, { ...base, tags: ["Travel", "Work"] }),
    true
  )
  assert.equal(matchesCollection(document, { ...base, tags: ["Work"] }), false)
  assert.equal(
    matchesCollection(document, { ...base, tag: "Travel", tags: [] }),
    false
  )
  assert.equal(
    matchesCollection(document, { ...base, tags: ["travel"] }),
    false
  )
  assert.deepEqual(
    collectionTags({ ...base, tags: ["Travel", " Travel ", ""] }),
    ["Travel"]
  )
})

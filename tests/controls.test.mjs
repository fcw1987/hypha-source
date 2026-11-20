import test from "node:test";
import assert from "node:assert/strict";
import {
  attendance,
  initialRoster,
  updateRoster,
} from "../app/roster-draft.ts";
import {
  courtCapacity,
  defaults,
  finishExample,
  quickScores,
  scoreProblem,
} from "../lib/scorebook.ts";

const roster = (n) =>
  Array.from({ length: n }, (_, i) => "Player fixture " + (i + 1));
const nameField = (draft, index, value) =>
  updateRoster(draft, { type: "name", id: draft.fields[index].id, value });

test("four default fields expand in pairs and removal preserves each remaining name and identity", () => {
  let draft = initialRoster({ names: [], courts: 1 });
  assert.deepEqual(
    draft.fields.map((f) => f.name),
    ["", "", "", ""],
  );
  assert.equal(attendance(draft.fields).capacity, 0);
  for (const [i, name] of roster(4).entries())
    draft = nameField(draft, i, name);
  assert.equal(draft.courts, 1);
  assert.equal(attendance(draft.fields).capacity, 1);
  draft = updateRoster(draft, { type: "add" });
  assert.equal(draft.fields.length, 6);
  draft = nameField(draft, 4, "Fern");
  draft = nameField(draft, 5, "Vale");
  const kept = draft.fields[5];
  draft = updateRoster(draft, { type: "remove", id: draft.fields[4].id });
  assert.equal(draft.fields.length, 5);
  assert.equal(draft.fields[4], kept);
  assert.equal(attendance(draft.fields).count, 5);
  assert.equal(
    updateRoster(draft, { type: "remove", id: draft.fields[1].id }),
    draft,
  );
  draft = updateRoster(draft, { type: "add" });
  assert.deepEqual(attendance(draft.fields).names, [...roster(4), "Vale"]);
  assert.equal(new Set(draft.fields.map((f) => f.id)).size, 7);
});

test("court capacity uses distinct attending names and retains a valid explicit selection", () => {
  assert.deepEqual(
    [0, 3, 4, 5, 7, 8, 11, 12, 15, 16].map(courtCapacity),
    [0, 0, 1, 1, 1, 2, 2, 3, 3, 4],
  );
  const names = roster(8);
  let draft = initialRoster({ names, courts: 2 });
  assert.deepEqual(attendance(draft.fields).names, names);
  assert.equal(draft.courts, 2);
  draft = updateRoster(draft, { type: "add" });
  assert.equal(draft.courts, 2);
  draft = nameField(draft, 7, " " + names[0].toUpperCase() + " ");
  assert.equal(attendance(draft.fields).duplicate, true);
  assert.equal(attendance(draft.fields).count, 7);
  assert.equal(draft.courts, 1);
  draft = nameField(draft, 7, "");
  assert.equal(attendance(draft.fields).duplicate, false);
  draft = nameField(draft, 7, names[7]);
  assert.equal(draft.courts, 1);
  assert.equal(updateRoster(draft, { type: "courts", value: 2 }).courts, 2);
  assert.equal(initialRoster({ names: roster(5), courts: 2 }).courts, 1);
});

test("fifteen fields add exactly one final row, then four courts can be selected", () => {
  const names = roster(15);
  let draft = initialRoster({ names, courts: 3 });
  draft = updateRoster(draft, { type: "add" });
  assert.equal(draft.fields.length, 16);
  assert.deepEqual(attendance(draft.fields).names, names);
  assert.equal(attendance(draft.fields).capacity, 3);
  draft = nameField(draft, 15, "Finch");
  draft = updateRoster(draft, { type: "courts", value: 4 });
  assert.equal(draft.courts, 4);
  assert.equal(updateRoster(draft, { type: "add" }), draft);
  draft = updateRoster(draft, { type: "remove", id: draft.fields[4].id });
  assert.equal(draft.courts, 3);
  assert.equal(draft.fields.at(-1).name, "Finch");
});

test("court shortcuts follow the game setting and extended scores use the stored finish rule", () => {
  assert.deepEqual(quickScores(11), [6, 7, 8, 9, 10, 11]);
  assert.deepEqual(quickScores(15), [10, 11, 12, 13, 14, 15]);
  assert.deepEqual(quickScores(2), [0, 1, 2]);
  assert.equal(defaults.finish, "cap");
  assert.equal(defaults.tie, "share");
  const two = { ...defaults, finish: "two" };
  assert.match(finishExample(defaults), /11–10/);
  assert.match(finishExample(two), /12–10/);
  for (const rule of [two, defaults]) assert.ok(scoreProblem([10, 10], rule));
  assert.equal(scoreProblem([11, 10], defaults), null);
  assert.ok(scoreProblem([11, 10], two));
  assert.ok(scoreProblem([12, 10], defaults));
  assert.equal(scoreProblem([12, 10], two), null);
  assert.equal(scoreProblem([12, 14], two), null);
});

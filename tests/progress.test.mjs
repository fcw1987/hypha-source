import test from "node:test";
import assert from "node:assert/strict";
import { newBook, addSession } from "../lib/rotation.ts";
import { defaults, record, standings } from "../lib/scorebook.ts";
import {
  racePoints,
  chartValues,
  spreadLabels,
  sessionProgress,
  seasonProgress,
  sessionPlayers,
  axisLabels,
  plotCeiling,
  lineSegments,
} from "../lib/progress.ts";

import { exampleSeason } from "../server/example-season.ts";

const names = [
  "Iris",
  "Sol",
  "Mira",
  "Theo",
  "Vale",
  "Ren",
  "Ellis",
  "Gale",
  "Alba",
  "Indy",
  "Kit",
  "Rue",
  "Fern",
  "Ada",
  "Noa",
  "Jules",
];
const make = (n = 4, courts = 1, rules = {}) =>
  newBook(
    "Hypha progress fixture",
    { ...defaults, rounds: 3, ...rules },
    {
      id: crypto.randomUUID(),
      names: names.slice(0, n),
      date: "2026-01-07",
      courts,
    },
  );
function save(book, session, number, score, submit = false) {
  const g = session.games[number - 1];
  return record(
    book,
    session.id,
    [{ id: g.id, before: g.score, score }],
    submit,
  );
}
const readings = (step, ids) => ids.map((id) => step.readings.get(id));
const totals = (step, ids) => readings(step, ids).map((r) => r.total);

test("empty, pending, shutout and out-of-order results remain distinct after a correction and repeat save", () => {
  const b = make(),
    s = b.sessions[0],
    p = sessionPlayers(b, s),
    ids = s.roster;
  let view = sessionProgress(b, s, p);
  assert.equal(view.hasScores, false);
  assert.equal(view.pending, 3);
  assert.deepEqual(totals(view.steps[0], ids), [null, null, null, null]);
  save(b, s, 2, [11, 0]);
  view = sessionProgress(b, s, p);
  assert.deepEqual(totals(view.steps[1], ids), [11, 0, 11, 0]);
  assert.equal(view.steps[1].readings.get(ids[1]).earned, 0);
  assert.deepEqual(
    lineSegments([0, ...view.steps.map((x) => x.readings.get(ids[0]).total)]),
    [[{ index: 0, value: 0 }], [{ index: 2, value: 11 }]],
  );
  save(b, s, 1, [11, 4]);
  assert.deepEqual(
    totals(sessionProgress(b, s, p).steps[1], ids),
    [22, 11, 15, 4],
  );
  const retry = { id: s.games[1].id, before: [11, 0], score: [3, 11] };
  record(b, s.id, [retry], false);
  record(b, s.id, [retry], false);
  view = sessionProgress(b, s, p);
  assert.deepEqual(totals(view.steps[1], ids), [14, 22, 7, 15]);
  assert.deepEqual(s.games[1].correctedFrom, [11, 0]);
  assert.equal(s.games[0].correctedFrom, undefined);
  assert.match(view.steps[1].detail, /3–11.*11–0/);
  assert.equal(view.steps[1].corrected, 1);
  assert.deepEqual(totals(view.steps[2], ids), [null, null, null, null]);
  assert.equal(view.steps[2].state, "pending");
  assert.deepEqual(
    [...view.totals],
    ids.map((id) => [id, standings(b).find((p) => p.id === id).points]),
  );
});

test("a player on another parallel court accrues zero in this game and is never assigned a bye", () => {
  const b = make(9, 2, { rounds: 1 }),
    s = b.sessions[0],
    p = sessionPlayers(b, s),
    [a, c] = s.games;
  const sitter = p.find(
    (p) => ![...a.a, ...a.b, ...c.a, ...c.b].includes(p.id),
  ).id;
  save(b, s, 1, [11, 7]);
  save(b, s, 1, [7, 11]);
  const snap = sessionProgress(b, s, p);
  assert.deepEqual(snap.steps[0].readings.get(sitter), {
    total: 0,
    earned: 0,
    activity: "bye",
    corrected: false,
  });
  const other = snap.steps[0].readings.get(c.a[0]);
  assert.equal(other.activity, "another court");
  assert.equal(other.earned, 0);
  assert.equal(other.corrected, false);
  assert.equal(snap.steps[0].readings.get(a.a[0]).corrected, true);
  assert.equal(snap.steps[1].readings.get(c.a[0]).total, null);
  assert.equal(snap.steps[1].readings.get(c.a[0]).activity, "pending");
  assert.equal(snap.steps[1].readings.get(sitter).activity, "bye");
  const season = seasonProgress(b, p);
  assert.equal(season.steps[0].state, "partial");
  assert.equal(season.steps[0].readings.get(c.a[0]).total, null);
});

test("season points carry over dates and changed attendance, including partially saved sessions", () => {
  const b = make(4, 1, { rounds: 1 }),
    s0 = b.sessions[0];
  save(b, s0, 1, [11, 6], true);
  addSession(b, {
    id: crypto.randomUUID(),
    date: "2026-02-18",
    names: [...names.slice(0, 3), "New Finch"],
    courts: 1,
  });
  const [a, departed, newcomer] = [
    b.players[0],
    b.players[3],
    b.players.at(-1),
  ];
  let data = seasonProgress(b, b.players);
  assert.equal(data.steps[0].readings.get(newcomer.id).total, null);
  assert.equal(
    data.steps[0].readings.get(newcomer.id).activity,
    "did not attend",
  );
  assert.equal(data.steps[1].state, "pending");
  assert.equal(data.steps[1].readings.get(a.id).total, null);
  save(b, b.sessions[1], 1, [5, 11]);
  data = seasonProgress(b, b.players);
  assert.deepEqual([...data.totals.values()], [16, 16, 17, 6, 11]);
  assert.deepEqual(data.steps[1].readings.get(departed.id), {
    total: 6,
    earned: 0,
    activity: "did not attend",
    corrected: false,
  });
  assert.equal(data.steps[1].readings.get(newcomer.id).earned, 11);
  assert.equal(data.baseline.has(newcomer.id), false);
  save(b, s0, 1, [4, 11], true);
  data = seasonProgress(b, b.players);
  assert.equal(data.steps[1].readings.get(a.id).total, 9);
  assert.equal(data.steps[0].corrected, 1);
  assert.equal(data.steps[1].corrected, 0);
  for (const p of standings(b)) assert.equal(data.totals.get(p.id), p.points);
});

test("an early submitted finish leaves later games unplayed and excludes them from pending counts", () => {
  const b = make(4, 1, { target: 11 }),
    s = b.sessions[0];
  save(b, s, 1, [11, 8], true);
  const game = sessionProgress(b, s, b.players),
    season = seasonProgress(b, b.players);
  assert.deepEqual(
    game.steps.map((s) => s.state),
    ["saved", "unplayed", "unplayed"],
  );
  assert.equal(game.pending, 0);
  assert.equal(season.steps[0].state, "saved");
  assert.equal(season.pending, 0);
  assert.deepEqual([...game.totals.values()], [11, 11, 8, 8]);
});

test("chart and table use only selected players, preserving source data and bounded readable ticks", () => {
  const b = make(16, 4, { rounds: 24 }),
    s = b.sessions[0],
    selected = b.players.slice(4, 8);
  save(b, s, 1, [11, 7]);
  const before = JSON.stringify(b);
  const data = sessionProgress(b, s, selected);
  assert.equal(data.steps.length, 96);
  for (const step of data.steps)
    assert.deepEqual(
      [...step.readings.keys()],
      selected.map((p) => p.id),
    );
  for (const count of [1, 3, 9, 10, 24, 96, 160])
    for (const max of [5, 10]) {
      const ticks = axisLabels(count, max);
      assert.equal(ticks[0], 0);
      assert.equal(ticks.at(-1), count);
      assert.equal(new Set(ticks).size, ticks.length);
      assert.ok(ticks.length <= max);
    }
  for (const total of [0, 1, 6, 71, 891, 99999, 500000]) {
    assert.ok(plotCeiling(total) >= total);
    assert.equal(plotCeiling(total) % 4, 0);
  }
  assert.equal(JSON.stringify(b), before);
});

test("a later submitted session can be entirely unplayed after an earlier correction finishes the race", () => {
  const b = make(4, 1, { rounds: 1, target: 25, finish: "two" });
  const next = (date) =>
    addSession(b, {
      id: crypto.randomUUID(),
      date,
      names: names.slice(0, 4),
      courts: 1,
    });
  save(b, b.sessions[0], 1, [11, 8], true);
  next("2026-01-14");
  save(b, b.sessions[1], 1, [11, 8], true);
  next("2026-01-21");
  // A legal win-by-two correction can finish the series in the previous session.
  save(b, b.sessions[1], 1, [26, 24], true);
  record(b, b.sessions[2].id, [], true);
  const season = seasonProgress(b, b.players);
  assert.equal(season.steps[2].state, "unplayed");
  assert.equal(season.pending, 0);
  assert.equal(season.steps[2].readings.get(b.players[0].id).total, null);
});

test("the season chart measures the gap to the entire field and preserves exact earned totals", () => {
  const book = exampleSeason();
  const data = seasonProgress(book, book.players);
  const race = racePoints(data);
  assert.deepEqual([...data.totals.values()], [890, 893, 871, 874]);
  assert.equal(race.length, 11);
  assert.deepEqual(race.at(-1), {
    top: 893,
    leaders: [book.players[1].id],
    margin: 3,
  });
  const lastGaps = book.players.map((p) =>
    chartValues(data, race, p.id, "season").at(-1),
  );
  assert.deepEqual(lastGaps, [3, 0, 22, 19]);
  assert.ok(new Set(race.flatMap((point) => point.leaders)).size > 1);
  const night = book.sessions[0];
  const session = sessionProgress(book, night, book.players);
  const gameRace = racePoints(session);
  for (const p of book.players) {
    assert.deepEqual(
      chartValues(session, gameRace, p.id, "session"),
      session.steps.map((step) => step.readings.get(p.id).total),
    );
  }
});

test("ties, partial nights and missing checkpoints do not imply a new leader or fabricated points", () => {
  const step = (state, a, b) => ({
    state,
    readings: new Map([
      ["a", { total: a }],
      ["b", { total: b }],
    ]),
  });
  const data = {
    baseline: new Set(["a", "b"]),
    steps: [
      step("saved", 44, 35),
      step("pending", null, null),
      step("partial", null, 40),
      step("saved", 44, 44),
      step("unplayed", null, null),
    ],
  };
  const race = racePoints(data);
  assert.deepEqual(
    race.map((r) => r?.margin ?? null),
    [9, null, 4, 0, null],
  );
  assert.deepEqual(race[2].leaders, ["a"]);
  assert.deepEqual(race[3].leaders, ["a", "b"]);
  assert.deepEqual(chartValues(data, race, "a", "season"), [
    0,
    null,
    null,
    0,
    null,
  ]);
  assert.deepEqual(chartValues(data, race, "b", "season"), [
    9,
    null,
    4,
    0,
    null,
  ]);
});

test("direct line labels stay in order and separate at both bounds of a phone plot", () => {
  for (const rows of [
    [15, 15, 15, 15],
    [174, 176, 177, 179],
    [15, 16, 169, 169],
  ]) {
    const anchors = rows.map((y, i) => ({ id: String(i), y }));
    const positions = [...spreadLabels(anchors, 15, 179, 18).values()];
    assert.equal(positions.length, 4);
    assert.ok(positions[0] >= 15 && positions[3] <= 179);
    for (let i = 1; i < positions.length; i++)
      assert.ok(positions[i] - positions[i - 1] >= 18);
    assert.deepEqual(
      anchors.map((a) => a.y),
      rows,
    );
  }
});

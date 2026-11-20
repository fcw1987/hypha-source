import test from "node:test";
import assert from "node:assert/strict";
import { defaults, record } from "../lib/scorebook.ts";
import { exampleSeason } from "../server/example-season.ts";
import {
  apart,
  appearances,
  blankLine,
  lineFor,
  margin,
  matchedOpponents,
  opposingTeams,
  outcomes,
  rankings,
  rate,
  threadStats,
} from "../lib/thread-stats.ts";

const ids = ["a", "b", "c", "d", "e", "f"];
const players = ids.map((id) => ({ id, name: id.toUpperCase() }));
const game = (id, a, b, score, extras = {}) => ({
  id,
  round: 1,
  court: 1,
  a,
  b,
  score,
  ...extras,
});
const night = (id, games, extra = {}) => ({
  id,
  date: "2026-01-01",
  roster: ids,
  courts: 1,
  submitted: false,
  games,
  ...extra,
});
const book = (...sessions) => ({
  id: "fictional",
  name: "Fictional stats",
  players,
  rules: defaults,
  sessions,
});
const pair = (...ids) => ({ kind: "partners", ids });
const versus = (...ids) => ({ kind: "opponents", ids });
const person = (id) => ({ kind: "player", id });
const line = (games, wins, pointsFor, pointsAgainst) => ({
  games,
  wins,
  pointsFor,
  pointsAgainst,
});

test("saved doubles count each side once with separate opponents, unequal apart samples, and period filters", () => {
  const s = night("first", [
    game("one", ["a", "b"], ["c", "d"], [11, 7]),
    game("two", ["e", "f"], ["b", "a"], [11, 9]),
    game("three", ["b", "a"], ["c", "d"], [11, 5]),
    game("four", ["a", "c"], ["b", "d"], [11, 6]),
    game("five", ["b", "e"], ["d", "f"], [11, 9]),
    game("pending", ["a", "b"], ["e", "f"], null, {
      started: true,
      live: [7, 5],
    }),
    game("invalid end", ["a", "b"], ["c", "d"], [12, 9]),
    game("unfinished", ["a", "b"], ["c", "d"], [5, 3]),
    game("void", ["a", "b"], ["c", "d"], [11, 1], { voided: true }),
  ]);
  const next = night("second", [game("six", ["c", "d"], ["a", "b"], [11, 4])], {
    submitted: true,
  });
  const b = book(s, next);
  const stats = threadStats(b, "rotating");
  assert.equal(stats.matches.length, 6);
  assert.equal(
    [...stats.partners.values()].reduce((sum, r) => sum + r.line.games, 0),
    12,
  );
  assert.equal(
    [...stats.opponents.values()].reduce((sum, r) => sum + r.line.games, 0),
    24,
  );
  const result = lineFor(stats, pair("a", "b"));
  assert.deepEqual(result, line(4, 2, 35, 34));
  assert.deepEqual(lineFor(stats, pair("b", "a")), result);
  assert.equal(rate(result), 50);
  assert.equal(margin(result), 0.25);
  assert.deepEqual(
    apart(lineFor(stats, person("a")), result),
    line(1, 1, 11, 6),
  );
  assert.deepEqual(
    apart(lineFor(stats, person("b")), result),
    line(2, 1, 17, 20),
  );
  assert.deepEqual(lineFor(stats, versus("a", "c")), line(3, 2, 26, 23));
  assert.deepEqual(lineFor(stats, versus("c", "a")), line(3, 1, 23, 26));
  assert.deepEqual(
    outcomes(appearances(stats, versus("c", "a"))),
    lineFor(stats, versus("c", "a")),
  );
  const other = opposingTeams(appearances(stats, pair("b", "a")), stats.names);
  assert.deepEqual(
    other.map((r) => [r.label, r.line]),
    [
      ["C & D", line(3, 2, 26, 23)],
      ["E & F", line(1, 0, 9, 11)],
    ],
  );
  assert.deepEqual(
    lineFor(threadStats(b, "rotating", "first"), pair("a", "b")),
    line(3, 2, 31, 23),
  );
  assert.deepEqual(
    lineFor(threadStats(b, "rotating", "second"), pair("a", "b")),
    line(1, 0, 4, 11),
  );
  record(b, next.id, [{ id: "six", before: [11, 4], score: [9, 11] }], false);
  assert.equal(next.submitted, true);
  assert.deepEqual(
    lineFor(threadStats(b, "rotating"), pair("a", "b")),
    line(4, 3, 42, 32),
  );
  next.games[0].score = null;
  assert.deepEqual(
    lineFor(threadStats(b, "rotating"), pair("a", "b")),
    line(3, 2, 31, 23),
  );
});

test("ranks use exact fractions, show ties, and distinguish frequency, total wins and small samples", () => {
  const row = (id, games, wins, pointsFor, pointsAgainst) => ({
    subject: person(id),
    label: id,
    line: line(games, wins, pointsFor, pointsAgainst),
  });
  const a = row("A", 3, 2, 20, 26),
    b = row("B", 6, 4, 40, 52),
    c = row("C", 8, 3, 80, 70),
    d = row("D", 1, 1, 11, 0);
  const r = rankings([a, b, c, d], "rate");
  assert.deepEqual(
    r.ranked.map((v) => [v.label, v.rank, v.tied]),
    [
      ["A", 1, true],
      ["B", 1, true],
      ["C", 3, false],
    ],
  );
  assert.deepEqual(
    r.small.map((v) => v.label),
    ["D"],
  );
  assert.equal(rankings([a, b, c, d], "wins").ranked[0].label, "B");
  assert.equal(rankings([a, b, c, d], "games").ranked[0].label, "C");
  assert.equal(rankings([a, b, c, d], "margin").ranked[0].label, "C");
  assert.equal(rankings([a, b, c, d], "games").small.length, 0);
});

test("no score has no rate, inactive players have no losses, and duplicate names keep separate identities", () => {
  const players = [
    { id: "a", name: "Sky" },
    { id: "b", name: "Sky" },
    { id: "c", name: "Rook" },
  ];
  const b = {
    ...book(
      night("one", [game("x", ["a"], ["g1"], [15, 13])], {
        format: "singles",
        roster: ["a", "b", "c", "g1"],
        guests: [{ id: "g1", name: "Sky" }],
      }),
      night(
        "two",
        [game("y", ["g2"], ["b"], [21, 19]), game("z", ["a"], ["b"], null)],
        {
          format: "singles",
          roster: ["a", "b", "g2"],
          guests: [{ id: "g2", name: "Sky" }],
        },
      ),
    ),
    players,
    rules: { ...defaults, gameTo: 15, finish: "two" },
  };
  const report = threadStats(b, "singles");
  assert.equal(report.partners.size, 0);
  assert.equal(report.opponents.size, 2);
  assert.equal(new Set([...report.names.values()]).size, 5);
  assert.deepEqual(lineFor(report, person("a")), line(1, 1, 15, 13));
  assert.deepEqual(lineFor(report, person("g2")), line(1, 1, 21, 19));
  assert.deepEqual(lineFor(report, person("b")), line(1, 0, 19, 21));
  assert.deepEqual(lineFor(report, person("c")), blankLine());
  assert.equal(rate(lineFor(report, person("c"))), null);
  assert.equal(margin(lineFor(report, versus("a", "b"))), null);
  assert.equal(threadStats(b, "rotating").matches.length, 0);
  assert.deepEqual(
    threadStats(book(night("empty", [])), "rotating").matches,
    [],
  );
});

test("fixed pairs and rotating pairs have independent baselines, even with the same IDs", () => {
  const b = book(
    night("switch", [game("r", ["a", "b"], ["c", "d"], [11, 9])]),
    night("stay", [game("f", ["d", "c"], ["b", "a"], [15, 13])], {
      format: "fixed",
      submitted: true,
    }),
  );
  b.rules = { ...defaults, finish: "two" };
  const fixed = threadStats(b, "fixed"),
    together = lineFor(fixed, pair("a", "b"));
  assert.deepEqual(together, line(1, 0, 13, 15));
  assert.deepEqual(apart(lineFor(fixed, person("a")), together), blankLine());
  assert.deepEqual(
    lineFor(threadStats(b, "rotating"), pair("a", "b")),
    line(1, 1, 11, 9),
  );
});

test("Lantern League matches independent season, opening-night and recent-form tallies", () => {
  const b = exampleSeason(),
    stats = threadStats(b, "rotating");
  const initial = JSON.stringify(b);
  assert.equal(stats.matches.length, 96);
  assert.equal(stats.nights, 11);
  const ranked = rankings(stats.partners.values(), "rate").ranked;
  assert.deepEqual(
    ranked.map((r) => [r.line.games, r.line.wins, r.rank]),
    [
      [32, 21, 1],
      [32, 17, 2],
      [32, 16, 3],
      [32, 16, 3],
      [32, 15, 5],
      [32, 11, 6],
    ],
  );
  const top = ranked[0];
  assert.equal(top.label, "Pip Moonfern & Bea Brightwing");
  assert.deepEqual(top.line, line(32, 21, 304, 285));
  const [pip, bea] = top.subject.ids;
  assert.deepEqual(
    apart(lineFor(stats, person(pip)), top.line),
    line(64, 33, 586, 589),
  );
  assert.deepEqual(
    apart(lineFor(stats, person(bea)), top.line),
    line(64, 31, 589, 586),
  );
  assert.equal(
    opposingTeams(appearances(stats, top.subject), stats.names).length,
    1,
  );
  const third = [...stats.players.keys()].find(
    (id) => id !== pip && id !== bea,
  );
  assert.deepEqual(matchedOpponents(stats, pip, bea, third), []);
  const opening = lineFor(
    threadStats(b, "rotating", b.sessions[0].id),
    top.subject,
  );
  assert.equal(opening.games, 3);
  assert.equal(opening.wins, 1);
  assert.equal(opening.pointsFor - opening.pointsAgainst, -8);
  const games = appearances(stats, person(bea)),
    latest = outcomes(games.slice(-10)),
    earlier = outcomes(games.slice(-20, -10));
  assert.deepEqual([latest.games, latest.wins, latest.pointsFor], [10, 7, 104]);
  assert.deepEqual(
    [earlier.games, earlier.wins, earlier.pointsFor],
    [10, 6, 100],
  );
  assert.equal(JSON.stringify(b), initial);
});

test("five-player overlap reverses the overall margin when both partners face the same pair", () => {
  const pip = "a",
    bea = "b",
    kit = "c",
    lin = "d",
    rae = "e";
  const games = [
    game("1", [pip, bea], [lin, rae], [11, 9]),
    game("2", [rae, lin], [bea, pip], [11, 7]),
    game("3", [bea, pip], [kit, lin], [11, 2]),
    game("4", [pip, bea], [lin, kit], [11, 3]),
    game("5", [lin, rae], [pip, kit], [8, 11]),
    game("6", [pip, kit], [rae, lin], [11, 9]),
    game("7", [pip, kit], [bea, rae], [1, 11]),
  ];
  const first = night("one", games.slice(0, 4)),
    second = night("two", games.slice(4), { submitted: true });
  const b = book(first, second);
  const stats = threadStats(b, "rotating");
  const overall = [bea, kit].map((partner) =>
    lineFor(stats, pair(pip, partner)),
  );
  assert.deepEqual(overall, [line(4, 3, 40, 25), line(3, 2, 23, 28)]);
  assert.deepEqual(overall.map(margin), [3.75, -5 / 3]);
  const rows = matchedOpponents(stats, pip, bea, kit);
  assert.deepEqual(
    rows.map((r) => [r.label, r.first, r.second]),
    [["D & E", line(2, 1, 18, 20), line(2, 2, 22, 17)]],
  );
  assert.deepEqual([margin(rows[0].first), margin(rows[0].second)], [-1, 2.5]);
  assert.deepEqual(
    matchedOpponents(stats, pip, kit, bea)[0].first,
    rows[0].second,
  );
  assert.deepEqual(
    matchedOpponents(threadStats(b, "rotating", "one"), pip, bea, kit),
    [],
  );
  assert.deepEqual(matchedOpponents(stats, pip, bea, bea), []);
});

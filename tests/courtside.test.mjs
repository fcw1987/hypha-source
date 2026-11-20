import test from "node:test";
import assert from "node:assert/strict";
import { newBook, addSession } from "../lib/rotation.ts";
import {
  defaults,
  standings,
  raceFinish,
  record,
  closed,
  teamFor,
} from "../lib/scorebook.ts";
import {
  courtBoard,
  startGame,
  reassign,
  byes,
  recap,
  onCourt,
} from "../lib/courtside.ts";
import {
  seasonProgress,
  sessionProgress,
  sessionPlayers,
} from "../lib/progress.ts";
const names = [
  "Avery",
  "Birch",
  "Cy",
  "Dawn",
  "Elm",
  "Finch",
  "Glen",
  "Hale",
  "Indigo",
  "Juniper",
  "Kai",
  "Luz",
  "Marsh",
  "Noel",
  "Ochre",
  "Pax",
];
const fixed = (teamCount, courts) => {
  const participants = names.slice(0, teamCount * 2);
  return newBook(
    "Fixture evening",
    { ...defaults, target: 11 },
    {
      id: crypto.randomUUID(),
      date: "2026-10-14",
      names: participants,
      courts,
      format: "fixed",
      teams: Array.from({ length: teamCount }, (_, i) => ({
        name: String.fromCharCode(65 + i),
        players: participants.slice(2 * i, 2 * i + 2),
      })),
    },
  );
};
const change = (g, score) => ({ id: g.id, before: g.score, score });
test("four fixed teams on two courts wait for the other live matchup, and the recap updates immediately", () => {
  const b = fixed(4, 2),
    s = b.sessions[0];
  const [ab, cd, ac, bd] = s.games;
  const matches = s.games.map((g) =>
    [teamFor(s, g.a).name, teamFor(s, g.b).name].join(""),
  );
  assert.deepEqual(matches, ["AB", "CD", "AC", "BD", "AD", "BC"]);
  startGame(b, s, ab.id);
  startGame(b, s, cd.id);
  record(b, s.id, [change(ab, [11, 6])], false);
  const [first, second] = courtBoard(s);
  assert.equal(first.current.id, ac.id);
  assert.equal(second.current.id, cd.id);
  assert.deepEqual(
    first.waiting.map((g) => g.id),
    [cd.id],
  );
  assert.throws(() => startGame(b, s, ac.id), /Waiting/);
  assert.equal(recap(b, s).find((p) => p.name === "A").average, 11);
  assert.equal(recap(b, s).find((p) => p.name === "C").played, 0);
  assert.ok(recap(b, s).every((p) => p.season === null));
  assert.equal(raceFinish(b), null);
  assert.deepEqual(
    standings(b).map((p) => p.points),
    Array(8).fill(0),
  );
  assert.equal(seasonProgress(b, b.players).hasScores, false);
  const p = sessionPlayers(b, s);
  assert.deepEqual(
    [...sessionProgress(b, s, p).totals.values()],
    [11, 6, 0, 0],
  );
  record(b, s.id, [change(cd, [5, 11])], false);
  startGame(b, s, ac.id);
  startGame(b, s, bd.id);
  assert.deepEqual(
    new Set(s.games.filter((g) => g.started).flatMap(onCourt)).size,
    8,
  );
});
for (const tc of [2, 3, 4, 5, 6, 7, 8])
  for (const c of [1, 2, 3, 4].filter((c) => c <= Math.floor(tc / 2))) {
    test(
      "fixed round robin: " +
        tc +
        " teams on " +
        c +
        " court(s), every matchup once and whole-pair byes",
      () => {
        const b = fixed(tc, c),
          s = b.sessions[0];
        const seen = new Set();
        for (const round of new Set(s.games.map((g) => g.round))) {
          const games = s.games.filter((g) => g.round === round),
            playing = games.flatMap(onCourt);
          assert.ok(games.length <= c);
          assert.equal(new Set(playing).size, playing.length);
          const sit = byes(s, round);
          for (const team of s.teams)
            assert.equal(
              sit.includes(team.pair[0]),
              sit.includes(team.pair[1]),
            );
          for (const g of games)
            seen.add(
              [teamFor(s, g.a).name, teamFor(s, g.b).name].sort().join("-"),
            );
        }
        assert.equal(s.games.length, (tc * (tc - 1)) / 2);
        assert.equal(seen.size, s.games.length);
      },
    );
  }
test("whole pairs are mandatory, including unique pair assignments and named teams", () => {
  for (const teams of [
    [{ name: "A", players: names.slice(0, 2) }],
    [
      { name: "A", players: names.slice(0, 2) },
      { name: "A", players: names.slice(2, 4) },
    ],
    [
      { name: "A", players: names.slice(0, 2) },
      { name: "B", players: [names[1], names[3]] },
    ],
  ]) {
    assert.throws(() =>
      newBook("F", defaults, {
        id: crypto.randomUUID(),
        date: "2026-01-01",
        names: names.slice(0, 4),
        courts: 1,
        format: "fixed",
        teams,
      }),
    );
  }
});
test("guest and late arrival preserve past and live games; pause and resume preserve actual byes", () => {
  const b = newBook(
    "Rotations",
    { ...defaults, rounds: 4 },
    {
      id: crypto.randomUUID(),
      date: "2026-10-14",
      names: names.slice(0, 8),
      courts: 2,
    },
  );
  const s = b.sessions[0];
  const [first, other] = s.games;
  record(b, s.id, [change(first, [11, 4])], false);
  startGame(b, s, other.id);
  // A legacy annotation on a pending game must not reserve its players.
  for (const game of s.games.slice(2)) game.sourceNote = "Imported fixture note";
  const frozen = structuredClone(s.games.slice(0, 2)),
    previous = structuredClone(b.players);
  const input = {
    names: [...names.slice(0, 7), "Night Guest", "Late Guest"],
    guestNames: ["Night Guest", "Late Guest"],
  };
  const result = reassign(b, s, input);
  assert.equal(result.preserved, 2);
  assert.ok(result.added.length);
  assert.deepEqual(s.games.slice(0, 2), frozen);
  assert.deepEqual(b.players, previous);
  const missing = previous.at(-1).id;
  assert.ok(
    s.games
      .filter((g) => g.round > 1)
      .every((g) => !onCourt(g).includes(missing)),
  );
  assert.equal(byes(s, 1).length, 0);
  assert.equal(byes(s, 2).length, 1);
  record(b, s.id, [change(other, [8, 11])], false);
  const guest = s.guests[0];
  const withGuest = s.games.find((g) => onCourt(g).includes(guest.id));
  record(b, s.id, [change(withGuest, [11, 3])], false);
  const night = recap(b, s).find((p) => p.id === guest.id);
  assert.equal(night.played, 1);
  assert.equal(night.season, null);
  assert.ok(night.average > 0);
  reassign(b, s, { names: names.slice(0, 3) });
  assert.equal(s.paused, true);
  assert.equal(s.games.filter((g) => !g.score && !g.started).length, 0);
  reassign(b, s, { names: names.slice(0, 5) });
  assert.equal(s.paused, undefined);
  assert.ok(s.games.some((g) => g.round > 1 && !g.score));
  assert.deepEqual(b.players, previous);
  assert.ok(!closed(b, 0));
});
test("night recap excludes byes, pending and later sessions from that night's target progress", () => {
  const b = newBook(
    "Same group",
    { ...defaults, rounds: 1 },
    {
      id: crypto.randomUUID(),
      date: "2026-10-14",
      names: names.slice(0, 5),
      courts: 1,
    },
  );
  const first = b.sessions[0],
    g = first.games[0];
  record(b, first.id, [change(g, [11, 8])], true);
  const before = recap(b, first),
    sitter = byes(first, 1)[0];
  assert.equal(before.find((p) => p.id === sitter).played, 0);
  assert.equal(before.find((p) => p.id === sitter).average, null);
  addSession(b, {
    id: crypto.randomUUID(),
    date: "2026-10-21",
    names: [...names.slice(0, 4), "Night Guest"],
    guestNames: ["Night Guest"],
    courts: 1,
  });
  const second = b.sessions[1],
    n = second.games[0];
  record(b, second.id, [change(n, [9, 11])], false);
  assert.deepEqual(recap(b, first), before);
  assert.equal(b.players.length, 5);
  assert.equal(
    recap(b, second).find((p) => p.name === "Night Guest").season,
    null,
  );
});

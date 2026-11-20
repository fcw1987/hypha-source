import test from "node:test";
import assert from "node:assert/strict";
import { clubRoundRobin } from "../lib/club-round-robin.ts";
import { schedule } from "../lib/rotation.ts";
import { byes } from "../lib/courtside.ts";

function event(players, courts, play, options = {}) {
  const roster = Array.from({ length: players }, (_, i) => "p" + (i + 1));
  const session = {
    id: "fictional-club-draw", date: "2026-09-07", roster, courts,
    games: [], submitted: false,
    club: { play, draw: "round-robin", movement: "up-down", queue: [], ...options },
  };
  if (play === "singles") session.format = "singles";
  if (play === "fixed") {
    session.format = "fixed";
    session.teams = Array.from({ length: Math.floor(players / 2) }, (_, i) => ({
      id: "team" + i, name: "Pair " + (i + 1), pair: roster.slice(2 * i, 2 * i + 2),
    }));
  }
  return session;
}

function checkGames(session, games) {
  const used = new Set();
  const ids = new Set();
  const matches = new Set();
  const named = new Set(session.roster);
  const played = new Map(session.roster.map(id => [id, 0]));
  const pairs = new Set(session.teams?.map(t => t.pair.join("/")));
  let round = 0, court = 0;
  for (const game of games) {
    assert.equal(game.score, null);
    assert.ok(!ids.has(game.id));
    ids.add(game.id);
    if (game.round !== round) {
      assert.equal(game.round, round + 1);
      round = game.round;
      used.clear();
      court = 0;
    }
    assert.equal(game.court, ++court);
    assert.ok(court <= session.courts);
    for (const side of [game.a, game.b]) {
      assert.equal(side.length, session.club.play === "singles" ? 1 : 2);
      if (session.teams) assert.ok(pairs.has(side.join("/")));
      for (const player of side) {
        assert.ok(named.has(player));
        assert.ok(!used.has(player), player + " assigned twice in wave " + round);
        used.add(player);
        played.set(player, played.get(player) + 1);
      }
    }
    if (session.club.play !== "split") {
      const key = [game.a[0], game.b[0]].sort().join("/");
      assert.ok(!matches.has(key), "opponents repeated: " + key);
      matches.add(key);
    }
    if (session.club.poolByPlayer) {
      const byPlayer = session.club.poolByPlayer;
      const pools = [...game.a, ...game.b].map(p => byPlayer[p]);
      assert.ok(pools.every(p => Number.isInteger(p) && p >= 1 && p === pools[0]));
    }
  }
  return played;
}

test("club mixers preserve the four-, five- and eight-player rotation cycles", () => {
  for (const [players, courts, rounds] of [[4, 1, 3], [5, 1, 5], [8, 2, 7]]) {
    const s = event(players, courts, "split", { rounds });
    const g = clubRoundRobin(s);
    assert.deepEqual(g, schedule(s.roster, courts, rounds, [], s.id));
    const counts = checkGames(s, g);
    assert.deepEqual(new Set(counts.values()), new Set([players === 5 ? 4 : rounds]));
    for (const [i, a] of s.roster.entries()) {
      for (const b of s.roster.slice(i + 1)) {
        assert.equal(g.filter(game => [game.a, game.b].some(side => side.includes(a) && side.includes(b))).length, 1);
        assert.equal(g.filter(game => (game.a.includes(a) && game.b.includes(b)) ||
          (game.b.includes(a) && game.a.includes(b))).length, 2);
      }
    }
  }
});

test("larger mixers balance appearances and use only the courts attendees can fill", () => {
  for (const [players, courts, rounds] of [
    [4, 12, 2], [9, 12, 9], [20, 5, 6], [32, 8, 8], [48, 12, 24], [47, 4, 8],
  ]) {
    const s = event(players, courts, "split", { rounds });
    const games = clubRoundRobin(s);
    const counts = [...checkGames(s, games).values()];
    assert.equal(games.length, Math.min(courts, Math.floor(players / 4)) * rounds);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
    assert.equal(games.at(-1).round, rounds);
    const first = { ...s, games };
    assert.equal(byes(first, 1).length, players - Math.min(courts, Math.floor(players / 4)) * 4);
  }
});

test("48 singles share eight courts across exactly 141 waves, or use all 24 courts", () => {
  for (const [courts, waves] of [[8, 141], [24, 47]]) {
    const s = event(48, courts, "singles");
    const initial = structuredClone(s);
    const games = clubRoundRobin(s);
    assert.equal(games.length, 1128);
    assert.equal(games.at(-1).round, waves);
    assert.deepEqual(new Set(checkGames(s, games).values()), new Set([47]));
    assert.deepEqual(s, initial);
    assert.deepEqual(clubRoundRobin(s), games);
    assert.ok(Buffer.byteLength(JSON.stringify({ ...s, games })) < 1400000);
  }
});

test("shortened singles schedule counts pairing rounds before physical court waves", () => {
  const s = event(48, 8, "singles", { rounds: 8 });
  const games = clubRoundRobin(s);
  assert.equal(games.length, 192);
  assert.equal(games.at(-1).round, 24);
  assert.deepEqual(new Set(checkGames(s, games).values()), new Set([8]));
});

test("fixed teams stay intact across whole and shortened rounds with shared courts", () => {
  for (const [players, courts, limit, gamesExpected, waves, gamesPerTeam] of [
    [4, 12, undefined, 1, 1, 1], [12, 2, undefined, 15, 8, 5],
    [20, 5, undefined, 45, 9, 9], [32, 8, undefined, 120, 15, 15],
    [32, 8, 8, 64, 8, 8], [48, 12, undefined, 276, 23, 23],
  ]) {
    const s = event(players, courts, "fixed", { rounds: limit });
    const g = clubRoundRobin(s);
    assert.equal(g.length, gamesExpected);
    assert.equal(g.at(-1).round, waves);
    assert.deepEqual(new Set(checkGames(s, g).values()), new Set([gamesPerTeam]));
    assert.deepEqual(g.at(-1).score, null);
  }
});

test("balanced pools share each wave and never assign opponents from different pools", () => {
  for (const [players, courts, play, pools, nGames, nWaves] of [
    [13, 3, "singles", 3, 22, 8], [20, 3, "fixed", 2, 20, 7],
    [48, 8, "singles", 4, 264, 33],
  ]) {
    const s = event(players, courts, play, { pools });
    const initial = structuredClone(s);
    const games = clubRoundRobin(s);
    const { poolByPlayer } = s.club;
    assert.deepEqual(Object.keys(poolByPlayer).sort(), [...s.roster].sort());
    const membership = Array.from({ length: pools }, (_, i) =>
      s.roster.filter(id => poolByPlayer[id] === i + 1));
    const teamSize = play === "singles" ? 1 : 2;
    const entrants = membership.map(ids => ids.length / teamSize);
    assert.ok(Math.max(...entrants) - Math.min(...entrants) <= 1);
    assert.equal(games.length, nGames);
    assert.equal(games.at(-1).round, nWaves);
    const counts = checkGames(s, games);
    for (const [index, ids] of membership.entries()) {
      assert.ok(ids.every(id => counts.get(id) === entrants[index] - 1));
    }
    assert.ok(new Set(games.filter(g => g.round === 1).map(g => poolByPlayer[g.a[0]])).size > 1);
    const after = structuredClone(s);
    delete after.club.poolByPlayer;
    assert.deepEqual(after, initial);
    assert.deepEqual(clubRoundRobin(s), games);
  }
});

test("an odd pool rotates byes, including across a partial draw and after a smaller pool finishes", () => {
  const solo = event(5, 2, "singles");
  solo.games = clubRoundRobin(solo);
  assert.deepEqual(new Set(checkGames(solo, solo.games).values()), new Set([4]));
  assert.deepEqual(Array.from({ length: 5 }, (_, i) => byes(solo, i + 1)[0]).sort(), [...solo.roster].sort());
  const s = event(9, 3, "singles", { pools: 2, rounds: 4 });
  const g = clubRoundRobin(s);
  assert.equal(g.length, 14);
  const counts = checkGames(s, g);
  for (const [id, count] of counts) {
    if (s.club.poolByPlayer[id] === 2) assert.equal(count, 3);
    else assert.ok(count === 3 || count === 4);
  }
});

test("the physical venue and full-pair roster are validated before a draw is returned", () => {
  for (const s of [
    event(1, 1, "singles"), event(49, 24, "singles"), event(48, 25, "singles"),
    event(48, 13, "fixed"), event(20, 3, "split", { pools: 2 }),
    event(5, 2, "fixed"), event(48, 12, "split", { rounds: 25 }),
    event(48, 24, "singles", { rounds: 48 }), event(6, 3, "singles", { pools: 4 }),
    event(6, 3, "singles", { rounds: 0 }), event(16, 4, "fixed", { pools: 0 }),
  ]) assert.throws(() => clubRoundRobin(s));
  const s = event(8, 2, "fixed");
  s.teams[1].pair[0] = s.teams[0].pair[0];
  assert.throws(() => clubRoundRobin(s), /intact pair/);
  s.roster[0] = s.roster[1];
  assert.throws(() => clubRoundRobin(s), /roster/);
});

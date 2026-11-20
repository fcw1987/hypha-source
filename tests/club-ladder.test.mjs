import test from "node:test";
import assert from "node:assert/strict";
import { advanceClub, newBook } from "../lib/rotation.ts";
import { defaults, eligibleAt, record } from "../lib/scorebook.ts";

function event(count, courts, play = "split", movement = "up-down") {
  const names = Array.from({length: count}, (_, i) => "Player " + (i + 1));
  const setup = { id: crypto.randomUUID(), format: play === "split" ? "rotating" : play,
    date: "2026-10-02", names, courts, club: {play, draw: "ladder", movement} };
  if (play === "fixed") setup.teams = Array.from({length: count / 2}, (_, i) => ({
    name: "Pair " + (i + 1), players: names.slice(i * 2, i * 2 + 2),
  }));
  const book = newBook("Club fixture", {...defaults, target: null}, setup);
  return {book, s: book.sessions[0], names};
}
function saveRound(book, s, round) {
  const games = s.games.filter(g => g.round === round);
  record(book, s.id, games.map(g => ({id: g.id, score: [11,7], before: null})), false);
  return games;
}
const played = games => games.flatMap(g => [...g.a, ...g.b]);
const at = (s, round) => s.games.filter(g => g.round === round);

test("both ladder movements match independent five-court movement oracles, including top and bottom", () => {
  for (const movement of ["up-down", "top-falls"]) {
    for (const play of ["split", "fixed", "singles"]) {
      const {book,s} = event(play === "singles" ? 10 : 20, 5, play, movement);
      for (let r = 1; r <= 3; r++) {
        const old = saveRound(book, s, r);
        const [a,b,c,d,e] = old;
        const seats = movement === "up-down"
          ? [[a.a,b.a],[a.b,c.a],[b.b,d.a],[c.b,e.a],[d.b,e.b]]
          : [[a.a,b.a],[b.b,c.a],[c.b,d.a],[d.b,e.a],[e.b,a.b]];
        const saved = structuredClone(s.games);
        advanceClub(book, s, {round: r});
        const next = at(s,r + 1);
        assert.deepEqual(s.games.slice(0, saved.length), saved);
        assert.deepEqual(next.map(g => new Set([...g.a,...g.b])), seats.map(v => new Set(v.flat())));
        assert.equal(new Set(played(next)).size, s.roster.length);
        for (const g of next) {
          const priorSides = old.flatMap(g => [g.a,g.b]).map(side => [...side].sort().join(","));
          for (const side of [g.a, g.b]) {
            if (play !== "singles") assert.equal(priorSides.includes([...side].sort().join(",")),play === "fixed");
          }
        }
      }
    }
  }
});
test("one physical court splits partners, extra empty courts stay empty and visits stay eligible by round", () => {
  const {book,s,names} = event(4,12);
  assert.equal(s.games.length,1);
  assert.throws(() => advanceClub(book,s,{round:1}));
  const old = saveRound(book,s,1)[0];
  advanceClub(book,s,{round:1,names:[...names,"Guest X","Guest Y"],guestNames:["Guest X","Guest Y"]});
  const next = at(s,2)[0];
  assert.equal(eligibleAt(s,1).length,4);
  assert.equal(eligibleAt(s,2).length,6);
  assert.equal(s.club.queue.length,2);
  for (const g of s.guests) assert.ok(played([next]).includes(g.id));
  assert.equal(new Set([...played([next]),...s.club.queue]).size,6);
  assert.deepEqual(old.score,[11,7]);
  saveRound(book,s,2);
  const last = structuredClone(at(s,2));
  advanceClub(book,s,{round:2,names:names.slice(0,3).concat("Guest X")});
  assert.deepEqual(at(s,2),last);
  assert.equal(s.club.queue.length,0);
  assert.deepEqual(eligibleAt(s,1),s.roster.slice(0,4));
  assert.equal(eligibleAt(s,3).length,4);
  assert.ok(!eligibleAt(s,3).includes(s.roster[3]));
  assert.equal(book.players.length,4);
});
test("waiting players enter in queue order, fixed pairs stay intact, one-court rematches have truthful boundaries", () => {
  for (const play of ["split","fixed","singles"]) {
    const count = play === "fixed" ? 10 : play === "singles" ? 5 : 7;
    const {book,s} = event(count,1,play);
    const initial = s.club.queue.slice();
    assert.ok(initial.length > 0);
    const first = saveRound(book,s,1)[0];
    advanceClub(book,s,{round:1});
    const second = at(s,2);
    const seats = play === "singles" ? 1 : 2;
    assert.ok(initial.slice(0,seats).every(p => played(second).includes(p)));
    assert.deepEqual(new Set([...s.club.queue,...played(second)]),new Set(s.roster));
    if (play === "fixed") assert.ok(second.flatMap(g => [g.a,g.b]).every(pair => s.teams.some(t => pair.every(id => t.pair.includes(id)))));
    assert.deepEqual(first.score,[11,7]);
  }
  const {book,s} = event(4,1);
  const sides = saveRound(book,s,1)[0];
  advanceClub(book,s,{round:1});
  const second = at(s,2)[0];
  for (const pair of [second.a,second.b])
    assert.ok(![sides.a,sides.b].some(prev => pair.every(id => prev.includes(id))));
});
test("club capacity for 32, 48 and a physically undersubscribed singles court sheet", () => {
  for (const [count,courts,play,filled] of [[32,8,"split",8],[48,12,"split",12],[48,12,"fixed",12],[48,24,"singles",24],[7,24,"singles",3]]) {
    const {book,s} = event(count,courts,play);
    for(let r = 1; r <= 3; r++) {
      const current = saveRound(book,s,r);
      assert.equal(current.length,filled);
      assert.equal(new Set([...played(current),...s.club.queue]).size,count);
      assert.equal(played(current).length+s.club.queue.length,count);
      advanceClub(book,s,{round:r});
    }
  }
  assert.throws(() => event(49,12));
  assert.throws(() => event(48,13));
  assert.throws(() => event(48,25,"singles"));
});
test("a correction changes an unpublished ladder draw; published dependent assignments keep their players", () => {
  const {book,s} = event(8,2);
  const round = saveRound(book,s,1);
  const saved = structuredClone(book);
  const trial = saved.sessions[0];
  advanceClub(saved,trial,{round:1});
  const game = round[1];
  record(book,s.id,[{id:game.id,before:[11,7],score:[4,11]}],false);
  advanceClub(book,s,{round:1});
  const issued = structuredClone(at(s,2));
  assert.notDeepEqual(at(trial,2),issued);
  assert.throws(() => advanceClub(book,s,{round:1}));
  assert.throws(() => advanceClub(book,s,{round:2}));
  record(book,s.id,[{id:game.id,before:[4,11],score:[11,7]}],false);
  assert.deepEqual(at(s,2),issued);
});

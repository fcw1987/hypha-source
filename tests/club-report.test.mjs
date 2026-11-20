import test from "node:test";
import assert from "node:assert/strict";
import { clubPlayerReport, clubReport } from "../lib/club-report.ts";
import { clubRoundRobin } from "../lib/club-round-robin.ts";
import { openClubBox, nextClubBox } from "../lib/club-box.ts";
import { openTournament, nextTournament } from "../lib/tournament.ts";
import { defaults, record } from "../lib/scorebook.ts";

function game(round, court, a, b, score, extra = {}) {
  return { id: "r" + round + "c" + court, round, court, a, b, score, ...extra };
}
function fixture(play, draw, roster, games, options = {}) {
  const session = {
    id: "club", date: "2026-06-02", roster, games, submitted: false, courts: 2,
    format: play === "split" ? undefined : play,
    club: { play, draw, movement: "up-down", queue: [], ...options },
  };
  const book = {
    id: "fixture", name: "Fictional club", rules: { ...defaults, target: null },
    players: roster.map(id => ({ id, name: id.toUpperCase() })), sessions: [session],
  };
  return { book, session };
}
const profile = (book, s, id) => clubPlayerReport(clubReport(book, s), id);

test("ladder separates movement issued for the next round from courts with a final; waits and corrections follow saved data", () => {
  const prior = [..."abcdefghi"];
  const { book, session } = fixture("split", "ladder", [...prior, "j"], [
    game(1, 1, ["e","f"], ["g","h"], [6,11]),
    game(1, 2, ["a","b"], ["c","d"], [11,8]),
    game(2, 1, ["e","f"], ["g","h"], [11,7]),
    game(2, 2, ["b","c"], ["d","i"], [5,11]),
    game(3, 1, ["a","g"], ["b","h"], null, { started:true, live:[3,2] }),
    game(3, 2, ["j","c"], ["i","f"], [11,9]),
  ]);
  session.attendanceByRound = {1:prior, 2:prior, 3:[..."abcefghij"]};
  session.club.queue = ["e"];
  book.players[0].name = book.players[8].name = "Fern";
  book.players.pop();
  session.guests = [{id:"j",name:"Finch"}];
  const other = { ...session, id:"another-night", games:[game(1,1,["a","b"],["c","d"],[11,0])] };
  book.sessions.unshift(other);
  const before = JSON.stringify(book);
  const report = clubReport(book,session);
  const a = clubPlayerReport(report,"a");
  assert.notEqual(a.name,clubPlayerReport(report,"i").name);
  assert.deepEqual([a.games,a.wins,a.losses,a.pointsFor,a.pointsAgainst,a.difference,a.perGame], [1,1,0,11,8,3,3]);
  assert.equal(a.highestCourt,2);
  assert.deepEqual(a.assignment,{status:"On court",round:3,court:1});
  assert.equal(a.waits,1);
  assert.equal(clubPlayerReport(report,"j").waits,0);
  assert.equal(clubPlayerReport(report,"e").assignment.status,"On the waiting list");
  assert.equal(clubPlayerReport(report,"d").assignment.status,"Absent from this round");
  assert.equal(JSON.stringify(book),before);
  record(book,"club",[{id:"r1c2",before:[11,8],score:[6,11]}],false);
  const after = profile(book,session,"a");
  assert.deepEqual([after.wins,after.losses,after.difference,after.waits,after.highestCourt],[0,1,-5,1,2]);
  assert.deepEqual(after.assignment,a.assignment);
  record(book,"club",[{id:"r3c1",before:null,score:[11,4]}],true);
  const final = profile(book,session,"a");
  assert.deepEqual([final.games,final.wins,final.losses,final.difference,final.perGame,final.highestCourt],[2,1,1,2,1,1]);
  assert.deepEqual(final.saved.map(g=>[g.round,g.court]),[[1,2],[3,1]]);
  assert.deepEqual(final.assignment,{status:"Session submitted"});
});

test("no result, a void assignment, a malformed side and an invalid score never create a loss, margin or completed wait", () => {
  const { book,session } = fixture("split","ladder",[..."abcdefghi"],[
    game(1,1,["a","b"],["c","d"],[11,3],{voided:true}),
    game(1,2,["e","f"],["g","h"],[11,7]),
    game(2,1,["a","a"],["c","d"],[11,5]),
    game(3,1,["e","f"],["g","h"],[12,9]),
    game(4,1,["e","f"],["g","h"],null),
  ]);
  const a=profile(book,session,"a");
  assert.deepEqual([a.games,a.losses,a.perGame,a.highestCourt,a.waits],[0,0,null,null,0]);
  assert.equal(profile(book,session,"i").waits,1);
  session.games=[];
  assert.deepEqual(profile(book,session,"a").assignment,{status:"Draw pending"});
});

test("fixed round robin measures distinct opposing teams from actual fixtures, regardless of pair order", () => {
  const { book,session }=fixture("fixed","round-robin",[..."abcdef"],[
    game(1,1,["a","b"],["c","d"],[11,4]),
    game(2,1,["d","c"],["b","a"],[11,8]),
    game(3,1,["a","b"],["e","f"],null),
  ]);
  session.teams = [{id:"1",name:"Cedar",pair:["a","b"]},{id:"2",name:"Hazel",pair:["c","d"]},{id:"3",name:"Ash",pair:["e","f"]}];
  const a=profile(book,session,"a");
  assert.deepEqual([a.teamName,a.faced,a.scheduled,a.wins,a.losses,a.difference,a.perGame],["Cedar",1,2,1,1,4,2]);
  assert.equal(a.saved[1].opposition,"Hazel");
  assert.deepEqual(a.assignment,{status:"Next scheduled game",round:3,court:1});
});

test("in a pool draw only played waves in the selected player's pool count eligible waits", () => {
  const {book,session}=fixture("singles","round-robin",[..."abcdef"],[
    game(1,1,["e"],["f"],[11,5]),
    game(2,1,["b"],["c"],[11,7]),
    game(3,1,["a"],["b"],[11,4]),
    game(4,1,["c"],["d"],null),
    game(5,1,["a"],["d"],null),
  ],{pools:2,poolByPlayer:{a:1,b:1,c:1,d:1,e:2,f:2}});
  const a=profile(book,session,"a");
  assert.deepEqual([a.waits,a.partners,a.faced,a.scheduled,a.pool],[1,0,1,2,1]);
});

test("48 singles players and all 1,128 matches yield a player-level 47-game recap without other sessions or invented future waits", () => {
  const roster = Array.from({length:48},(_,i)=>"p"+(i+1));
  const {book,session}=fixture("singles","round-robin",roster,[]);
  session.courts=24;session.games=clubRoundRobin(session);
  assert.equal(session.games.length,1128);
  const early=profile(book,session,roster[0]);
  assert.deepEqual([early.games,early.waits,early.faced,early.scheduled],[0,0,0,47]);
  for(const g of session.games) g.score = g.b[0] === roster[0] ? [4,11] : [11,4];
  const r=clubReport(book,session);
  const p=clubPlayerReport(r,roster[0]);
  assert.equal(r.players.length,48);
  assert.deepEqual([p.games,p.wins,p.losses,p.pointsFor,p.pointsAgainst,p.difference,p.perGame,p.waits,p.faced,p.scheduled],
    [47,47,0,517,188,329,7,0,47,47]);
  assert.equal(p.saved.length,47);
  assert.equal(p.assignment.status,"No remaining assignment");
});

for (const fixed of [false, true]) {
  test((fixed ? "fixed team" : "singles") + " box recap counts waits in the flight actually occupied in each published block", () => {
    const roster = [...(fixed ? "abcdefghijkl" : "abcdef")];
    const { book, session } = fixture(fixed ? "fixed" : "singles", "box", roster, [], { pools: 2 });
    session.courts = 1;
    if (fixed) session.teams = Array.from({ length: 6 }, (_, i) => ({
      id: "team" + (i + 1), name: "Pair " + (i + 1), pair: roster.slice(i * 2, i * 2 + 2),
    }));
    const seeds = fixed ? session.teams.map(t => t.id) : roster;
    const sideId = side => fixed ? session.teams.find(t => t.pair.includes(side[0])).id : side[0];
    const seedResult = g => { g.score = seeds.indexOf(sideId(g.a)) < seeds.indexOf(sideId(g.b)) ? [11,5] : [5,11]; };
    const moved = fixed ? "f" : "c";
    openClubBox(session);
    session.games.forEach(seedResult);
    const opening = profile(book, session, moved);
    assert.deepEqual([opening.flight, opening.waits, opening.games, opening.faced, opening.scheduled],
      [{ number: 1, block: 1 }, 1, 2, 2, 2]);
    nextClubBox(session, 1);
    const next = session.club.boxes[1];
    const nextGames = session.games.filter(g => g.round >= next.firstRound);
    // Only Flight 1 plays these waves. The selected entrant has already moved down to Flight 2.
    nextGames.filter(g => next.flights[0].includes(sideId(g.a))).forEach(seedResult);
    const partial = profile(book, session, moved);
    assert.deepEqual([partial.flight, partial.pool, partial.waits, partial.faced, partial.scheduled],
      [{ number: 2, block: 2 }, undefined, 1, 2, 4]);
    nextGames.forEach(seedResult);
    const movedFinal = profile(book, session, moved), stayed = profile(book, session, "a");
    assert.deepEqual([movedFinal.games, movedFinal.waits, movedFinal.faced, movedFinal.scheduled], [4,2,4,4]);
    // A and the second entrant play each other twice; repeat meetings count once in coverage.
    assert.deepEqual([stayed.games, stayed.waits, stayed.faced, stayed.scheduled, stayed.flight],
      [4,2,3,3,{ number: 1, block: 2 }]);
    if (fixed) assert.equal(movedFinal.teamName, "Pair 3");
  });
}

test("tournament waits follow active knockout entrants still awaiting their issued court across starting pools", () => {
  const {book,session} = fixture("singles","tournament",[..."abcdefgh"],[],{
    pools:2,tournament:{entry:"pools",qualifiers:4,bronze:false,division:"open"},
  });
  session.courts=1;
  openTournament(session);
  const saveOpen = () => session.games.forEach(g => {
    if (!g.score) g.score = g.a[0] < g.b[0] ? [11,6] : [6,11];
  });
  saveOpen();
  const start=clubReport(book,session);
  const waits=id=>clubPlayerReport(start,id).waits;
  nextTournament(session,0);
  const semis=session.club.bracket.stages[0];
  assert.deepEqual(semis.slots.map(m=>[m.a,m.b]),[["a","d"],["b","c"]]);
  saveOpen();
  const after=clubReport(book,session);
  for (const id of session.roster) {
    const p=clubPlayerReport(after,id);
    // b and c waited for the one physical court during a v d.
    assert.equal(p.waits - waits(id), id==="b" || id==="c" ? 1 : 0, id);
  }
  nextTournament(session,1);
  saveOpen();
  const final=clubReport(book,session);
  for(const id of session.roster) assert.equal(clubPlayerReport(final,id).waits,clubPlayerReport(after,id).waits);
  assert.equal(clubPlayerReport(final,"b").pool,2);
});

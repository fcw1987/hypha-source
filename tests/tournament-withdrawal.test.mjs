import test from "node:test";
import assert from "node:assert/strict";
import { newBook } from "../lib/rotation.ts";
import { defaults, record } from "../lib/scorebook.ts";
import {
  guardTournamentScore, nextTournament, setTournamentWithdrawal, tournamentGameStatus,
  tournamentPoolComplete, tournamentPoolDispositions, tournamentPoolProgress,
  tournamentStandings, tournamentTies, tournamentWithdrawalImpact, tournamentWithdrawnPlayers,
} from "../lib/tournament.ts";

function fixture(n = 8, options = {}) {
  const { fixed = true, pools = 2, qualifiers = 4, entry = "pools", courts = 2 } = options;
  const names = Array.from({length:n * (fixed ? 2 : 1)}, (_,i) => "Fixture player " + (i + 1));
  const teams = fixed ? Array.from({length:n}, (_,i) => ({
    name: "Fictional pair " + (i + 1), players:names.slice(2*i,2*i+2),
  })) : undefined;
  const book = newBook("Disposable tournament", {...defaults,target:null}, {
    id:crypto.randomUUID(),date:"2026-11-21",format:fixed?"fixed":"singles",courts,names,teams,
    club:{play:fixed?"fixed":"singles",draw:"tournament",movement:"up-down",pools,
      tournament:{entry,qualifiers,bronze:false,division:"open"}},
  });
  const s=book.sessions[0], b=s.club.bracket;
  const entrants = fixed ? s.teams.map(t => t.id) : s.roster;
  const idOf=side=>fixed?s.teams.find(t=>t.pair.includes(side[0])).id:side[0];
  const withEntrant=(id)=>s.games.filter(g=>idOf(g.a)===id||idOf(g.b)===id);
  const between=(a,b)=>withEntrant(a).find(g=>idOf(g.a)===b||idOf(g.b)===b);
  const winBySeed=games=>record(book,s.id,games.map(g=>({
    id:g.id,before:null,beforeVersion:g.editVersion??0,
    score:entrants.indexOf(idOf(g.a))<entrants.indexOf(idOf(g.b))?[11,7]:[7,11],
  })),false);
  return {book,s,b,entrants,withEntrant,between,winBySeed,idOf};
}

test("eight-pair pool withdrawal keeps 10 historical finals, counts 9 of 9, voids two, and publishes original crossovers", () => {
  const {book,s,b,entrants,withEntrant,winBySeed}=fixture();
  const leaver=entrants[7], touched=withEntrant(leaver), pending=touched.slice(1);
  assert.equal(touched.length,3);
  winBySeed(s.games.filter(g=>!pending.includes(g)));
  assert.deepEqual(tournamentPoolProgress(s),{counted:10,required:12,excluded:0,voided:0,shortages:[]});
  assert.throws(()=>nextTournament(s,0),e=>e.status===409);
  const historical=structuredClone(s.games);
  const impact=tournamentWithdrawalImpact(s,leaver,true);
  assert.deepEqual([impact.pool,impact.activeEntrants,impact.requiredEntrants],[2,3,2]);
  assert.deepEqual(impact.affectedFinals,[touched[0].id]);
  assert.deepEqual(impact.affectedPending,pending.map(g=>g.id));
  assert.equal(setTournamentWithdrawal(s,leaver,true),true);
  assert.equal(setTournamentWithdrawal(s,leaver,true),false);
  const report=tournamentPoolProgress(s);
  assert.deepEqual(report,{counted:9,required:9,excluded:1,voided:2,shortages:[]});
  assert.equal(tournamentPoolComplete(s),true);
  assert.deepEqual(b.withdrawn,[leaver]);
  assert.deepEqual(tournamentWithdrawnPlayers(s),new Set(s.teams[7].pair));
  assert.equal(s.games.filter(g=>g.score).length,10);
  historical.forEach((orig,i)=>{
    const actual=s.games[i];
    assert.deepEqual(actual,pending.includes(actual)?{...orig,editVersion:1}:orig);
  });
  assert.deepEqual(tournamentPoolDispositions(s),new Map(touched.map((g,i)=>[g.id,i?"void":"excluded"])));
  assert.throws(()=>record(book,s.id,[{id:pending[0].id,before:null,beforeVersion:1,score:[11,7]}],false),e=>e.status===409);
  assert.throws(()=>guardTournamentScore(s,touched[0],null),e=>e.status===409);
  const rows=tournamentStandings(s);
  assert.ok(!rows.flat().some(r=>r.id===leaver));
  assert.deepEqual(rows.map(pool=>pool.map(r=>[r.id,r.played,r.wins,r.difference])),[
    [["t1",3,3,12],["t3",3,2,4],["t5",3,1,-4],["t7",3,0,-12]],
    [["t2",2,2,8],["t4",2,1,0],["t6",2,0,-8]],
  ]);
  nextTournament(s,0);
  assert.deepEqual(b.seeds,["t1","t2","t3","t4"]);
  assert.deepEqual(b.stages[0].slots.map(m=>[m.a,m.b]),[["t1","t4"],["t2","t3"]]);
  assert.throws(()=>setTournamentWithdrawal(s,leaver,false),e=>e.status===409);
  assert.throws(()=>setTournamentWithdrawal(s,entrants[0],true),e=>e.status===409);
  const snap=structuredClone(b.seeding), g=touched[0];
  record(book,s.id,[{id:g.id,before:g.score,beforeVersion:g.editVersion,score:[11,1]}],false);
  assert.deepEqual(b.seeding,snap);
  assert.deepEqual(tournamentPoolProgress(s),report);
  const reloaded=JSON.parse(JSON.stringify(s));
  assert.deepEqual(tournamentPoolDispositions(reloaded),tournamentPoolDispositions(s));
});

test("overlapping withdrawals and restores change only newly affected games and revisions, including a saved shared result", () => {
  for (const sharedFinal of [false,true]) {
    const {s,book,b,withEntrant,between,winBySeed}=fixture();
    const [a,c]=b.pools[0], shared=between(a,c);
    if (sharedFinal) winBySeed([shared]);
    setTournamentWithdrawal(s,a,true);
    const afterA=shared.editVersion;
    const impact=tournamentWithdrawalImpact(s,c,true);
    assert.deepEqual(sharedFinal?impact.stillExcluded:impact.stillVoid,[shared.id]);
    setTournamentWithdrawal(s,c,true);
    assert.equal(shared.editVersion,afterA);
    const restore=tournamentWithdrawalImpact(s,a,false);
    assert.deepEqual(sharedFinal?restore.stillExcluded:restore.stillVoid,[shared.id]);
    setTournamentWithdrawal(s,a,false);
    assert.equal(tournamentGameStatus(s,shared),sharedFinal?"excluded":"void");
    assert.equal(shared.editVersion,afterA);
    assert.equal(tournamentPoolDispositions(s).size,withEntrant(c).length);
    setTournamentWithdrawal(s,c,false);
    assert.equal(b.withdrawn,undefined);
    assert.equal(tournamentPoolDispositions(s).size,0);
    assert.equal(shared.editVersion,sharedFinal?1:2);
    if (!sharedFinal) {
      assert.throws(()=>record(book,s.id,[{id:shared.id,before:null,beforeVersion:0,score:[11,8]}],false),e=>e.status===409);
      record(book,s.id,[{id:shared.id,before:null,beforeVersion:2,score:[11,8]}],false);
    }
  }
});

test("a suspended live game retains its points, releases claims and cannot be restored onto an occupied court or player", () => {
  for(const mode of ["court","player"]){
    const {s,b,idOf,withEntrant}=fixture();
    const withdrawn=b.pools[0][0];
    const options=withEntrant(withdrawn);
    const saved=options.map(g=>({g,conflict:s.games.find(other=>!options.includes(other) && (
      mode==="court"?g.court===other.court:g.court!==other.court &&
      [...g.a,...g.b].some(p=>other.a.includes(p)||other.b.includes(p))))})).find(x=>x.conflict);
    assert.ok(saved);
    const {g,conflict}=saved;
    g.started=true;g.live=[5,3];g.editVersion=7;
    const impact=tournamentWithdrawalImpact(s,withdrawn,true);
    assert.deepEqual(impact.affectedLive,[g.id]);
    setTournamentWithdrawal(s,withdrawn,true);
    assert.deepEqual([g.score,g.live,g.started,g.editVersion],[null,[5,3],true,8]);
    assert.equal(tournamentGameStatus(s,g),"void");
    conflict.started=true;conflict.live=[2,2];
    const before=structuredClone(s);
    const restore=tournamentWithdrawalImpact(s,withdrawn,false);
    assert.match(restore.restoreBlock,/Court .*wave .*active match/);
    assert.throws(()=>setTournamentWithdrawal(s,withdrawn,false),e=>e.status===409);
    assert.deepEqual(s,before);
    conflict.score=[11,5];delete conflict.started;delete conflict.live;
    assert.equal(tournamentWithdrawalImpact(s,withdrawn,false).restoreBlock,null);
    setTournamentWithdrawal(s,withdrawn,false);
    assert.deepEqual([tournamentGameStatus(s,g),g.score,g.live,g.started,g.editVersion],["eligible",null,[5,3],true,9]);
    assert.ok([idOf(g.a),idOf(g.b)].includes(withdrawn));
  }
});

test("a tie created by excluding a prior opponent must be resolved among the remaining entrants", () => {
  const {s,b,entrants,between,idOf}=fixture(4,{fixed:false,pools:1,qualifiers:2});
  const [a,c,d,out]=entrants;
  const assign=(x,y,own,other)=>{const g=between(x,y);g.score=idOf(g.a)===x?[own,other]:[other,own];};
  assign(a,c,11,9);assign(c,d,11,9);assign(d,a,11,9);
  assign(a,out,11,1);assign(c,out,11,3);assign(d,out,11,4);
  assert.deepEqual(tournamentTies(s),[]);
  setTournamentWithdrawal(s,out,true);
  assert.deepEqual(tournamentWithdrawnPlayers(s),new Set([out]));
  assert.deepEqual(tournamentPoolProgress(s),{counted:3,required:3,excluded:3,voided:0,shortages:[]});
  assert.deepEqual(tournamentTies(s),[{pool:1,rank:1,ids:[a,c,d]}]);
  assert.throws(()=>nextTournament(s,0,[{pool:1,order:[a,c,out],reason:"Wrong group"}]),/tied group/);
  nextTournament(s,0,[{pool:1,order:[d,c,a],reason:"Recorded director decision."}]);
  assert.deepEqual(b.seeds,[d,c]);
});

test("short pools stay short: no wildcard, withdrawn semifinalist, or qualification without a match", () => {
  for (const [n,pools,qualifiers,keep] of [[8,2,4,1],[4,1,4,3],[3,1,2,1],[4,2,4,0]]) {
    const {s,b,winBySeed}=fixture(n,{fixed:false,pools,qualifiers});
    winBySeed(s.games);
    const pool=b.pools.at(-1), required=qualifiers/pools;
    const out=pool.slice(keep);
    for(const id of out) setTournamentWithdrawal(s,id,true);
    assert.deepEqual(tournamentPoolProgress(s).shortages,[{pool:pools,active:keep,required}]);
    assert.equal(tournamentPoolComplete(s),false);
    assert.deepEqual(tournamentTies(s),[]);
    assert.throws(()=>nextTournament(s,0),e=>e.status===409 && /Pool [AB].*needs.*Restore/.test(e.message));
    assert.deepEqual(b.seeds,[]);
    for(const id of out.slice(0,required-keep)) setTournamentWithdrawal(s,id,false);
    assert.equal(tournamentPoolComplete(s),true);
    nextTournament(s,0);
    assert.equal(b.seeds.filter(id=>pool.includes(id)).length,required);
  }
});

test("only whole known entrants of an open pooled tournament can change, with atomic version-limit failure", () => {
  const {s,b,entrants,withEntrant}=fixture();
  for(const [id,flag] of [[s.roster[0],true],["missing",true],[entrants[0],"false"]])
    assert.throws(()=>setTournamentWithdrawal(s,id,flag));
  const touched=withEntrant(entrants[0]);
  touched.at(-1).editVersion=Number.MAX_SAFE_INTEGER;
  const before=structuredClone(s);
  assert.throws(()=>setTournamentWithdrawal(s,entrants[0],true),e=>e.status===409);
  assert.deepEqual(s,before);
  s.submitted=true;
  assert.throws(()=>setTournamentWithdrawal(s,entrants[0],true),/before playoff/);
  const direct=fixture(4,{entry:"seeded",pools:1});
  assert.throws(()=>setTournamentWithdrawal(direct.s,direct.entrants[1],true),/before playoff/);
  assert.deepEqual(b.stages,[]);
});

test("48-player pool recalculation uses all 1,128 original fixtures without awarding points for voids", () => {
  const {s,b}=fixture(48,{fixed:false,pools:1,courts:8});
  assert.equal(s.games.length,1128);
  for(const id of b.pools[0].slice(40)) setTournamentWithdrawal(s,id,true);
  assert.deepEqual(tournamentPoolProgress(s),{counted:0,required:780,excluded:0,voided:348,shortages:[]});
  assert.equal(s.games.length,1128);
  assert.ok(s.games.every(g=>g.score===null));
  assert.equal(tournamentPoolDispositions(s).size,348);
  assert.ok(tournamentStandings(s)[0].every(row=>row.played===0 && row.pointsFor===0 && row.losses===0));
});

test("two suspended games for the same entrant can be restored separately without a double booking", () => {
  const {book,s,b,between}=fixture(6,{fixed:false,pools:1,qualifiers:2});
  const [a,birch,cedar]=b.pools[0], first=between(a,birch), second=between(a,cedar);
  first.started=true;first.live=[2,1];
  setTournamentWithdrawal(s,birch,true);
  second.started=true;second.live=[3,2];
  setTournamentWithdrawal(s,cedar,true);
  setTournamentWithdrawal(s,a,true);
  setTournamentWithdrawal(s,birch,false);
  setTournamentWithdrawal(s,cedar,false);
  assert.match(tournamentWithdrawalImpact(s,a,false).restoreBlock,/Two suspended games/);
  assert.throws(()=>setTournamentWithdrawal(s,a,false),e=>e.status===409);
  setTournamentWithdrawal(s,birch,true);
  setTournamentWithdrawal(s,a,false);
  assert.deepEqual([tournamentGameStatus(s,first),tournamentGameStatus(s,second)],["void","eligible"]);
  record(book,s.id,[{id:second.id,before:null,beforeVersion:second.editVersion,score:[11,8]}],false);
  setTournamentWithdrawal(s,birch,false);
  assert.deepEqual([first.live,first.started,tournamentGameStatus(s,first)],[[2,1],true,"eligible"]);
});

"use client";
import { useState } from "react";
import type { Pair } from "../lib/scorebook";
import {
  apart,
  appearances,
  lineFor,
  margin,
  matchedOpponents,
  minimumGames,
  opposingTeams,
  outcomes,
  rate,
} from "../lib/thread-stats";
import type {
  Appearance,
  RecordLine,
  StatRow,
  Stats,
  Subject,
} from "../lib/thread-stats";
import { prettyDate } from "./client-kit";
import {
  gameCount,
  OutcomeMetrics,
  pct,
  recordText,
  RecordRows,
  signed,
} from "./stats-parts";

function FormStrip({
  games,
  names,
}: {
  games: Appearance[];
  names: Map<string, string>;
}) {
  const recent = games.slice(-10),
    prior = games.slice(-20, -10);
  const [picked, pick] = useState<number | null>(null);
  if (!recent.length) return null;
  const at = Math.min(picked ?? recent.length - 1, recent.length - 1);
  const selected = recent[at];
  const { game, session } = selected;
  const group = (ids: string[]) => ids.map((id) => names.get(id)).join(" & ");
  const last = outcomes(recent);
  const before = outcomes(prior);
  return (
    <section className="panel stats-section stats-form">
      <h3>Recent form</h3>
      <p>
        <strong>{recordText(last)} W–L</strong> over the last{" "}
        {gameCount(last.games)} · {last.pointsFor} points for.
        {prior.length > 0 && (
          <>
            {" "}
            The previous {gameCount(before.games)} finished {recordText(before)}{" "}
            W–L with {before.pointsFor} points for.
          </>
        )}
      </p>
      <div
        className="form-strip"
        role="group"
        aria-label="Recent results in schedule order"
      >
        {recent.map((m, i) => {
          const won = m.game.score![m.side] > m.game.score![1 - m.side];
          return (
            <button
              type="button"
              key={m.session.id + "/" + m.game.id}
              className={won ? "form-win" : "form-loss"}
              aria-pressed={i === at}
              aria-label={
                "Session " +
                m.night +
                ", game " +
                m.number +
                ", " +
                (won ? "win" : "loss")
              }
              onClick={() => pick(i)}
            >
              {won ? "W" : "L"}
            </button>
          );
        })}
      </div>
      <div className="stats-game-detail" aria-live="polite">
        <small>
          {prettyDate(session.date, true)} · Session {selected.night}, game{" "}
          {selected.number}
        </small>
        <strong>
          {group(game.a)} {game.score![0]}–{game.score![1]} {group(game.b)}
        </strong>
      </div>
    </section>
  );
}
function PairComparison({
  stats,
  ids,
  together,
}: {
  stats: Stats;
  ids: Pair;
  together: RecordLine;
}) {
  const choices = [
    { label: "Together", line: together },
    ...ids.map((id) => ({
      label: stats.names.get(id) + " with other partners",
      line: apart(lineFor(stats, { kind: "player", id }), together),
    })),
  ];
  return (
    <section className="panel stats-section">
      <h3>Together vs apart</h3>
      <p>
        Win rate in this period. Each player’s comparison includes every game
        with another partner, including games across the net from this partner.
      </p>
      <ul className="stats-comparison">
        {choices.map(({ label, line }, i) => (
          <li key={label}>
            <div>
              <strong>{label}</strong>
              <b>{pct(line)}</b>
            </div>
            <span className="stats-compare-track" aria-hidden="true">
              <i style={{ width: (rate(line) ?? 0) + "%" }} />
            </span>
            <small>
              {line.games
                ? recordText(line) + " W–L · " + gameCount(line.games)
                : "No games in this comparison"}
              {line.games > 0 && line.games < minimumGames && " · Small sample"}
              {i > 0 &&
                line.games >= minimumGames &&
                together.games >= minimumGames &&
                " · Together " +
                  signed(rate(together)! - rate(line)!, 1) +
                  " percentage points"}
            </small>
          </li>
        ))}
      </ul>
      <p className="stats-note">
        Different partners and opponents can change these records. Final scores
        describe results and cannot isolate a player’s contribution.
      </p>
    </section>
  );
}
function ComparePartners({
  stats,
  id,
  choices,
}: {
  stats: Stats;
  id: string;
  choices: string[];
}) {
  const [left, setFirst] = useState(choices[0]);
  const [right, setSecond] = useState(choices[1]);
  const first = choices.includes(left)
    ? left
    : choices.find((id) => id !== right)!;
  const second =
    choices.includes(right) && right !== first
      ? right
      : choices.find((id) => id !== first)!;
  const rows = matchedOpponents(stats, id, first, second);
  const display = (line: RecordLine) => (
    <>
      <strong>{recordText(line)} W–L</strong>
      <small>
        {signed(margin(line))} pts/game · {gameCount(line.games)}
        {line.games < minimumGames && " · Small sample"}
      </small>
    </>
  );
  function twoRecords(a: RecordLine, b: RecordLine) {
    return (
      <dl className="stats-matched-records">
        {[first, second].map((partner, i) => (
          <div key={partner}>
            <dt>With {stats.names.get(partner)}</dt>
            <dd>{display(i === 0 ? a : b)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <div className="stats-match-compare">
      <p>
        Compare average point margins and W–L against identical opposing pairs
        under the same scoring rules.
      </p>
      <div className="stats-filters">
        {(
          [
            ["First partner", first, second, setFirst],
            ["Second partner", second, first, setSecond],
          ] as const
        ).map(([label, value, other, change]) => (
          <label key={label}>
            {label}
            <select value={value} onChange={(e) => change(e.target.value)}>
              {choices
                .filter((p) => p !== other)
                .map((p) => (
                  <option key={p} value={p}>
                    {stats.names.get(p)}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <h4>Against all opponents</h4>
      {twoRecords(
        lineFor(stats, { kind: "partners", ids: [id, first] }),
        lineFor(stats, { kind: "partners", ids: [id, second] }),
      )}
      <h4>Against the same opposing pair</h4>
      {rows.length ? (
        <>
          <ul className="stats-matched-list">
            {rows.map((r) => (
              <li key={r.key}>
                <b>Against {r.label}</b>
                {twoRecords(r.first, r.second)}
              </li>
            ))}
          </ul>
          <p>
            These are the games each partnership played. Timing, attendance and
            differences within small samples can affect the comparison.
          </p>
        </>
      ) : (
        <p>
          These partnerships never faced the same two opponents in this period.
          With four players, swapping partners also changes the opposing pair.
        </p>
      )}
    </div>
  );
}
function PartnerBreakdown({
  stats,
  id,
  rows,
  open,
}: {
  stats: Stats;
  id: string;
  rows: StatRow[];
  open: (s: Subject) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const choices = rows.flatMap((r) =>
    r.subject.kind === "partners" ? [r.subject.ids[1]] : [],
  );
  return (
    <section className="panel stats-section">
      <h3>With each partner</h3>
      <p>Partner records for {stats.names.get(id)}, most games first.</p>
      <RecordRows
        rows={rows}
        open={open}
        more="partners"
        empty="No saved doubles games in this period."
      />
      {choices.length > 1 && (
        <details
          className="stats-disclosure"
          onToggle={(e) => setExpanded(e.currentTarget.open)}
        >
          <summary>Compare two partners</summary>
          {expanded && (
            <ComparePartners stats={stats} id={id} choices={choices} />
          )}
        </details>
      )}
    </section>
  );
}
export function StatsDetail({
  stats,
  subject,
  open,
}: {
  stats: Stats;
  subject: Subject;
  open: (s: Subject) => void;
}) {
  const line = lineFor(stats, subject);
  const games = appearances(stats, subject);
  const teams =
    subject.kind === "partners" ? opposingTeams(games, stats.names) : [];
  const single = subject.kind === "player";
  const playerId = single ? subject.id : "";
  function related(rows: Iterable<StatRow>, kind: "partners" | "opponents") {
    const result: StatRow[] = [];
    for (const row of rows) {
      if (row.subject.kind === "player" || !row.subject.ids.includes(playerId))
        continue;
      const other = row.subject.ids.find((p) => p !== playerId)!;
      const target: Subject = { kind, ids: [playerId, other] };
      result.push({
        subject: target,
        label: stats.names.get(other)!,
        line: lineFor(stats, target),
      });
    }
    return result.sort(
      (a, b) => b.line.games - a.line.games || a.label.localeCompare(b.label),
    );
  }
  return (
    <div className="stats-detail">
      <section className="stats-profile">
        <div className="stats-profile-title">
          <h3>
            {subject.kind === "partners"
              ? "Partnership record"
              : subject.kind === "opponents"
                ? "Head-to-head record"
                : "Player record"}
          </h3>
          {subject.kind === "opponents" && (
            <p>From {stats.names.get(subject.ids[0])}’s side of the net.</p>
          )}
          {!line.games && <p>No saved games for this selection.</p>}
        </div>
        <OutcomeMetrics line={line} />
        {subject.kind !== "player" && (
          <div className="stats-profile-links">
            {subject.ids.map((id) => (
              <button key={id} onClick={() => open({ kind: "player", id })}>
                {stats.names.get(id)}
              </button>
            ))}
          </div>
        )}
      </section>
      {subject.kind === "partners" && (
        <div className="stats-columns">
          <PairComparison stats={stats} ids={subject.ids} together={line} />
          <section className="panel stats-section">
            <h3>Who they faced</h3>
            <p>
              {teams.length === 1
                ? "They went " +
                  recordText(line) +
                  " in " +
                  gameCount(line.games) +
                  " against " +
                  teams[0].label +
                  ", their only opposing pair."
                : "Results from this partnership’s side, grouped by opposing pair."}
            </p>
            <RecordRows
              rows={teams}
              more="opposing pairs"
              empty="No opposing pairs in this period."
            />
          </section>
        </div>
      )}
      <FormStrip games={games} names={stats.names} />
      {single && (
        <div className="stats-columns">
          {stats.format !== "singles" && (
            <PartnerBreakdown
              stats={stats}
              id={playerId}
              rows={related(stats.partners.values(), "partners")}
              open={open}
            />
          )}
          <section className="panel stats-section">
            <h3>Against each opponent</h3>
            <p>
              {stats.format === "singles"
                ? "Head-to-head results, most games first."
                : "Each doubles game counts once against each of the two opponents."}
            </p>
            <RecordRows
              rows={related(stats.opponents.values(), "opponents")}
              open={open}
              more="opponents"
              empty="No head-to-head results in this period."
            />
          </section>
        </div>
      )}
    </div>
  );
}

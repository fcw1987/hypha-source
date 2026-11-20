"use client";
import "./stats.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { gameRuleLabel } from "../lib/scorebook";
import type { Book } from "../lib/scorebook";
import {
  apart,
  appearances,
  formatOf,
  lineFor,
  minimumGames,
  opposingTeams,
  rankings,
  subjectLabel,
  threadStats,
} from "../lib/thread-stats";
import type { Format, Order, Stats, Subject } from "../lib/thread-stats";
import { prettyDate } from "./client-kit";
import { gameCount, pct, recordText, RecordRows } from "./stats-parts";
import { StatsDetail } from "./stats-detail";

const formats: Record<Format, string> = {
  rotating: "Rotating doubles",
  fixed: "Fixed doubles",
  singles: "Singles",
};
const orders: Record<Order, string> = {
  rate: "Win rate",
  margin: "Average margin",
  wins: "Most wins",
  games: "Most games",
};
type Open = (s: Subject) => void;

function SinglesMatchups({ stats, open }: { stats: Stats; open: Open }) {
  const duels = [...stats.opponents.values()].sort(
    (a, b) => b.line.games - a.line.games || a.label.localeCompare(b.label),
  );
  return (
    <section className="panel stats-section">
      <h3>Head-to-head</h3>
      <p>
        Most-played matchups first. Each record is from the first player’s side.
      </p>
      <RecordRows
        rows={duels}
        metric="games"
        open={open}
        more="matchups"
        empty="Save a first singles result to see a matchup."
      />
    </section>
  );
}
function PartnerBoard({ stats, open }: { stats: Stats; open: Open }) {
  const [order, setOrder] = useState<Order>("rate");
  const { ranked, small } = rankings(stats.partners.values(), order);
  return (
    <section className="panel stats-section">
      <div className="stats-board-head">
        <h3>Partner rankings</h3>
        <label>
          Rank by
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as Order)}
          >
            {(Object.keys(orders) as Order[]).map((value) => (
              <option key={value} value={value}>
                {orders[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        {order === "rate"
          ? "Wins divided by games together. Rank starts at three games."
          : order === "margin"
            ? "Points for minus points against, per game together. Rank starts at three games."
            : order === "wins"
              ? "Total games won together. Every saved final counts."
              : "Games played together, regardless of result."}{" "}
        Equal values share a rank.
      </p>
      <RecordRows
        key={order}
        rows={ranked}
        metric={order}
        open={open}
        more="pairs"
        empty={
          small.length
            ? "No pairs have three games together yet."
            : "No partnership results in this period."
        }
      />
      {small.length > 0 && (
        <details className="stats-disclosure">
          <summary>
            Small samples · {small.length}{" "}
            {small.length === 1 ? "pair" : "pairs"}
          </summary>
          <p>
            One or two games together. These records are available before they
            qualify for a rank.
          </p>
          <RecordRows
            rows={small}
            metric={order}
            open={open}
            more="pairs"
            small
          />
        </details>
      )}
    </section>
  );
}
function PlayerDirectory({ stats, open }: { stats: Stats; open: Open }) {
  const [all, expand] = useState(false);
  const rows = [...stats.players.values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  return (
    <section className="panel stats-section">
      <h3>Players</h3>
      <p>Open a player for their form and matchup records.</p>
      <div className="stats-directory">
        {rows.slice(0, all ? undefined : 8).map((row) => (
          <button
            key={JSON.stringify(row.subject)}
            onClick={() => open(row.subject)}
          >
            <span>
              <strong>{row.label}</strong>
              <small>
                {row.line.games
                  ? recordText(row.line) + " W–L · " + gameCount(row.line.games)
                  : "No saved games"}
              </small>
            </span>
          </button>
        ))}
      </div>
      {rows.length > 8 && (
        <button
          className="stats-more"
          aria-expanded={all}
          onClick={() => expand(!all)}
        >
          {all ? "Show fewer players" : "Show all " + rows.length + " players"}
        </button>
      )}
    </section>
  );
}
function Takes({ stats, open }: { stats: Stats; open: Open }) {
  const singles = stats.format === "singles";
  const rows = singles ? stats.players : stats.partners;
  const top = rankings(rows.values(), "rate").ranked.filter(
    (row) => row.rank === 1,
  );
  if (!stats.matches.length)
    return (
      <section className="stats-feature stats-early">
        <h3>No saved finals yet</h3>
        <p>
          Save a game in this period to see{" "}
          {singles ? "player and head-to-head" : "player and partner"} records.
        </p>
      </section>
    );
  const leader = top[0];
  const lone = top.length === 1;
  const pair =
    lone && leader.subject.kind === "partners" ? leader.subject : null;
  const opposition = pair
    ? opposingTeams(appearances(stats, pair), stats.names)
    : [];
  const bestLabel = singles
    ? "Highest singles win rate"
    : "Top partnership by win rate";
  const duels = singles
    ? rankings(stats.opponents.values(), "games").ranked.filter(
        (r) => r.rank === 1,
      )
    : [];
  const usual =
    pair && leader
      ? pair.ids.map((id) => ({
          id,
          other: apart(lineFor(stats, { kind: "player", id }), leader.line),
        }))
      : [];
  return (
    <div className="stats-takes">
      <section className="stats-feature">
        <h3>{bestLabel}</h3>
        {leader ? (
          <>
            <div className="stats-feature-main">
              <div className="stats-feature-name">
                {lone
                  ? leader.label
                  : top.length +
                    (singles ? " players" : " pairs") +
                    " share first"}
              </div>
              <div className="stats-feature-rate">
                {pct(leader.line)}
                <small>win rate</small>
              </div>
            </div>
            {lone ? (
              <>
                <p>
                  {recordText(leader.line)} W–L · {gameCount(leader.line.games)}
                  {pair && " together"}
                </p>
                <button onClick={() => open(leader.subject)}>
                  {pair ? "Explore this pair" : "Explore this player"}
                </button>
              </>
            ) : (
              <p>
                {top.length <= 3
                  ? top.map((r) => r.label).join(" / ")
                  : "See all tied records below."}
              </p>
            )}
          </>
        ) : (
          <>
            <strong className="stats-feature-name">Early results</strong>
            <p>
              Rankings begin at {minimumGames} saved games{" "}
              {singles ? "per player" : "per partnership"}. Every saved score
              already appears below.
            </p>
          </>
        )}
      </section>
      {pair ? (
        <section className="stats-context">
          <h3>With other partners</h3>
          <ul>
            {usual.map(({ id, other }) => (
              <li key={id}>
                <button
                  type="button"
                  className="stats-player-link"
                  onClick={() => open({ kind: "player", id })}
                >
                  <span>
                    <strong>{stats.names.get(id)}</strong>
                    <small>
                      {other.games
                        ? recordText(other) +
                          " W–L · " +
                          gameCount(other.games) +
                          (other.games < minimumGames ? " · Small sample" : "")
                        : "No games apart"}
                    </small>
                  </span>
                  <b>{pct(other)}</b>
                </button>
              </li>
            ))}
          </ul>
          <p>
            {opposition.length === 1
              ? "Together they faced " +
                opposition[0].label +
                " in all " +
                gameCount(leader.line.games) +
                "."
              : "Together they faced " +
                opposition.length +
                " different opposing pairs."}
          </p>
        </section>
      ) : (
        <section className="stats-context">
          <h3>{singles ? "Most-played matchup" : "Partnerships in play"}</h3>
          {singles && duels[0] ? (
            <>
              <strong className="stats-context-name">
                {duels.length === 1
                  ? duels[0].label
                  : duels.length + " matchups share the lead"}
              </strong>
              <p>
                {gameCount(duels[0].line.games)}
                {duels.length > 1 && " each"}.{" "}
                {duels.length === 1
                  ? "First player went " + recordText(duels[0].line) + "."
                  : "See head-to-head records below."}
              </p>
              {duels.length === 1 && (
                <button
                  className="stats-inline-link"
                  onClick={() => open(duels[0].subject)}
                >
                  View matchup
                </button>
              )}
            </>
          ) : (
            <>
              <strong className="stats-context-name">
                {stats.partners.size} observed{" "}
                {stats.partners.size === 1 ? "pair" : "pairs"}
              </strong>
              <p>
                {gameCount(stats.matches.length)} have a saved final. Each side
                contributes one partnership result.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
export default function ThreadStats({ book }: { book: Book }) {
  const [session, setSession] = useState("");
  const available = [...new Set(book.sessions.map(formatOf))];
  const [seasonFormat, setFormat] = useState<Format>(() =>
    available.includes("rotating") ? "rotating" : (available[0] ?? "rotating"),
  );
  const selected = book.sessions.find((s) => s.id === session);
  const format = selected ? formatOf(selected) : seasonFormat;
  const [scoring, chooseScoring] = useState("");
  const formatsForPeriod = [...new Set(book.sessions.filter(s => formatOf(s) === format).map(s => gameRuleLabel(book.rules, s)).reverse())];
  const rule = selected ? gameRuleLabel(book.rules, selected) : formatsForPeriod.includes(scoring) ? scoring : formatsForPeriod[0];
  const stats = useMemo(() => threadStats(book, format, session, rule), [book, format, session, rule]);
  const [trail, setTrail] = useState<Subject[]>([]);
  const subject = trail.at(-1);
  const heading = useRef<HTMLHeadingElement>(null),
    moving = useRef(false);
  useEffect(() => {
    if (moving.current) {
      heading.current?.focus();
      moving.current = false;
    }
  }, [trail]);
  function open(s: Subject) {
    moving.current = true;
    setTrail((prior) => [...prior, s]);
  }
  function period(id: string) {
    const next = book.sessions.find((s) => s.id === id);
    if ((next ? formatOf(next) : seasonFormat) !== format) setTrail([]);
    setSession(id);
  }
  return (
    <section className="stats-view" aria-label="Thread stats">
      {subject && (
        <button
          className="stats-back"
          onClick={() => {
            moving.current = true;
            setTrail(trail.slice(0, -1));
          }}
        >
          {trail.length > 1
            ? "Back to " + subjectLabel(trail[trail.length - 2], stats.names)
            : "Back to stats overview"}
        </button>
      )}
      <div className="stats-heading">
        <div>
          <h2 tabIndex={-1} ref={heading}>
            {subject
              ? subjectLabel(subject, stats.names)
              : format === "singles"
                ? "Singles stats"
                : "Player & partner stats"}
          </h2>
          <p>
            {formats[format]} · {gameCount(stats.matches.length)} saved
            {!selected &&
              " · " +
                stats.nights +
                (stats.nights === 1 ? " session" : " sessions")}
          </p>
        </div>
        <div className="stats-filters">
          <label>
            Period
            <select value={session} onChange={(e) => period(e.target.value)}>
              <option value="">Whole season</option>
              {book.sessions.map((s, i) => (
                <option key={s.id} value={s.id}>
                  Session {i + 1} · {prettyDate(s.date, true)}
                </option>
              ))}
            </select>
          </label>
          {!selected && formatsForPeriod.length > 1 && (
            <label>Scoring rules
              <select value={rule} onChange={e => { chooseScoring(e.target.value); setTrail([]); }}>
                {formatsForPeriod.map(label => <option key={label}>{label}</option>)}
              </select>
            </label>
          )}
          {!selected && available.length > 1 && (
            <label>
              Format
              <select
                value={format}
                onChange={(e) => {
                  setFormat(e.target.value as Format);
                  setTrail([]);
                }}
              >
                {available.map((f) => (
                  <option key={f} value={f}>
                    {formats[f]}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      {subject ? (
        <StatsDetail
          key={JSON.stringify(subject) + session + format + rule}
          stats={stats}
          subject={subject}
          open={open}
        />
      ) : (
        <>
          <Takes stats={stats} open={open} />
          <div className="stats-columns">
            {format === "singles" ? (
              <SinglesMatchups stats={stats} open={open} />
            ) : (
              <PartnerBoard key={format + session} stats={stats} open={open} />
            )}
            <PlayerDirectory key={format + session} stats={stats} open={open} />
          </div>
        </>
      )}
      <details className="stats-method">
        <summary>Which games count?</summary>
        <p>
          Each valid saved final in this thread and period counts, including
          finals in a session still in progress. Byes, voided games, pending
          games and live scores add no results. A correction replaces the
          earlier score. Undo counts the restored final, or removes the result
          if it returns to pending.
        </p>
        <p>
          {format === "singles"
            ? "Singles points belong to the player on that side."
            : "Both partners receive their side’s score. A partnership counts once per side per game. Rotating and fixed doubles are shown separately."}{" "}
          Average margin is points for minus points against, divided by games
          played. Scoring rules in this comparison are {stats.rule}. Timed games are grouped by duration and cap. Longer games can have larger point margins.
        </p>
        <p>
          Player profiles follow this thread’s roster IDs. A session guest has a
          separate profile for that night. Form follows session and scheduled
          game order.
        </p>
      </details>
    </section>
  );
}

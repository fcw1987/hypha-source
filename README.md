# Hypha

Hypha keeps pickleball scores for one game or a season. Players join private threads, record singles or doubles results, and see how their standings and partnerships develop across game nights.

[Open the official app](https://hypha.franklinwaggoner.chatgpt.site/) · [Read the guide](https://fcw1987.github.io/hypha-source/) · [Browse the guide source](docs/index.html)

## Explore a season

After unlocking the app, open **Example season**. The Lantern League is a fictional group that played 96 games over 11 nights. **Stats → Explore this pair** shows how Pip Moonfern and Bea Brightwing went 21–11 together. All 32 of their games were against the same opposing pair. The guide walks through the final game, when Bea and Pip entered tied at 882 and Bea finished three points ahead.

## Choose an activity

Open **New Thread** for **Quick play**, **Round robin**, **Ladder** or **Tournament**. A secondary **Practice log** can start with one player. Scheduled events support singles and doubles, score-based or timed finals, and court or flight assignments. A tournament can qualify entrants from round-robin pools or draw a knockout from supplied seeds. Practice measures stay in the thread and separate from its match standings.

The [guide](docs/index.html#activities) includes a four-player rotation, a 16-player fixed-team tournament, and a counted practice set. It explains the recreational pool tiebreaks, [withdrawal and restoration before the playoffs](docs/index.html#tournament-withdrawal), and how a published stage affects later score corrections.

## Read the source

This is a source-viewing selection from Hypha v20. It contains the following parts of the application.

| Question | Start here |
| --- | --- |
| When is a score final, and who gets the points? | [Scoring, standings and season finish](lib/scorebook.ts) |
| How are fixed-team draws and available courts handled? | [Fixed teams](lib/fixed-teams.ts) and [court availability](lib/courtside.ts) |
| How do saved results become charts and partner comparisons? | [Progress calculations](lib/progress.ts), [matchup records](lib/thread-stats.ts) and [the Stats view](app/thread-stats.tsx) |
| How do pool seeds become a playoff? | [Pool ranking, byes and elimination stages](lib/tournament.ts) |
| How do flights, timers and drill counts work? | [Flight movement](lib/club-box.ts), [round clock](lib/round-clock.ts) and [practice records](lib/practice.ts) |
| What does a completed season look like? | [The fictional Lantern League](server/example-season.ts) |

The [file manifest](MANIFEST.md) lists the entire snapshot, its source revision and the digest of each selected release file. The UI excerpts refer to React and surrounding app components. The application shell, shared stylesheet, production server, database, dependencies and deployment configuration are outside the snapshot. It is not a runnable mirror or deployment package. The reviewed selection excludes `lib/rotation.ts`; some excerpts refer to this and other omitted modules.

## Read the guide

Open `docs/index.html` to read the guide directly. GitHub Pages can serve the `docs/` folder under any repository name. Its relative asset links, in-page navigation and court diagram work without scripts. The official app handles all access, invitations and scores.

## Rights

The [source-viewing license](LICENSE) permits inspection of original Hypha material. It reserves rights in independent execution, deployment, modification, reuse and redistribution, subject to applicable law, separate authorization and GitHub’s platform rights. This is not an open-source project. The snapshot is offered for reading and does not invite code contributions.

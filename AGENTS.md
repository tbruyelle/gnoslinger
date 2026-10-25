# AGENTS.md

Guidance for AI agents working in this repository. `CLAUDE.md` is a symlink to
this file.

## Project Goal

**Gnoslinger** is a digital version of the 1982 Avalon Hill board game **Gunslinger** (tactical
Old West gunfight: hex movement, 5-segment action-point turns, action cards).
The game runs **on the gno.land chain**: a Gno realm holds every game and
resolves the turns; a Phaser web app is the interface and signs its
transactions with the **Adena** wallet. There is no game server.

Current milestone: **board A only, 2 to 4 players, one character each, every
character a side of its own** (the creator picks the number of seats; the
seats take the showdown's characters in the order the players join: the
marshal, the kid, the reb, the yankee), each player picking where its character
stands when calling or joining,
the foot actions (advance, back up, run, spin around, sprint, turn,
leap/drop, get up/down) and the Colt 45 gun play (Draw & Cock,
Cock/Aim/Shoot, Shoot, Load) with the full hit, wound and penalty rules,
throwing the gun in hand (Throw, with Strength on top), and
victory points (rule 15). Plans are hidden: each player commits a hash of
its plan, then reveals it once every plan is committed, with a copy
timelocked to drand for anyone to open if it vanishes
(`DESIGN_HIDDEN_PLANS.md`); brawling, other weapons and multi-board layouts
come later.

## Tech Stack

- **Realm**: Gno (`gno.land/{p,r}/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/...`), pinned gno
  toolchain through `go.mod` + `go tool` (like `~/src/aibgno`).
- **Client**: TypeScript + Phaser 3 + Vite (port 5173), tests with vitest,
  wallet through the injected `window.adena` API.
- **Deployment**: nothing is deployed for now: no network (Onyx included)
  holds the realm or any of its games, only local gnodev chains, which
  replay their transactions with the new code on every reload. A change
  needs no compatibility with records stored by earlier versions: the
  decoders read the current formats only, the client expects every field
  the realm writes.
- **Rules reference**: `bga/` (separate git repo, gitignored, private
  `github.com/tbruyelle/gunslinger-bga`) holds an abandoned Board Game Arena
  PHP implementation and `bga/doc/RULES.md`, the full rules transcription.
  Read the PHP code to understand how a rule was handled, but do not copy or
  port it; take the rules from `RULES.md`, not from git history.
- **Design**: the Claude Design canvas
  https://claude.ai/artifact/LeDyXGrNgMY8miYHV9MYF7 (private) is the visual
  reference for the action cards, the character sheet, the segment tracker
  and the HIT!/MISSED!/JAMMED!/EXPLODED! bursts. Its screen mockups (splash,
  lobby, game while planning, replay) were drawn for a duel and are not kept
  up to date: the screens as the game has them are the reference. Palette: ground `#1E1618`, ink
  `#2A1C14`, rule `#5A4636`, parchment `#F3E7CE`, cream `#FBF4E4`, brick
  `#B5482A`/`#8E2F1A`, indigo `#33307F`, gold `#F2B544`, action green
  `#4F7A3A`; fonts Rye (titles) and Zilla Slab (text), from Google Fonts.

## Key Commands

```bash
make gnodev        # local chain: chain id "dev", RPC 127.0.0.1:26657, gnoweb :8888; -empty-blocks keeps the block time current (else a tx after an idle spell runs with the previous tx's time and a due ClaimTimeout is refused)
                   # ADENA_ADDRS="g1... g1..." make gnodev  premines Adena accounts
make web           # vite dev server for the client
make dev           # both, with concurrently
make test          # go tool gno test ./gno/...   (unit tests + filetests)
make lint          # go tool gno lint ./gno/...
make fmt           # go tool gno fmt -w ./gno
make check         # tsc --noEmit + vitest for the client
make gen-board     # regenerate board A adjacency + fences + obstacles + half-hexes + the line-of-sight between table (realm + client) from assets/hex_grid.json
                   # python3 scripts/gen_board_data.py --draw-los A-H11 A-I11 --out los.png  draws the lines of sight between two hexes over the board
make gen-tutorial  # replay the tutorial's showdown through the realm (filetest z16) into client/src/tutorial/showdown.json
make mod-download  # sync ~/.config/gno/pkg/mod with the pinned gno (after update-fork)
make update-fork FORK_REF=<ref>   # re-pin gnolang/gno in go.mod
```

**Always use `go tool gno` / `go tool gnodev` / `go tool gnokey`**, never a
standalone binary: `go.mod` pins the gno commit the realm is written against.

Run one Gno package or test:
```bash
go tool gno test -v ./gno/p/engine/v0
go tool gno test -run TestResolve_Seg5Cancel ./gno/p/engine/v0
# a filetest needs its full path in -run (without the filetests/ directory):
go tool gno test -run ./gno/r/v0/z2_ ./gno/r/v0/
go tool gno test -update-golden-tests ./gno/r/v0/   # refresh // Output: and // Events:
```

## Layout

The directories do not mirror the package paths: a package's path is the
`module` of its `gnomod.toml`, which the toolchain (`gnowork.toml` at the
root makes the repo a workspace) and gnodev read, wherever the directory
is. `gno/{p,r}/X` holds `gno.land/{p,r}/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/X`.

```
gno/
  p/hex/v0          directions, relative directions, Board adjacency + axial coords + fenced hexsides + obstacles + the between table, range, aim zone, line of sight (sight.gno; board_a.gno is generated)
  p/cards/v0        the 12 action cards (24 sides), Enabled() = implemented actions
  p/engine/v0       pure rules engine: set up (setup.gno), plan DSL + validation, Resolve, EndTurn, result deck (deck.gno, fire.gno), impact table, sight heights (sight.gno)
  r/v0              the realm: games, lobby, Commit/Reveal/RevealMany, JSON views, Render, filetests/
  r/profiles/v0     the players' profiles and ranking, kept across game versions; written only by the allowed game realms
client/src/
  chain/      rpc.ts (abci_query/status/tx/broadcast), adena.ts (wallet), session.ts (session key wallet), tx.ts (sign + encode a call), realm.ts (typed calls), poller.ts, types.ts
  rules/      cards.ts, facing.ts, sight.ts (pure card data, facing math, sight heights; mirrors the Gno packages)
  board/      board_A.json (generated) + boardA.ts (BoardMap: adjacency, aim zone, between table, line of sight)
  game/       commit.ts (hidden plans: hash, salt, pending reveals, tlock), reveals.ts (what is due: own reveal, opening, last commit in clear), setup.ts (where each character sets up, as the engine), plan.ts (encode/validate), replay.ts (preview), playback.ts (resolution log), sight.ts (a character's sight, as the engine)
  tutorial/   tutorial.ts (How to play: TutorialRealm, the coach), showdown.json (generated by make gen-tutorial)
  scenes/     BootScene → LobbyScene → GameScene   (SetupScene/TokenPlacementScene are dormant, multi-board later)
  ui/toast.ts
scripts/gen_board_data.py   generates hex/v0/board_a.gno and client/src/board/board_A.json
scripts/gen_tutorial.py     extracts the tutorial's showdown from filetest z16 into client/src/tutorial/showdown.json
assets/                     served as the Vite public dir, shipped whole by a build: only what the client loads (board A, tokens, cards, markers, sounds, hex_grid.json)
assets-src/                 the rest, kept for later: other boards, result cards, rifle sounds, the VASSAL module and its images (vassal_v2/, local/: untracked)
```

## Realm

### Data
`Game{ID, Players[]{Addr, Char}, State engine.State, Turn, MaxTurns, Timeout, Phase,
Commits []Sealed{Hash, Locked}, Plans[], Salts[], Revealed[], Missed[], TurnStart, Turns []*TurnResult, Winner, EndReason, Awards
[]engine.Award, VP[], Stake, Pot, Payouts[], HouseCut, Rev, CreatedAt, UpdatedAt}` stored in an `avl.Tree` by zero-padded `seqid`;
`Players`, `Commits`, `Plans`, `Salts`, `Revealed`, `Missed` and `VP` have one entry per seat (2 to 4,
`engine.MinPlayers`..`MaxPlayers`), the seats filling up in the order the
players join (`Addr` "" while free; `seats`, `freeSeat`, `seated`,
`allIn`); `State.Chars` is a slice of the same length.
`byPlayer` (address → ids) and `openGames` (a seat is free) indexes. `Rev` is bumped on every
change and is what clients poll. `TurnStart` is the turn's clock, set when
a turn starts (the last join, each resolution) and left alone by the saves
within it, so a plan sent does not give the others more time; the turn
can be claimed `Timeout` after it (`timeoutAt`, `"timeoutAt"` in the game
JSON and the summaries, 0 unless planning). `Plans` holds only the turn in progress;
every resolved turn is kept in `Turns`, `LastTurn()` being the last one
(`TurnResult{Turn, Plans[], Seed, StartEnc, GroundEnc, CardsEnc, EventsEnc}`, at most
MaxTurns; the start snapshot, the weapons on the ground at the start, the
cards drawn and the events are stored in the engine's compact text
encodings, `engine/v0/encode.gno`, read back through `Start()`,
`Ground()`, `Cards()`, `Events()`: as structs a turn cost over 17 KB of
storage deposit, encoded about a tenth). A turn is self-contained: the
replay shows it from its own record, the ground included (`"ground"` in
the turn's JSON, `GameScene.groundBefore`), without the turns before it.

### Storage deposit
Measured on gnodev on 2026-10-16, before the seats (two-player games; a
game of 3 or 4 stores a character, a plan and a VP total more per seat,
and its turns one more character snapshot each) (storage price 100 ugnot/byte; gnokey
prints `STORAGE DELTA` and `STORAGE FEE` for each call), the same calls
run on the code before and after the profiles moved to their own realm,
each on a fresh node:

| Call | Bytes, profiles in the game realm | Bytes, profiles realm | Deposit |
|---|---|---|---|
| `CreateGame`, the player's first game (new profile) | 20,915 | 20,850 | 2.09 GNOT |
| `JoinGame`, the player's first game (new profile) | 7,284 | 7,272 | 0.73 GNOT |
| `CreateGame`, returning player | 16,641 | 16,648 | 1.66 GNOT |
| `JoinGame`, returning player | −947 | −949 | refund 0.09 GNOT |
| first `SubmitPlan` of a turn (plan stored; measured before the hidden plans) | 38–85 | 35–85 | ~0.007 GNOT |
| resolving `SubmitPlan`, both pass | 1,965 | 1,985 | 0.20 GNOT |
| resolving, both advance + run | 1,884 | 1,884 | 0.19 GNOT |
| resolving, both Draw & Cock | 1,829 | 1,839 | 0.18 GNOT |
| resolving, aim + shoot + aim each | 2,161 | 2,095 | 0.21 GNOT |
| `Surrender` (scored, 4 awards) | 2,406 | 2,408 | 0.24 GNOT |
| deploying the profiles realm (`addpkg`, once, the deployer) | | 36,402 | 3.64 GNOT |

The profiles realm adds nothing measurable to the players' calls: the
differences, a few dozen bytes either way, come from the turn's random
cards (the events stored) and the timestamps, not from the realm crossing.
Its one cost is its deployment. A player's first game costs about 4.3 KB
more to create and 8.2 KB more to join than a later one: the new profile,
its ranking entry and the address's first `byPlayer` entry. A join of a
returning player frees bytes, the game leaving `openGames`.

A turn costs about 1.8–2.8 KB (0.18–0.28 GNOT; an earlier aim + shoot +
aim turn, with more hits, measured 2,679), nearly all of it paid by the
player whose plan resolves it. Even a turn where both pass costs ~1.9 KB:
the base is most likely the `TurnResult` kept for replays and the
rewritten `Game` (not broken down further); events (combat: shots, wounds,
their cards) add a few hundred bytes. A 20-turn game is roughly 40–55 KB
(4–5.5 GNOT) on top of create and join.

### Stakes (`stakes.gno`)
A showdown may be played for GNOT (this project's, not the board game's):
the ugnot sent with `CreateGame` are its `Stake` (none: a free showdown),
and every `JoinGame` must send exactly the same (refused otherwise); the
realm holds them, the `Pot`. Coins are read with `unsafe.OriginSend()` and
taken only from a direct user call (`IsUserCall`, so a realm in between
cannot have spent the send), in ugnot only; every other crossing call
refuses coins (`assertNoSend`), which would sit in the balance with no
showdown to pay them. When the game finishes (`finish`, which takes the
crossing call's `cur` to pay), `payPot`: the house keeps `HouseCutPercent`
(5) for events, the winner takes the rest, a draw splits it between the
seats tied for the most victory points (the remainder of the division to
the house); a showdown ended with nobody left in the fight by timeouts
(`nobodyWon`) and `CancelGame` give every
stake back in full (`refundStakes`). `Payouts` (per seat) and
`HouseCut` record it; events `PotPaid`, `StakeRefunded`. The house's funds
(`house`, `House()`) are the only part of the balance not owed to a game:
the admin (`Admin()`, the deployer at first: test1 on gnodev) sends them
out with `WithdrawHouse(to, amount)` and hands over with `SetAdmin`, since
a later realm version cannot reach this one's balance. JSON: `stake`,
`pot`, `payouts` (`[]` until paid), `houseCut` in `json/game` and the
summaries; gnoweb shows the stake on the open games and the game page,
the join link sends it, and the home page what the house holds. Checked
on gnodev (2026-10-21): a 5 GNOT showdown won by surrender paid the
winner 9.5 GNOT and the house 0.5; a join sending 1 GNOT was refused.

### Set up
Rule 3.4 and the SET UP of a showdown (`engine/v0/setup.gno`, [H3]): each
character of the showdown has its own hexes to set up in and a default
facing, `engine.Setups` (`CharSetup{Char, Hexes, Facing}`, one per seat in
seat order; `SeatChar`, `SetupOf`, `CanSetUp`, `ShowdownChars`), around
the middle of the corral: seat 0 the **marshal** on the west side in
**D5-D7, E6, E7** looking SE (a flat-top grid has no W or E), seat 1
**the_kid** on the east side in **H5-H7, G6, G7** looking NW, seat 2
**reb** to the south in **E8, F7, F8, G8** looking N, seat 3 **yankee**
to the north in **E5, F5, F4, G5** looking S (this project's own set up, each facing the middle; the
rules' showdown 1 lines two sides up in G5-G9 and E5-E9). The creator is seat
0 and picks how many seats the game has (2 to 4); each player joining
takes the first free seat and its character, so the characters are fixed
by join order. Each may face any direction. Nobody is alerted (29.21):
all start upright with the loaded Colt 45 holstered (`engine.NewState(n)`
leaves the seats in no hex, `State.SetUp` places one). A free seat of a
waiting game has `"addr":""` and `"hex":""` in the JSON. The client
mirrors the table in `game/setup.ts` (`SETUPS`, `MIN_PLAYERS`,
`MAX_PLAYERS`, `seatChar`, `nextSeat`, `setupZone`, `defaultFacing`).

### Profiles (`r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/profiles/v0`)
The profiles live in a realm of their own so that a new version of the game
realm (new rules, `gnoslinger/v1`) keeps the scores. Each address that
creates or joins a game gets a `Profile{Addr, GamesPlayed, VictoryPoints,
CreatedAt}` (`profiles` by address, `ranking` sorted by victory points then
games played, both descending, then address): `GamesPlayed` goes up for both
seats when a game starts (`JoinGame`), so a cancelled showdown does not
count; `VictoryPoints` adds up the points of the player's awards (may be
negative, `desc` centres the ranking key on 0). The game realm writes through
the crossing functions `Ensure`, `AddGamePlayed` and `AddVictoryPoints`
(`profiles.X(cross(cur), ...)`; that is why `autoPass`, `resolveTurn` and
`Game.award` take the crossing call's `cur`), which panic unless the calling
realm (`cur.Previous().PkgPath()`) is on the allowlist (`games`; `init`
allows `gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0`). The admin, the deployer at
first (`unsafe.OriginCaller()`; test1 on gnodev), manages it: `Allow(pkgPath)`
when a new game version is deployed, `Disallow(pkgPath)` to stop scoring an
old one (its CreateGame, JoinGame and resolving reveal then panic),
`SetAdmin(addr)`. Reads: `Get(addr) (Profile, bool)` (a copy), `Rank`,
`Count`, `Games`, `IsGame`, `Admin`, `Name` (the address's name in
`gno.land/r/sys/users`, also used by the game realm), `ProfileJSON`,
`PlayersJSON` and `Render` (below). Upgrading the rules: deploy
`gnoslinger/v1`, `Allow` it, point `VITE_REALM_PATH` at it, then `Disallow`
v0 once its running games are over.

### Crossing functions (called with MsgCall, args are strings)
| Function | Notes |
|---|---|
| `CreateGame(cur, seats, maxTurns, timeoutMinutes, startHex, facing) string` | the ugnot sent are the stake (Stakes); 2 to 4 seats; the caller in seat 0 as the showdown's first character (the marshal), standing in one of its hexes (`startHex`) facing 0 N … 5 NW; 10 to 30 turns (the client sends 20); the timeout is per turn, 0 = 2 days (5 min to 30 days); phase `waiting`, which has no timeout: the game stays open until its seats fill up or its creator cancels it |
| `JoinGame(cur, id, startHex, facing)` | must send the game's stake; the first free seat and its character (the kid, then the reb, then the yankee), in one of its hexes; the last seat taken starts the game (phase `planning`, `GamesPlayed` for every seat; the turn clock starts there); refused to a player already seated |
| `CancelGame(cur, id)` | creator, while a seat is free (players may have joined); gives every stake back; deletes the game (and every seated player's `byPlayer` entry) so the creator gets the CreateGame storage deposit back; the client returns to the lobby once the game view answers "game not found" |
| `Commit(cur, id, turn, hash, locked) int` | **hidden plans** (`DESIGN_HIDDEN_PLANS.md`): `turn` the one in progress (refused otherwise: a commit for another turn, say one in flight when time was called, holds a hash no reveal of this turn can match, and would take the seat's commit; a gnodev reload replaying the transactions once landed a turn-5 commit in turn 4 that way); phase `planning`, before the turn's deadline (`commitUntil`, `assertInTime`: past it the game can only be claimed), from a character in the fight that has not committed; `hash` is `PlanHash(id, turn, seat, salt, plan)` (64 lowercase hex), `locked` the salt and plan timelocked to the turn's `lockRound` (required, at most `MaxLocked` 1 KB; the client encrypts offline, so every commit can carry one); stores it (`Commits[seat]`, a `Sealed`), resets `Missed`; when every character in the fight committed, phase `revealing` (event `AllCommitted`); returns Rev. A player with 5 or more delay cannot play anything and is passed automatically (`progress`, event `PlanPassed`: revealed with the empty plan); with everyone passed, turns resolve by themselves until someone can act |
| `Reveal(cur, id, turn, seat, salt, plan) int` | `turn` the one in progress. Phase `revealing`: anyone; the salt (1 to 64 hex) and plan must match the seat's hash; then the plan is validated (a target must be a seat of the game, not one's own) and stored with its salt, the commit cleared (its deposit refunded to the caller). Phase `planning`: the **last commit in clear**, only from the seat itself, before the deadline, once every other character in the fight committed (their plans are fixed by their hashes; a refused transaction still shows the plan, so the client only sends it when its poll shows exactly that); it counts as the seat's commit and reveal. The reveal that completes the turn (every character in the fight revealed, `allRevealed`) resolves it in the same tx |
| `RevealMany(cur, id, turn, seats, salts, plans) int` | phase `revealing`, anyone: several seats at once, the lists separated by `;` (an empty plan is an empty field): what the opener of the timelocked plans sends, one drand round opening them all. A seat already revealed is skipped, and so is one whose salt and plan do not match its hash or whose plan is not valid (event `PlanUnopened`: the opener cannot check that before opening, and one bad plan must not hold the others back); bad lists, an unknown seat, the wrong turn or phase abort |
| `Surrender(cur, id)` | rule 15.4, while the plans are committed (the start of a turn; refused while revealing, which would be the abort after reading the others' plans): the character is `Out` (nobody can shoot it, it plays no more), its commit dropped. With one character left in the fight the game ends and is scored (`surrender`); with more, the showdown goes on without it and moves on to the reveals if the others' plans are committed |
| `ClaimTimeout(cur, id)` | anyone (`time.Now()`, lazy: no timers on chain); refused while waiting for players (no timeout then). **Planning**, past the deadline: each alive seat without a commit **misses** the turn (`Missed[seat]`++, event `PlanMissed`): the turn is passed for it (empty plan), unless that is its `MaxMissed` (3rd) miss in a row, which makes it `Out` (out of time counts as surrendering); only a revealed plan resets the count (a commit alone does not), an automatic pass (5+ delay) leaves it as it is (and counts as a plan in); the game then moves on to the reveals, and with nobody's plan in the turn resolves empty: a showdown nobody plays any more ends after `MaxMissed` claims, everyone `Out`, its stakes given back (there is no `abandoned` ending any more; it ended the game when nobody committed, which let a late winner lose a game won, the other character being passed automatically). **Revealing**, past `revealUntil` (the deadline plus `RevealGrace`, 5 min: the timelocked plans open `LockDelay`, 2 min, after the deadline, and their opener needs time): every alive seat whose plan is not revealed misses the turn the same way (`missTurn`, its commit dropped); refused before ("the plans can still be revealed"). A backstop, not the usual way: a vanished player's plan is opened from its timelocked copy and revealed with no claim; this only catches a copy that cannot be opened (deliberately broken, or drand out of reach) or one nobody opened. No harsher penalty: the realm cannot tell a copy nobody could open from one a claimer chose not to open (in a 2-player game the claimer is the only one around to open it), and a deliberately broken copy only buys the choice between its plan and a pass, each use a missed turn. One character left → `timeout`, scored, the turn not played; more → the turn moves on with the plans in |

Errors are panics prefixed `gnoslinger: `; the client extracts them from the
tx result log. Events: `GameCreated`, `PlayerJoined`, `PlanCommitted`,
`AllCommitted` (`id turn`), `PlanRevealed` (`id turn seat by`: the player, or
the opener of its timelocked plan), `PlanUnopened` (`id turn seat reason`),
`PlanPassed`, `PlanMissed` (`id turn seat missed`), `PlayerSurrendered`, `TurnResolved`, `VictoryPoints` (`id seat player reason
points`, one per award, points < 0 for a loss), `GameEnded` (informational; there is no event subscription on
the RPC, clients poll).

### Reads
`Render("json/game/{id}")`, `Render("json/games/{addr}")` (the open
games, the `live` ones being played and the `ended` ones, the last 10
finished, both found among the `liveScan` (200) newest games, and the
address's own, at most 50 each),
`Render("json/history/{id}/{turn}")` (one resolved turn, from 1, with its
starting state and ground, plans, seed, drawn cards and events, for
replays: a turn per query, `TurnJSON`, so that what a query costs does not
grow with the game, the whole history of a long 4-seat game nearing the
3 billion gas a query may use; "turn N is not resolved" past the last) and
`Render("json/plan/{id}/{addr}")` (where an address's plan for the turn in
progress stands, `committed`, `revealed`, and the plan once revealed); each
seat of `json/game` carries `committed`, `revealed` and `locked` (its
timelocked plan, "" once revealed), the game `commitUntil`, `revealUntil`
and `lockRound` (the drand quicknet round of the turn's timelocked plans,
`(commitUntil + LockDelay − genesis) / 3 + 2`; the realm never checks
anything about drand), the summaries' players `committed` and `revealed`
and the summaries `lockRound` (for the lobby to open the timelocked plans),
and `timeoutAt` is `commitUntil` while planning, `revealUntil` while
revealing; `PlanHash(id, turn, seat, salt, plan)` is a plain function (for
gnokey); in the profiles
realm, `Render("json/profile/{addr}")` (`null` before the address's first
game) and `Render("json/players/{offset}/{count}")` (a page of the ranking, at most
50, `{total, offset, players}`; each profile carries its `rank` and `name`,
the address's name in `gno.land/r/sys/users`, where `r/sys/namereg`
registers them, resolved when the JSON is built, "" if none; every player of
`json/game` and `json/games` carries that `name` too, and
`json/games/{addr}` the listed address's own: the client and the gnoweb pages
show a player by name, else by address, `playerLabel`; every seat's `aimAt`
says which seat its AIM markers follow, -1 for a hex or no aim, and the
summaries' players carry their `status`; each seat of `json/game` carries `missed`, the turns in a row it let time out) return raw JSON through `vm/qrender`
(`vm/qeval` would Go-quote the string). `Render("")`, `game/{id}`, `help` are
gnoweb pages, and so is the profiles realm's `Render("")` (the top 50, the
games scored). `GameJSON`, `GamesJSON`, `TurnJSON`, `HistoryJSON`, `GameRev` are plain
getters for tests and gnokey (`HistoryJSON`, every turn at once, is served by
no view: the tests and `make gen-tutorial` read it).

### Plan string
`entry("," entry)*`, `entry := <card 1-12><f|b>[:<choice>]`; the choice is a
direction for move/turn cards (`ahead_left ahead ahead_right back_left back
back_right`), for Draw & Cock `<gun id>:<hand>` (`9f:1:0`: gun 1 to the
gun hand; hands: 0 gun hand, 1 other hand, 2 both hands; every gun has a
stable id on its owner's sheet, the starting Colt is 1) or `g<ground
id>:<hand>` to pick up a weapon lying in the character's hex (`9f:g2:0`;
ground ids are stable for the game, `ground[].id` in the JSON; the realm
rejects an unknown ground id, the hex is checked when the action executes
so a character may walk to the gun first, and the pick-up gives the gun a
fresh id on the new sheet, the first player winning a contested gun, 11.11), or for the gun actions
the option: Cock/Aim/Shoot `5f:cock|uncock`, `5f:aim:<target>` or
`5f:shoot:<target>`, Shoot `7f:shoot:<target>` or a bare `7f` (does nothing,
keeps the aim); a target is a hex of the aim zone (`A-F6`) or a character
by seat (`@1`; the client turns a click on an occupied hex into this; the
realm refuses a seat the game does not have, and one's own). A
shot at a hex hits the character standing there when it comes up (the
first alive one in seat order when two share it); with
nobody there, or with that character out of sight (rule 31, below), it is
held, like a Shoot doing nothing: no card, no shell, the gun stays cocked
and the aim is kept (a `nothing` event, Reason `empty_hex`, or `no_los`
with `Target` the hidden seat; a shot at `@1` out of sight is held the
same way). So is a shot at `@1` once that character is out of the fight
(killed, passed out, surrendered, run away; Reason `out_of_fight`,
`Target` the seat): it cannot be a target any more (12.6, 14.6). The rules
have the player state an action's choice when revealing it (7.4, 7.7),
after the previous one, so the player would name someone else or do
nothing (11.3); a hidden plan fixes every choice (targets, directions,
options) at the start of the turn, and holding the shot is the nearest
to doing nothing. An aim at a fallen character is cancelled (`no_target`).
**Gun moves** (10.22, `engine.GunMove`): free, each time an action is
revealed, the gun in BOTH HANDS may go to the gun hand as it is (the other
hand, as for Draw & Cock, comes with a second gun: refused for now), and a gun in a
hand may be dropped in the hex (a cocked one fires harmlessly, `dropGun`).
A plan carries them as `h<gun id>:<to>` entries (the sheet's gun id, as
Draw & Cock; `to` 0 gun hand, `g` the ground; 1, the other hand, parses but
`Validate` refuses it) **before the
action they go with**, done when that action is revealed (`reveal`: the
turn start for the first, else right after the previous action), e.g.
`h1:g,1f:ahead` drops the Colt as the Advance comes up; one after the last
action is refused (no reveal left); they cost nothing and do not count as
entries (`Action.Moves`, at most 3 before an action). The gun may be one
picked up earlier in the plan (it takes the sheet's next id, `NextID`):
whether it is there, and where, is checked when the move is done: a gun move the gun no longer allows (not in a hand, not in
both hands) is cancelled (`cancel`, Action `gun_move`, Reason
`not_in_hand`/`not_both`/`no_gun`); a move to a hand is a `move_gun` event
(From `both_hands`, To the hand), a drop the usual `drop_gun` with Reason `gun_move` ("" for a gun knocked out of the hand or falling with its owner); dropping
the gun the character would fire (gun hand or both hands) also loses its
aim (`lose_aim`, Reason `gun_dropped`: this project's call, 12.42 lists the
GUN HAND wound but not a gun let go). Nothing holsters a gun.
**Throw** (card 6 back, 17) names its target like a shot, `6b:throw:@1` or
`6b:throw:A-F6`, a bare `6b` doing nothing. **Strength** (card 7 back, 20)
is `7b:damage` (+2 to the penalties; also a bare `7b`, what an unstated
Strength does, 20.2) or `7b:wield` (+4 to the wielding factor, the range),
and must come **just before a Throw** (`Validate`: "strength is played
just before a throw"); `Plan.Combine` folds it into that Throw (its cost
added, `Action.Wield`/`Damage`, its gun moves done as the Throw is
revealed), which is how `Resolve` plays it: revealed, executed or
cancelled with the Throw (20.1).
At most 5 actions, empty = pass. Example `1f:ahead_left,2f:ahead,3f`. Rules
(engine `Plan.Validate`): one side per card, dir required for move/turn
cards and in the right set, no choice otherwise, Draw & Cock needs a gun of
the sheet (holstered or in a hand, not already in the box named) or one
on the ground, the gun hand or both hands as destination (the other hand
comes later) and that box free (`Guns.Blocked`: BOTH HANDS takes both
hands), Load takes no choice, gun actions need a valid option (whether a gun is in
hand is checked when the action executes, so Draw & Cock + Shoot works in
one turn), total cost ≤ 5 − carried delay, Run needs Advance, Sprint needs
Run in the same plan **and** a Run played on the previous turn
(`RanLastTurn`, carried over by `EndTurn`; rule 9.23).

### Directions
Absolute 0=N 1=NE 2=SE 3=S 4=SW 5=NW (flat-top hexes, vertical columns).
Relative offsets from the facing: ahead=0, ahead_right=1, back_right=2,
back=3, back_left=4, ahead_left=5. **Left/right are the character's own sides
while it keeps facing forward** (facing N, back_right is SE). Note that
`bga/modules/php/Hex.php` swaps back_left/back_right; the realm and the client
use the convention above. Tokens are drawn rotated by
`dirIndexToAngle(facing, charKey)` (their arrow is baked into the PNG, see
`CHAR_ARROW_DIR`).

### Resolution (engine.Resolve)
For each segment 1–5 and each alive player, the next action executes once when
`usedTime + cost + delay ≤ segment`, **shots first** (7.52), in seat
order. `engine.Resolve(board, st, plans []Plan, d)` takes one plan per
seat and leaves the state given as it is (`CloneChars`; so do `EndTurn`
and `EndShowdown`). Delay gained in a segment applies from the next one. Moving while
down costs 2 delay (crawl); Sprint goes straight ahead and draws a delay
card; Leap/Drop draws two; ending a move in an occupied hex makes both
characters draw one (rule 9.24); moving (crawling too) or staggering
across a fenced hexside draws two (35.2, reason `fence`). Board A's corral
fence is 48 hexsides, listed as hex pairs in `FENCES` in
`scripts/gen_board_data.py` (read off `board_A.png`, gates at F2 and F10)
and generated into `Board.Fenced` and `fences` in `board_A.json`
(`BoardMap.fenced`). Moving or staggering onto or off an obstacle hex draws
two more (36.4, reason `obstacle`; none from one obstacle to another):
board A's only obstacle is the horse trough, `OBSTACLES` in the generator,
`Board.Obstacle` and `obstacles` in the JSON. The trough is an obstacle
half-hex (36.2): it fills the top half of I11, so the generator splits I11
(`HALF_HEXES`, `HALF_HEX_LINKS`) into **A-I11\*** (the trough, neighbours
I10 J10 I11 I11 H11 H10, reached from I10, J10, H10 and H11) and **A-I11**
(the empty bottom half, neighbours I11* J10 J11 I12 H11 I11*, reached from
J11 and I12); both keep the whole hex's axial coordinates, and board A has
138 hexes. Hex ids may end in `*` (plan strings accept it). `BoardMap.crossesObstacle`
tells the planning preview when to play the obstacle sound. A move off
the map (Advance, Run, Back Up, Sprint, crawling too) **runs away** (15.5):
status `RanAway` (`"ran_away"` in the JSON), an `EvRunAway` event (`From`
the edge hex left, `Facing` the way it went), its other actions dropped,
AIM markers on it lost at the end of the segment (Reason `no_target`); it
scores Run away −2 on that turn and nothing at the end of the showdown
(15.6), and no SERIOUS check follows it (a simplification of 15.9). The
client hides its token, says RAN AWAY on its panel, and offers running
away as one gold arrow when picking a move (straight on, the
way the character faces or backs, when that leaves the map, else the way
that does; `runAwayArrow`: on the board's side of the edge, kept inside the
view, since the hex out there lies beyond the board's image, the edge
hexes being centred on its edges; its hover says what it means; picking
it, and its playback, play `run-away.wav`)
Unexecuted actions are cancelled after segment 5. End of
turn (`EndTurn`, returns events) removes half the delay, rounded up, and a
character with more delay than endurance at the end of two turns in a row
(checked after the halving) passes out. Events have `Seg` 0 for turn-start
events (SERIOUS fatigue, aim lost on the first reveal) and `EndOfTurn` (6)
for those after segment 5 (cancels, passing out, the serious-wound check).
Each event of a segment carries its `Step` (`step` in the JSON, the 20th
encoded field): `StepShots`, then
`StepAction`+seat for each seat's action in seat order, then `StepEnd`
(occupied-hex penalty, combat results, aims out of the zone); 0 outside the
segments. Replays show the steps one after the other.

**Guns and shooting** (rules 11–14, Colt 45 only). Draw & Cock moves a
gun (from a holster or a hand) to the gun hand or both hands, cocked.
**Load** (11.2, 27.2) needs the gun in BOTH HANDS: one shell (up to the Ammo
limit, else `full`), the gun uncocks (`load` event, N = shells); a jammed
gun can neither shoot nor be cocked (`jammed`) until completely reloaded:
Draw & Cock moves it uncocked (`draw` Result `jammed`), the client offers
only Cock/Aim/Shoot's Aim (for a throw) and Throw for it, and the load that fills it clears the jam (Result
`unjammed`, 13.31); an exploded gun cannot be loaded, cocked, aimed or
fired (`broken`). Cock/Aim/Shoot cocks, uncocks, aims
or shoots; Shoot shoots or does nothing. Aims and shots name a target the
same way (11.31). **Aiming** puts 2 AIM points (max
8) on the target named, a character (the markers then follow it wherever
it goes: `Character.AimAt` is its seat, `AimHex` "") or a hex (`AimHex`
holds it, `AimAt` is `NoSeat`, -1); the target
must be in the aim zone when the aim executes or the action is cancelled. The gun must be in a box it fires from
(one-handed: gun hand or both hands) or the action is cancelled; a shot also
needs it cocked and loaded. **Aim** is lost when revealing any action but a
Turn, an aim or a shot (stricter than 12.44: cocking, uncocking and a Shoot
doing nothing lose it too), when a new target (the hex
aimed at, or the opponent shot at) is more than one hex from the markers
(12.5; within one hex the markers move) or would move the markers into or
out of the character's own hex (12.5, Reason `own_hex`; kept between two
targets both in it, and when the old target is named again), when the
markers' hex leaves the
aim zone at the end of a segment (12.41), when the markers' target is out
of sight at the end of a segment (31.1, Reason `no_los`, `To` the obstacle
in the way), after a shot (12.43) and on penalties. **Aim zone** (8.32) =
own hex plus the 120° cone between the ahead-left and ahead-right rows
(`hex.Board.InAimZone`, axial coordinates generated into `board_a.gno`);
range = shortest path (`Board.Distance`; the two halves of the split hex
each count one step, unlike 30.62). **Line of sight** (rule 31, design in
`DESIGN_LOS.md`): board A's only blocker is the horse trough (the corral
fence never blocks sight, 35.1, and characters do not either). The
generator traces the sight from the printed coordinates, boxes around the
grid points except around the trough where the labels sit along its sides
(`COORD_BOXES`), against the trough's outline, and emits the **between
table** (`Board.between`, `between` in `board_A.json`: the hex pairs the
trough lies between, 322 rows); neither the realm nor the client computes
a line (`python3 scripts/gen_board_data.py --draw-los A-H11 A-I11` draws
them). `hex.Board.LineOfSight(from, to, hFrom, hTo)` applies the heights
(DOWN 3, obstacle 4, upright 5, wall 10; `hex.Height`) to the obstacles
between: blocked when higher than both, clear when lower than both, and
when between the two heights blocked only if the lower end is adjacent to
it (31.31, 31.32; no plateau effect without hill or gully hexes). A
character lying on the trough counts as upright and is never blocked by
it (30.32, 36.5); a hex aimed at counts as upright (31.3). So two
standing characters always see each other, two DOWN ones never across
the trough, and a DOWN character next to it is hidden from anyone across
it (and sees nobody across it). `engine/v0/sight.gno` (`sightHeight`,
`canSee`) traces to a character at its height or to a hex. An **aim** at
a target out of sight is cancelled (`cancel`, Reason `no_los`, `To` the
obstacle); an aim at the hex under a hidden DOWN character works, since
the hex is in sight, and covers the spot. A **shot** at a target out of
sight is held, as at an empty hex (above). The aim zone is checked first,
with its own reasons. **A shot** draws a result card: a MALFUNCTION
whose Handloaded line says no effect is replaced; a misfire cancels the shot
and a second MALFUNCTION jams (shells 0) or blows up the gun. A FIRE card's
hit chart is read at aim time (card aim time + AIM points − GUN ARM / OTHER
ARM wounds) and range; off the chart is a miss, and so is a
shot at a target out of the aim zone, which still draws its card and spends
the shell (11.32, 13.2). Target Status (13.6): Move (foot action played or dropped this turn)
and Run turn a bullseye into the card's lesser hit and any other hit into a
miss; Down turns any hit but a bullseye into a miss. The shot event keeps
the chart's hit (`Chart`, `chart` in the JSON) and the letters of the
entries that changed it (`Status`, `status`: M, R, D; the 21st and 22nd
encoded fields), and the resolution log
shows "BE → ARM hit (target moved)". A bullseye becomes a
VITAL hit (the shooter's best choice). The shooter then uncocks, spends a
shell and loses the aim. **Hits** map through the IMPACT TABLE (`impact.gno`,
line B from the VASSAL module's table; the rules PDF has none) and apply at
the end of the segment: KILL; STUN n (n wound cards, read on the WOUND line:
endurance boxes and delay, or a 14.11 penalty); STAGGER (two direction
cards: move to the hex named by the first, relative to the target's facing
or "Long" along the shooter's line, face per the second, then DROP; an
off-board hex keeps the character in place); SERIOUS n (n fatigue cards at
every turn start; at the end of the showdown a card's DELAY number plus the
points kills at 4, `EndShowdown`); GUN HAND / OTHER HAND (the weapon drops in
the hex, `State.Ground`, firing harmlessly if cocked); GUN ARM n / OTHER ARM
n (aim time); LEG n (n fatigue cards per hex moved upright); LIGHT n (n
fatigue cards). Endurance starts at 20 (`StartEndurance`). A character killed or passed
out drops every weapon in the hex as it is (14.6, `drop_gun` events, no
wild shot), where the other may pick them up. Fanfiring and aim transfer
on a Shoot doing nothing are not played.

**Throwing** (rule 17, `throw` in `resolve.gno`): a Throw goes off with the
shots, at the start of the segment (16.14), and throws the weapon in the
proper box (a one-handed gun in the gun hand or both hands; jammed or
blown up guns too; bare hands cannot, `no_gun`). Its target is found as a
shot's, and held the same way (empty hex, out of sight, out of the fight:
`nothing`, the gun kept). A range beyond the weapon's wielding factor
(`GunSpec.Wielding`, 4 for the Colt) plus the Strength's +4 cancels it
(`out_of_range`, 17.2). Aim time: 2 one-handed / 1 two-handed + AIM
points − arm wounds (the aim moves onto the target on reveal as a shot's,
17.11, and is lost after, Reason `throw`). One hit card, MALFUNCTIONs
skipped (17.3), Target Status as for a shot, out of the aim zone a miss
(17.12); a bullseye is the thrower's choice, `StrikingBullseye` (HEAD on
line B: LIGHT 6, LOSE AIM). The `throw` event has the shot's fields. The
damage comes from the **STRIKING TABLE** (`Striking`, line B: the
one-handed guns' row; `lose_aim` is a penalty of its own), plus the
Strength's +2 to each GUN ARM, OTHER ARM, LEG, SERIOUS, LIGHT and STUN
(`Strengthen`, 20.21), applied at the end of the segment. The weapon
lands as it is (no wild shot) in the target's hex on a hit, else next to
it in the direction a drawn card names (17.4, a `direction` event): from
the facing of a character named, from the direction towards the thrower
for a hex named, `long` along the thrower's line; `same` or off the map,
the target's hex. Landing is a `drop_gun` event with Reason `throw`.

**Result deck** (`engine/v0/deck.gno`): the 108 result cards are transcribed
as data (`engine.Cards`: DELAY, WOUND and HEX lines; TAC is unused and the
FIRE hit tables come with combat). Each turn the deck is shuffled once from a
seed (`engine.Seed` over realm path, id, turn, the revealed salts and plans, height, block time
→ `engine.NewDeck`, a seeded PCG `rand.Shuffle`) and cards are dealt in that
order; the seed and the trace of the drawn cards (`TurnResult.Cards`) are
stored so the turn can be replayed. "Drawing a delay card" (rule 14.21) deals
the next card and reads its DELAY line: a number is delay points; LOSE AIM
has no effect yet; WILD SHOT fires every cocked gun (uncocked, one shell
less, `wild_shot` event); DROP turns an upright character DOWN (`flip` event
without action) and draws three more cards (reason `drop`). Cards 101–108
are MALFUNCTION cards: that block replaces the FIRE table and only matters
when shooting, their DELAY and WOUND lines are ordinary. Every card dealt is
one `delay` event carrying `Card` (number) and `Result` (penalty name, "" for
points); the crawl penalty is a fixed +2 with `Card` 0. Tests use
`engine.Fixed(37)` (always DELAY 1), `engine.Sequence` or a hand-made
`Drawer`.

**Victory points** (rule 15, `engine/v0/victory.gno`), each character a
side of its own, are scored at the end of every turn: `TurnVictoryPoints`
compares the characters before the turn (the `start` snapshot) and after
it: Killed −8 and Kill enemy +2 to the enemy whose hit killed it
(`Character.Killers`, one flag per seat, set by the killing shot), or +1
each (`VPSharedKill`) when the kill is shared: several enemies' KILLs land
in the same segment (15.2; the hits apply in seat order, the first kills
and a later KILL of that segment is marked too), or a SERIOUS death at the
end goes to the enemies tied for the most SERIOUS points (15.21,
`EndShowdown`, `mostSeats` over `Character.SeriousFrom`); passing out 0 and
Knock out enemy +1 to the enemy who crossed off most of its endurance boxes
(`Character.Hurt[seat]`: the boxes each seat's hits cost, wound and fatigue
cards of STUN and LIGHT to the shooter, each fatigue card of SERIOUS and
LEG wounds to the seat whose wound gave that point, `SeriousFrom` and
`LegFrom`, the points per seat, `pointFrom`; `Serious` and `Leg` stay the
totals; the per-seat fields are encoded "/"-separated); a tie goes to the first
seat; a character down and out can no longer be hit, so a knock out is
never followed by a kill). When the showdown ends with the turn,
`EndVictoryPoints` follows: still up, Survive +2, and Hold the field +2 when
the only one; Out (surrendered or out of time) Surrender −2 and the
Knock out +1 as above; passed out or surrendered, Captured −4 when an enemy
holds the field (15.63). Those awards close the turn's log as `vp` events
(`EvVP`, Seg 6, N = points, Reason = the award). `Surrender` and a
`timeout` claim that leave one character score `EndVictoryPoints` at once
(no turn). No Ally killed, money bags or special rules. `Game.award` records each award
(`Awards`, `VP` totals, a `VictoryPoints` event, the profile's total in
the profiles realm);
`finish` gives the win to the most points, a tie for the most a draw. The game
JSON carries `vp` and `awards` (`{p, reason, points}`), the summaries `vp`.
The client shows the `vp` events in the log of the turn (`describeEvent`),
the result in the header ("Marshal wins 4 to −6 VP", with more seats
"Reb wins: Marshal −6, The Kid −6, Reb 4 VP", `game/vp.ts`), a recap
per player at the end of the final replay (`vpRecap`), and my VP on the
lobby's finished line. With more than two characters the showdown goes on
after a kill, a pass out or a surrender, so kills and knock outs land on
their turn and the rest on the last one.

### Gno idioms in use (gno 0.9)
`func F(cur realm, ...)`, caller = `cur.Previous().Address()`, other realm
functions called with `cross(cur)`, `chain.Emit`, `chain/runtime`,
`time.Now()` = block time, `p/nt/{avl,seqid,mux,ufmt,markdown/sanitize}/v0`,
`p/moul/{md,txlink}/v0`. No `encoding/json` (JSON is hand-built in
`json.gno`). Tests: `testing.SetRealm(testing.NewUserRealm(addr))` **must be
called directly in the test function** (it rewrites that frame's `cur`; a
helper would set its own frame), then `F(cross(cur), ...)`;
`uassert.AbortsWithMessage(t, cur, msg, func(){...})` for panics of crossing
calls; `testing.SkipHeights(n)` advances block time 5 s per height.

## Client

- `chain/rpc.ts`: hand-rolled JSON-RPC (`abci_query` with base64 data,
  `status`, `tx` by hash, `waitForTx`). Query errors carry the realm panic.
- `chain/adena.ts`: `window.adena` (`AddEstablish`, `GetAccount`,
  `GetNetwork`/`SwitchNetwork`/`AddNetwork`, `DoContract`, `On`). **Adena
  broadcasts sync** (success only means "in the mempool") **and only answers
  `DoContract` when the user dismisses its result screen** (kept visible, with
  the notification, through `withNotification`/`isVisibleResult`), so `realm.ts`
  races the wallet answer against the chain: each write watches the game view
  for its own effect and returns as soon as it shows; the wallet answer, when
  it comes first, is followed by the tx result, which carries the realm's
  panic message if the call failed. One tx in flight per account. Adena
  tracks site connections **per account**: `DoContract` for an account not
  connected to the site answers `NOT_CONNECTED` without any popup, so
  `doContract` first checks `GetAccount` (re-establishing if needed) and
  throws `wrong-account` when Adena moved to another account. Account
  switches are detected through `On("changedAccount")` **and** a 3 s
  `GetAccount` poll, since the event is not always delivered. The same poll
  tracks the lock (`GetAccount` answers `WALLET_LOCKED`):
  `ui/walletNotices.ts` toasts "locked"/"unlocked" and the lobby top bar
  shows an "Adena locked" badge; a call left unanswered for
  `WALLET_NOTICE_MS` (6 s) shows "Waiting for Adena…" until it answers.
- `chain/session.ts`: **account sessions** (the chain's `auth` module,
  `MsgCreateSession`; no realm code). `SessionWallet` is the `Wallet` every
  scene uses (`chain.wallet`): with a live session it signs each call with a
  secp256k1 key kept in `localStorage` (`gnoslinger.session.<chainId>.<addr>`)
  and broadcasts it itself (`broadcast_tx_sync`), so no Adena popup; the
  realm sees the player's address as the caller. Otherwise, and when the
  chain refuses the session (expired, revoked, over its limit: a
  `Session…Error` at CheckTx, or "session not allowed error" at delivery
  when a storage deposit goes over), it falls back to Adena, and
  `ui/walletNotices.ts` says auto-sign stopped; past the limit it is not
  tried again before the next spend period. A call sending coins (a
  stake) always goes through Adena, so the player signs the money it puts
  in. `enable` sends
  `/auth.m_create_session` through Adena's `DoContract` (accepted since
  Adena's session-account release; `AdenaWallet.doMessages`), revoking the
  previous key of the browser in the same tx; `revoke` sends
  `/auth.m_revoke_session`. A session may call `vm/exec:<VITE_REALM_PATH>`
  only, spends at most its daily limit (fees **and** storage deposits; a
  refund does not give it back), and is read from
  `auth/accounts/<addr>/session/<key addr>` (account number and sequence
  for signing, `spend_used`). The fee is the gas price
  (`auth/gasprice`) times the gas wanted plus 20 %, unless `VITE_GAS_FEE`.
  `chain/tx.ts` builds the sign bytes (sorted amino JSON) and the amino
  binary of a one-`MsgCall` tx with the signature's `session_addr`; its
  tests hold vectors printed by the pinned gno. The lobby top bar shows
  **Auto-sign on · time left** / **Auto-sign off**, opening a dialog (time
  left, spent today, Revoke; or 1/7/30 days and 5/10/25 GNOT a day, Turn on).
- `ui/toast.ts`: toasts are DOM elements over the canvas, because the
  scenes rebuild their display list (`children.removeAll`) on every refresh,
  which destroyed Phaser toasts the moment they appeared; identical texts
  replace each other.
- `chain/poller.ts`: polls `json/game/{id}` every `VITE_POLL_MS` (2 s) and
  fires on `rev` change; backs off on errors; pauses when the tab is hidden.
- Addresses (`game/route.ts`): the page's hash names what is shown, to
  reopen or share it: `#game/<id>` a showdown, `#game/<id>/<turn>` its
  replay on that turn (a short id is padded: `#game/2`), `#how-to-play`
  the tutorial. A game's address opens with no wallet, to share and watch
  it: `BootScene` starts `GameScene` straight away (`turn`: the replay on
  that turn once it resolved, the final replay for a finished game; else a
  toast), which reads the chain through `viewerChain()` (`chain/index.ts`:
  no account, signs nothing) whenever no wallet is connected, so the game
  shows as to a spectator; its Lobby goes to the splash, as from the
  tutorial. `GameScene` keeps the
  hash current with `history.replaceState` (no history entries, no
  `hashchange`): the game while shown, the turn while a replay shows one,
  cleared on leaving. Editing the address to another game while the app
  runs reloads the page onto it.
- `LobbyScene`: splash screen as in the Design canvas (the cover framed like
  a card in a double-ruled page, the tagline, **Connect with Adena**, the
  Avalon Hill credit), animated (intro, slow zoom, blowing dust, gun smoke;
  Connect with Adena fires a gunshot, always `gunshot1.wav`; the western music,
  `sounds/music-splash.mp3`, then plays once in the lobby, fading out when a game
  opens or on Quit; switched off for now by `MUSIC_ENABLED`); `BootScene` waits up to 2 s for the
  web fonts first, since Phaser draws a text once. A game handing back
  `{ splash: false }` skips the splash. Then connect Adena (switching/adding
  the network from `VITE_CHAIN_ID`/`VITE_RPC_URL`) and show the lobby: an
  HTML overlay (`ui/lobbyView.ts`, after the Design canvas's lobby mockup)
  rendered from the scene's state on every change, with the account (copy,
  Quit), **Your move** (running games without my plan, the time left before
  a timeout can be claimed, red when running out; then the running games
  out of time, mine to claim, `claimable`, as brick OUT OF TIME cards with
  a CALL TIME button that opens the game, saying what calling time does:
  the turn goes on without the late ones, an empty turn if nobody played;
  the game screen's button says CALL TIME too, the UI's words for a
  claim), **Waiting on others**,
  **Open showdowns** to join (those with a join or the call within a week, `stillOffered`), **Current showdowns** (anyone's being played, mine aside: **Watch** opens it as a spectator), **Recently finished** (anyone's last 10 finished, mine aside, told as nobody's, `outcomeLine(g, "")`: **Replay**), **Finished** (mine: Replay) and the **New showdown**
  form (turns 10 to 30, time per turn, **Stake**: Free, 1, 5, 10 or 25
  GNOT, `game/stakes.ts`, its note saying what the winner takes; a line
  shows the stake and pot, a finished one what I won or lost, the game
  screen's title the pot). Each showdown's line shows my
  character's token (on an open showdown, the one I would join as) ringed
  in its seat's colour, the other seats' tokens small over its corner, a
  free seat as a dashed ring (`crest`). Under the form, **Top guns** lists the first 5 of the ranking (refreshed
with the games every 5 s; a player shows as its registered name, else its
short address, `playerLabel`); a click anywhere on it opens the whole
ranking in a dialog, 20 a page (`PLAYERS_PAGE`), whose rows open a
player's profile; my address in the top bar opens mine (rank, games
played, victory points, since). `game/lobby.ts` sorts the games into
  those sections from the `committed` and `revealed` flags and `status` each player
  carries in `json/games/{addr}` (a character out of the fight has no move
  to make). The form has a **Players** select (2 to 4, `SEAT_OPTIONS`)
  with the line-up of the seats in their colours. **Call a showdown** and
  **Join** do not sign anything yet: they open the game screen in its
  set-up mode (below), where the player takes position first. Characters
  are fixed by seat: the creator plays the showdown's first character,
  `marshal` (`CREATOR_CHAR`), and a joiner the next free seat's
  (`nextSeat`, `seatChar`: "Join as Reb · 2 of 4 seats taken"); the
  realm seats the joiner wherever is free when the join lands.
- `GameScene`: renders `committed` state from the chain. Opened with a
  `SetupRequest` instead of (or with) a game id, it is in **set-up mode**
  (`mode === "setup"`, `GameScene.setup`): calling a showdown shows board A
  with nothing on the chain yet, joining one shows the creator's token and
  the empty seat; my character's hexes (`setupZone`) are highlighted in
  action green under the tokens (`showSetupZone`); joining, the seat
  (and so the character and its hexes) follows the chain on every poll
  (`syncJoinSeat`: if someone takes it first, a toast says so and the
  position is picked again in the next seat's hexes), and the set up ends
  once the chain shows me seated; the one under the
  pointer shows my token see-through, as it would stand (`showSetupGhost`);
  a click stands my token
  there (`placeSetup`), facing its default way (`defaultFacing`) until
  turned: clicking the token turns it clockwise (right button
  the other way, `turnSetup`), the panel on the left has Turn left/right and
  **CALL THE SHOWDOWN** / **JOIN THE SHOWDOWN** (`sendSetup`: `CreateGame`
  then the scene restarts on the game created; `JoinGame` then the poll
  takes over), the hand shows greyed out. A join whose game started without
  me drops to spectating. The board (Phaser)
  sits in the centre cell of an HTML overlay, `ui/showdownView.ts` after the
  Design canvas's game mockups, laid out by `showdownLayout` (the scene's
  board transform, mask, zoom/pan and input bounds use the same rectangle)
  and rendered from the scene's state (`viewModel`) on every change: the
  header (Lobby, turn, status, players); while planning, waiting or once
  over, my character (endurance boxes, delay, AIM, wounds, guns) and
  **Your plan** (the segment tracker, `game/segments.ts`, then the entries,
  points, Send / Clear / Replay / Surrender, or the plan sent, Claim, Cancel
  for the creator while seats are free) on
  the left, in one panel framed in my seat's colour (`gv-me`; allies will
  go under it), the other characters under an Opponents title
  (Characters for a spectator) ("plan sent"; compact rows when they are
  several) on the right, and the hand along
  the bottom: one double-sided card per column, top or bottom half picked,
  the whole card shown on hover; in a replay, every character on the left,
  the resolution log on the right (every character name bold in its
  seat's colour, `colorNames`; a click on it opens it in a wide
  dialog, kept up to date while the replay moves, Esc or the cross
  closing it), and a timeline (one row per character,
  `turnSegmentCells`, thinner rows past two, the blue pointer over the segment shown, a click on a
  segment jumps there; the turn number between the turn arrows stands for
  segment 0, the turn start, a click jumping to it; the pointer then
  stands at the start of segment 1) with the controls along the bottom. Every seat has
  a colour (`ui/seats.ts`, `SEAT_COLORS`: indigo, brick, green, teal,
  apart in hue and lightness): the panels' rule, the token rings (mine wider
  and growing and shrinking while it is my move, `setPulse`; never another colour,
  since the AIM markers' frames use the same ones; a token under the
  pointer gets a gold halo behind it instead, `setHover`, `haloTexture`), the timeline's dot, the character
  sheet's accent and the frame of its AIM markers. Clicking a
  character panel opens its sheet; each panel shows who plays the
  character (`playerLabel`, the full address on hover), the sheet the
  registered name and the full address, a click copying it (`wireCopy`); hovering a token outlines its
  character's panel in its seat's colour (`ShowdownView.highlightSeat`). The hand builds an
  ordered plan with a live preview (`replayPlan`) and relative-direction hex
  picks (move choices and the aim zone highlight whole hexes,
  `GameScene.hexHighlight` over `BoardMap.outline`: a regular hexagon of
  `hexRadius`, measured from the grid, or the traced outline of a half-hex,
  `shapes` in `board_A.json`; turn choices use a regular hexagon that way); sides the realm does not play yet (`isEnabled`) are hatched
  (cards with none, brawling, are left out), sides that cannot be picked right now are greyed out; **Send plan** → the hidden plan (`sendHidden`, `game/commit.ts`): when the poll shows every other character in the fight committed, `Reveal` in clear; else a 16-byte salt, `Commit` of `planHash` with the salt and plan timelocked to `lockRound` (`lockSealed`, tlock-js loaded on first use, encrypting offline with its built-in quicknet info, `defaultChainInfo`: only opening needs a drand node), the salt and plan kept in `localStorage` (`savePending`, `gnoslinger.reveal.<chainId>.<realm>.<game>.<turn>.<seat>`, pruned once past). While revealing (`game/reveals.ts`): my reveal is due (`ownRevealDue`) and goes out by itself with auto-sign on, from the game screen or the lobby (`revealFromLobby`); with it off the ribbon says "reveal your plan" with a **REVEAL** button and the lobby lists it under Your move. Past the drand round (`roundTime(lockRound)` plus `DRAND_MARGIN`, 5 s, since the relays serve a round a moment late; a 3 s timer watching for it, during a playback too; an opening that decrypts nothing is retried quietly every 5 s until the reveals' grace is over), the plans left unrevealed are opened (`openLocked`, one round for all) and revealed in one `RevealMany`, mine too if still pending (`openPlans`, `game/opener.ts` `openAndReveal`; auto-sign off: **OPEN THE PLANS**). The lobby does the same from the summaries (`summaryOpenable`: a seat committed and not revealed, every commit carrying its copy, its `lockRound` out): with auto-sign it reads that game's view and opens them itself (`dueOpenings`, `revealFromLobby`, retried every 10 s until the grace is over); the game's button reads a disabled Revealing… while the lobby's reveal or opening is in flight, `revealingId`, the games list refreshed once it is sent), without it lists the game under Your move with OPEN; a game with a plan to reveal or open is never shown as a claim; the panels show PLAN SENT/PLANNING then REVEALED/REVEALING, and Claim comes once past `revealUntil`; when `lastTurn.turn` changes, the
  resolution log is played back segment by segment (`playback.ts`) from the
  turn's stored starting state, then the state re-syncs. Moving forward, a
  segment plays its steps one after the other (`splitSteps`; the playback's
  `cut` stops the shown state at a step), so a bullet flies before the
  moves and an aim taken after a move waits for the token to get there;
  stepping back or jumping lands a segment in one go. **Replay** opens
  the whole history, its turns read in parallel, one query each
  (`RealmClient.getTurns`, kept once read: a resolved turn never changes),
  with turn navigation and
  play/pause; a cross at the replay panel's top right closes it (or ends a
  live turn's playback). A running game opened with a resolved turn this
  browser has not played back yet (`loadSeenTurn`, `gnoslinger.seen.<chainId>.<realm>.<game>.<addr>`, one per account, holding
  `<createdAt>:<turn>`, so a game of a chain started over, given the same
  id again, does not take the old game's turns as seen; saved when a live playback starts, so leaving it for the lobby does not replay it again) opens on that turn's playback: it may
  have resolved while the player was in the lobby, whose auto-sign reveals
  by themselves, or on another account. A finished game opens straight on its whole
  replay, from the final turn when the game ends while watched or when this
  browser has not played that turn back yet (it ended from the lobby, say), and that
  replay has no cross (`finalReplay`); Lobby leaves it. Only the last selected card can be deselected (choices are
  relative to the state before it). Tokens sharing a hex are fanned out
  in a star around its centre (`stackOffset`, the first up-left, two make
  the diagonal; `STACK_REST`, the characters among themselves, so a gun
  dropped in the hex does not push one back to the centre), and spread
  fully, guns included, while the pointer is over the stack, the star
  widening with the count (`STACK_SPREAD`, `STACK_GAP`;
  `updateStackHover`, animated) so each one can be clicked.
  A gun held in a hand shows as its icon (`assets/guns/<type>.gif`) at the
  token corner above the arrow, "above" in the figure's upright frame
  (`CharacterToken.setGun`, `gunAngle`), with its shells as red dots along
  the bottom, greyed out while uncocked; the DEL badge takes the corner
  below it and the AIM markers of whoever aims at the character the other
  top corner (one per aimer, fanned along the rim, framed in the aimer's
  colour, `setTargetAims`, `aimersOn`), all turning
  with the token; a gun dropped in a hex (`ground` in the JSON, `drop_gun`
  events in playback) is drawn there with the same icon below the tokens,
  stacked like a character sharing the hex (`occupantsAt`); `CharView.guns` carries
  the guns through the preview (Draw & Cock moves the gun) and the playback
  (`draw` and `wild_shot` events are folded, the turn's `start` JSON lists
  the guns, its `ground` the guns lying in hexes when it began). Hovering a token shows that character's aim zone, where it can aim and
shoot (`showAimZone`: brick red for an enemy, action green for mine, under
the tokens, not clickable; the hexes it cannot see, `game/sight.ts` over
`BoardMap.lineOfSight`, are left out; not during a replay or a turn's playback).
Clicking a token opens the **character
  sheet** (`ui/characterSheet.ts`): an HTML overlay built from the design
  template `ui/characterSheet.html` (1100×850, fonts Rye / Zilla Slab from
  Google Fonts), filled with the name, token and a live status row; hands,
  holster boxes list the character's guns, a GROUND panel above the
  endurance track lists the weapons lying in the character's hex, which a
  Draw & Cock can drag to the gun hand like a holstered gun. Every character starts with a loaded, uncocked Colt 45
  in the holster (`engine.startingGuns`). **Draw & Cock** (card 9 front) is
  the first gun action: picking it opens the sheet in pick mode, where a
  gun (holstered, in a hand, or on the ground) is dragged (or clicked) into
  the GUN HAND or BOTH HANDS box, only the boxes it may go to accepting it
  (`GunPick.destinations`, `drawDestinations`); the plan then
  carries the gun id and hand (`9f:1:0`, `9f:1:2`) and the resolution moves and cocks the gun
  (`draw` event). **Gun moves**: my own sheet, opened from my panel or token while
  I plan (`gunMovePick`), takes the free gun moves the same way: the gun in
  BOTH HANDS dragged to GUN HAND or the GROUND panel, a gun in
  a hand to the GROUND panel (`moveDestinations`, hand code 3 for the
  ground, `HAND_GROUND`). A move goes with the next card picked
  (`looseMoves` until then, `movesByCard` after; taking a card back takes
  its moves away, and the loose ones made after it), Your plan lists it before that card ("Drop the Colt 45",
  free), the preview applies it (`replayPlan`, `CharView.dropped` drawn on
  the ground) and Send waits while one has no action after it
  (`planProblem`). **Load** (card 8 front) is playable with a gun in both
  hands that has room (`loadableGun`). **Cock/Aim/Shoot** and **Shoot** open a column of option buttons beside my token (`openOptMenu`: Cock,
  Aim, Shoot; `pendingOpts`; Aim is always enabled (an aim serves a throw
  too), Cock only with the gun uncocked and not jammed, Shoot only cocked;
  the Shoot card goes straight to its target;
  uncocking and a Shoot doing nothing are only reachable through the plan
  string). Aim then highlights the aim zone (`BoardMap.aimZone`,
  same axial maths as the realm) and the clicked hex goes into the plan
  (`pendingAims`, `5f:aim:A-F6`); a hex with several enemies in sight
  opens a menu naming them (`aimTargets`, `resolveAim`); Your plan names
  the target in its seat's colour (`PlanLine.target`). A hex of the
  zone that is itself out of sight (as upright, 31.3) is left out, aiming or shooting, as on token
  hover; with the opponent hidden but its hex in sight
  the pick names the hex (`5f:aim:A-I11` or `7f:shoot:A-I11`, not `@1`):
  an aim covers the spot, a shot is held until someone in sight stands
  there, the odds read 0 (`ShotOdds.los`) and the hover says so; every
  shot at an empty hex says it is held if nobody stands there when it
  comes up. When shooting, the hovered hex of the zone shows the chance
  of hitting it (`game/shotOdds.ts` over `rules/hitChance.ts`, the players'
  aid table `percent_hit.png`: hit % per aim time 1–9 and range 0–12 out of
  the 108 cards, bullseye % in red; Target Status not counted), with range
  and aim time on hover: card aim time (Cock/Aim/Shoot 2, Shoot 1) plus the
  AIM points kept (markers within one hex of the target) minus arm wounds. The preview (`replayPlan`) follows the
  aim, cocking and shells; AIM markers are drawn on the aimed hex, or on the target's token when
  they follow it (`refreshAimMarkers`, `aimOnToken` from `aimAt`); tokens grey out for a killed or
  passed-out character; the sheet
  shows AIM (and on whom), who aims at the character (AIMED BY), the
  turns in a row its player let time out (MISSED n of 3, when any), endurance
  (boxes above the ones left are crossed off) and the
  permanent wounds. During playback a bullet flies from the shooter's gun
  icon for each shot (`flashShots`), shaking the view, the guns of a step
  going off one after the other when their sounds play (`shotDelays` in
  `game/sounds.ts`, 220 ms apart, shared by the sounds and the bullets;
  the step lasts that much longer); a miss flies on off
  the board, a hit spurts blood out along the bullet's line, leaving a
  spray of streaks on the board (`sprayBlood`; a thrown weapon and the
  SERIOUS bleeding keep round drops and stains); the hit location's burst, `assets/hit_<location>.png` (arm,
  body, critical, gun, head, leg, side, vital, picked by `game/bursts.ts`
  from the shot's final `hit`; `hit.png`, a plain "HIT!", only for a
  location without an image), or `missed.png` bursts beside the target (`jammed.png` or `exploded.png` beside the shooter when the second MALFUNCTION jams or blows up the gun; an exploded gun's icon is struck through in red and only Throw can use it). A **throw** (`flyThrow`) flies the gun's icon spinning in a straight line from the thrower's hand: onto the target on a hit, with the same burst as a bullet and blood splashing round it, or past it to the hex where it lands on a miss; the gun shows on the ground once it lands (`throwLandings`, in the step's hold). Planning, **Throw** goes straight to its target among the hexes of the aim zone within reach (`throwReach`: 4, 8 with a `wield` Strength; the hover shows the odds with aim time 2 and the range out of the reach), **Strength** opens two buttons (+2 to the penalties, +4 hexes of range) and is only offered with the Throw free and the points for both, after which only the Throw can be picked (`planAllows`). Brawling stays disabled.
- **How to play** (`tutorial/`): a guided showdown, the player's Marshal
  against a scripted Kid, on the game screen with no chain and no wallet;
  opened by **How to play** beside Connect with Adena on the splash, in the
  lobby's top bar, or at `#how-to-play` (`BootScene`). The realm played it
  beforehand: filetest `z16_tutorial` commits the Kid's plan, prints the
  game view (what the tutorial shows while planning), reveals the Marshal's
  in clear and resolves, four turns (movement; Draw & Cock; aim & shoot:
  the Kid misses, the Marshal wounds it; delays: the Kid's shot pushed past
  segment 5, the Marshal kills it), its salts picked so the cards play the
  lesson; `make gen-tutorial` extracts the views and the history into
  `showdown.json`. A change to the rules that changes the filetest's output
  needs the script looked at again (other salts, other texts).
  `GameScene` opened with `{ tutorial: true }` uses `tutorialChain()`: a
  `TutorialRealm` serving those views (times shifted to now), a wallet that
  is the recorded Marshal; sending the plan reveals it in clear, accepted
  only when it does what the step asks (`planMatches`, by action, either
  Cock/Aim/Shoot card), else refused with the plan asked for; the next
  view's last turn then plays back as usual. The coach panel tops the right
  column (`tutorialCoach`, `ShowdownModel.coach`): the lesson and what to
  play, what the turn played back shows, and once over (at the end of the
  final replay) the win conditions, Play it again and To the lobby;
  Surrender, Claim and Cancel are left out. Lobby goes back to the splash
  unless Adena is connected.
- Config: `client/.env.local` (see `.env.example`): `VITE_RPC_URL`,
  `VITE_CHAIN_ID`, `VITE_CHAIN_NAME`, `VITE_REALM_PATH`,
  `VITE_PROFILES_PATH` (the profiles realm, where `getProfile` and
  `listPlayers` read), `VITE_POLL_MS`,
  optional `VITE_GAS_WANTED`/`VITE_GAS_FEE`. Without `VITE_GAS_WANTED` each
  call's gas limit is fitted (`chain/gas.ts`, `SessionWallet.gasFor`): the
  call is simulated first (`Rpc.simulate`, the node's `.app/simulate` on
  `tx.simulationTx`: a 1 ugnot fee, a blank signature, the session key's
  public key or none for an Adena account, whose key the chain holds once
  it signed anything) and goes out with 1.5 times its simulated gas, twice
  for a call that may resolve the turn (`Reveal`, `RevealMany`,
  `ClaimTimeout`, `Surrender`: the deck seed includes the block height, so
  its block may draw more cards than the simulation), between 25M and
  500M; without a simulation (a refusal, an unknown key) the fixed 100M,
  300M for those. Through the session a call that runs out of gas goes
  again once with twice the limit. A fixed 100M ran out on a 4-seat turn
  where everyone shoots twice (about 101M, measured on gnodev 2026-10-25;
  its simulation said 100M, the block used 94.5M), and made every call
  pay 0.12 GNOT of fee where a commit uses about 16M gas (now 0.03).
  That is the session's path: Adena fits a call's limit itself, whatever
  the request says (its own simulation times its fee tier, Slow 1, Average
  1.1 by default, Fast 1.2, and its user's gas adjustment; read in its
  source, use-network-fee.ts, and seen on 2026-10-25: a commit simulated at
  16.6M went out with 18.26M), so the client does not simulate an Adena
  call; a reveal resolving the turn signed in Adena has that 10 % margin.

### Manual end-to-end test
1. Two accounts in Adena; `ADENA_ADDRS="g1... g1..." make gnodev` (premines
   them); `make web`; open http://localhost:5173, approve connect / add
   network `dev` / switch.
2. Account A: pick the number of players (2 to 4), **Call a showdown**:
   the board opens with D5 to D7, E6 and E7 in green; click a hex (say
   A-D6), turn the token if you like, **CALL THE SHOWDOWN**. Switch
   account in Adena (the app reconnects): **Join** from "Open showdowns",
   H5 to H7, G6 and G7 are green, click A-H6, **JOIN THE SHOWDOWN** (a
   third player gets E8, F7, F8 and G8 as Reb, a fourth E5, F5, F4 and
   G5 as Yankee). Everyone sees the
   marshal at A-D6 (facing SE) and The Kid at A-H6 (facing NW); the game
   starts once the last seat is taken.
3. Each account picks cards and sends its plan (a commit; the last one in
   clear), the committed plans are then revealed (by themselves with
   auto-sign on, else with REVEAL) and the last reveal resolves the turn, every tab replays it, positions match
   `go tool gnokey query vm/qrender -remote 127.0.0.1:26657 -data 'gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0:json/game/0000001'`.
4. CLI alternative: `go tool gnokey maketx call -pkgpath gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0 -func Commit -args 0000001 -args 1 -args <hash> -args "" -gas-fee 1000000ugnot -gas-wanted 100000000 -broadcast -chainid dev -remote 127.0.0.1:26657 <key>`
   with the hash from `go tool gnokey query vm/qeval -remote 127.0.0.1:26657 -data 'gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0.PlanHash("0000001",1,0,"a1","1f:ahead")'`,
   then the last player `-func Reveal -args 0000001 -args 1 -args 1 -args b1 -args "1f:ahead"` (in clear) and anyone `-func Reveal -args 0000001 -args 1 -args 0 -args a1 -args "1f:ahead"`
   (`CreateGame -args 3 -args 20 -args 0 -args A-D6 -args 2`, `JoinGame
   -args 0000001 -args A-H6 -args 5`). A second gnodev for such a run,
   leaving the usual one alone: `go tool gnodev local -no-watch -no-web
   -node-rpc-listener 127.0.0.1:36657 -add-account <addr>=1000000000ugnot…`
   with keys made in a scratch keybase (`gnokey add -home <dir>
   -insecure-password-stdin`).

## Game Rules (quick reference)

Turn: 5 segments. Players secretly pick up to 5 time points of action cards
(minus carried delay), in play order; actions resolve by time (shots first
once combat lands); effects apply at segment end. Full rules:
`bga/doc/RULES.md`; decisions: `bga/doc/ASSUMPTIONS.md` (`[Hx]` ids).

| Card | Front (cost) | Back (cost) |
|------|--------------|-------------|
| 1 | Advance (2) | Back Up (3) |
| 2 | Run (1) | Spin Around (2) |
| 3 | Sprint (1) | Turn (1) |
| 4 | Sprint (1) | Leap/Drop (1) |
| 5 | Cock/Aim/Shoot (2) | Get Up/Down (3) |
| 6 | Cock/Aim/Shoot (2) | Throw (2) |
| 7 | Shoot (1) | Strength (2) |
| 8 | Load (3) | Head Out/Back (2) |
| 9 | Draw & Cock (3) | Head Out/Back (2) |
| 10 | Jab (2) | Duck (1) |
| 11 | Swing (3) | Block (2) |
| 12 | Belt (3) | Guard (2) |

## Assets

`assets/` (served by Vite as its public directory, which a build copies whole:
only what the client loads, about 20 MB; checked on 2026-10-25 against the
names the code builds, the rest moved to `assets-src/`, the TTS dump's
leftovers deleted): board 1600×2232 (`board_A.png`; the others in `assets-src/`),
character tokens `char_*.png` 95×95, action cards `action_card_a{1-12}[_back].png` (630×880),
`hex_grid.json` (hex centres, scaled 2×), gun icons `guns/<type>.gif` and AIM
markers `aim{2,4,6,8}.gif` (from the VASSAL module), sound effects `sounds/`
(played during turn playback: `game/sounds.ts` maps events to groups of
variants, `GameScene.playSounds` picks one from the turn's seed, hashed with the event's place in the turn and the group, `variantIndex`, so a turn sounds the same on every playback, and a wild shot's bullet flies the same way (`turnPick`); the planning sounds pick at random; a miss, misfires
included, adds a `missed*` ricochet after the gunshot; each character hit
in a segment groans once (`wounded*`), however many effects the hits
have, or cries `dead*` if one of them kills it, when it reacts
(`woundDelays`: 350 ms after the shot that hit it, two characters due at
once one after the other, 220 ms apart), and its token waits for that
moment to fall, grey out, lose its endurance and drop its guns
(`refreshTokens`'s hold); a shot cancelled for
an empty gun (reason `empty`) plays `empty-gun*`, as does picking the target
of a shot whose gun the preview shows empty, instead of `plan-shoot.wav`; SERIOUS fatigue
costing endurance at the turn start plays a `wounded*` groan, crossing a
fence or going onto or off an obstacle an `obstacle*` sound, a thrown
weapon `throw1.wav` as it leaves the hand and `impact*` as it lands, `thud*` when it missed, as does a gun let go (a `drop_gun` with Reason `gun_move`; picking that move on the sheet plays it too; a cocked one goes off `GUN_FALL_MS` after the thud, as it lands, its bullet leaving the gun's icon on the ground, `groundGunPos`), `THROW_FLIGHT_MS` after it leaves the hand,
the target reacting then) and while planning,
for what the plan alone decides (`soundsForPreview`: steps, climbing over a
fence or an obstacle, turns, going down,
drawing, picking a gun up from the ground (`ground_pick1.wav`, in
playback too, instead of the holster sound), cocking, aiming, loading; shots wait for the cards, picking a
shot's target plays `plan-shoot.wav`, a card added to the plan
`pick-card.mp3` and one taken out `pick-card-reverse.mp3`, both converted
from `pick-card.aiff`, an option button of Cock/Aim/Shoot `select.mp3`);
`delay1.mp3`
plays when a DEL badge goes up, `delay1-reverse.mp3` (made with ffmpeg
`areverse`) when it goes down (`soundsForDelay`, also on the re-sync after
a live turn, which shows the end-of-turn halving). `assets/local/` (VASSAL): status
overlays `state_{down,dead,passed_out}.png` drawn over the tokens (tracked;
the module's other images, `assets-src/local/` and `assets-src/vassal_v2/`
with the `.vmod` `parse_hex_grid.py` reads, are untracked). `python scripts/fetch_assets.py` re-downloads into `assets-src/`
(not needed, everything is present).

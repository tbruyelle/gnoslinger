# Showdowns: architecture plan

Today the realm plays one showdown, the battle royale: board A, 2 to 4
players, one character each, every character a side of its own. More are
planned: the battle royale up to 8, teams (OK Corral). This plan makes a
showdown a pluggable **package**, registered with the one game realm.

## Where the code assumed two players (done on 2026-10-16)

- Realm and engine: `NumPlayers` (fixed `[2]` arrays) in 36 places, "the
  opponent is `1 - p`" in 6 (`target := 1 - p` in `Resolve`, AIM markers that
  follow "the opponent"). Now slices, one entry per seat (2 to 4,
  `engine.MinPlayers`..`MaxPlayers`), targets by seat everywhere
  (`Character.AimAt`, `Killers`, `Hurt`); the realm seats the players in
  join order with fixed characters (AGENTS.md, Set up). Phase 2 below is
  done but for teams and more than four seats.
- Client: about 8 `1 - seat` spots, gone the same way (`aimAt`,
  `aimersOn`, seat colours).
- Plans already name targets by seat (`@1`), which works for N players.

## Decision: a showdown is a package, not a realm

A showdown is rules plus a scenario (seats, boards, teams, starting hexes,
victory conditions): it has no state of its own. Every game stays in the one
realm.

Gno has no dynamic dispatch by path: a realm only calls what it imports, and
imports are fixed at deploy. A showdown **realm** would have to import the
main realm and push summaries to it (`hub.Report` on every create, join and
turn), storing every game twice. A showdown **package** avoids that: a p
package has no realm, its code runs in the caller's context, so the realm can
**store an interface value whose concrete type comes from a showdown
package** and call its methods later. That is dynamic dispatch through an
interface, with no cross-realm call.

Gained over one realm per showdown: no state stored twice (no extra deposit
per turn), one lobby index, one realm for the client, profiles and
leaderboard next to the games. Lost: a showdown cannot keep its own state; if
one ever needs some (a season ranking per showdown, pots), the realm keeps
it, keyed by showdown.

## Layout

```
gno.land/p/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/
  hex/v0                boards, adjacency (multi-board layouts later)
  cards/v0              action cards
  engine/v0             rules for N players: State.Chars []Character, plans
                        per seat, targets by seat, teams (friendly fire),
                        victory conditions
  showdown/v0           the Showdown interface every showdown implements
  showdowns/battleroyale/v0
                        today's rules: board A, 2 to 4 seats, every
                        character a side of its own (v1: up to 8 seats)
  showdowns/corral/v0   teams, the OK Corral scenario

gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0
                        the only realm: registry, games (seats, phases, plan
                        collection, timeouts, Rev, turn history), lobby,
                        profiles, leaderboard, JSON views
```

## The contract

```go
// p/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/showdown/v0
type Showdown interface {
    Info() Info // name, min/max players, teams, boards
    Setup(seats []Seat) engine.State
    Validate(st engine.State, seat int, plan string) error
    Resolve(st engine.State, plans []string, d engine.Drawer) (engine.State, []engine.Event)
    Outcome(st engine.State, turn, maxTurns int) (over bool, winners []int, reason string)
}
```

Most showdowns are the shared engine plus a scenario: `type Showdown struct{}`
with a few lines per method.

## Registering a showdown

Anyone runs a `gnokey maketx run` script (`MsgRun` can import any
package):

```go
package main

import (
    gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
    "gno.land/p/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/showdowns/battleroyale/v0"
)

func main() { gnoslinger.Register(cross, battleroyale.Showdown{}) }
```

There is no key to choose: the showdown is its package path. The same
script importing `battleroyale/v1` replaces it (Replacing a showdown,
below).

Who may register depends on where the showdown's code lives:

- **The project's own showdowns**, packages under
  `gno.land/p/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/showdowns/`: anyone, no admin. Deploying
  under that namespace already takes its owner, so the code is trusted.
- **Any other package**: the admin only (later GovDAO or a multisig), after
  reviewing it.

To tell them apart the realm needs the package path of the value's concrete
type: `Info()` cannot be trusted (any package can claim any path) and Gno has
no `reflect`, so how to read it is a spike question (Phases, 1). The same
path is the showdown's identity: a version is just another package, told
apart by the path's last segment (`v0`, `v1`), so the realm keeps the
showdowns in an `avl.Tree` keyed by the **package path without its
version** (`gno.land/p/.../gnoslinger/showdowns/battleroyale`: what the lobby
lists, with the version registered, and what `CreateGame` takes); each
game keeps the value it was created with (`Game.Showdown`, a type
reference, the value being an empty struct), not the key.

### Replacing a showdown

Registering a package whose path, but for its version, is already
registered **replaces** the showdown there: `battleroyale/v1` takes the
place of `battleroyale/v0` (new rules, a fix) and stays one showdown in
the lobby. The games created from then on take the new value, the games
created with the old one keep it: that is why a game holds its value
rather than its key, since a key looked up at each call would change the
rules of a running game under its players, plans committed under one
version resolving under another. Packages are immutable, so the old value
keeps working for as long as a game holds it, out of the registry too. A
fix reaches the new games only: a running game resolves with the value it
holds, bug included. The game JSON carries the package path of its value
(`.../battleroyale/v0`), so an old game says which rules it plays.

Who may replace is who may register (the project's showdowns: anyone; any
other package: the admin), and the replacement has to be the same package
path before the version, with a higher version: nothing else can take a
showdown's place, and the registry only moves forward (a rollback is a new
version holding the old code). The rule reads the path the way the
namespace check does (Phases, 1): if it cannot be read, every registration
and replacement is the admin's, who checks the path by eye. `Retire` takes
a showdown out of the lobby; the games created with its value go on.

```go
func Register(cur realm, s showdown.Showdown) // keyed by its package path without the version; a higher version of a registered path replaces it for the games to come; open to the project's showdowns, admin otherwise
func Retire(cur realm, path string)           // out of the lobby: no new games; running ones go on
func CreateGame(cur realm, showdown string, charKey string, maxTurns, timeoutMinutes int) string // showdown: the registry key
// JoinGame, SubmitPlan, Resign, ClaimTimeout as today
Render("json/showdowns")
Render("json/games/{addr}")
```

## Client

- The lobby lists the showdowns (`json/showdowns`: key, the package path
  registered, with its version, and `Info()`) and creates a game in one of
  them.
- Every game uses the same JSON shape, so one game screen renders every
  showdown.
- N characters: an opponents column instead of the single opponent panel, a
  target picker listing every character, and the replay timeline with one
  row per character (proposed in the Replay mockup on the Design canvas).

## More seats and teams

Two pieces of work past today's battle royale of 2 to 4, besides the
packages themselves (Phases).

**The battle royale up to 8 seats** (`battleroyale/v1`). More than raising
`engine.MaxPlayers` (4):
- set up: four more `CharSetup` entries (`engine/v0/setup.gno`, mirrored in
  the client's `game/setup.ts`); eight zones around the middle of the
  corral need more room than today's four;
- four more characters, with their tokens and names;
- four more seat colours (`ui/seats.ts`), apart in hue and lightness and
  visible on the board's tan;
- the screens (DESIGN_MULTIPLAYER.md, Order of what is left): up to seven
  opponent panels, eight timeline rows in a replay (a "Me / everyone"
  filter), a header of eight names ("+3");
- cost: a turn's gas and storage deposit grow with the seats; measure a
  turn resolving 8 plans against the client's fixed 100M gas limit
  (`DEFAULT_GAS_WANTED`);
- the snapshots' per-seat fields (`Hurt`, `Killers`, `SeriousFrom`,
  `LegFrom`) grow to 8 entries; older records with 4 already read.

**Teams** (the OK Corral, `corral/v0`). The engine has none today: every
character is a side of its own (`victory.gno`). Needed:
- a side per seat, so an aim or a shot at an ally is refused or allowed
  (friendly fire);
- the victory points that need sides: Ally killed (15.23), Hold the field
  and Captured per side, a side's score;
- a team pick in the lobby, team colours instead of seat colours, the
  panels grouped by team.

## Phases

1. **Spike (1 to 2 days).** Filetests on the pinned gno to confirm:
   - the realm can persist an interface value whose concrete type lives in a
     package it does not import, and call its methods after reloading it,
     and still once another value replaced it in the registry (a game keeps
     its own: Replacing a showdown);
   - `MsgRun` can make the crossing call to `Register`, with the caller as
     the previous realm;
   - the realm can read the package path of a registered value's concrete
     type (a VM or stdlib helper), to open registration to the project's own
     showdowns; if it cannot, registration stays admin-only for every
     package;
   - the storage deposit and gas of a game in a registered showdown, against
     today's numbers (AGENTS.md, Storage deposit).
2. **Engine to N players.** Replace `[NumPlayers]` with slices and `1 - p`
   with explicit targets; add teams and victory conditions (victory points,
   TODO.md). Today's showdown must stay identical: its tests and filetests
   are the safety net.
3. **The `Showdown` contract and `battleroyale/v0`.** Move today's
   showdown's specifics (setup, validation, outcome) from the realm into
   `showdowns/battleroyale/v0`; the realm gains the registry. It stays
   `gnoslinger/v0`, changed in place: it only runs on dev chains so far,
   where gnodev redeploys it from the files.
   Once a deployment must be kept (testnet, mainnet), packages are immutable
   and an incompatible change needs the next version path.
4. **Client.** The showdowns listed in the lobby, N-player game screen (what the
   screens need past four seats and for teams: DESIGN_MULTIPLAYER.md,
   Order of what is left, 3).
5. **New showdowns.** `battleroyale/v1` (up to 8 seats), registered over
   `v0`, the same path one version up (Replacing a showdown), then
   `corral/v0` with teams (More seats and teams). With more than two
   players commit-reveal matters more: every extra player is one more who
   could read the others' plans before sending their own.

## Risks

1. **Dynamic registration may not work** (spike, point 1). Fallback: the
   realm imports each showdown package and registers it in its own `init`.
   A new showdown then needs a new realm version: still all packages, just
   less dynamic.
2. **Registered code runs as the realm.** A p package cannot import realms,
   so it makes no crossing calls and only touches what the realm hands it:
   one game's state. A buggy showdown could still corrupt its own games or
   burn gas: the project's showdowns are reviewed before they are
   deployed under its namespace, and any other package before the admin
   registers it.
3. **Determinism.** `Resolve` must stay deterministic and seeded, so turns
   can be replayed from their seed as today.

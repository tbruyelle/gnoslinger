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
one ever needs some (a season ranking per mode, pots), the realm keeps it,
keyed by mode.

## Layout

```
gno.land/p/tbruyelle/gnoslinger/
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

gno.land/r/tbruyelle/gnoslinger/v0
                        the only realm: registry, games (seats, phases, plan
                        collection, timeouts, Rev, turn history), lobby,
                        profiles, leaderboard, JSON views
```

## The contract

```go
// p/tbruyelle/gnoslinger/showdown/v0
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
    gnoslinger "gno.land/r/tbruyelle/gnoslinger/v0"
    "gno.land/p/tbruyelle/gnoslinger/showdowns/battleroyale/v0"
)

func main() { gnoslinger.Register(cross, "battleroyale/v0", battleroyale.Showdown{}) }
```

Who may register depends on where the showdown's code lives:

- **The project's own showdowns**, packages under
  `gno.land/p/tbruyelle/gnoslinger/showdowns/`: anyone, no admin. Deploying
  under that namespace already takes its owner, so the code is trusted.
- **Any other package**: the admin only (later GovDAO or a multisig), after
  reviewing it.

To tell them apart the realm needs the package path of the value's concrete
type: `Info()` cannot be trusted (any package can claim any path) and Gno has
no `reflect`, so how to read it is a spike question (Phases, 1). The realm
keeps the
showdowns in an `avl.Tree` by key; each game records the key it was created
with. Packages are immutable, which helps: `battleroyale/v1` is registered next to
`v0`, and running games keep their rules.

```go
func Register(cur realm, key string, s showdown.Showdown) // open to the project's showdowns, admin otherwise
func Retire(cur realm, key string)                        // no new games; running ones go on
func CreateGame(cur realm, mode string, charKey string, maxTurns, timeoutMinutes int) string
// JoinGame, SubmitPlan, Resign, ClaimTimeout as today
Render("json/modes")
Render("json/games/{addr}")
```

## Client

- The lobby lists the modes (`json/modes`) and creates a game in one of them.
- Every game uses the same JSON shape, so one game screen renders every mode.
- N characters: an opponents column instead of the single opponent panel, a
  target picker listing every character, and the replay timeline with one
  row per character (proposed in the Replay mockup on the Design canvas).

## Phases

1. **Spike (1 to 2 days).** Filetests on the pinned gno to confirm:
   - the realm can persist an interface value whose concrete type lives in a
     package it does not import, and call its methods after reloading it;
   - `MsgRun` can make the crossing call to `Register`, with the caller as
     the previous realm;
   - the realm can read the package path of a registered value's concrete
     type (a VM or stdlib helper), to open registration to the project's own
     showdowns; if it cannot, registration stays admin-only for every
     package;
   - the storage deposit and gas of a game in a registered mode, against
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
4. **Client.** Mode list in the lobby, N-player game screen (what the
   screens need past four seats and for teams: DESIGN_MULTIPLAYER.md,
   Order of what is left, 3).
5. **New showdowns.** `battleroyale/v1` (up to 8 seats), then
   `corral/v0`. With more than two
   players commit-reveal matters more: every extra player is one more who
   could read the others' plans before sending their own.

## Risks

1. **Dynamic registration may not work** (spike, point 1). Fallback: the
   realm imports each showdown package and registers it in its own `init`.
   A new showdown then needs a new realm version: still all packages, just
   less dynamic.
2. **Registered code runs as the realm.** A p package cannot import realms,
   so it makes no crossing calls and only touches what the realm hands it:
   one game's state. A buggy showdown could still corrupt its own mode's
   games or burn gas: the project's showdowns are reviewed before they are
   deployed under its namespace, and any other package before the admin
   registers it.
3. **Determinism.** `Resolve` must stay deterministic and seeded, so turns
   can be replayed from their seed as today.

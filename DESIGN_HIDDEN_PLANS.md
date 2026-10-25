# Hidden plans: commit, reveal, timelocked plan — design

Status: built 2026-10-20, with the account sessions it uses for the
popups (2026-10-18, `chain/session.ts`) and the turn's fixed start,
`TurnStart` (2026-10-19); this document is kept to the build, and
`AGENTS.md` has the details. Changed from the first proposal while
building: a claim passes the turn of a seat whose plan is not in, in
both phases, instead of putting it out (`no_reveal` −8 is gone);
`RevealMany` skips a seat it cannot reveal instead of aborting; every
commit carries its timelocked plan, encrypted offline; `Sealed` is the
commit's type (`Commit` being the function).

## Goal

Today the second player to send `SubmitPlan` can read the first player's
plan from the chain (the tx's arguments, the realm's `json/plan` view).
The plans must be secret until everyone's is in, and that must not cost
a game server or the ability to play by correspondence (a 2-day turn with
an offline opponent).

What gno.land offers for this, surveyed on 2026-10-17: no encrypted
mempool, no threshold keys among the validators, nothing like SKALE's
BITE, Fairblock, Zama or a TEE chain, so **someone has to send the plan
in clear once everyone has committed**: the reveal transaction cannot go
away. What can go away is the player's chance to abort after seeing the
others, and its wait on an offline player. Two pieces, each useful alone,
built in that order:

1. **Commit-reveal in the realm**: `Commit(hash)`, then `Reveal(salt,
   plan)` by anyone who has them; the last reveal resolves the turn as the
   last `SubmitPlan` does today; an unrevealed plan at the deadline scores
   like a death, so aborting never pays.
2. **Timelocked plan**: the commit carries the salt and plan encrypted
   to the drand round of the turn's deadline (`tlock`). If the committer
   vanishes, anyone opens its plan at the deadline and the turn resolves
   with it. The realm only stores the timelocked plan: no new on-chain
   crypto.

Popups are a matter of comfort, not of the mechanism: with Adena alone a
turn asks for two signatures instead of today's one, the commit and then
the reveal once everyone has committed. Auto-sign (account sessions,
below) takes both away.

## The turn

Words used below:

- **Reveal**: the `Reveal(id, turn, seat, salt, plan)` transaction, which
  puts a seat's salt and plan on chain against its hash. Anyone may send
  it.
- **Last commit in clear**: the last seat to commit skips its commit and
  reveals at once, its plan in clear: the others' plans are already fixed
  by their hashes (below).
- **Open**: decrypt a seat's timelocked plan off chain, once drand's
  round R is out. Any client can; it is followed by a reveal.
- **Own reveal**: the player's browser reveals from the salt and plan it
  kept at commit time. The usual path, seconds after the last commit.
- **Opened reveal**: a client opens a vanished player's timelocked plan
  and reveals it, after the deadline. Every timelocked plan of a turn
  opens with the same drand round, so a client opens all the unrevealed
  ones at once and reveals them in one `RevealMany` transaction: with 3
  or 4 seats, several players vanishing in one turn is no rare case.

The realm handles both the same way; the `by` of the `PlanRevealed` event
tells them apart. Players never pick one: the client does both by itself
and only says "Revealing…", and once, when a turn waited on the deadline,
"The Kid's plan opened at the deadline".

Two players, both online, both with auto-sign on: no popup at all.
Without it, Adena asks for the commit and for the reveal, the last player
to commit once only. Here B commits last:

```
 A's browser                      realm                                  B's browser
   │ plan picked                    │                                         │
   │ salt ← 16 random bytes         │                                         │
   │ hash ← sha256(…)               │                                         │
   │ locked ← tlock(salt‖plan       │                                         │
   │          → round R)            │                                         │
   ├── Commit(id, t, hash, locked) ►│ Commits[0] = {hash, locked}             │
   │                                │                                         │ poll: A committed, B is last
   │                                │◄── Reveal(id, t, 1, salt', plan') ──────┤ (in clear: A's plan is fixed)
   │                                │ every alive seat in → revealing         │
   │ poll: "revealing"              │                                         │
   ├── Reveal(id,t,0,salt,plan) ───►│ sha256 matches; plan validated          │
   │                                │ every seat revealed → resolveTurn       │
   │                                │ seed ← salts, plans, height, block time │
   │ poll: lastTurn changed         │ Turn++, phase planning                  │ poll: lastTurn changed
   │ playback                       │                                         │ playback
```

The client finds a reveal due by polling the realm's views, as it does
today (no reading of blocks): the game screen polls its game every 2 s,
and the lobby refreshes the player's games every 5 s. When a game shows
the phase `revealing` and this browser holds that seat's salt and plan,
kept in `localStorage` at commit time (keyed by game, turn and seat, so a
reload or another tab still reveals), the own reveal is due. With
auto-sign on it goes out by itself, from the game screen or the lobby;
with it off, it waits for the player (see Client), since each reveal is
an Adena popup. A player whose browser is closed is covered by the
timelocked plan only. Four seats work the same: `revealing` starts with
the last commit of the alive seats, and the turn resolves with the last
reveal.

**The last commit in clear.** Once every other alive seat has committed,
hiding the last plan protects nothing: the others' plans are fixed by
their hashes, so seeing the last one lets them refuse to reveal at most,
which is the "last to reveal" case below, answered the same way. So the
last seat to commit sends `Reveal` straight away, in `planning`, with its
salt and plan and no hash to check: it counts as its commit and its
reveal, the turn goes to `revealing` with that seat revealed, and it needs
no timelocked copy. A transaction's arguments are public even when the
realm refuses it, so a refused shortcut would show the plan to a seat
that can still commit against it: the realm accepts it only when every
other alive seat has committed and the turn given is the current one, and
the client sends it only when its latest poll of the game shows exactly
that (a commit is never withdrawn but by a surrender, and a seat that
surrendered no longer plays).

Per player and turn: two transactions (commit, reveal), one for the last
to commit, zero signatures asked of the player. The reveal that completes the turn pays the
resolution, as the last `SubmitPlan` does today; the others are cheap.

### The turn's clock

The turn has a fixed start, `TurnStart`, set when the turn starts and
left alone by later saves (built ahead of the rest: before it, the
timeout restarted on every save, `UpdatedAt`), and the deadlines follow
from it:
the timelocked plans are locked to a round after D, so every client must
know D when it commits.

```
TurnStart                                 D = TurnStart + Timeout          D + RevealGrace
│◄────────── Commit accepted ────────────►│◄─────── Reveal only ──────────►│ Reveal or ClaimTimeout
│                                         │ ClaimTimeout: uncommitted miss  │ unrevealed miss the turn
│                                         │ ≤1 alive → finished(timeout)    │ ≤1 alive → finished(timeout)
│                                         │ else → revealing                │ else resolve with the plans in
                                          R = first drand round after D + 2 min: the timelocked plans open
```

`Timeout` is the game's (5 min to 30 days, default 2 days), unchanged.
`RevealGrace` is a realm constant (5 min): time for the drand round, the
block clock's drift and an opener's transaction. A reveal is accepted at
any time in the `revealing` phase, after the grace too, until someone
claims the timeout; the honest client opens the timelocked plans before
it ever offers the claim button.

A claim, in either phase, treats every seat whose plan is not in the same
way: it **misses the turn**, which is passed for it, and at the third
missed turn in a row it is out of the fight, scored as a surrender. Only
a revealed plan resets the count, so committing and never revealing
counts as missing. A claim in the reveal phase is a backstop: a vanished
player's plan is opened from its timelocked copy, with no claim. It only
catches a copy that cannot be opened, deliberately broken or drand out of
reach, or one nobody opened. It does not punish harder, because the realm
cannot tell a copy nobody could open from one a claimer chose not to
open: in a 2-player game the claimer is the only one around to open it,
and a death's points would reward skipping the opening.

### State machine

```
            last seat joins           every alive seat committed
 waiting ───────────────► planning ─────────────────────────────► revealing
    │                        │  ▲                                   │
    │ ClaimTimeout           │  │ Turn++                            │ every seat revealed,
    │ (expired)              │  └───────────────────────────────────┤ or ClaimTimeout past D+grace:
    │                        │ ClaimTimeout past D, ≥2 committed    │ resolveTurn
    │                        └───────────────────────────────────►  │
    ▼                                                               ▼ ≤1 alive, or MaxTurns
 finished ◄─────────────────────────────────────────────────────────┘
```

`Surrender` stays a `planning` action (committed or not: the commit is
dropped); in `revealing` it is refused, since surrendering after reading
the others' reveals would be the abort this design removes. `autoPass`
works as today: a seat with no time points is committed and revealed
with the empty plan at once.

## Why nobody gains by cheating

| Moment | What the player sees | What it could do | Why it does not pay |
|---|---|---|---|
| Before committing | The others' hashes | Nothing | A sha256 of 16 random bytes and the plan is hiding and binding |
| Last to commit | Every other hash | Send its plan in clear | The others' plans are fixed; they can only refuse to reveal, see two rows down |
| Committed, others not | Nothing new | Wait | Commits are refused past D; whoever waits past D misses the turn, without having learnt anything |
| Revealing, first to reveal | Nothing new | Refuse to reveal | Its timelocked plan opens at R anyway and plays. Only a copy broken on purpose at commit time keeps it hidden: that buys the choice, after seeing the others, between its plan and a pass, each use a missed turn (out at the third) |
| Claimer, 2 players | A vanished player's timelocked plan, unopened | Claim instead of opening | That player only misses the turn, as with no commit: skipping the opening gains little |
| Revealing, last to reveal | Every other plan | Compute the outcome, then refuse | The seed includes the resolving block's height and time: the outcome is unknown until the reveal lands. And see the row above |
| Opener of a timelocked plan | A vanished player's plan | Nothing | It opens after D: that player can no longer change anything, and the opener itself has committed or is Out |

The timelock round is chosen by the client; the realm cannot check it. A
round earlier than D exposes the chooser's own plan to the others before
they commit: its loss alone. A round later than D only delays the
opening of its own plan, until a missed turn if nobody opens it.

## The timelocked plan

```
 commit (the player's client)                        open (any client, once round R is out)
 salt ← crypto.getRandomValues(16)                   sig_R ← GET api.drand.sh/v2/beacons/quicknet/rounds/R
 plan ← canonical plan string (may be "")             salt‖plan ← timelockDecrypt(locked, sig_R)   (tlock-js)
 hash ← sha256("gnoslinger|" id "|" turn "|" seat     check sha256(…) == Commits[seat].Hash
               "|" salt "|" plan), hex                RevealMany(id, seats, salts, plans), every seat opened
 locked ← timelockEncrypt(R, salt‖plan, quicknet)      realm: same sha256, ParsePlan, Validate, store
 Commit(id, turn, hash, locked)
```

- drand **quicknet**: chain hash `52db9ba7…c84e971`, genesis 1692803367,
  one round every 3 s, BLS12-381 signatures on G1, 22 nodes of 18
  organisations with a threshold; the public `api.drand.sh` serves the
  rounds (any other relay does too). `tlock-js` and `drand-client` run in
  the browser (Vite `build.target` es2020). The ciphertext is an `age`
  file with a tlock stanza: about 300 to 500 bytes for a plan.
- The realm computes the round from the deadline so every client uses the
  same one, `lockRound = (D + 2 min − genesis) / 3 + 2`, and shows it
  in the game JSON; the round is only a number, the realm never verifies
  anything about drand.
- The realm checks the timelocked plan's size only (≤ 1 KB). Its deposit
  (about 0.05 GNOT a seat) comes back with the reveal: once the hash is
  checked, the plan and salt are kept in clear and the seat's hash and
  timelocked plan are cleared, refunded to whoever sent the reveal. That is
  the player itself on an own reveal, and the opener of a vanished
  player's plan otherwise: a small bounty for opening it.
- Encrypting needs no drand node: the network's public key and scheme
  are constants (`tlock-js`'s `defaultChainInfo` for quicknet) and the
  realm gives the round, so the client always locks and `Commit` refuses
  an empty timelocked plan. Only opening fetches the round's signature;
  with drand unreachable then, the plan waits, and past the grace the
  claim passes the seat's turn (a missed one). That claim is a backstop:
  it only ever hits a copy that cannot be opened, a deliberately broken
  one, a long drand outage, or a copy nobody opened.

## Popups and account sessions

Auto-sign (`AGENTS.md`, `chain/session.ts`): a key kept in the browser
signs the player's calls to the game realm, through the chain's account
sessions, so the commit and the reveal need no popup. It changes nothing
in the realm (the caller is the player's address) nor in the mechanism:

- The key lives in the page, so it sends the reveal only while the game
  is open. A player who commits and closes the tab is covered by its
  timelocked plan, with or without a session.
- The session's daily limit counts the storage deposits too: the
  resolving reveal and the commits' deposits use some of it, and a
  refund does not give it back.

## Realm

### Data

```go
// Commit is a seat's sealed plan for the current turn.
type Commit struct {
    // sha256 hex of the domain, salt and plan; "" until committed
    Hash string
    // the timelocked plan, a tlock ciphertext (≤ 1 KB), required
    Locked string
}

type Game struct {
    …
    Phase Phase // waiting | planning | revealing | finished
    // the turn's clock: commits until +Timeout, reveals until
    // +Timeout+RevealGrace
    TurnStart time.Time
    Commits   []Commit // one per seat, each cleared by its seat's reveal
    Plans     []string // the revealed plans, canonical (as today)
    // the revealed salts, part of the seed; cleared when the turn resolves
    Salts []string
    // replaces Submitted; a seat has committed when its Hash is set or it
    // is revealed
    Revealed []bool
    …
}
```

`TurnResult` is unchanged: the plans in clear, the seed, the cards, the
events. Replays and the history view do not change.

### Crossing functions

| Function | Caller | Does |
|---|---|---|
| `Commit(cur, id, turn, hash, locked string) int` | the seat | `turn` the one in progress (a commit for another turn could never be revealed), phase `planning`, before D, character alive, not yet committed; `hash` 64 hex chars, `locked` ≤ 1 KB; stores; when every alive seat has committed, phase `revealing` (event `AllCommitted`). Returns Rev |
| `Reveal(cur, id string, turn, seat int, salt, plan string) int` | anyone | `turn` the current one; phase `revealing`, seat committed and not revealed, sha256 matches; or phase `planning` (the last commit in clear), before D, by the seat itself, not committed, every other alive seat committed, no hash to check (any other reveal while planning would leak); then exactly today's `SubmitPlan` checks (parse, validate, ground ids, targets, `PlayedFoot`/`PlayedRun`); stores plan and salt and clears the seat's commit (its deposit refunded to the caller); when every seat is revealed, `resolveTurn` in the same tx. Returns Rev |
| `RevealMany(cur, id, seats, salts, plans string) int` | anyone | the opened reveals of a turn in one transaction: `seats`, `salts` and `plans` are lists separated by `;` (a plan string never holds one; an empty plan is an empty field), the same length. Each seat as `Reveal`, in the order given; a seat already revealed is skipped (its player's own reveal landed first), and so is one whose salt and plan do not match its hash or whose plan is not valid (event `PlanUnopened`; the opener cannot check that before opening, and one bad copy must not hold the others back): that seat stays unrevealed, for the claim. Bad lists, an unknown seat, the wrong turn or phase abort. Each cleared commit is refunded to the caller; when the call completes the turn, `resolveTurn` in the same tx. Returns Rev |
| `Surrender(cur, id)` | the seat | `planning` only; drops the seat's commit; as today otherwise |
| `ClaimTimeout(cur, id)` | anyone | see the clock above: past D while planning (no commit at all: abandoned), past `D + RevealGrace` while revealing; every alive seat whose plan is not in misses the turn, then the turn moves on with the plans in |
| `SubmitPlan` | | removed. A game created "open" (plans in clear, no secrecy, a lobby checkbox) could keep it: `Commit` of the empty hash plus an immediate reveal. Optional, not in the first cut |

The seed becomes `engine.Seed(realmPath, id, turn, salts…, plans…,
height, time)`: the salts make it unpredictable to every player when it
commits, the block keeps the outcome unknown to the last revealer.

Events: `PlanCommitted` (id, turn, seat), `AllCommitted`, `PlanRevealed` (id,
turn, seat, by; one per seat of a `RevealMany`), `PlanPassed`, `TurnResolved`,
`PlanUnopened`, `PlanMissed` (no commit, or no plan revealed, at the claim).
JSON: `phase` gains `revealing`; each
player gains `committed`, `revealed` and `locked`; the game gains `commitUntil`,
`revealUntil` and `lockRound`; `json/plan/{id}/{addr}` shows the commit only
(the client shows its own plan from `localStorage`).

### Rules decisions

- **[Hn] A plan not in at the claim**, no commit by D or not revealed
  by `D + RevealGrace`: the seat misses the turn (passed), and is out of
  the fight at the third missed turn in a row, scored as a surrender; a
  revealed plan resets the count.
- **[Hn+1] The turn's clock** runs from the turn's start, not from the
  last move: a 3-player game no longer gets a longer turn when its
  commits trickle in.

## Client

- `game/commit.ts`: `sealPlan(game, turn, seat, plan, round)` → `{salt,
  hash, locked}` (WebCrypto sha256, tlock-js); `pendingReveals` in
  `localStorage`; `openLocked(locked, round)`.
- `chain/realm.ts`: `commit(id, hash, locked)` watching
  `players[seat].committed`, `reveal(id, seat, salt, plan)` watching
  `players[seat].revealed` or the turn changing, `revealMany(id, reveals)`
  watching every seat given revealed or the turn changing; sent through
  `chain.wallet` (auto-sign, else Adena).
- `GameScene`: **Send plan** seals and commits, or, when the latest poll
  shows every other alive seat committed, sends the plan in clear with
  `Reveal` (no seal, no timelocked copy, nothing kept in `localStorage`); the header says
  "Committed 1 of 2", then "Revealing…"; on every poll, with the phase
  `revealing`: my pending reveal goes out; past `lockRound`, every
  unrevealed seat with a timelocked plan is opened (one drand round for
  all) and they are revealed together in one `RevealMany`, mine too if it
  is still pending. Without auto-sign
  the same steps wait for a click, an Adena popup each, rather than
  opening Adena unasked (a popup the player did not expect is easily
  dismissed): the status ribbon says "Reveal your plan" (flashing, as on
  every change) with a **REVEAL** button, and **OPEN THE PLANS** for the
  vanished players' timelocked plans, one popup for all. The planning
  panel shows my plan from `localStorage` while waiting. **Claim** only
  shows once past `revealUntil` and after the timelocked plans were tried.
- `LobbyScene`, `ui/lobbyView.ts`: "Your move" from `committed`/`revealed`.
  On every refresh, each game in `revealing` whose seat has a pending
  reveal in this browser: with auto-sign on, the reveal goes out from the
  lobby (one at a time); with it off, the game is listed under **Your
  move** as "Reveal your plan", its button opening the game.
- `game/lobby.ts`, `chain/types.ts`: the new fields.

## Costs

| Item | Today | With hidden plans |
|---|---|---|
| Signatures a turn, a player | 1 Adena popup (0 with auto-sign) | 2 Adena popups (0 with auto-sign) |
| Transactions a turn, a player | 1 | 2 (1 for the last to commit) |
| Storage a turn | ~2 KB, the turn's record | the same, plus ~0.5 KB a seat for the commit and its timelocked plan, refunded by its reveal |
| Turn latency, both online | the last plan | the last reveal, seconds after the last commit |
| Turn latency, a committer offline | n/a (the turn stalls until the claim) | D + 2 min, the plan still plays |

## Steps

1. Realm: the deadlines from `TurnStart` (built), `Commit`, `Reveal`,
   `revealing`, the missed turns at the claim, the seed with salts; unit tests and
   filetests (a full turn, the last commit in clear, a reveal while
   planning refused while another seat has not committed, a wrong salt, a
   claim in each phase). Client: seal, commit, reveal through Adena.
   Playable with two popups a turn.
2. Realm: `RevealMany` (filetests: several seats in one call, a seat
   already revealed skipped, a wrong hash aborting it). Client: the
   timelocked plan (tlock-js), the realm's `lockRound`, the opener logic,
   the Claim button gated behind it.
3. `AGENTS.md`, `bga/doc/ASSUMPTIONS.md`, `TODO.md`.

## Alternative: a shared key with a key server

Status: idea, 2026-10-18, not chosen. It removes the reveal phase: each
player sends one transaction a turn, its commit, and a plan opens as soon
as the last commit lands, a vanished player's too. The price is a small
key server, against the goal of no game server, trusted not to collude
with a player.

### The key

The same identity-based encryption as tlock (Boneh-Franklin over
BLS12-381), with several key holders instead of drand. BLS signatures on
the same message add up, and so do the public keys:

```
at join      seat i: secret s_i, public P_i = s_i·G2, proof of possession
server       secret s_k, public P_k (a realm constant)
identity     Q = H("gnoslinger|" id "|" turn)
key          P = P_k + Σ P_i over the turn's key seats
commit i     locked_i ← encrypt(salt_i‖plan_i, Q, P), σ_i = s_i·Q
opening      σ = σ_k + Σ σ_i = (s_k + Σ s_i)·Q, the identity's private key
```

The proof of possession (a signature of the seat's own public key) is
needed: without it a player could register P_i = x·G2 − ΣP_others and
open everything alone. The **key seats** are the seats alive and not
passed automatically at the turn's start, known to every client from the
state, since an auto-passed seat sends no commit and so no share.

### The turn

```
 A's browser                          realm                              key server
   │ plan picked                        │                                     │
   │ salt ← 16 random bytes             │                                     │
   │ hash ← sha256(…)                   │                                     │
   │ locked ← encrypt(salt‖plan, Q, P)  │                                     │
   │ σ_A ← s_A·Q                        │                                     │
   ├── Commit(id, hash, locked, σ_A) ──►│ Commits[0]                          │
   │                                    │ B commits the same way              │ (B cannot open A's plan)
   │                                    │ every key seat committed → opening  │
   │                                    │                                     │ poll
   │                                    │                                     │ σ ← σ_k + Σ σ_i
   │                                    │                                     │ decrypt every locked_i
   │                                    │◄── Open(id, salts, plans) ──────────┤
   │                                    │ sha256 matches for each seat        │
   │                                    │ seed ← salts, plans, block          │
   │ poll: lastTurn changed             │ Turn++, phase planning              │
   │ playback                           │                                     │
```

The realm does no pairing: it checks the hashes as `Reveal` does, so the
server cannot change a plan, only withhold or leak it. A variant keeps the
server off the chain: it serves σ_k over HTTP once the chain shows every
commit, and any client sends `Open` (without a session key, an Adena
popup for whoever does).

### Who can read a plan early

| Holder | Has | Can open early? |
|---|---|---|
| The last player, before committing | Every other σ_i, its own s_i | No: σ_k is missing |
| The key server | σ_k, the σ_i committed so far | No: the uncommitted seats' σ_i are missing |
| The key server and one player together | Everything | Yes: the trust assumption. A threshold group of servers makes it harder, at the cost of a network to run |

### What can go wrong

- **The server is down or withholds σ_k**: no plan opens. A drand
  timelocked copy of each plan in the commit (as in the main design)
  opens them at D + 2 min, or each player reveals by hand.
- **A key seat never commits** (surrenders while planning, or runs out
  of time): its σ_i never comes, so the key stays incomplete. The drand
  copy opens the committed plans at D + 2 min; the timeout path is slow
  anyway.
- **A bogus σ_i** (not s_i·Q): nobody can decrypt. The realm cannot
  see it without a pairing; the server and the clients check
  e(σ_i, G2) = e(Q, P_i) off chain, and the seat is treated as never
  revealed.

### Against the main design

| Item | Main design | Shared key |
|---|---|---|
| Transactions a turn, a player | 2 (commit, reveal) | 1 (commit) |
| Adena popups a turn, without a session key | 2 | 1 |
| Auto-sign (account sessions) | takes the 2 popups away | takes the 1 popup away |
| Turn latency, all online | the last reveal | the server's `Open`, seconds after the last commit |
| Turn latency, a committer offline | D + 2 min | seconds |
| Trust | drand's threshold | drand's threshold (fallback) and the key server not colluding |
| To run | nothing | the key server, its gas (or the HTTP variant) |
| Client crypto | tlock-js | BLS12-381 IBE by hand (`@noble/curves`), plus tlock-js for the fallback |
| Join | as today | a BLS key and its proof of possession |

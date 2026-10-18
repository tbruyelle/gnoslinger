# Hidden plans: commit, reveal, timelocked plan — design

Status: proposal, 2026-10-17. Not built yet, except the account sessions
it can use for the popups (built 2026-10-18, `AGENTS.md`,
`chain/session.ts`). `TODO.md` lists the
commit-reveal item this replaces ("`PhaseCommit`/`PhaseReveal` reserved",
"the deck shuffle seeded from the revealed salts").

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

Two players, both online, both with auto-sign on: no popup at all.
Without it, Adena asks for the commit and for the reveal.

```
 A's browser                      realm                                  B's browser
   │ plan picked                    │                                         │
   │ salt ← 16 random bytes         │                                         │
   │ hash ← sha256(…)               │                                         │
   │ locked ← tlock(salt‖plan       │                                         │
   │          → round R)            │                                         │
   ├── Commit(id, hash, locked) ───►│ Commits[0] = {hash, locked}             │
   │                                │◄── Commit(id, hash', locked') ──────────┤ (B saw only A's hash)
   │                                │ every alive seat committed → revealing  │
   │ poll: "revealing"              │                                         │ poll: "revealing"
   ├── Reveal(id, 0, salt, plan) ──►│ sha256 matches; plan validated          │
   │                                │◄── Reveal(id, 1, salt', plan') ─────────┤
   │                                │ every seat revealed → resolveTurn       │
   │                                │ seed ← salts, plans, height, block time │
   │ poll: lastTurn changed         │ Turn++, phase planning                  │ poll: lastTurn changed
   │ playback                       │                                         │ playback
```

The reveal is sent by the client as soon as the poll shows the phase
`revealing`, from the salt and plan it kept in `localStorage` at commit
time (keyed by game, turn and seat, so a reload or another tab still
reveals). Four seats work the same: `revealing` starts with the last
commit of the alive seats, and the turn resolves with the last reveal.

Per player and turn: two transactions (commit, reveal), zero signatures
asked of the player. The reveal that completes the turn pays the
resolution, as the last `SubmitPlan` does today; the others are cheap.

### The turn's clock

The clock no longer restarts on every save: `TurnStart` is set when the
turn starts, and the deadlines follow from it.

```
TurnStart                                 D = TurnStart + Timeout          D + RevealGrace
│◄────────── Commit accepted ────────────►│◄─────── Reveal only ──────────►│ Reveal or ClaimTimeout
│                                         │ ClaimTimeout: uncommitted → Out │ unrevealed → Out, no_reveal −8
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
| Committed, others not | Nothing new | Wait | Commits are refused past D; whoever waits past D is Out |
| Revealing, first to reveal | Nothing new | Refuse to reveal | Its timelocked plan opens at R anyway; with a broken one, `no_reveal` −8 and Out (so Captured −4 can follow), never better than its plan |
| Revealing, last to reveal | Every other plan | Compute the outcome, then refuse | The seed includes the resolving block's height and time: the outcome is unknown until the reveal lands. And see the row above |
| Opener of a timelocked plan | A vanished player's plan | Nothing | It opens after D: that player can no longer change anything, and the opener itself has committed or is Out |

The timelock round is chosen by the client; the realm cannot check it. A
round earlier than D exposes the chooser's own plan to the others before
they commit: its loss alone. A round later than D only delays the
opening of its own plan, until `no_reveal` if nobody opens it.

## The timelocked plan

```
 commit (the player's client)                        open (any client, once round R is out)
 salt ← crypto.getRandomValues(16)                   sig_R ← GET api.drand.sh/v2/beacons/quicknet/rounds/R
 plan ← canonical plan string (may be "")             salt‖plan ← timelockDecrypt(locked, sig_R)   (tlock-js)
 hash ← sha256("gnoslinger|" id "|" turn "|" seat     check sha256(…) == Commits[seat].Hash
               "|" salt "|" plan), hex                Reveal(id, seat, salt, plan)
 locked ← timelockEncrypt(R, salt‖plan, quicknet)      realm: same sha256, ParsePlan, Validate, store
 Commit(id, hash, locked)
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
  the player itself on an ordinary reveal, and the opener of a vanished
  player's plan otherwise: a small bounty for opening it.
- Without a drand relay reachable (or with the timelocked plan left
  empty), the design degrades to plain commit-reveal with the
  `no_reveal` penalty.

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
    Hash   string // sha256 hex of the domain, salt and plan; "" until committed
    Locked string // the timelocked plan, a tlock ciphertext (≤ 1 KB), "" when the client sent none
}

type Game struct {
    …
    Phase     Phase     // waiting | planning | revealing | finished
    TurnStart time.Time // the turn's clock; commits until +Timeout, reveals until +Timeout+RevealGrace
    Commits   []Commit  // one per seat, each cleared by its seat's reveal
    Plans     []string  // the revealed plans, canonical (as today)
    Salts     []string  // the revealed salts, part of the seed; cleared when the turn resolves
    Revealed  []bool    // replaces Submitted; a seat has committed when its Hash is set or it is revealed
    …
}
```

`TurnResult` is unchanged: the plans in clear, the seed, the cards, the
events. Replays and the history view do not change.

### Crossing functions

| Function | Caller | Does |
|---|---|---|
| `Commit(cur, id, hash, locked string) int` | the seat | phase `planning`, before D, character alive, not yet committed; `hash` 64 hex chars, `locked` ≤ 1 KB; stores; when every alive seat has committed, phase `revealing` (event `AllCommitted`). Returns Rev |
| `Reveal(cur, id, seat int, salt, plan string) int` | anyone | phase `revealing` only (a reveal while planning would leak), seat committed and not revealed; sha256 matches; then exactly today's `SubmitPlan` checks (parse, validate, ground ids, targets, `PlayedFoot`/`PlayedRun`); stores plan and salt and clears the seat's commit (its deposit refunded to the caller); when every seat is revealed, `resolveTurn` in the same tx. Returns Rev |
| `Surrender(cur, id)` | the seat | `planning` only; drops the seat's commit; as today otherwise |
| `ClaimTimeout(cur, id)` | anyone | see the clock above; a reveal-phase claim gives every unrevealed alive seat `Out` and the award `no_reveal` −8, then resolves with the plans in |
| `SubmitPlan` | | removed. A game created "open" (plans in clear, no secrecy, a lobby checkbox) could keep it: `Commit` of the empty hash plus an immediate reveal. Optional, not in the first cut |

The seed becomes `engine.Seed(realmPath, id, turn, salts…, plans…,
height, time)`: the salts make it unpredictable to every player when it
commits, the block keeps the outcome unknown to the last revealer.

Events: `PlanCommitted` (id, turn, seat), `AllCommitted`, `PlanRevealed`
(id, turn, seat, by), `PlanPassed`, `TurnResolved`, `VictoryPoints` with
reason `no_reveal`. JSON: `phase` gains `revealing`; each player gains
`committed`, `revealed` and `locked`; the game gains `commitUntil`,
`revealUntil` and `lockRound`; `json/plan/{id}/{addr}` shows the
commit only (the client shows its own plan from `localStorage`).

### Rules decisions

- **[Hn] An unrevealed plan**: at `D + RevealGrace` the seat is `Out`
  and scores `no_reveal` −8, the points of a death (15.1), and may be
  captured at the end like any character out of the fight (15.63). No
  enemy gets the Kill points. Out of time without a commit stays what it
  is today, a surrender.
- **[Hn+1] The turn's clock** runs from the turn's start, not from the
  last move: a 3-player game no longer gets a longer turn when its
  commits trickle in.

## Client

- `game/commit.ts`: `sealPlan(game, turn, seat, plan, round)` → `{salt,
  hash, locked}` (WebCrypto sha256, tlock-js); `pendingReveals` in
  `localStorage`; `openLocked(locked, round)`.
- `chain/realm.ts`: `commit(id, hash, locked)` watching
  `players[seat].committed`, `reveal(id, seat, salt, plan)` watching
  `players[seat].revealed` or the turn changing; sent through `chain.wallet`
  (auto-sign, else Adena).
- `GameScene`: **Send plan** seals and commits; the header says
  "Committed 1 of 2", then "Revealing…"; on every poll, with the phase
  `revealing`: my pending reveal goes out; past `lockRound`, every
  unrevealed seat with a timelocked plan is opened and revealed (one tx at a
  time, as the realm client allows one in flight); without auto-sign
  the same steps show as buttons (an Adena popup each). The planning
  panel shows my plan from `localStorage` while waiting. **Claim** only
  shows once past `revealUntil` and after the timelocked plans were tried.
- `ui/lobbyView.ts`: "Your move" from `committed`/`revealed`.
- `game/lobby.ts`, `chain/types.ts`: the new fields.

## Costs

| Item | Today | With hidden plans |
|---|---|---|
| Signatures a turn, a player | 1 Adena popup (0 with auto-sign) | 2 Adena popups (0 with auto-sign) |
| Transactions a turn, a player | 1 | 2 |
| Storage a turn | ~2 KB, the turn's record | the same, plus ~0.5 KB a seat for the commit and its timelocked plan, refunded by its reveal |
| Turn latency, both online | the last plan | the last reveal, seconds after the last commit |
| Turn latency, a committer offline | n/a (the turn stalls until the claim) | D + 2 min, the plan still plays |

## Steps

1. Realm: `TurnStart` and the fixed deadlines, `Commit`, `Reveal`,
   `revealing`, `no_reveal`, the seed with salts; unit tests and
   filetests (a full turn, a reveal while planning refused, a wrong salt,
   a claim in each phase). Client: seal, commit, reveal through Adena.
   Playable with two popups a turn.
2. Client: the timelocked plan (tlock-js), the realm's `lockRound`, the opener
   logic, the Claim button gated behind it.
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

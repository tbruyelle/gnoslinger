# Hidden plans: commit, reveal, escrow — design

Status: proposal, 2026-10-17. Nothing built yet. `TODO.md` lists the
commit-reveal item this replaces ("`PhaseCommit`/`PhaseReveal` reserved",
"dice seeded from revealed salts").

## Goal

Today the second player to send `SubmitPlan` can read the first player's
plan from the chain (the tx's arguments, the realm's `json/plan` view).
The plans must be secret until everyone's is in, and that must not cost
the player an extra wallet signature per turn, a game server, or the
ability to play by correspondence (a 2-day turn with an offline opponent).

What gno.land offers for this, surveyed on 2026-10-17: no encrypted
mempool, no threshold keys among the validators, nothing like SKALE's
BITE, Fairblock, Zama or a TEE chain, so **someone has to send the plan
in clear once everyone has committed**: the reveal transaction cannot go
away. What can go away is the player's involvement in it, its chance to
abort after seeing the others, and its wait on an offline player. Three
pieces, each useful alone, built in that order:

1. **Commit-reveal in the realm**: `Commit(hash)`, then `Reveal(salt,
   plan)` by anyone who has them; the last reveal resolves the turn as the
   last `SubmitPlan` does today; an unrevealed plan at the deadline scores
   like a death, so aborting never pays.
2. **Native session keys** (the pinned gno's `auth` module has them,
   `MsgCreateSession`): a key kept in the browser signs every game call
   as the player, fees paid by the player's account within a spend limit.
   One Adena popup a month; the reveal, and everything else, goes out by
   itself.
3. **Escrow to drand**: the commit carries the salt and plan encrypted to
   the drand round of the turn's deadline (`tlock`). If the committer
   vanishes, anyone opens its plan at the deadline and the turn resolves
   with it. The realm only stores the escrow: no new on-chain crypto.

## The turn

Two players, both online, both with a session key: no popup at all.

```
 A's browser               realm                                   B's browser
   │ plan picked              │                                        │
   │ salt ← 16 random bytes   │                                        │
   │ hash ← sha256(…)         │                                        │
   │ escrow ← tlock(salt‖plan → round R)                               │
   ├── Commit(id, hash, escrow) ─►│ Commits[0] = {hash, escrow}         │
   │                          │◄── Commit(id, hash', escrow') ──────────┤ (B saw only A's hash)
   │                          │ every alive seat committed → revealing  │
   │ poll: "revealing"        │                                        │ poll: "revealing"
   ├── Reveal(id, 0, salt, plan) ─►│ sha256 matches; plan validated     │
   │                          │◄── Reveal(id, 1, salt', plan') ─────────┤
   │                          │ every seat revealed → resolveTurn       │
   │                          │ seed ← salts, plans, height, block time │
   │ poll: lastTurn changed   │ Turn++, phase planning                 │ poll: lastTurn changed
   │ playback                 │                                        │ playback
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
                                          R = first drand round after D + 2 min: the escrows open
```

`Timeout` is the game's (5 min to 30 days, default 2 days), unchanged.
`RevealGrace` is a realm constant (5 min): time for the drand round, the
block clock's drift and an opener's transaction. A reveal is accepted at
any time in the `revealing` phase, after the grace too, until someone
claims the timeout; the honest client opens escrows before it ever offers
the claim button.

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
| Revealing, first to reveal | Nothing new | Refuse to reveal | Its escrow opens at R anyway; with a broken escrow, `no_reveal` −8 and Out (so Captured −4 can follow), never better than its plan |
| Revealing, last to reveal | Every other plan | Compute the outcome, then refuse | The seed includes the resolving block's height and time: the outcome is unknown until the reveal lands. And see the row above |
| Opener of an escrow | A vanished player's plan | Nothing | It opens after D: that player can no longer change anything, and the opener itself has committed or is Out |

The escrow round is chosen by the client; the realm cannot check it. A
round earlier than D exposes the chooser's own plan to the others before
they commit: its loss alone. A round later than D only delays the
opening of its own plan, until `no_reveal` if nobody opens it.

## The escrow

```
 commit (the player's client)                        open (any client, once round R is out)
 salt ← crypto.getRandomValues(16)                   sig_R ← GET api.drand.sh/v2/beacons/quicknet/rounds/R
 plan ← canonical plan string (may be "")             salt‖plan ← timelockDecrypt(escrow, sig_R)   (tlock-js)
 hash ← sha256("gnoslinger|" id "|" turn "|" seat     check sha256(…) == Commits[seat].Hash
               "|" salt "|" plan), hex                Reveal(id, seat, salt, plan)
 escrow ← timelockEncrypt(R, salt‖plan, quicknet)      realm: same sha256, ParsePlan, Validate, store
 Commit(id, hash, escrow)
```

- drand **quicknet**: chain hash `52db9ba7…c84e971`, genesis 1692803367,
  one round every 3 s, BLS12-381 signatures on G1, 22 nodes of 18
  organisations with a threshold; the public `api.drand.sh` serves the
  rounds (any other relay does too). `tlock-js` and `drand-client` run in
  the browser (Vite `build.target` es2020). The ciphertext is an `age`
  file with a tlock stanza: about 300 to 500 bytes for a plan.
- The realm computes the round from the deadline so every client uses the
  same one, `escrowRound = (D + 2 min − genesis) / 3 + 2`, and shows it
  in the game JSON; the round is only a number, the realm never verifies
  anything about drand.
- The realm checks the escrow's size only (≤ 1 KB). Its deposit (about
  0.05 GNOT a seat) is refunded when the turn resolves and the commits
  are cleared, to whoever sent the resolving reveal.
- Without a drand relay reachable (or with the escrow left empty), the
  design degrades to plain commit-reveal with the `no_reveal` penalty.

## Session keys

The pinned gno (`tm2/pkg/sdk/auth`, `gno.land/pkg/gnoland/allow_paths.go`)
has account sessions. The realm needs **no change** for them: a
session-signed call reaches it with `cur.Previous().Address()` being the
player's own address.

```
 Adena (master g1abc…)                                chain, auth module
   │ one popup: MsgCreateSession{                      /a/<master>/s/<session>:
   │   session_key: the browser's public key,            pubkey, account number, sequence,
   │   expires_at: now + 30 days,                        expires_at, allow_paths,
   │   allow_paths: ["vm/exec:gno.land/r/tbruyelle/gnoslinger/v1"],   spend_limit, spend_used
   │   spend_limit: 5 GNOT, spend_period: 1 day }
   ▼
 browser key (secp256k1 in localStorage, one per master address)
   │ every game call:
   │   tx{ msgs: [m_call{ caller: master, pkg_path, func, args }], fee,
   │       signatures: [{ pub_key: session, signature, session_addr: session }] }
   │   sign bytes: chain_id, the session account's number and sequence
   │   (abci query auth/accounts/<master>/session/<session>)
   ▼
 ante: fee taken from the master's balance, counted on the session's limit
 realm: caller == master
```

Facts from the code: at most 16 sessions an account, 8 allow paths,
expiry up to 4 years, spend period up to 30 days; a session can never
sign `auth` messages (no escalation) nor `vm/add_package`; `allow_paths`
scopes a realm, not a function; the gas fee counts against the spend
limit, and so does every coin the call moves (a `CreateGame` storage
deposit included), so the limit also bounds what a stolen key can cost.

What the key may do with the realm scoped: commit, reveal, create and
join games, surrender, claim. A stolen key could lose the player's games
and spend the limit on deposits. For a game that is acceptable; the limit
and the expiry are the player's choice in the lobby ("Play without
popups: 30 days, up to 5 GNOT a day"), with Revoke next to it.

Client side:

- `chain/session.ts`: make and keep the key; `SessionWallet implements
  Wallet` (`address` is the master's; `doContract` builds the tx, signs
  it, broadcasts with `broadcast_tx_sync` through the existing `Rpc`),
  and falls back to the Adena wallet when the session is missing,
  expired or over its limit (the chain answers `SessionNotAllowed`).
- Signing: `@gnolang/tm2-js-client` encodes the tx and signs, but its
  `signTransaction` hard-codes `session_addr: ""` and queries the signer's
  own account: the client builds the signature itself (the signer and
  the Tx encoder of the library, or a hand-rolled amino sign doc with
  `@noble/curves` secp256k1) and fetches the session account's number and
  sequence.
- Gas: a commit or a reveal that does not resolve needs little; the
  resolving reveal keeps the fixed `DEFAULT_GAS_WANTED` as today. The
  declared `gas_fee` is charged in full, so size it per call.

**Open point**: Adena's `DoContract` and `SignTx` document four message
types (`/bank.MsgSend`, `/vm.m_call`, `/vm.m_addpkg`, `/vm.m_run`) and
nothing says whether `/auth.m_create_session` is accepted or refused.
Try it on gnodev first. Until it works, the session is created with the
CLI (`gnokey maketx session create -pubkey <bech32 pubkey> -expires-at
30d -allow-paths vm/exec:gno.land/r/tbruyelle/gnoslinger/v1 -spend-limit
5000000ugnot -spend-period 86400 …`), or the client plays with Adena
popups for the commit and the reveal (two a turn).

## Realm

### Data

```go
// Commit is a seat's sealed plan for the current turn.
type Commit struct {
    Hash   string // sha256 hex of the domain, salt and plan; "" until committed
    Escrow string // the tlock ciphertext (≤ 1 KB), "" when the client sent none
}

type Game struct {
    …
    Phase     Phase     // waiting | planning | revealing | finished
    TurnStart time.Time // the turn's clock; commits until +Timeout, reveals until +Timeout+RevealGrace
    Commits   []Commit  // one per seat, cleared when the turn resolves
    Plans     []string  // the revealed plans, canonical (as today)
    Salts     []string  // the revealed salts, part of the seed; cleared with the commits
    Revealed  []bool    // replaces Submitted
    …
}
```

`TurnResult` is unchanged: the plans in clear, the seed, the cards, the
events. Replays and the history view do not change.

### Crossing functions

| Function | Caller | Does |
|---|---|---|
| `Commit(cur, id, hash, escrow string) int` | the seat (master or session) | phase `planning`, before D, character alive, not yet committed; `hash` 64 hex chars, `escrow` ≤ 1 KB; stores; when every alive seat has committed, phase `revealing` (event `AllCommitted`). Returns Rev |
| `Reveal(cur, id, seat int, salt, plan string) int` | anyone | phase `revealing` only (a reveal while planning would leak), seat committed and not revealed; sha256 matches; then exactly today's `SubmitPlan` checks (parse, validate, ground ids, targets, `PlayedFoot`/`PlayedRun`); stores plan and salt; when every seat is revealed, `resolveTurn` in the same tx. Returns Rev |
| `Surrender(cur, id)` | the seat | `planning` only; drops the seat's commit; as today otherwise |
| `ClaimTimeout(cur, id)` | anyone | see the clock above; a reveal-phase claim gives every unrevealed alive seat `Out` and the award `no_reveal` −8, then resolves with the plans in |
| `SubmitPlan` | | removed. A game created "open" (plans in clear, no secrecy, a lobby checkbox) could keep it: `Commit` of the empty hash plus an immediate reveal. Optional, not in the first cut |

The seed becomes `engine.Seed(realmPath, id, turn, salts…, plans…,
height, time)`: the salts make it unpredictable to every player when it
commits, the block keeps the outcome unknown to the last revealer.

Events: `PlanCommitted` (id, turn, seat), `AllCommitted`, `PlanRevealed`
(id, turn, seat, by), `PlanPassed`, `TurnResolved`, `VictoryPoints` with
reason `no_reveal`. JSON: `phase` gains `revealing`; each player gains
`committed`, `revealed` and `escrow`; the game gains `commitUntil`,
`revealUntil` and `escrowRound`; `json/plan/{id}/{addr}` shows the
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
  hash, escrow}` (WebCrypto sha256, tlock-js); `pendingReveals` in
  `localStorage`; `openEscrow(escrow, round)`.
- `chain/realm.ts`: `commit(id, hash, escrow)` watching
  `players[seat].committed`, `reveal(id, seat, salt, plan)` watching
  `players[seat].revealed` or the turn changing; the wallet is the
  session when there is one.
- `GameScene`: **Send plan** seals and commits; the header says
  "Committed 1 of 2", then "Revealing…"; on every poll, with the phase
  `revealing`: my pending reveal goes out; past `escrowRound`, every
  unrevealed seat with an escrow is opened and revealed (one tx at a
  time, as the realm client allows one in flight); without a session key
  the same steps show as buttons (an Adena popup each). The planning
  panel shows my plan from `localStorage` while waiting. **Claim** only
  shows once past `revealUntil` and after the escrows were tried.
- `ui/lobbyView.ts`: "Your move" from `committed`/`revealed`; the
  session key box in the top bar (create with a limit and a duration,
  the time left, revoke).
- `game/lobby.ts`, `chain/types.ts`: the new fields.

## Costs

| Item | Today | With hidden plans |
|---|---|---|
| Signatures a turn, a player | 1 Adena popup | 0 (session) or 2 (Adena) |
| Transactions a turn, a player | 1 | 2 |
| Storage a turn | ~2 KB, the turn's record | the same, plus ~0.5 KB a seat for commit and escrow, refunded at resolution |
| Turn latency, both online | the last plan | the last reveal, seconds after the last commit |
| Turn latency, a committer offline | n/a (the turn stalls until the claim) | D + 2 min, the plan still plays |

## Steps

1. Realm: `TurnStart` and the fixed deadlines, `Commit`, `Reveal`,
   `revealing`, `no_reveal`, the seed with salts; unit tests and
   filetests (a full turn, a reveal while planning refused, a wrong salt,
   a claim in each phase). Client: seal, commit, reveal through Adena.
   Playable with two popups a turn.
2. Client: session keys. Check first whether Adena signs
   `/auth.m_create_session` on gnodev; else the gnokey command in the
   lobby's help. The session signer, the fallback to Adena.
3. Client: the escrow (tlock-js), the realm's `escrowRound`, the opener
   logic, the Claim button gated behind it.
4. `AGENTS.md`, `bga/doc/ASSUMPTIONS.md`, `TODO.md`.

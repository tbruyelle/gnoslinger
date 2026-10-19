// Package gnoslinger is the on-chain lobby and referee of Gunslinger
// showdowns (the 1982 Avalon Hill gunfight game) of two to four players.
// Players create and join games and submit their turn plans; the realm
// resolves each turn with the pure engine package and keeps the result for
// the web client to animate.
package gnoslinger

import (
	"strconv"
	"time"

	"gno.land/p/nt/avl/v0"
	"gno.land/p/nt/seqid/v0"
	"gno.land/p/tbruyelle/gnoslinger/engine/v0"
	profiles "gno.land/r/tbruyelle/gnoslinger/profiles/v0"
)

const (
	realmPath = "gno.land/r/tbruyelle/gnoslinger/v0"

	// DefaultTimeout is how long a turn may sit without progress before
	// anyone can call ClaimTimeout on it, when CreateGame gets 0.
	DefaultTimeout = 48 * time.Hour
	// MinTimeout and MaxTimeout bound the timeout a creator may pick.
	MinTimeout = 5 * time.Minute
	MaxTimeout = 30 * 24 * time.Hour
	// MinMaxTurns and MaxMaxTurns bound the game length.
	MinMaxTurns = 10
	MaxMaxTurns = 30
	// MaxMissed is the turns in a row a player may let time out: each is
	// passed for it, the last puts its character out of the fight.
	MaxMissed = 3
)

// Phase is where a game stands.
type Phase int

const (
	// PhaseWaiting: the seats are filling up.
	PhaseWaiting Phase = iota
	// PhasePlanning: every seat taken; collecting the plans of the current turn.
	PhasePlanning
	// PhaseFinished: over, see Game.EndReason.
	PhaseFinished
)

// String returns the phase name used in JSON views.
func (p Phase) String() string {
	switch p {
	case PhaseWaiting:
		return "waiting"
	case PhasePlanning:
		return "planning"
	case PhaseFinished:
		return "finished"
	}
	return "?"
}

// Player is a seat: the address that controls it (empty while nobody took
// it) and its character token.
type Player struct {
	Addr address
	Char string
}

// TurnResult is the outcome of one resolved turn, kept so the client can
// replay it: the state the turn started from, the plans (one per seat),
// and what happened. Seed lets anyone re-run the resolution; Cards is the
// trace of the result cards drawn from the deck it shuffles, in order. The
// start snapshot, the cards and the events are kept in the engine's compact
// text encodings: as structs they cost a hundred times more storage (see
// engine/encode.gno).
type TurnResult struct {
	Turn      int
	Plans     []string
	Seed      string
	StartEnc  string // engine.EncodeChars
	CardsEnc  string // engine.EncodeInts
	EventsEnc string // engine.EncodeEvents
}

func newTurnResult(turn int, start []engine.Character, plans []string, seed string, cards []int, evs []engine.Event) *TurnResult {
	return &TurnResult{Turn: turn, Plans: plans, Seed: seed, StartEnc: engine.EncodeChars(start), CardsEnc: engine.EncodeInts(cards), EventsEnc: engine.EncodeEvents(evs)}
}

// Start is the state of every seat when the turn began.
func (r *TurnResult) Start() []engine.Character { return engine.DecodeChars(r.StartEnc) }

// Cards is the result cards drawn during the turn, in order.
func (r *TurnResult) Cards() []int { return engine.DecodeInts(r.CardsEnc) }

// Events is what happened during the turn, in order.
func (r *TurnResult) Events() []engine.Event { return engine.DecodeEvents(r.EventsEnc) }

// Game is one showdown. Players, Plans, Submitted, Missed and VP have one entry
// per seat, the seats filling up in the order the players join.
type Game struct {
	ID        string
	Players   []Player
	State     engine.State
	Turn      int // 1-based
	MaxTurns  int
	Timeout   time.Duration // the time a turn gives, from TurnStart, after which ClaimTimeout succeeds
	Phase     Phase
	Plans     []string // current turn, canonical form
	Submitted []bool
	Missed    []int         // turns in a row each seat let time out, reset by a plan
	TurnStart time.Time     // when the turn in progress started: its clock, left alone by the saves within the turn
	Turns     []*TurnResult // resolved turns, in order (at most MaxTurns)
	Winner    int           // seat index, -1 for none: the most victory points, -1 on a tie
	EndReason string
	// Awards are the victory points earned and lost so far (rule 15), at
	// the end of each turn and of the showdown; VP adds them up per seat.
	Awards    []engine.Award
	VP        []int
	Rev       int // bumped on every change; clients poll it
	CreatedAt time.Time
	UpdatedAt time.Time
}

var (
	games     = avl.NewTree() // id -> *Game
	gameSeq   seqid.ID
	byPlayer  = avl.NewTree() // address -> []string game ids, newest first
	openGames = avl.NewTree() // id -> *Game while a seat is free
)

func getGame(id string) *Game {
	if _, err := seqid.FromString(id); err != nil {
		panic("gnoslinger: invalid game id")
	}
	v := games.Get(id)
	if v == nil {
		panic("gnoslinger: game not found")
	}
	return v.(*Game)
}

// seats is the number of seats of the game, taken or not.
func (g *Game) seats() int { return len(g.Players) }

// seat returns the seat of addr in g, or -1.
func (g *Game) seat(addr address) int {
	for i, p := range g.Players {
		if p.Addr == addr && p.Addr != "" {
			return i
		}
	}
	return -1
}

func (g *Game) mustSeat(addr address) int {
	p := g.seat(addr)
	if p < 0 {
		panic("gnoslinger: you are not a player of this game")
	}
	return p
}

// freeSeat is the first seat nobody took, -1 once every seat is taken.
func (g *Game) freeSeat() int {
	for i, p := range g.Players {
		if p.Addr == "" {
			return i
		}
	}
	return -1
}

// seated counts the seats taken.
func (g *Game) seated() int {
	n := 0
	for _, p := range g.Players {
		if p.Addr != "" {
			n++
		}
	}
	return n
}

// allIn reports whether the turn has every plan it waits for: one from
// each character still in the fight.
func (g *Game) allIn() bool {
	for p := range g.Players {
		if g.State.Chars[p].Status == engine.Alive && !g.Submitted[p] {
			return false
		}
	}
	return true
}

// lastTurn is the most recently resolved turn, or nil.
func (g *Game) lastTurn() *TurnResult {
	if len(g.Turns) == 0 {
		return nil
	}
	return g.Turns[len(g.Turns)-1]
}

// timeoutAt is when the turn in progress becomes claimable through
// ClaimTimeout, Timeout after its start whatever happened since (a plan
// sent does not restart it); a game waiting for players has no timeout.
func (g *Game) timeoutAt() time.Time { return g.TurnStart.Add(g.Timeout) }

// startTurn starts the turn's clock.
func (g *Game) startTurn() { g.TurnStart = time.Now() }

// assertInTime refuses a plan once the turn is claimable:
// past timeoutAt it can only be claimed (ClaimTimeout), so playing late
// cannot turn a lost game around, nor win it by claiming right after.
func (g *Game) assertInTime() {
	if !time.Now().Before(g.timeoutAt()) {
		panic("gnoslinger: out of time: the game can only be claimed now")
	}
}

// award records victory points (rule 15): each award is a VictoryPoints
// event, adds to the seat's total and to the player's profile (in the
// profiles realm, which cur, the crossing call's, gets to write).
func (g *Game) award(cur realm, awards []engine.Award) {
	for _, a := range awards {
		g.Awards = append(g.Awards, a)
		g.VP[a.Player] += a.Points
		emit("VictoryPoints", "id", g.ID, "seat", strconv.Itoa(a.Player), "player", g.Players[a.Player].Addr.String(),
			"reason", a.Reason, "points", strconv.Itoa(a.Points))
		profiles.AddVictoryPoints(cross(cur), g.Players[a.Player].Addr, a.Points)
	}
}

// finish ends the game: the most victory points win, a tie for the most (a
// game nobody played included) being a draw.
func (g *Game) finish(reason string) {
	g.Phase = PhaseFinished
	g.EndReason = reason
	g.Winner = -1
	best, tie := 0, false
	for p, v := range g.VP {
		switch {
		case g.Winner < 0 || v > best:
			g.Winner, best, tie = p, v, false
		case v == best:
			tie = true
		}
	}
	if tie {
		g.Winner = -1
	}
	w := ""
	if g.Winner >= 0 {
		w = g.Players[g.Winner].Addr.String()
	}
	emit("GameEnded", "id", g.ID, "reason", reason, "winner", w)
}

// save records a change: bumps the revision and the activity clock.
func save(g *Game) {
	g.Rev++
	g.UpdatedAt = time.Now()
	games.Set(g.ID, g)
}

func index(addr address, id string) {
	var ids []string
	if v := byPlayer.Get(addr.String()); v != nil {
		ids = v.([]string)
	}
	byPlayer.Set(addr.String(), append([]string{id}, ids...))
}

// unindex removes id from addr's games, and addr from byPlayer once it has
// none left.
func unindex(addr address, id string) {
	v := byPlayer.Get(addr.String())
	if v == nil {
		return
	}
	var ids []string
	for _, x := range v.([]string) {
		if x != id {
			ids = append(ids, x)
		}
	}
	if len(ids) == 0 {
		byPlayer.Remove(addr.String())
		return
	}
	byPlayer.Set(addr.String(), ids)
}

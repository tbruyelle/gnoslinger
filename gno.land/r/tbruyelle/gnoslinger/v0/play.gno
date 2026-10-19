package gnoslinger

import (
	"chain/runtime"
	enchex "encoding/hex"
	"strconv"
	"time"

	"gno.land/p/tbruyelle/gnoslinger/cards/v0"
	"gno.land/p/tbruyelle/gnoslinger/engine/v0"
	"gno.land/p/tbruyelle/gnoslinger/hex/v0"
)

// SubmitPlan commits the caller's ordered action stack for the current turn
// and returns the game revision. The plan string is a comma-separated list of
// "<card><f|b>[:<direction>]" entries, e.g. "1f:ahead_left,2f:ahead,3f"; an
// empty string passes. Once every character still in the fight has a plan
// in, the turn resolves in this same transaction and the next turn starts.
func SubmitPlan(cur realm, id string, plan string) int {
	caller := cur.Previous().Address()
	g := getGame(id)
	if g.Phase != PhasePlanning {
		panic("gnoslinger: game is not accepting plans")
	}
	g.assertInTime()
	p := g.mustSeat(caller)
	if g.State.Chars[p].Status != engine.Alive {
		panic("gnoslinger: your character is out of the fight")
	}
	if g.Submitted[p] {
		panic("gnoslinger: plan already submitted for this turn")
	}
	pl, err := engine.ParsePlan(plan)
	if err != nil {
		panic("gnoslinger: " + err.Error())
	}
	if err := pl.Validate(g.State.Chars[p]); err != nil {
		panic("gnoslinger: " + err.Error())
	}
	for _, a := range pl {
		if a.Ground > 0 && !groundExists(g.State, a.Ground) {
			panic("gnoslinger: there is no such weapon on the ground")
		}
		if a.Target >= g.seats() {
			panic("gnoslinger: there is no character @" + strconv.Itoa(a.Target) + " in this game")
		}
		if a.Target == p {
			panic("gnoslinger: you cannot " + a.Opt + " at your own character")
		}
	}
	// Target-status flags for this turn, set whether or not the actions
	// end up executing ([H12]).
	g.State.Chars[p].PlayedFoot = pl.PlayedFoot()
	g.State.Chars[p].PlayedRun = pl.Has(cards.Run)
	g.Plans[p] = pl.String()
	g.Submitted[p] = true
	g.Missed[p] = 0

	turn := g.Turn
	resolved := g.allIn()
	var seed string
	if resolved {
		seed = resolveTurn(cur, g)
	}
	autoPass(cur, g)
	save(g)
	emit("PlanSubmitted", "id", id, "turn", strconv.Itoa(turn), "player", caller.String(), "seat", strconv.Itoa(p))
	if resolved {
		emit("TurnResolved", "id", id, "turn", strconv.Itoa(turn), "rev", strconv.Itoa(g.Rev), "seed", seed)
	}
	return g.Rev
}

// autoPass passes the turn for every player who cannot play anything (a
// carried delay of 5 or more leaves no time points, rule 7.3): there is
// nothing to wait for from them. When nobody is left to wait for, the turn
// resolves at once, and so on while that lasts.
func autoPass(cur realm, g *Game) {
	for g.Phase == PhasePlanning {
		for p := range g.Players {
			c := &g.State.Chars[p]
			if c.Status != engine.Alive || g.Submitted[p] || g.State.Budget(p) > 0 {
				continue
			}
			c.PlayedFoot = false
			c.PlayedRun = false
			g.Plans[p] = ""
			g.Submitted[p] = true
			emit("PlanPassed", "id", g.ID, "turn", strconv.Itoa(g.Turn), "seat", strconv.Itoa(p))
		}
		if !g.allIn() {
			return
		}
		turn := g.Turn
		seed := resolveTurn(cur, g)
		emit("TurnResolved", "id", g.ID, "turn", strconv.Itoa(turn), "rev", strconv.Itoa(g.Rev+1), "seed", seed)
	}
}

// resolveTurn plays the seats' plans with the result deck shuffled from
// this turn's seed, stores the result and advances the game. It returns the
// seed in hex.
func resolveTurn(cur realm, g *Game) string {
	n := g.seats()
	parts := append([]string{realmPath, g.ID, strconv.Itoa(g.Turn)}, g.Plans...)
	parts = append(parts, strconv.FormatInt(runtime.ChainHeight(), 10), strconv.FormatInt(time.Now().UnixNano(), 10))
	seed := engine.Seed(parts...)
	plans := make([]engine.Plan, n)
	for i, s := range g.Plans {
		pl, err := engine.ParsePlan(s)
		if err != nil {
			panic("gnoslinger: stored plan is invalid: " + err.Error())
		}
		plans[i] = pl
	}
	// From a copy: the live state may share the characters with what the
	// engine returns (see engine.CloneChars).
	start := engine.CloneChars(g.State.Chars)
	deck := engine.NewDeck(seed)
	st, evs := engine.Resolve(hex.A, g.State, plans, deck)
	st, endEvs := engine.EndTurn(st)
	evs = append(evs, endEvs...)
	if g.Turn >= g.MaxTurns && engine.AliveCount(st) > 1 { // the end-of-showdown SERIOUS wound check (14.5)
		st, endEvs = engine.EndShowdown(st, deck)
		evs = append(evs, endEvs...)
	}
	// Victory points close the turn: what it did, then, when the showdown
	// ends with it, the end of the showdown (rule 15).
	over := engine.AliveCount(st) <= 1 || g.Turn >= g.MaxTurns
	awards := engine.TurnVictoryPoints(engine.State{Chars: start}, st)
	if over {
		awards = append(awards, engine.EndVictoryPoints(st)...)
	}
	evs = append(evs, engine.VPEvents(awards)...)
	seedHex := enchex.EncodeToString(seed[:])
	g.Turns = append(g.Turns, newTurnResult(g.Turn, start, g.Plans, seedHex, deck.Drawn(), evs))
	g.State = st
	g.award(cur, awards)
	g.Plans = make([]string, n)
	g.Submitted = make([]bool, n)
	switch {
	case engine.AliveCount(g.State) == 0:
		g.finish("all_down")
	case engine.AliveCount(g.State) == 1:
		g.finish("last_standing")
	case g.Turn >= g.MaxTurns:
		g.finish("max_turns")
	default:
		g.Turn++
		g.startTurn()
	}
	return seedHex
}

// groundExists reports whether a gun with that ground id lies somewhere on
// the board; whether it is in the character's hex is checked when the
// action executes, since the character may walk to it first.
func groundExists(st engine.State, id int) bool {
	for _, gg := range st.Ground {
		if gg.ID == id {
			return true
		}
	}
	return false
}

// Surrender gives up the showdown (rule 15.4: at the start of a turn, that
// is while the plans are collected). The character is Out: nobody can
// shoot it and it plays no more. With one character left in the fight the
// game ends and is scored, the surrendered losing the "Surrender" points
// and, an enemy holding the field, being captured; with more, the showdown
// goes on without it, and the turn resolves if the others' plans are in.
func Surrender(cur realm, id string) {
	caller := cur.Previous().Address()
	g := getGame(id)
	if g.Phase != PhasePlanning {
		panic("gnoslinger: game is not in progress")
	}
	p := g.mustSeat(caller)
	if g.State.Chars[p].Status != engine.Alive {
		panic("gnoslinger: your character is out of the fight")
	}
	g.State.Chars[p].Status = engine.Out
	emit("PlayerSurrendered", "id", id, "turn", strconv.Itoa(g.Turn), "player", caller.String(), "seat", strconv.Itoa(p))
	if engine.AliveCount(g.State) <= 1 {
		g.award(cur, engine.EndVictoryPoints(g.State))
		g.finish("surrender")
	} else {
		g.Plans[p] = ""
		g.Submitted[p] = false
		autoPass(cur, g)
	}
	save(g)
}

// ClaimTimeout ends the wait of a turn that saw no progress for the game's
// Timeout. Anyone may call it. A game waiting for players has no timeout
// (its creator may cancel it); when nobody sent a plan, the game is
// abandoned; otherwise each player who did not misses
// the turn: it is passed for them, unless that makes MaxMissed in a row,
// which puts the character out of the fight (out of time counts as
// surrendering). With one character left the game ends and is scored,
// with more the turn resolves with the plans in and the showdown goes on.
func ClaimTimeout(cur realm, id string) {
	g := getGame(id)
	switch g.Phase {
	case PhaseFinished:
		panic("gnoslinger: game is finished")
	case PhaseWaiting:
		panic("gnoslinger: the game is waiting for players: it has no timeout")
	}
	if time.Now().Before(g.timeoutAt()) {
		panic("gnoslinger: the game has not timed out yet")
	}
	if !anySubmitted(g) {
		g.finish("abandoned")
	} else {
		for p := range g.Players {
			c := &g.State.Chars[p]
			if c.Status != engine.Alive || g.Submitted[p] {
				continue
			}
			g.Missed[p]++
			emit("PlanMissed", "id", id, "turn", strconv.Itoa(g.Turn), "seat", strconv.Itoa(p), "missed", strconv.Itoa(g.Missed[p]))
			if g.Missed[p] >= MaxMissed {
				c.Status = engine.Out
				continue
			}
			c.PlayedFoot = false
			c.PlayedRun = false
			g.Plans[p] = ""
			g.Submitted[p] = true
		}
		if engine.AliveCount(g.State) <= 1 {
			g.award(cur, engine.EndVictoryPoints(g.State))
			g.finish("timeout")
		} else {
			autoPass(cur, g)
		}
	}
	save(g)
}

// anySubmitted reports whether a plan came in this turn.
func anySubmitted(g *Game) bool {
	for _, s := range g.Submitted {
		if s {
			return true
		}
	}
	return false
}

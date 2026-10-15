package engine

import (
	"strconv"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

// showdown scores a showdown that ends in the given state, from a start
// where both characters were up: what the last turn did, then the end.
func showdown(s State) []Award {
	return append(TurnVictoryPoints(startState(), s), EndVictoryPoints(s)...)
}

// endState is the starting state with the given statuses and endurances.
func endState(s0, s1 Status, e0, e1 int) State {
	s := startState()
	s.Chars[0].Status, s.Chars[0].Endurance = s0, e0
	s.Chars[1].Status, s.Chars[1].Endurance = s1, e1
	return s
}

func awardsString(awards []Award) string {
	out := ""
	for _, a := range awards {
		out += " " + string(rune('0'+a.Player)) + ":" + a.Reason
	}
	return out
}

func totals(awards []Award) string {
	t := VPTotals(awards)
	return strconv.Itoa(t[0]) + " " + strconv.Itoa(t[1])
}

func TestVictoryPoints_BothSurvive(t *testing.T) {
	a := showdown(endState(Alive, Alive, 12, StartEndurance))
	uassert.Equal(t, " 0:survive 1:survive", awardsString(a))
	uassert.Equal(t, "2 2", totals(a))
}

func TestVictoryPoints_Killed(t *testing.T) {
	a := showdown(endState(Killed, Alive, 3, StartEndurance))
	uassert.Equal(t, " 0:killed 1:kill_enemy 1:survive 1:hold_field", awardsString(a))
	uassert.Equal(t, "-8 6", totals(a))
}

func TestVictoryPoints_PassedOut(t *testing.T) {
	// Knocked out by the enemy's wounds, then captured by the one holding the field.
	a := showdown(endState(Alive, PassedOut, StartEndurance, 4))
	uassert.Equal(t, " 0:knock_out_enemy 0:survive 0:hold_field 1:captured", awardsString(a))
	uassert.Equal(t, "5 -4", totals(a))

	// Passed out of fatigue alone: nobody knocked him out.
	a = showdown(endState(Alive, PassedOut, StartEndurance, StartEndurance))
	uassert.Equal(t, "4 -4", totals(a))
}

func TestVictoryPoints_Surrender(t *testing.T) {
	a := showdown(endState(Out, Alive, StartEndurance, 15))
	uassert.Equal(t, " 0:surrender 0:captured 1:survive 1:hold_field", awardsString(a))
	uassert.Equal(t, "-6 4", totals(a))

	// Wounded first: the enemy also knocked him out (15.41).
	a = showdown(endState(Out, Alive, 9, StartEndurance))
	uassert.Equal(t, "-6 5", totals(a))
}

func TestVictoryPoints_NobodyStands(t *testing.T) {
	// Nobody holds the field, so nobody is captured.
	a := showdown(endState(Killed, PassedOut, 0, 2))
	uassert.Equal(t, " 0:killed 1:kill_enemy 0:knock_out_enemy", awardsString(a))
	uassert.Equal(t, "-7 2", totals(a))
}

func TestTurnVictoryPoints_OnlyWhatTheTurnDid(t *testing.T) {
	// Already passed out before the turn: nothing new to score.
	before := endState(Alive, PassedOut, StartEndurance, 4)
	after := endState(Alive, PassedOut, StartEndurance, 4)
	uassert.Equal(t, 0, len(TurnVictoryPoints(before, after)))
	uassert.Equal(t, 0, len(TurnVictoryPoints(startState(), startState())))
}

func TestVPEvents(t *testing.T) {
	evs := VPEvents([]Award{award(1, VPKilled), award(0, VPKill)})
	uassert.Equal(t, 2, len(evs))
	uassert.Equal(t, EvVP, evs[0].Kind)
	uassert.Equal(t, EndOfTurn, evs[0].Seg)
	uassert.Equal(t, 1, evs[0].Player)
	uassert.Equal(t, -8, evs[0].N)
	uassert.Equal(t, VPKilled, evs[0].Reason)
	// They survive the turn record's encoding.
	back := DecodeEvents(EncodeEvents(evs))
	uassert.Equal(t, -8, back[0].N)
	uassert.Equal(t, VPKill, back[1].Reason)
}

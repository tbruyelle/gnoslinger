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

// endState is the starting state with the given statuses and endurances,
// every box crossed off by the other seat, who also did the killing.
func endState(s0, s1 Status, e0, e1 int) State {
	s := startState()
	s.Chars[0].Status, s.Chars[0].Endurance = s0, e0
	s.Chars[1].Status, s.Chars[1].Endurance = s1, e1
	s.Chars[0].Hurt[1] = StartEndurance - e0
	s.Chars[1].Hurt[0] = StartEndurance - e1
	for p := range s.Chars {
		if s.Chars[p].Status == Killed {
			s.Chars[p].KilledBy = 1 - p
		}
	}
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
	out := ""
	for i, v := range VPTotals(awards, 2) {
		if i > 0 {
			out += " "
		}
		out += strconv.Itoa(v)
	}
	return out
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

func TestVictoryPoints_FourSeats(t *testing.T) {
	// Seat 2 killed seat 1; seat 3 surrendered after seat 0 wounded it the
	// most; seats 0 and 2 both survive, so nobody holds the field and the
	// surrendered one is not captured.
	s := fourState()
	s.Chars[1].Status, s.Chars[1].Endurance, s.Chars[1].KilledBy = Killed, 0, 2
	s.Chars[1].Hurt = [MaxPlayers]int{3, 0, 17, 0}
	s.Chars[3].Status, s.Chars[3].Endurance = Out, 12
	s.Chars[3].Hurt = [MaxPlayers]int{5, 0, 3, 0}
	a := append(TurnVictoryPoints(fourState(), s), EndVictoryPoints(s)...)
	uassert.Equal(t, " 1:killed 2:kill_enemy 0:survive 2:survive 3:surrender 0:knock_out_enemy", awardsString(a))
	totals := VPTotals(a, 4)
	uassert.Equal(t, "3 -8 4 -2", strconv.Itoa(totals[0])+" "+strconv.Itoa(totals[1])+" "+strconv.Itoa(totals[2])+" "+strconv.Itoa(totals[3]))

	// The last one standing holds the field: the others are captured.
	s.Chars[2].Status, s.Chars[2].Hurt = PassedOut, [MaxPlayers]int{4, 0, 0, 4} // a tie goes to the first seat
	a = append(TurnVictoryPoints(fourState(), s), EndVictoryPoints(s)...)
	uassert.Equal(t, " 1:killed 2:kill_enemy 0:knock_out_enemy 0:survive 0:hold_field 2:captured 3:surrender 0:knock_out_enemy 3:captured", awardsString(a))

	// A death nobody caused (KilledBy NoSeat) gives no kill.
	s = fourState()
	s.Chars[0].Status, s.Chars[0].KilledBy = Killed, NoSeat
	uassert.Equal(t, " 0:killed", awardsString(TurnVictoryPoints(fourState(), s)))
	// Passing out with no box crossed off by anyone: no knock out.
	s = fourState()
	s.Chars[0].Status = PassedOut
	uassert.Equal(t, "", awardsString(TurnVictoryPoints(fourState(), s)))
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

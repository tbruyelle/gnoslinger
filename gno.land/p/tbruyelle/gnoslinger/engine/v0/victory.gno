package engine

// Victory point awards (rule 15), for showdowns where each character is a
// side of its own: there are no allies (no "Ally killed"), moving off the
// board is cancelled (no "Run away"), and no special rule captures or kills
// anyone.
const (
	VPSurvive   = "survive"         // +2: conscious and unsurrendered at the end (15.62)
	VPHoldField = "hold_field"      // +2: the only side with survivors (15.63)
	VPSurrender = "surrender"       // -2 (15.41)
	VPCaptured  = "captured"        // -4: passed out or surrendered when the enemy holds the field (15.63, 15.7)
	VPKilled    = "killed"          // -8 (15.2)
	VPKill      = "kill_enemy"      // +2: the enemy who killed him (15.2)
	VPKnockOut  = "knock_out_enemy" // +1: the enemy who crossed off most of his endurance boxes (15.3, 15.41)
)

// VPPoints is what each award is worth (the VICTORY POINTS schedule, 15.11).
// Passing out is worth 0 and makes no award.
var VPPoints = map[string]int{
	VPSurvive:   2,
	VPHoldField: 2,
	VPSurrender: -2,
	VPCaptured:  -4,
	VPKilled:    -8,
	VPKill:      2,
	VPKnockOut:  1,
}

// Award is victory points a character earns (Points > 0) or loses.
type Award struct {
	Player int
	Reason string // one of the VP* names
	Points int
}

// TurnVictoryPoints scores what a turn did, from the characters before and
// after it: a character killed loses the "Killed" points and the enemy
// gets "Kill enemy" (15.2); one who passed out gets nothing and the enemy
// "Knock out enemy" when it crossed off endurance boxes (15.3). With two
// characters the enemy is the other one, and every endurance box crossed
// off was crossed off by it (wounds and their fatigue). A character who is
// not up cannot be hit, so a knocked-out one is never killed afterwards.
func TurnVictoryPoints(before, after State) []Award {
	var out []Award
	for p, c := range after.Chars {
		if before.Chars[p].Status != Alive {
			continue
		}
		enemy := 1 - p
		switch c.Status {
		case Killed:
			out = append(out, award(p, VPKilled), award(enemy, VPKill))
		case PassedOut:
			if c.Endurance < StartEndurance {
				out = append(out, award(enemy, VPKnockOut))
			}
		}
	}
	return out
}

// EndVictoryPoints scores the end of the showdown (15.6): a character still
// up survives, and holds the field when it is the only one (15.62, 15.63);
// Out stands for a surrendered character, who loses the "Surrender" points
// and, like passing out, gives the enemy "Knock out enemy" when it crossed
// off endurance boxes (15.41); passed out or surrendered, a character is
// captured when the enemy holds the field (15.63, 15.7).
func EndVictoryPoints(s State) []Award {
	var out []Award
	survivors := AliveCount(s)
	for p, c := range s.Chars {
		enemy := 1 - p
		holds := survivors == 1 && s.Chars[enemy].Status == Alive
		switch c.Status {
		case Alive:
			out = append(out, award(p, VPSurvive))
			if survivors == 1 {
				out = append(out, award(p, VPHoldField))
			}
		case Out:
			out = append(out, award(p, VPSurrender))
			if c.Endurance < StartEndurance {
				out = append(out, award(enemy, VPKnockOut))
			}
			if holds {
				out = append(out, award(p, VPCaptured))
			}
		case PassedOut:
			if holds {
				out = append(out, award(p, VPCaptured))
			}
		}
	}
	return out
}

func award(p int, reason string) Award {
	return Award{Player: p, Reason: reason, Points: VPPoints[reason]}
}

// VPEvents are the awards as end-of-turn events of the turn's log.
func VPEvents(awards []Award) []Event {
	evs := make([]Event, 0, len(awards))
	for _, a := range awards {
		evs = append(evs, Event{Seg: EndOfTurn, Player: a.Player, Kind: EvVP, N: a.Points, Reason: a.Reason})
	}
	return evs
}

// VPTotals adds the awards up per character.
func VPTotals(awards []Award) [NumPlayers]int {
	var t [NumPlayers]int
	for _, a := range awards {
		t[a.Player] += a.Points
	}
	return t
}

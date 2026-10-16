package engine

import (
	"testing"

	"gno.land/p/tbruyelle/gnoslinger/hex/v0"
)

// startState is the setup the tests play from: seat 0 at A-F3 facing
// south, seat 1 at A-F9 facing north, six hexes apart inside the corral.
func startState() State {
	s := NewState(2)
	s.SetUp(0, "A-F3", hex.S)
	s.SetUp(1, "A-F9", hex.N)
	return s
}

// fourState is a four-seat set up: the two of startState, then seat 2 at
// A-H6 facing south-west and seat 3 at A-D6 facing north-east.
func fourState() State {
	s := NewState(4)
	s.SetUp(0, "A-F3", hex.S)
	s.SetUp(1, "A-F9", hex.N)
	s.SetUp(2, "A-H6", hex.SW)
	s.SetUp(3, "A-D6", hex.NE)
	return s
}

func TestNewStateIsUnplaced(t *testing.T) {
	for _, n := range []int{2, 3, 4} {
		s := NewState(n)
		if len(s.Chars) != n || AliveCount(s) != n {
			t.Errorf("NewState(%d) has %d characters, %d alive", n, len(s.Chars), AliveCount(s))
		}
		for p, c := range s.Chars {
			if c.Hex != "" || c.Down || c.Status != Alive || c.Endurance != StartEndurance || len(c.Guns) == 0 || c.Guns[0].Location != Holstered || c.Guns[0].Shells != 6 {
				t.Errorf("seat %d = %+v", p, c)
			}
			if c.AimAt != NoSeat || c.KilledBy != NoSeat || c.SeriousBy != NoSeat || c.LegBy != NoSeat {
				t.Errorf("seat %d names a seat: %+v", p, c)
			}
		}
	}
}

func TestSetUp(t *testing.T) {
	s := NewState(2)
	s.Chars[1].Down = true
	s.SetUp(0, "A-G5", hex.NE)
	s.SetUp(1, "A-E8", hex.NW)
	if s.Chars[0].Hex != "A-G5" || s.Chars[0].Facing != hex.NE || s.Chars[1].Hex != "A-E8" || s.Chars[1].Facing != hex.NW || s.Chars[1].Down {
		t.Errorf("state = %+v", s.Chars)
	}
	// The sheet is untouched.
	if s.Chars[0].Guns[0].Location != Holstered || s.Chars[0].Endurance != StartEndurance {
		t.Errorf("sheet changed: %+v", s.Chars[0])
	}
}

func TestSetups(t *testing.T) {
	if got := ShowdownChars(); len(got) != MaxPlayers || got[0] != "marshal" || got[1] != "the_kid" || got[2] != "el_jefe" || got[3] != "axe" {
		t.Errorf("ShowdownChars() = %v", got)
	}
	if SeatChar(0) != "marshal" || SeatChar(3) != "axe" || SeatChar(4) != "" || SeatChar(-1) != "" {
		t.Error("SeatChar")
	}
	// Every hex assigned is a hex of board A, not an obstacle, assigned to one character only.
	seen := map[string]string{}
	for _, s := range Setups {
		if !IsCharKey(s.Char) || !s.Facing.Valid() || len(s.Hexes) == 0 {
			t.Errorf("setup %+v", s)
		}
		for _, h := range s.Hexes {
			if !hex.A.Has(h) || hex.A.Obstacle(h) {
				t.Errorf("%s sets up in %s, which is no hex to stand in", s.Char, h)
			}
			if other, ok := seen[h]; ok {
				t.Errorf("%s is assigned to %s and %s", h, other, s.Char)
			}
			seen[h] = s.Char
		}
	}
	if s := SetupOf("marshal"); s == nil || s.Facing != hex.NW || len(s.Hexes) != 5 || s.Hexes[0] != "A-G5" || s.Hexes[4] != "A-G9" {
		t.Errorf("SetupOf(marshal) = %+v", s)
	}
	if s := SetupOf("the_kid"); s == nil || s.Facing != hex.SE || len(s.Hexes) != 5 || s.Hexes[0] != "A-E5" || s.Hexes[4] != "A-E9" {
		t.Errorf("SetupOf(the_kid) = %+v", s)
	}
	if s := SetupOf("el_jefe"); s == nil || s.Facing != hex.NW || len(s.Hexes) != 5 || s.Hexes[0] != "A-I5" || s.Hexes[4] != "A-I9" {
		t.Errorf("SetupOf(el_jefe) = %+v", s)
	}
	if s := SetupOf("axe"); s == nil || s.Facing != hex.SE || len(s.Hexes) != 5 || s.Hexes[0] != "A-C5" || s.Hexes[4] != "A-C9" {
		t.Errorf("SetupOf(axe) = %+v", s)
	}
	if SetupOf("dude") != nil || SetupOf("") != nil {
		t.Error("characters outside the showdown have no set up")
	}
}

func TestCanSetUp(t *testing.T) {
	for _, tt := range []struct {
		char string
		id   string
		ok   bool
	}{
		{"marshal", "A-G5", true}, {"marshal", "A-G7", true}, {"marshal", "A-G9", true},
		{"marshal", "A-G4", false}, {"marshal", "A-G10", false}, {"marshal", "A-E7", false}, {"marshal", "A-F3", false},
		{"the_kid", "A-E5", true}, {"the_kid", "A-E9", true},
		{"the_kid", "A-G7", false}, {"the_kid", "A-E4", false}, {"the_kid", "A-F9", false},
		{"el_jefe", "A-I7", true}, {"el_jefe", "A-I4", false}, {"axe", "A-C9", true}, {"axe", "A-C10", false},
		{"dude", "A-G7", false}, {"marshal", "", false}, {"marshal", "A-Z9", false},
	} {
		if got := CanSetUp(tt.char, tt.id); got != tt.ok {
			t.Errorf("CanSetUp(%q, %q) = %v, want %v", tt.char, tt.id, got, tt.ok)
		}
	}
}

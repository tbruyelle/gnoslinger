package engine

import (
	"testing"

	"gno.land/p/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/hex/v0"
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
			if c.AimAt != NoSeat || c.Killers != ([MaxPlayers]bool{}) || c.SeriousFrom != ([MaxPlayers]int{}) || c.LegFrom != ([MaxPlayers]int{}) {
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
	if got := ShowdownChars(); len(got) != MaxPlayers || got[0] != "marshal" || got[1] != "the_kid" || got[2] != "reb" || got[3] != "yankee" {
		t.Errorf("ShowdownChars() = %v", got)
	}
	if SeatChar(0) != "marshal" || SeatChar(3) != "yankee" || SeatChar(4) != "" || SeatChar(-1) != "" {
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
	if s := SetupOf("marshal"); s == nil || s.Facing != hex.SE || len(s.Hexes) != 5 || s.Hexes[0] != "A-D5" || s.Hexes[2] != "A-D7" || s.Hexes[4] != "A-E7" {
		t.Errorf("SetupOf(marshal) = %+v", s)
	}
	if s := SetupOf("the_kid"); s == nil || s.Facing != hex.NW || len(s.Hexes) != 5 || s.Hexes[0] != "A-H5" || s.Hexes[2] != "A-H7" || s.Hexes[4] != "A-G7" {
		t.Errorf("SetupOf(the_kid) = %+v", s)
	}
	if s := SetupOf("reb"); s == nil || s.Facing != hex.N || len(s.Hexes) != 4 || s.Hexes[0] != "A-E8" || s.Hexes[1] != "A-F7" || s.Hexes[3] != "A-G8" {
		t.Errorf("SetupOf(reb) = %+v", s)
	}
	if s := SetupOf("yankee"); s == nil || s.Facing != hex.S || len(s.Hexes) != 4 || s.Hexes[0] != "A-E5" || s.Hexes[2] != "A-F4" || s.Hexes[3] != "A-G5" {
		t.Errorf("SetupOf(yankee) = %+v", s)
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
		{"marshal", "A-D5", true}, {"marshal", "A-D6", true}, {"marshal", "A-D7", true}, {"marshal", "A-E6", true}, {"marshal", "A-E7", true},
		{"marshal", "A-D4", false}, {"marshal", "A-D8", false}, {"marshal", "A-E5", false}, {"marshal", "A-H6", false}, {"marshal", "A-F3", false},
		{"the_kid", "A-H5", true}, {"the_kid", "A-H7", true}, {"the_kid", "A-G6", true}, {"the_kid", "A-G7", true},
		{"the_kid", "A-D6", false}, {"the_kid", "A-H4", false}, {"the_kid", "A-H8", false}, {"the_kid", "A-G5", false},
		{"reb", "A-F7", true}, {"reb", "A-F8", true}, {"reb", "A-G8", true}, {"reb", "A-F6", false}, {"reb", "A-G7", false},
		{"yankee", "A-E5", true}, {"yankee", "A-F5", true}, {"yankee", "A-F4", true}, {"yankee", "A-F6", false}, {"yankee", "A-E6", false},
		{"dude", "A-D6", false}, {"marshal", "", false}, {"marshal", "A-Z9", false},
	} {
		if got := CanSetUp(tt.char, tt.id); got != tt.ok {
			t.Errorf("CanSetUp(%q, %q) = %v, want %v", tt.char, tt.id, got, tt.ok)
		}
	}
}

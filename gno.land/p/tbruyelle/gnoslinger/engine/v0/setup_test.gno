package engine

import (
	"testing"

	"gno.land/p/tbruyelle/gnoslinger/hex/v0"
)

// startState is the setup the tests play from: seat 0 at A-F3 facing
// south, seat 1 at A-F9 facing north, six hexes apart inside the corral.
func startState() State {
	s := NewState()
	s.SetUp(0, "A-F3", hex.S)
	s.SetUp(1, "A-F9", hex.N)
	return s
}

func TestNewStateIsUnplaced(t *testing.T) {
	s := NewState()
	for p, c := range s.Chars {
		if c.Hex != "" || c.Down || c.Status != Alive || c.Endurance != StartEndurance || len(c.Guns) == 0 || c.Guns[0].Location != Holstered || c.Guns[0].Shells != 6 {
			t.Errorf("seat %d = %+v", p, c)
		}
	}
	if AliveCount(s) != 2 {
		t.Error("both seats alive")
	}
}

func TestSetUp(t *testing.T) {
	s := NewState()
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
	if got := ShowdownChars(); len(got) != 2 || got[0] != "marshal" || got[1] != "the_kid" {
		t.Errorf("ShowdownChars() = %v", got)
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
		{"dude", "A-G7", false}, {"marshal", "", false}, {"marshal", "A-Z9", false},
	} {
		if got := CanSetUp(tt.char, tt.id); got != tt.ok {
			t.Errorf("CanSetUp(%q, %q) = %v, want %v", tt.char, tt.id, got, tt.ok)
		}
	}
}

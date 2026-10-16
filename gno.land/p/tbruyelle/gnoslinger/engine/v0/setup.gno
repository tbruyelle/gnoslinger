package engine

import "gno.land/p/tbruyelle/gnoslinger/hex/v0"

// The showdown's SET UP (rules 3.4 and 29.2; [H3]): each character has its
// own hexes to set up in, as a showdown's SET UP assigns them (showdown 1,
// Gunfight, lines its sides up in G5-G9 and E5-E9 inside the corral, two
// columns apart). The seats take the characters in order: the creator is
// the first, each player joining the next. Nobody is alerted (29.21): all
// start upright with the Colt holstered, facing any direction.

// CharSetup is where a character of the showdown sets up: the hexes it may
// stand in, and the way it faces unless its player turns it.
type CharSetup struct {
	Char   string
	Hexes  []string
	Facing hex.Dir
}

// Setups is the showdown played, one character per seat in seat order,
// each a side of its own: the Marshal inside the corral in G5-G9, the Kid
// in E5-E9, El Jefe in I5-I9 and Axe in C5-C9, every column two apart. They
// face the middle: a flat-top grid has no west or east, so the Marshal and
// El Jefe look north-west, the Kid and Axe south-east. A character with no
// entry is not in the showdown; a game of n seats uses the first n.
var Setups = []CharSetup{
	{Char: "marshal", Hexes: []string{"A-G5", "A-G6", "A-G7", "A-G8", "A-G9"}, Facing: hex.NW},
	{Char: "the_kid", Hexes: []string{"A-E5", "A-E6", "A-E7", "A-E8", "A-E9"}, Facing: hex.SE},
	{Char: "el_jefe", Hexes: []string{"A-I5", "A-I6", "A-I7", "A-I8", "A-I9"}, Facing: hex.NW},
	{Char: "axe", Hexes: []string{"A-C5", "A-C6", "A-C7", "A-C8", "A-C9"}, Facing: hex.SE},
}

// SeatChar is the character of a seat, "" for a seat the showdown does not have.
func SeatChar(seat int) string {
	if seat < 0 || seat >= len(Setups) {
		return ""
	}
	return Setups[seat].Char
}

// SetupOf returns the set up of a character, nil when it is not in the showdown.
func SetupOf(charKey string) *CharSetup {
	for i := range Setups {
		if Setups[i].Char == charKey {
			return &Setups[i]
		}
	}
	return nil
}

// ShowdownChars lists the characters of the showdown, seats in order.
func ShowdownChars() []string {
	out := make([]string, len(Setups))
	for i, s := range Setups {
		out[i] = s.Char
	}
	return out
}

// CanSetUp reports whether charKey may set up in hex id: one of its hexes.
func CanSetUp(charKey, id string) bool {
	s := SetupOf(charKey)
	if s == nil {
		return false
	}
	for _, h := range s.Hexes {
		if h == id {
			return true
		}
	}
	return false
}

// SetUp stands seat p's character upright in hex id facing f; the rest of
// its sheet is left as it is.
func (s *State) SetUp(p int, id string, f hex.Dir) {
	s.Chars[p].Hex = id
	s.Chars[p].Facing = f
	s.Chars[p].Down = false
}

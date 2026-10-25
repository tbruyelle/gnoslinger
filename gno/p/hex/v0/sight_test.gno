package hex

import "testing"

func TestBoardABetweenTable(t *testing.T) {
	// The generated table: sorted rows of {a, b, o}, a < b hexes, o an
	// obstacle, never the obstacle's own pairs (36.5).
	if len(A.between) == 0 {
		t.Fatal("no between rows")
	}
	for k, r := range A.between {
		if r[0] < 0 || r[0] >= len(A.ids) || r[1] < 0 || r[1] >= len(A.ids) || r[0] >= r[1] {
			t.Errorf("row %d: bad pair %v", k, r)
		}
		if r[2] < 0 || r[2] >= len(A.obstacles) {
			t.Errorf("row %d: bad obstacle %v", k, r)
		} else if o := A.obstacles[r[2]]; o == r[0] || o == r[1] {
			t.Errorf("row %d: %s lies between itself and a hex", k, A.ids[o])
		}
		if k > 0 {
			p := A.between[k-1]
			if p[0] > r[0] || (p[0] == r[0] && (p[1] > r[1] || (p[1] == r[1] && p[2] >= r[2]))) {
				t.Errorf("rows %d and %d out of order: %v, %v", k-1, k, p, r)
			}
		}
		// Every row is found back, whichever way the pair is asked.
		a, b := A.ids[r[0]], A.ids[r[1]]
		if got := A.Between(a, b); len(got) != 1 || got[0] != "A-I11*" {
			t.Errorf("Between(%s, %s) = %v", a, b, got)
		}
		if got := A.Between(b, a); len(got) != 1 || got[0] != "A-I11*" {
			t.Errorf("Between(%s, %s) = %v", b, a, got)
		}
	}
}

func TestBoardABetween(t *testing.T) {
	// The trough lies between hexes on its two sides...
	for _, c := range [][2]string{
		{"A-H10", "A-I11"}, {"A-I10", "A-I11"}, {"A-H10", "A-J11"}, {"A-I10", "A-I12"}, {"A-I9", "A-I12"}, {"A-H9", "A-J12"},
	} {
		if got := A.Between(c[0], c[1]); len(got) != 1 || got[0] != "A-I11*" {
			t.Errorf("Between(%s, %s) = %v, want the trough", c[0], c[1], got)
		}
	}
	// ...but not between hexes a string can join beside it, nor anything
	// to or from the trough itself (36.5).
	for _, c := range [][2]string{
		{"A-H11", "A-I11"}, {"A-J10", "A-I11"}, {"A-H10", "A-J10"}, {"A-I10", "A-J10"}, {"A-H10", "A-H11"},
		{"A-H11", "A-J10"}, // along the trough's length
		{"A-I11", "A-I12"}, {"A-I11", "A-J11"}, {"A-F3", "A-F9"},
		{"A-I11*", "A-I10"}, {"A-I11*", "A-H12"}, {"A-I11*", "A-I11"},
		{"A-I10", "A-I10"}, {"A-X1", "A-I11"}, {"A-I10", "A-X1"},
	} {
		if got := A.Between(c[0], c[1]); got != nil {
			t.Errorf("Between(%s, %s) = %v, want nothing", c[0], c[1], got)
		}
	}
}

func TestLineOfSight(t *testing.T) {
	up, down := HeightUpright, HeightDown
	for _, c := range []struct {
		from, to string
		hFrom    Height
		hTo      Height
		clear    bool
	}{
		// I10 and I11, on the two sides of the trough, both adjacent to it.
		{"A-I10", "A-I11", up, up, true},      // lower than both (31.31)
		{"A-I10", "A-I11", down, down, false}, // higher than both (31.31)
		{"A-I10", "A-I11", down, up, false},   // the DOWN end is adjacent (31.32)
		{"A-I10", "A-I11", up, down, false},
		{"A-I11", "A-I10", down, up, false}, // the same the other way round
		// I9 and I12, across the trough but not adjacent to it.
		{"A-I9", "A-I12", up, up, true},
		{"A-I9", "A-I12", down, down, false},
		{"A-I9", "A-I12", down, up, true}, // the only adjacent counter, if any, is the higher one (31.32)
		{"A-I9", "A-I12", up, down, true},
		// H10 and J11: the DOWN end adjacent to the trough blocks, the other not.
		{"A-H10", "A-J11", down, up, false},
		{"A-H10", "A-J11", up, down, true},
		// Beside the trough nothing blocks, whatever the heights.
		{"A-H11", "A-I11", down, down, true},
		{"A-J10", "A-I11", down, down, true},
		// To or from the trough itself (36.5).
		{"A-I11*", "A-I10", down, down, true},
		{"A-H12", "A-I11*", down, down, true},
		// Far from it.
		{"A-F3", "A-F9", down, down, true},
		{"A-F3", "A-F3", down, down, true},
	} {
		clear, blocker := A.LineOfSight(c.from, c.to, c.hFrom, c.hTo)
		if clear != c.clear || (clear && blocker != "") || (!clear && blocker != "A-I11*") {
			t.Errorf("LineOfSight(%s, %s, %d, %d) = %v, %q, want clear %v", c.from, c.to, c.hFrom, c.hTo, clear, blocker, c.clear)
		}
	}
	// An unknown hex blocks, with no blocker to name.
	if clear, blocker := A.LineOfSight("A-X1", "A-I11", up, up); clear || blocker != "" {
		t.Errorf("LineOfSight(A-X1, A-I11) = %v, %q", clear, blocker)
	}
	if clear, blocker := A.LineOfSight("A-I11", "", up, up); clear || blocker != "" {
		t.Errorf("LineOfSight(A-I11, \"\") = %v, %q", clear, blocker)
	}
}

func TestBlocks(t *testing.T) {
	up, down, obst, wall := HeightUpright, HeightDown, HeightObstacle, HeightWall
	for _, c := range []struct {
		h, h1, h2  Height
		adj1, adj2 bool
		want       bool
	}{
		{obst, up, up, true, true, false},     // lower than both
		{obst, down, down, false, false, true}, // higher than both
		{obst, down, up, true, false, true},    // the lower counter adjacent
		{obst, down, up, false, true, false},   // only the higher one adjacent
		{obst, down, up, false, false, false},  // neither adjacent: no plateau effect on flat ground
		{obst, up, down, false, true, true},
		{obst, up, down, true, false, false},
		{wall, up, up, false, false, true}, // a wall is higher than anyone
		{wall, up, down, true, true, true},
	} {
		if got := blocks(c.h, c.h1, c.h2, c.adj1, c.adj2); got != c.want {
			t.Errorf("blocks(%d, %d, %d, %v, %v) = %v, want %v", c.h, c.h1, c.h2, c.adj1, c.adj2, got, c.want)
		}
	}
}

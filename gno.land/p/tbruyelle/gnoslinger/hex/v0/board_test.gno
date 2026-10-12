package hex

import (
	"sort"
	"strings"
	"testing"
)

func TestBoardAIntegrity(t *testing.T) {
	if A.Name() != "A" {
		t.Errorf("name = %q", A.Name())
	}
	if A.Size() != 138 { // 137 hexes, I11 split into two halves
		t.Fatalf("board A has %d hexes, want 138", A.Size())
	}
	ids := A.IDs()
	if !sort.StringsAreSorted(ids) {
		t.Fatal("ids are not sorted")
	}
	for i := 1; i < len(ids); i++ {
		if ids[i] == ids[i-1] {
			t.Errorf("duplicate id %q", ids[i])
		}
	}
	if len(A.nbr) != len(ids) {
		t.Fatalf("nbr has %d rows, want %d", len(A.nbr), len(ids))
	}
	for _, id := range ids {
		if A.Index(id) < 0 || !A.Has(id) {
			t.Errorf("%q not found by Index/Has", id)
		}
		n := 0
		for d := Dir(0); d < 6; d++ {
			nb, ok := A.Neighbor(id, d)
			if !ok {
				continue
			}
			n++
			if nb == id {
				t.Errorf("%s is its own %s neighbour", id, d)
			}
			// Adjacency is symmetric: going back the opposite way returns,
			// to the same hex or to the other half of a split one.
			back, ok := A.Neighbor(nb, d.Opposite())
			if !ok || strings.TrimSuffix(back, "*") != strings.TrimSuffix(id, "*") {
				t.Errorf("asymmetric: %s -%s-> %s but %s -%s-> %q", id, d, nb, nb, d.Opposite(), back)
			}
		}
		if n < 1 || n > 6 {
			t.Errorf("%s has %d neighbours", id, n)
		}
	}
}

func TestBoardANeighbors(t *testing.T) {
	// A central hex has a full ring (same sample as scripts/gen_board_data.py).
	if got := A.Neighbors("A-F6"); got != [6]string{"A-F5", "A-G6", "A-G7", "A-F7", "A-E7", "A-E6"} {
		t.Errorf("Neighbors(A-F6) = %v", got)
	}
	// The two starting hexes of the fixed 2-player setup.
	if nb, ok := A.Neighbor("A-F1", S); !ok || nb != "A-F2" {
		t.Errorf("Neighbor(A-F1, S) = %q, %v", nb, ok)
	}
	if nb, ok := A.Neighbor("A-F12", N); !ok || nb != "A-F11" {
		t.Errorf("Neighbor(A-F12, N) = %q, %v", nb, ok)
	}
	// A-F12 sits on the bottom edge: nothing to the south.
	if _, ok := A.Neighbor("A-F12", S); ok {
		t.Error("Neighbor(A-F12, S) should be off-board")
	}
	// Unknown hex or invalid direction.
	if _, ok := A.Neighbor("A-Z9", N); ok {
		t.Error("unknown hex should have no neighbour")
	}
	if _, ok := A.Neighbor("A-F6", Dir(6)); ok {
		t.Error("invalid direction should have no neighbour")
	}
	if got := A.Neighbors("A-Z9"); got != [6]string{} {
		t.Errorf("Neighbors(unknown) = %v", got)
	}
	if A.Index("A-Z9") != -1 || A.Has("") {
		t.Error("unknown ids must not be found")
	}
	// IDs returns a copy.
	ids := A.IDs()
	ids[0] = "mutated"
	if A.IDs()[0] == "mutated" {
		t.Error("IDs() must return a copy")
	}
}

func TestBoardAFences(t *testing.T) {
	// The corral fence (rule 35): 48 hexsides, each seen from both hexes.
	n := 0
	for _, id := range A.IDs() {
		for d := Dir(0); d < 6; d++ {
			if !A.Fenced(id, d) {
				continue
			}
			n++
			nb, ok := A.Neighbor(id, d)
			if !ok || !A.Fenced(nb, d.Opposite()) {
				t.Errorf("fence %s %d: not mirrored on %q", id, d, nb)
			}
		}
	}
	if n != 2*48 {
		t.Errorf("fenced hexside ends = %d, want %d", n, 2*48)
	}
	for _, c := range []struct {
		id   string
		d    Dir
		want bool
	}{
		{"A-E3", N, true},   // the fence west of the Upper Gate
		{"A-E2", S, true},   // the same hexside, from outside
		{"A-F3", N, false},  // through the Upper Gate
		{"A-F10", S, false}, // through the Lower Gate
		{"A-B4", NW, true},  // the west side, B4 | A4
		{"A-F6", N, false},  // the middle of the corral
		{"A-X1", N, false},  // unknown hex
	} {
		if got := A.Fenced(c.id, c.d); got != c.want {
			t.Errorf("Fenced(%s, %d) = %v, want %v", c.id, c.d, got, c.want)
		}
	}
}

func TestBoardAObstacles(t *testing.T) {
	// The horse trough (rule 36) is the only obstacle of board A.
	n := 0
	for _, id := range A.IDs() {
		if A.Obstacle(id) {
			n++
		}
	}
	if n != 1 || !A.Obstacle("A-I11*") || A.Obstacle("A-I11") || A.Obstacle("A-X1") {
		t.Errorf("obstacles: %d, I11* %v, I11 %v", n, A.Obstacle("A-I11*"), A.Obstacle("A-I11"))
	}
}

func TestBoardAHalfHexes(t *testing.T) {
	// I11 is split (36.2): the trough I11* on top, the empty I11 below.
	if got := A.Neighbors("A-I11*"); got != [6]string{"A-I10", "A-J10", "A-I11", "A-I11", "A-H11", "A-H10"} {
		t.Errorf("Neighbors(A-I11*) = %v", got)
	}
	if got := A.Neighbors("A-I11"); got != [6]string{"A-I11*", "A-J10", "A-J11", "A-I12", "A-H11", "A-I11*"} {
		t.Errorf("Neighbors(A-I11) = %v", got)
	}
	for _, c := range []struct {
		from string
		d    Dir
		want string
	}{{"A-I10", S, "A-I11*"}, {"A-J10", SW, "A-I11*"}, {"A-H10", SE, "A-I11*"}, {"A-H11", NE, "A-I11*"}, {"A-J11", NW, "A-I11"}, {"A-I12", N, "A-I11"}} {
		if nb, _ := A.Neighbor(c.from, c.d); nb != c.want {
			t.Errorf("Neighbor(%s, %s) = %q, want %q", c.from, c.d, nb, c.want)
		}
	}
	// Both halves share the coordinates of the whole hex.
	q1, r1, _ := A.Coords("A-I11*")
	q2, r2, _ := A.Coords("A-I11")
	if q1 != q2 || r1 != r2 || A.Distance("A-I11*", "A-I11") != 1 {
		t.Errorf("I11* at (%d,%d), I11 at (%d,%d), distance %d", q1, r1, q2, r2, A.Distance("A-I11*", "A-I11"))
	}
}

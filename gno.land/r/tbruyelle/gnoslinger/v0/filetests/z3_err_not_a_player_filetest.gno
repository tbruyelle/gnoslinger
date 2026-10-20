// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z3_err_not_a_player_filetest

package z3_err_not_a_player_filetest

import (
	"testing"

	gnoslinger "gno.land/r/tbruyelle/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
)

func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	gnoslinger.Commit(cross(cur), id, gnoslinger.PlanHash(id, 1, 0, "ab", "1f:ahead"), "locked")
}

// Error:
// gnoslinger: you are not a player of this game

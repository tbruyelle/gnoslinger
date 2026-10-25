// PKGPATH: gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z7_err_after_finished_filetest

package z7_err_after_finished_filetest

import (
	"testing"

	gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
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
	for turn := 1; turn <= 9; turn++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		gnoslinger.Commit(cross(cur), id, turn, gnoslinger.PlanHash(id, turn, 0, "ab", ""), "locked")
		testing.SetRealm(testing.NewUserRealm(bob))
		gnoslinger.Reveal(cross(cur), id, turn, 1, "ab", "")
		gnoslinger.Reveal(cross(cur), id, turn, 0, "ab", "")
	}
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.Commit(cross(cur), id, 10, gnoslinger.PlanHash(id, 10, 0, "ab", ""), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Reveal(cross(cur), id, 10, 1, "ab", "")
	gnoslinger.Reveal(cross(cur), id, 10, 0, "ab", "")
	gnoslinger.Commit(cross(cur), id, 10, gnoslinger.PlanHash(id, 10, 1, "ab", ""), "locked")
}

// Error:
// gnoslinger: game is not accepting plans

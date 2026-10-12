// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z7_err_after_finished_filetest

package z7_err_after_finished_filetest

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
	id := gnoslinger.CreateGame(cross(cur), "marshal", 10, 0)
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "dude")
	for i := 0; i < 9; i++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		gnoslinger.SubmitPlan(cross(cur), id, "")
		testing.SetRealm(testing.NewUserRealm(bob))
		gnoslinger.SubmitPlan(cross(cur), id, "")
	}
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.SubmitPlan(cross(cur), id, "")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.SubmitPlan(cross(cur), id, "")
	gnoslinger.SubmitPlan(cross(cur), id, "")
}

// Error:
// gnoslinger: game is not accepting plans

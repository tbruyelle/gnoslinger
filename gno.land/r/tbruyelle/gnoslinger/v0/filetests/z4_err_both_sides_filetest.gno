// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z4_err_both_sides_filetest

package z4_err_both_sides_filetest

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
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.SubmitPlan(cross(cur), id, "1f:ahead,1b:back")
}

// Error:
// gnoslinger: you cannot use both sides of a card

// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z10_cancel_waiting_filetest

package z10_cancel_waiting_filetest

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
	other := gnoslinger.CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	// A cancelled game is deleted: only the other one is left.
	gnoslinger.CancelGame(cross(cur), id)
	println(gnoslinger.GamesJSON(alice.String()))
	gnoslinger.CancelGame(cross(cur), other)
	println(gnoslinger.GamesJSON(alice.String()))
}

// Output:
// {"name":"","open":[{"id":"0000002","rev":1,"phase":"waiting","turn":1,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0],"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":0,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","committed":false,"revealed":false},{"addr":"","name":"","char":"","status":"alive","committed":false,"revealed":false}]}],"mine":[{"id":"0000002","rev":1,"phase":"waiting","turn":1,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0],"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":0,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","committed":false,"revealed":false},{"addr":"","name":"","char":"","status":"alive","committed":false,"revealed":false}]}]}
// {"name":"","open":[],"mine":[]}

// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z13_profiles_filetest

package z13_profiles_filetest

import (
	"testing"

	gnoslinger "gno.land/r/tbruyelle/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
)

func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), "marshal", 10, 0)
	// Alice has a profile, the game has not started: no game played yet.
	println(gnoslinger.ProfileJSON(alice.String()))
	println(gnoslinger.ProfileJSON(bob.String()))
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "dude")
	gnoslinger.CreateGame(cross(cur), "marshal", 10, 0)
	println(gnoslinger.PlayersJSON(0, 5))
	println(gnoslinger.PlayersJSON(1, 5))
	println(gnoslinger.Render("json/players/0/1"))
}

// Output:
// {"addr":"g1alice00000000000000000000000000000000","name":"","rank":1,"gamesPlayed":0,"victoryPoints":0,"createdAt":1234567890}
// null
// {"total":2,"offset":0,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","rank":1,"gamesPlayed":1,"victoryPoints":0,"createdAt":1234567890},{"addr":"g1bob0000000000000000000000000000000000","name":"","rank":2,"gamesPlayed":1,"victoryPoints":0,"createdAt":1234567890}]}
// {"total":2,"offset":1,"players":[{"addr":"g1bob0000000000000000000000000000000000","name":"","rank":2,"gamesPlayed":1,"victoryPoints":0,"createdAt":1234567890}]}
// {"total":2,"offset":0,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","rank":1,"gamesPlayed":1,"victoryPoints":0,"createdAt":1234567890}]}

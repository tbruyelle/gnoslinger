// PKGPATH: gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z13_profiles_filetest

package z13_profiles_filetest

import (
	"testing"

	profiles "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/profiles/v0"
	gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
)

func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	// Alice has a profile, the game has not started: no game played yet.
	println(profiles.ProfileJSON(alice.String()))
	println(profiles.ProfileJSON(bob.String()))
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	gnoslinger.CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	println(profiles.PlayersJSON(0, 5))
	println(profiles.PlayersJSON(1, 5))
	println(profiles.Render("json/players/0/1"))
}

// Output:
// {"addr":"g1alice00000000000000000000000000000000","name":"","rank":1,"gamesPlayed":0,"victoryPoints":0,"createdAt":1234567890}
// null
// {"total":2,"offset":0,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","rank":1,"gamesPlayed":1,"victoryPoints":0,"createdAt":1234567890},{"addr":"g1bob0000000000000000000000000000000000","name":"","rank":2,"gamesPlayed":1,"victoryPoints":0,"createdAt":1234567890}]}
// {"total":2,"offset":1,"players":[{"addr":"g1bob0000000000000000000000000000000000","name":"","rank":2,"gamesPlayed":1,"victoryPoints":0,"createdAt":1234567890}]}
// {"total":2,"offset":0,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","rank":1,"gamesPlayed":1,"victoryPoints":0,"createdAt":1234567890}]}

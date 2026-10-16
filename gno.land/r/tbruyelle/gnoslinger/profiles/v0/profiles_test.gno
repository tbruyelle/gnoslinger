package profiles

import (
	"strings"
	"testing"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
)

const gameV0 = "gno.land/r/tbruyelle/gnoslinger/v0"

var (
	dave = testutils.TestAddress("dave")
	erin = testutils.TestAddress("erin")
	boss = testutils.TestAddress("boss")
)

func TestWritesFromGamesOnly(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(dave))
	uassert.AbortsWithMessage(t, cur, "profiles: "+" is not an allowed game realm", func() {
		Ensure(cross(cur), dave)
	})
	testing.SetRealm(testing.NewCodeRealm("gno.land/r/someone/else"))
	uassert.AbortsWithMessage(t, cur, "profiles: gno.land/r/someone/else is not an allowed game realm", func() {
		AddVictoryPoints(cross(cur), dave, 100)
	})
	_, ok := Get(dave)
	uassert.False(t, ok)
	uassert.Equal(t, "null", ProfileJSON(dave.String()))
}

func TestProfiles(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewCodeRealm(gameV0))
	Ensure(cross(cur), dave)
	p, ok := Get(dave)
	uassert.True(t, ok)
	uassert.Equal(t, 0, p.GamesPlayed)
	Ensure(cross(cur), dave) // no-op
	uassert.Equal(t, profiles.Size(), ranking.Size())

	AddGamePlayed(cross(cur), dave)
	AddGamePlayed(cross(cur), erin) // creates erin's
	uassert.Equal(t, profiles.Size(), ranking.Size())
	// Equal points and games: by address.
	uassert.Equal(t, strings.Compare(dave.String(), erin.String()) < 0, Rank(dave) < Rank(erin))

	AddVictoryPoints(cross(cur), erin, 4)
	AddVictoryPoints(cross(cur), dave, -6)
	uassert.Equal(t, 1, Rank(erin))
	uassert.Equal(t, 2, Rank(dave))
	p, _ = Get(dave)
	uassert.Equal(t, -6, p.VictoryPoints)
	uassert.Equal(t, 1, p.GamesPlayed)
	uassert.Equal(t, 2, Count())

	all := PlayersJSON(0, MaxPage)
	uassert.True(t, strings.Contains(all, `"total":2`))
	uassert.True(t, strings.Index(all, erin.String()) < strings.Index(all, dave.String()))
	uassert.True(t, strings.Contains(ProfileJSON(dave.String()), `"rank":2,"gamesPlayed":1,"victoryPoints":-6`))
	uassert.True(t, strings.Contains(PlayersJSON(1, 1), `"addr":"`+dave.String()+`"`))
	uassert.Equal(t, `{"total":2,"offset":0,"players":[]}`, PlayersJSON(0, 0))
	uassert.Equal(t, PlayersJSON(0, 1), Render("json/players/0/1"))
	uassert.Equal(t, ProfileJSON(erin.String()), Render("json/profile/"+erin.String()))
	uassert.True(t, strings.Contains(Render(""), "| 1 | `"+erin.String()+"` | 4 | 1 |"))
}

func TestAllowlist(cur realm, t *testing.T) {
	admin = boss // tests have no deployer
	uassert.True(t, IsGame(gameV0))
	const gameV1 = "gno.land/r/tbruyelle/gnoslinger/v1"

	testing.SetRealm(testing.NewUserRealm(dave))
	uassert.AbortsWithMessage(t, cur, "profiles: admin only", func() {
		Allow(cross(cur), gameV1)
	})

	testing.SetRealm(testing.NewUserRealm(boss))
	Allow(cross(cur), gameV1)
	uassert.True(t, IsGame(gameV1))
	uassert.Equal(t, 2, len(Games()))

	// The new version scores on the same profiles.
	testing.SetRealm(testing.NewCodeRealm(gameV1))
	before, _ := Get(erin)
	AddVictoryPoints(cross(cur), erin, 2)
	after, _ := Get(erin)
	uassert.Equal(t, before.VictoryPoints+2, after.VictoryPoints)

	// The old one no longer does.
	testing.SetRealm(testing.NewUserRealm(boss))
	Disallow(cross(cur), gameV0)
	uassert.False(t, IsGame(gameV0))
	uassert.AbortsWithMessage(t, cur, "profiles: "+gameV0+" is not allowed", func() {
		Disallow(cross(cur), gameV0)
	})
	testing.SetRealm(testing.NewCodeRealm(gameV0))
	uassert.AbortsWithMessage(t, cur, "profiles: "+gameV0+" is not an allowed game realm", func() {
		AddGamePlayed(cross(cur), erin)
	})

	// The admin hands over.
	testing.SetRealm(testing.NewUserRealm(boss))
	Allow(cross(cur), gameV0)
	SetAdmin(cross(cur), dave)
	uassert.Equal(t, dave, Admin())
	testing.SetRealm(testing.NewUserRealm(dave))
	Disallow(cross(cur), gameV1)
	uassert.Equal(t, 1, len(Games()))
}

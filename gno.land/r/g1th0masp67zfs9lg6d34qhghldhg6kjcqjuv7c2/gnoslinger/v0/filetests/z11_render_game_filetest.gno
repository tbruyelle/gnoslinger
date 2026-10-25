// PKGPATH: gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z11_render_game_filetest

package z11_render_game_filetest

import (
	"testing"

	gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
)

// The gnoweb pages after a resolved turn.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.Commit(cross(cur), id, gnoslinger.PlanHash(id, 1, 0, "ab", "1f:ahead_left,2f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Reveal(cross(cur), id, 1, 1, "ab", "4b,1f:ahead")
	gnoslinger.Reveal(cross(cur), id, 1, 0, "ab", "1f:ahead_left,2f:ahead")
	// Turn 2: alice ran on turn 1, so she can sprint now.
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.Commit(cross(cur), id, gnoslinger.PlanHash(id, 2, 0, "ab", "1f:ahead,2f:ahead,3f"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Reveal(cross(cur), id, 2, 1, "ab", "")
	gnoslinger.Reveal(cross(cur), id, 2, 0, "ab", "1f:ahead,2f:ahead,3f")
	println(gnoslinger.Render(""))
	println(gnoslinger.Render("game/" + id))
}

// Output:
// # Gnoslinger
// Showdowns of two to four gunfighters on board A, the Corral, each on their own. Create a game, wait for the seats to fill up, then submit a plan every turn. [How to play](/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0:help).
//
// [Create a game of two as the marshal]($help&func=CreateGame&facing=2&maxTurns=20&seats=2&startHex=A-D7&timeoutMinutes=0) · [of three]($help&func=CreateGame&facing=2&maxTurns=20&seats=3&startHex=A-D7&timeoutMinutes=0) · [of four]($help&func=CreateGame&facing=2&maxTurns=20&seats=4&startHex=A-D7&timeoutMinutes=0)
//
// ## Open games
// No game is waiting for players.
//
// ## Recent games
// | Game | Players | Turn | Phase |
// |---|---|---|---|
// | [0000001](/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0:game/0000001) | marshal vs the\_kid | 3/10 | planning |
//
//
// # Game 0000001
// Turn 3 of 10 · planning
//
// | Seat | Player | Character | Hex | Facing | Down | Delay | Status | Plan |
// |---|---|---|---|---|---|---|---|---|
// | 0 | `g1alice00000000000000000000000000000000` | marshal | A-E10 | S | no | 1 | alive | pending |
// | 1 | `g1bob0000000000000000000000000000000000` | the\_kid | A-H6 | N | yes | 0 | alive | pending |
//
// ### Turn 1
// Plans: `1f:ahead_left,2f:ahead` vs `4b,1f:ahead`
//
// Result cards drawn: 59, 95
//
// - seg 1: the\_kid goes down
// - seg 1: the\_kid draws card 59 (leap): gains 1 delay, now 1
// - seg 1: the\_kid draws card 95 (leap): LOSE AIM
// - seg 2: marshal advance: A-D5 → A-E6
// - seg 3: marshal run: A-E6 → A-E7
// - seg 4: the\_kid advance: A-H7 → A-H6 (crawling)
// - seg 4: the\_kid gains 2 delay (crawl), now 3
//
// ### Turn 2
// Plans: `1f:ahead,2f:ahead,3f` vs `(pass)`
//
// Result cards drawn: 83
//
// - seg 2: marshal advance: A-E7 → A-E8
// - seg 3: marshal run: A-E8 → A-E9
// - seg 4: marshal sprint: A-E9 → A-E10
// - seg 4: marshal draws card 83 (sprint): gains 2 delay, now 2
//
// Plans are hidden: commit `PlanHash(id, turn, seat, salt, plan)`, reveal once every plan is committed. [Commit a plan]($help&func=Commit&hash=&id=0000001&locked=) · [Surrender]($help&func=Surrender&id=0000001) · [Claim timeout]($help&func=ClaimTimeout&id=0000001) (after 2009-02-15 23:31 UTC)
//
// [Back to the lobby](/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0:)

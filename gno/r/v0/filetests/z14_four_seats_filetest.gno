// PKGPATH: gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z14_four_seats_filetest

package z14_four_seats_filetest

import (
	"testing"

	gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
	dave  address = "g1dave00000000000000000000000000000000"
)

// A game of four: the seats fill up in the order the players join, each
// with the next character; the game starts with the last. Then a turn
// where the marshal aims at the reb, who walks: the markers follow it.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 4, 10, 0, "A-D6", 2) // looking south-east, the reb's way
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H6", 2)
	testing.SetRealm(testing.NewUserRealm(carol))
	gnoslinger.JoinGame(cross(cur), id, "A-F8", 0)
	println(gnoslinger.GamesJSON(dave.String()))
	testing.SetRealm(testing.NewUserRealm(dave))
	gnoslinger.JoinGame(cross(cur), id, "A-F5", 3)
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.Commit(cross(cur), id, 1, gnoslinger.PlanHash(id, 1, 0, "ab", "9f:1:0,5f:aim:@2"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Commit(cross(cur), id, 1, gnoslinger.PlanHash(id, 1, 1, "ab", ""), "locked")
	testing.SetRealm(testing.NewUserRealm(carol))
	gnoslinger.Commit(cross(cur), id, 1, gnoslinger.PlanHash(id, 1, 2, "ab", "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(dave))
	gnoslinger.Reveal(cross(cur), id, 1, 3, "ab", "3b:ahead_right") // the last plan, in clear
	gnoslinger.RevealMany(cross(cur), id, 1, "0;1;2", "ab;ab;ab", "9f:1:0,5f:aim:@2;;1f:ahead")
	println(gnoslinger.GameJSON(id))
	println(gnoslinger.Render("game/" + id))
}

// Output:
// {"name":"","open":[{"id":"0000001","rev":3,"phase":"waiting","turn":1,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0,0,0],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":0,"lockRound":0,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","committed":false,"revealed":false},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","status":"alive","committed":false,"revealed":false},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"reb","status":"alive","committed":false,"revealed":false},{"addr":"","name":"","char":"","status":"alive","committed":false,"revealed":false}]}],"mine":[]}
// {"id":"0000001","rev":9,"phase":"planning","turn":2,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D6","facing":2,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":2,"aimAt":2,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"gun_hand","cocked":true,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-H6","facing":2,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"reb","hex":"A-F7","facing":0,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1dave00000000000000000000000000000000","name":"","char":"yankee","hex":"A-F5","facing":4,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":-1,"vp":[0,0,0,0],"awards":[],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":1234740690,"commitUntil":1234740690,"revealUntil":1234740990,"lockRound":-152687517,"lastTurn":{"turn":1,"seed":"eb1e4b2ddbdf279104f3064e4fc819f6b946ba25666dc0354d53226080d526ab","cards":[],"plans":["9f:1:0,5f:aim:@2","","1f:ahead","3b:ahead_right"],"events":[{"seg":1,"p":3,"kind":"turn","action":"turn","from":"","to":"","facing":4,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":6,"chart":"","status":""},{"seg":2,"p":2,"kind":"move","action":"advance","from":"A-F8","to":"A-F7","facing":0,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":5,"chart":"","status":""},{"seg":3,"p":0,"kind":"draw","action":"draw_and_cock","from":"holstered","to":"gun_hand","facing":0,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"colt45","gunId":1,"step":3,"chart":"","status":""},{"seg":5,"p":0,"kind":"aim","action":"cock_aim_shoot","from":"","to":"A-F7","facing":0,"down":false,"n":2,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":2,"hit":"","range":0,"gun":"","gunId":0,"step":3,"chart":"","status":""}],"start":[{"hex":"A-D6","facing":2,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H6","facing":2,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-F8","facing":0,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-F5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[]}}
// # Game 0000001
// Turn 2 of 10 · planning
//
// | Seat | Player | Character | Hex | Facing | Down | Delay | Status | Plan |
// |---|---|---|---|---|---|---|---|---|
// | 0 | `g1alice00000000000000000000000000000000` | marshal | A-D6 | SE | no | 0 | alive | pending |
// | 1 | `g1bob0000000000000000000000000000000000` | the\_kid | A-H6 | SE | no | 0 | alive | pending |
// | 2 | `g1carol0000000000000000000000000000000` | reb | A-F7 | N | no | 0 | alive | pending |
// | 3 | `g1dave00000000000000000000000000000000` | yankee | A-F5 | SW | no | 0 | alive | pending |
//
// ### Turn 1
// Plans: `9f:1:0,5f:aim:@2` vs `(pass)` vs `1f:ahead` vs `3b:ahead_right`
//
// - seg 1: yankee turn: now facing SW
// - seg 2: reb advance: A-F8 → A-F7
// - seg 3: marshal draws the Colt 45 to the gun hand and cocks it
// - seg 5: marshal aims at A-F7 (reb): 2 AIM points
//
// Plans are hidden: commit `PlanHash(id, turn, seat, salt, plan)`, reveal once every plan is committed. [Commit a plan]($help&func=Commit&hash=&id=0000001&locked=&turn=2) · [Surrender]($help&func=Surrender&id=0000001) · [Claim timeout]($help&func=ClaimTimeout&id=0000001) (after 2009-02-15 23:31 UTC)
//
// [Back to the lobby](/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0:)

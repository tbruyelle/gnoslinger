// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z14_four_seats_filetest

package z14_four_seats_filetest

import (
	"testing"

	gnoslinger "gno.land/r/tbruyelle/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
	dave  address = "g1dave00000000000000000000000000000000"
)

// A game of four: the seats fill up in the order the players join, each
// with the next character; the game starts with the last. Then a turn
// where the marshal aims at el jefe, who walks: the markers follow it.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 4, 10, 0, "A-G7", 2) // looking south-east, el jefe's way
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-E7", 2)
	testing.SetRealm(testing.NewUserRealm(carol))
	gnoslinger.JoinGame(cross(cur), id, "A-I7", 5)
	println(gnoslinger.GamesJSON(dave.String()))
	testing.SetRealm(testing.NewUserRealm(dave))
	gnoslinger.JoinGame(cross(cur), id, "A-C7", 2)
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.SubmitPlan(cross(cur), id, "9f:1:0,5f:aim:@2")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.SubmitPlan(cross(cur), id, "")
	testing.SetRealm(testing.NewUserRealm(carol))
	gnoslinger.SubmitPlan(cross(cur), id, "1f:ahead")
	testing.SetRealm(testing.NewUserRealm(dave))
	gnoslinger.SubmitPlan(cross(cur), id, "3b:ahead_right")
	println(gnoslinger.GameJSON(id))
	println(gnoslinger.Render("game/" + id))
}

// Output:
// {"name":"","open":[{"id":"0000001","rev":3,"phase":"waiting","turn":1,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0,0,0],"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","submitted":false},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","status":"alive","submitted":false},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"el_jefe","status":"alive","submitted":false},{"addr":"","name":"","char":"","status":"alive","submitted":false}]}],"mine":[]}
// {"id":"0000001","rev":8,"phase":"planning","turn":2,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-G7","facing":2,"down":false,"delay":0,"status":"alive","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":2,"aimAt":2,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"gun_hand","cocked":true,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-E7","facing":2,"down":false,"delay":0,"status":"alive","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"el_jefe","hex":"A-H6","facing":5,"down":false,"delay":0,"status":"alive","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1dave00000000000000000000000000000000","name":"","char":"axe","hex":"A-C7","facing":3,"down":false,"delay":0,"status":"alive","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":-1,"vp":[0,0,0,0],"awards":[],"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":1234740690,"lastTurn":{"turn":1,"seed":"250a581cbc820a16aa33e310a316445776f31ffef5acfff260b78f6fd7260bf6","cards":[],"plans":["9f:1:0,5f:aim:@2","","1f:ahead","3b:ahead_right"],"events":[{"seg":1,"p":3,"kind":"turn","action":"turn","from":"","to":"","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":6,"chart":"","status":""},{"seg":2,"p":2,"kind":"move","action":"advance","from":"A-I7","to":"A-H6","facing":5,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":5,"chart":"","status":""},{"seg":3,"p":0,"kind":"draw","action":"draw_and_cock","from":"holstered","to":"gun_hand","facing":0,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"colt45","gunId":1,"step":3,"chart":"","status":""},{"seg":5,"p":0,"kind":"aim","action":"cock_aim_shoot","from":"","to":"A-H6","facing":0,"down":false,"n":2,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":2,"hit":"","range":0,"gun":"","gunId":0,"step":3,"chart":"","status":""}],"start":[{"hex":"A-G7","facing":2,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-E7","facing":2,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-I7","facing":5,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-C7","facing":2,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}}
// # Game 0000001
// Turn 2 of 10 · planning
//
// | Seat | Player | Character | Hex | Facing | Down | Delay | Status | Plan |
// |---|---|---|---|---|---|---|---|---|
// | 0 | `g1alice00000000000000000000000000000000` | marshal | A-G7 | SE | no | 0 | alive | pending |
// | 1 | `g1bob0000000000000000000000000000000000` | the\_kid | A-E7 | SE | no | 0 | alive | pending |
// | 2 | `g1carol0000000000000000000000000000000` | el\_jefe | A-H6 | NW | no | 0 | alive | pending |
// | 3 | `g1dave00000000000000000000000000000000` | axe | A-C7 | S | no | 0 | alive | pending |
//
// ### Turn 1
// Plans: `9f:1:0,5f:aim:@2` vs `(pass)` vs `1f:ahead` vs `3b:ahead_right`
//
// - seg 1: axe turn: now facing S
// - seg 2: el\_jefe advance: A-I7 → A-H6
// - seg 3: marshal draws the Colt 45 to the gun hand and cocks it
// - seg 5: marshal aims at A-H6 (el\_jefe): 2 AIM points
//
// [Submit a plan]($help&func=SubmitPlan&id=0000001&plan=) · [Surrender]($help&func=Surrender&id=0000001) · [Claim timeout]($help&func=ClaimTimeout&id=0000001) (after 2009-02-15 23:31 UTC)
//
// [Back to the lobby](/r/tbruyelle/gnoslinger/v0:)

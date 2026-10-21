// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z2_two_plans_resolve_filetest

package z2_two_plans_resolve_filetest

import (
	"testing"

	gnoslinger "gno.land/r/tbruyelle/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
)

// Alice commits her plan; bob, the last, reveals his in clear at once;
// alice's reveal resolves the turn: she advances then runs, bob drops.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(alice))
	println(gnoslinger.Commit(cross(cur), id, gnoslinger.PlanHash(id, 1, 0, "ab", "1f:ahead,2f:ahead"), "locked"))
	testing.SetRealm(testing.NewUserRealm(bob))
	println(gnoslinger.Reveal(cross(cur), id, 1, 1, "cd", "5b"))
	println(gnoslinger.Reveal(cross(cur), id, 1, 0, "ab", "1f:ahead,2f:ahead"))
	println(gnoslinger.GameJSON(id))
}

// Output:
// 3
// 4
// 5
// {"id":"0000001","rev":5,"phase":"planning","turn":2,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D7","facing":3,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":true,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-H7","facing":0,"down":true,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":-1,"vp":[0,0],"awards":[],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":1234740690,"commitUntil":1234740690,"revealUntil":1234740990,"lockRound":-152687517,"lastTurn":{"turn":1,"seed":"8e8d404efd6d52ffd52dcd5138d8336f12928665ea0d2c5e8e20b6096e127ff6","cards":[],"plans":["1f:ahead,2f:ahead","5b"],"events":[{"seg":2,"p":0,"kind":"move","action":"advance","from":"A-D5","to":"A-D6","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":3,"chart":"","status":""},{"seg":3,"p":0,"kind":"move","action":"run","from":"A-D6","to":"A-D7","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":3,"chart":"","status":""},{"seg":3,"p":1,"kind":"flip","action":"get_up_down","from":"","to":"","facing":0,"down":true,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":4,"chart":"","status":""}],"start":[{"hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H7","facing":0,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}}

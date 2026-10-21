// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z12_max_turns_finish_filetest

package z12_max_turns_finish_filetest

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
	for turn := 1; turn <= 9; turn++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		gnoslinger.Commit(cross(cur), id, gnoslinger.PlanHash(id, turn, 0, "ab", ""), "locked")
		testing.SetRealm(testing.NewUserRealm(bob))
		gnoslinger.Reveal(cross(cur), id, turn, 1, "ab", "")
		gnoslinger.Reveal(cross(cur), id, turn, 0, "ab", "")
	}
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.Commit(cross(cur), id, gnoslinger.PlanHash(id, 10, 0, "ab", ""), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Reveal(cross(cur), id, 10, 1, "ab", "3b:ahead_left")
	gnoslinger.Reveal(cross(cur), id, 10, 0, "ab", "")
	println(gnoslinger.GameJSON(id))
}

// Output:
// {"id":"0000001","rev":32,"phase":"finished","turn":10,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-H7","facing":5,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":-1,"vp":[2,2],"awards":[{"p":0,"reason":"survive","points":2},{"p":1,"reason":"survive","points":2}],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"max_turns","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":0,"commitUntil":0,"revealUntil":0,"lockRound":0,"lastTurn":{"turn":10,"seed":"ca82654219d62e4054e330eb9749baff5b55e0faf2bf5e811f469743df477fb5","cards":[],"plans":["","3b:ahead_left"],"events":[{"seg":1,"p":1,"kind":"turn","action":"turn","from":"","to":"","facing":5,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":4,"chart":"","status":""},{"seg":6,"p":0,"kind":"vp","action":"","from":"","to":"","facing":0,"down":false,"n":2,"delay":0,"reason":"survive","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":0,"chart":"","status":""},{"seg":6,"p":1,"kind":"vp","action":"","from":"","to":"","facing":0,"down":false,"n":2,"delay":0,"reason":"survive","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":0,"chart":"","status":""}],"start":[{"hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H7","facing":0,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}}

// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z15_surrender_goes_on_filetest

package z15_surrender_goes_on_filetest

import (
	"testing"

	gnoslinger "gno.land/r/tbruyelle/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
)

// In a game of three, a surrender leaves the two others to fight on: the
// turn resolves with their plans. The second surrender ends the game.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 3, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	gnoslinger.JoinGame(cross(cur), id, "A-E8", 3)
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.SubmitPlan(cross(cur), id, "1f:ahead")
	testing.SetRealm(testing.NewUserRealm(carol))
	gnoslinger.SubmitPlan(cross(cur), id, "1f:ahead")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Surrender(cross(cur), id)
	println(gnoslinger.GamesJSON(bob.String()))
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.Surrender(cross(cur), id)
	println(gnoslinger.GameJSON(id))
}

// Output:
// {"name":"","open":[],"mine":[{"id":"0000001","rev":6,"phase":"planning","turn":2,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0,0],"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","submitted":false},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","status":"out","submitted":false},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"el_jefe","status":"alive","submitted":false}]}]}
// {"id":"0000001","rev":7,"phase":"finished","turn":2,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D6","facing":3,"down":false,"delay":0,"status":"out","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-H7","facing":0,"down":false,"delay":0,"status":"out","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"el_jefe","hex":"A-E9","facing":3,"down":false,"delay":0,"status":"alive","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":2,"vp":[-6,-6,4],"awards":[{"p":0,"reason":"surrender","points":-2},{"p":0,"reason":"captured","points":-4},{"p":1,"reason":"surrender","points":-2},{"p":1,"reason":"captured","points":-4},{"p":2,"reason":"survive","points":2},{"p":2,"reason":"hold_field","points":2}],"endReason":"surrender","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":0,"lastTurn":{"turn":1,"seed":"016ca09db33e4815d99d6bd4d67e2c0a718862b6b614067d0d142507ac7fae3f","cards":[],"plans":["1f:ahead","","1f:ahead"],"events":[{"seg":2,"p":0,"kind":"move","action":"advance","from":"A-D5","to":"A-D6","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":3,"chart":"","status":""},{"seg":2,"p":2,"kind":"move","action":"advance","from":"A-E8","to":"A-E9","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":5,"chart":"","status":""}],"start":[{"hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H7","facing":0,"down":false,"delay":0,"status":"out","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-E8","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}}

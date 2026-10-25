// PKGPATH: gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z1_create_join_filetest

package z1_create_join_filetest

import (
	"testing"

	gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
)

// A game is created, then joined: the JSON view and the events.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	println(gnoslinger.GameJSON(id))
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	println(gnoslinger.GameJSON(id))
	println(gnoslinger.GamesJSON(bob.String()))
}

// Output:
// {"id":"0000001","rev":1,"phase":"waiting","turn":1,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"","name":"","char":"","hex":"","facing":0,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":-1,"vp":[0,0],"awards":[],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":0,"commitUntil":0,"revealUntil":0,"lockRound":0,"lastTurn":null}
// {"id":"0000001","rev":2,"phase":"planning","turn":1,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-H7","facing":0,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":-1,"vp":[0,0],"awards":[],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":1234740690,"commitUntil":1234740690,"revealUntil":1234740990,"lockRound":-152687517,"lastTurn":null}
// {"name":"","open":[],"live":[{"id":"0000001","rev":2,"phase":"planning","turn":1,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":1234740690,"lockRound":-152687517,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","committed":false,"revealed":false},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","status":"alive","committed":false,"revealed":false}]}],"mine":[{"id":"0000001","rev":2,"phase":"planning","turn":1,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":1234740690,"lockRound":-152687517,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","committed":false,"revealed":false},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","status":"alive","committed":false,"revealed":false}]}]}

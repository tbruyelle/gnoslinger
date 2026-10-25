// PKGPATH: gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z15_surrender_goes_on_filetest

package z15_surrender_goes_on_filetest

import (
	"testing"

	gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
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
	gnoslinger.Commit(cross(cur), id, 1, gnoslinger.PlanHash(id, 1, 0, "ab", "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(carol))
	gnoslinger.Commit(cross(cur), id, 1, gnoslinger.PlanHash(id, 1, 2, "ab", "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Surrender(cross(cur), id) // the others' plans are committed: the reveals start
	gnoslinger.RevealMany(cross(cur), id, 1, "0;2", "ab;ab", "1f:ahead;1f:ahead")
	println(gnoslinger.GamesJSON(bob.String()))
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.Surrender(cross(cur), id)
	println(gnoslinger.GameJSON(id))
}

// Output:
// {"name":"","open":[],"live":[{"id":"0000001","rev":7,"phase":"planning","turn":2,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0,0],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":1234740690,"lockRound":-152687517,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","committed":false,"revealed":false},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","status":"out","committed":false,"revealed":false},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"reb","status":"alive","committed":false,"revealed":false}]}],"mine":[{"id":"0000001","rev":7,"phase":"planning","turn":2,"maxTurns":10,"timeout":172800,"winner":-1,"vp":[0,0,0],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":1234740690,"lockRound":-152687517,"players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","status":"alive","committed":false,"revealed":false},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","status":"out","committed":false,"revealed":false},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"reb","status":"alive","committed":false,"revealed":false}]}]}
// {"id":"0000001","rev":8,"phase":"finished","turn":2,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D6","facing":3,"down":false,"delay":0,"status":"out","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-H7","facing":0,"down":false,"delay":0,"status":"out","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1carol0000000000000000000000000000000","name":"","char":"reb","hex":"A-E9","facing":3,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":"","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":2,"vp":[-6,-6,4],"awards":[{"p":0,"reason":"surrender","points":-2},{"p":0,"reason":"captured","points":-4},{"p":1,"reason":"surrender","points":-2},{"p":1,"reason":"captured","points":-4},{"p":2,"reason":"survive","points":2},{"p":2,"reason":"hold_field","points":2}],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"surrender","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":0,"commitUntil":0,"revealUntil":0,"lockRound":0,"lastTurn":{"turn":1,"seed":"caea8b59f7fbbb2856d16561204c73863a1c21925d39e0bcc4ae8c8f36897160","cards":[],"plans":["1f:ahead","","1f:ahead"],"events":[{"seg":2,"p":0,"kind":"move","action":"advance","from":"A-D5","to":"A-D6","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":3,"chart":"","status":""},{"seg":2,"p":2,"kind":"move","action":"advance","from":"A-E8","to":"A-E9","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":5,"chart":"","status":""}],"start":[{"hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H7","facing":0,"down":false,"delay":0,"status":"out","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-E8","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[]}}

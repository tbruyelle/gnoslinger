// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z8_timeout_claim_filetest

package z8_timeout_claim_filetest

import (
	"testing"

	gnoslinger "gno.land/r/tbruyelle/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
)

// After 30 minutes without the second plan, anyone can claim the turn: it
// is passed for bob. At the third turn in a row bob is out and the game ends.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 2, 10, 30, "A-D5", 3) // 30 minute timeout
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	for i := 0; i < 3; i++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		gnoslinger.SubmitPlan(cross(cur), id, "")
		testing.SkipHeights(361) // 5s per height
		testing.SetRealm(testing.NewUserRealm(carol))
		gnoslinger.ClaimTimeout(cross(cur), id)
	}
	println(gnoslinger.GameJSON(id))
}

// Output:
// {"id":"0000001","rev":8,"phase":"finished","turn":3,"maxTurns":10,"timeout":1800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","submitted":true,"missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-H7","facing":0,"down":false,"delay":0,"status":"out","submitted":false,"missed":3,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":0,"vp":[4,-6],"awards":[{"p":0,"reason":"survive","points":2},{"p":0,"reason":"hold_field","points":2},{"p":1,"reason":"surrender","points":-2},{"p":1,"reason":"captured","points":-4}],"endReason":"timeout","createdAt":1234567890,"updatedAt":1234573305,"timeoutAt":0,"lastTurn":{"turn":2,"seed":"e8d1f8cf469e167157cf268f22c3c562ea161c2a33a665bd6d8053c3403ed1e6","cards":[],"plans":["",""],"events":[],"start":[{"hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H7","facing":0,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}}

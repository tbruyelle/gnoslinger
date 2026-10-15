// PKGPATH: gno.land/r/tbruyelle/gnoslinger/v0/filetests/z9_surrender_filetest

package z9_surrender_filetest

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
	id := gnoslinger.CreateGame(cross(cur), "marshal", 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "the_kid", "A-E9", 0)
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Surrender(cross(cur), id)
	println(gnoslinger.GameJSON(id))
}

// Output:
// {"id":"0000001","rev":3,"phase":"finished","turn":1,"maxTurns":10,"timeout":172800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-G5","facing":3,"down":false,"delay":0,"status":"alive","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-E9","facing":0,"down":false,"delay":0,"status":"out","submitted":false,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":0,"vp":[4,-6],"awards":[{"p":0,"reason":"survive","points":2},{"p":0,"reason":"hold_field","points":2},{"p":1,"reason":"surrender","points":-2},{"p":1,"reason":"captured","points":-4}],"endReason":"surrender","createdAt":1234567890,"updatedAt":1234567890,"timeoutAt":0,"lastTurn":null}

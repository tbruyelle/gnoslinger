// PKGPATH: gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z8_timeout_claim_filetest

package z8_timeout_claim_filetest

import (
	"testing"

	gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
	carol address = "g1carol0000000000000000000000000000000"
)

// After 30 minutes without the second plan, anyone can claim the turn: it
// is passed for bob, and alice's plan is revealed. At the third turn in a
// row bob is out and the game ends.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 2, 10, 30, "A-D5", 3) // 30 minute timeout
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	for turn := 1; turn <= 3; turn++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		gnoslinger.Commit(cross(cur), id, turn, gnoslinger.PlanHash(id, turn, 0, "ab", ""), "locked")
		testing.SkipHeights(361) // 5s per height
		testing.SetRealm(testing.NewUserRealm(carol))
		gnoslinger.ClaimTimeout(cross(cur), id)
		if turn < 3 {
			gnoslinger.Reveal(cross(cur), id, turn, 0, "ab", "")
		}
	}
	println(gnoslinger.GameJSON(id))
}

// Output:
// {"id":"0000001","rev":10,"phase":"finished","turn":3,"maxTurns":10,"timeout":1800,"board":"A","players":[{"addr":"g1alice00000000000000000000000000000000","name":"","char":"marshal","hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","committed":true,"revealed":false,"locked":"locked","missed":0,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"addr":"g1bob0000000000000000000000000000000000","name":"","char":"the_kid","hex":"A-H7","facing":0,"down":false,"delay":0,"status":"out","committed":false,"revealed":false,"locked":"","missed":3,"playedFoot":false,"playedRun":false,"ranLastTurn":false,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[],"winner":0,"vp":[4,-6],"awards":[{"p":0,"reason":"survive","points":2},{"p":0,"reason":"hold_field","points":2},{"p":1,"reason":"surrender","points":-2},{"p":1,"reason":"captured","points":-4}],"stake":0,"pot":0,"payouts":[],"houseCut":0,"endReason":"timeout","createdAt":1234567890,"updatedAt":1234573305,"timeoutAt":0,"commitUntil":0,"revealUntil":0,"lockRound":0,"lastTurn":{"turn":2,"seed":"e7a9dfa38f3c56077b6b194ea4fdf12c325853c4290d003d01de5436755d32b2","cards":[],"plans":["",""],"events":[],"start":[{"hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H7","facing":0,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}],"ground":[]}}

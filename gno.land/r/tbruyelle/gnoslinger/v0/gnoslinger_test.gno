package gnoslinger

import (
	"strconv"
	"strings"
	"testing"

	"gno.land/p/tbruyelle/gnoslinger/engine/v0"
	"gno.land/p/tbruyelle/gnoslinger/hex/v0"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	profiles "gno.land/r/tbruyelle/gnoslinger/profiles/v0"
)

// salt is the salt every test plan is committed with.
const salt = "ab"

// hashOf is what seat commits for plan in the turn in progress of game id.
func hashOf(id string, seat int, plan string) string {
	return PlanHash(id, getGame(id).Turn, seat, salt, plan)
}

var (
	alice = testutils.TestAddress("alice")
	bob   = testutils.TestAddress("bob")
	carol = testutils.TestAddress("carol")
)

func TestCreateAndJoin(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 20, 0, "A-D5", 3)
	g := getGame(id)
	uassert.Equal(t, "waiting", g.Phase.String())
	uassert.Equal(t, 20, g.MaxTurns)
	uassert.Equal(t, int64(DefaultTimeout), int64(g.Timeout))
	uassert.Equal(t, 1, g.Turn)
	uassert.Equal(t, 1, g.Rev)
	uassert.Equal(t, -1, g.Winner)
	uassert.Equal(t, alice.String(), g.Players[0].Addr.String())
	uassert.Equal(t, "marshal", g.Players[0].Char)
	uassert.Equal(t, "", g.Players[1].Addr.String())
	uassert.True(t, openGames.Has(id))
	uassert.Equal(t, "A-D5", g.State.Chars[0].Hex)
	uassert.Equal(t, int(hex.S), int(g.State.Chars[0].Facing))
	uassert.Equal(t, "", g.State.Chars[1].Hex) // nobody there yet

	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"id":"`+id+`"`), js)
	uassert.True(t, strings.Contains(js, `"phase":"waiting"`), js)
	uassert.True(t, strings.Contains(js, `"hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","committed":false,"revealed":false,"locked":""`), js)
	uassert.True(t, strings.Contains(js, `"lastTurn":null}`), js)
	uassert.True(t, strings.Contains(js, `"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]`), js)

	uassert.AbortsWithMessage(t, cur, "gnoslinger: you cannot join your own game", func() {
		JoinGame(cross(cur), id, "A-H7", 0)
	})

	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, 2, g.Rev)
	uassert.Equal(t, bob.String(), g.Players[1].Addr.String())
	uassert.Equal(t, "A-H7", g.State.Chars[1].Hex)
	uassert.Equal(t, int(hex.N), int(g.State.Chars[1].Facing))
	uassert.False(t, openGames.Has(id))

	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is not open", func() {
		JoinGame(cross(cur), id, "A-H7", 0)
	})

	// Both players find the game in their list; carol has none.
	uassert.True(t, strings.Contains(GamesJSON(alice.String()), `"mine":[{"id":"`+id+`"`))
	uassert.True(t, strings.Contains(GamesJSON(bob.String()), `"mine":[{"id":"`+id+`"`))
	uassert.True(t, strings.HasSuffix(GamesJSON(carol.String()), `"mine":[]}`))
}

func TestCreateValidation(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: seats must be between 2 and 4", func() {
		CreateGame(cross(cur), 1, 10, 0, "A-D5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: seats must be between 2 and 4", func() {
		CreateGame(cross(cur), 5, 10, 0, "A-D5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: maxTurns must be between 10 and 30", func() {
		CreateGame(cross(cur), 2, 31, 0, "A-D5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: maxTurns must be between 10 and 30", func() {
		CreateGame(cross(cur), 2, 9, 0, "A-D5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: maxTurns must be between 10 and 30", func() {
		CreateGame(cross(cur), 2, 0, 0, "A-D5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: timeoutMinutes must be between 5 and 43200", func() {
		CreateGame(cross(cur), 2, 10, 43201, "A-D5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: timeoutMinutes must be between 5 and 43200", func() {
		CreateGame(cross(cur), 2, 10, 4, "A-D5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game not found", func() {
		JoinGame(cross(cur), "9999999", "A-H7", 0)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: invalid game id", func() {
		JoinGame(cross(cur), "nope", "A-H7", 0)
	})
}

func TestSetUp(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	// The creator is the marshal, in one of its hexes, facing one of the six directions.
	uassert.AbortsWithMessage(t, cur, "gnoslinger: marshal sets up in A-D5, A-D6, A-D7, A-E6, A-E7, not in A-F3", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-F3", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: marshal sets up in A-D5, A-D6, A-D7, A-E6, A-E7, not in A-H6", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-H6", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: facing must be between 0 (N) and 5 (NW)", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-D5", 6)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: facing must be between 0 (N) and 5 (NW)", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-D5", -1)
	})
	id := CreateGame(cross(cur), 3, 10, 0, "A-D6", 2)
	g := getGame(id)
	uassert.Equal(t, 3, g.seats())
	uassert.Equal(t, "marshal", g.Players[0].Char)
	uassert.Equal(t, "A-D6", g.State.Chars[0].Hex)
	uassert.Equal(t, int(hex.SE), int(g.State.Chars[0].Facing))
	uassert.False(t, g.State.Chars[0].Down)
	uassert.True(t, strings.Contains(GameJSON(id), `{"addr":"","name":"","char":"","hex":"","facing":0`), GameJSON(id))

	// The first joiner is the kid, in its own hexes; the second the reb.
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the_kid sets up in A-H5, A-H6, A-H7, A-G6, A-G7, not in A-G9", func() {
		JoinGame(cross(cur), id, "A-G9", 0)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the_kid sets up in A-H5, A-H6, A-H7, A-G6, A-G7, not in A-I11*", func() {
		JoinGame(cross(cur), id, "A-I11*", 0)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: facing must be between 0 (N) and 5 (NW)", func() {
		JoinGame(cross(cur), id, "A-H7", 7)
	})
	JoinGame(cross(cur), id, "A-H7", 5)
	uassert.Equal(t, "waiting", g.Phase.String()) // a seat is still free
	uassert.True(t, openGames.Has(id))
	uassert.Equal(t, "the_kid", g.Players[1].Char)
	uassert.Equal(t, "A-H7", g.State.Chars[1].Hex)
	uassert.Equal(t, int(hex.NW), int(g.State.Chars[1].Facing))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you are already in this game", func() {
		JoinGame(cross(cur), id, "A-F8", 0)
	})
	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: reb sets up in A-E8, A-F7, A-F8, A-G8, not in A-H6", func() {
		JoinGame(cross(cur), id, "A-H6", 0)
	})
	JoinGame(cross(cur), id, "A-F8", 4)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.False(t, openGames.Has(id))
	uassert.Equal(t, "reb", g.Players[2].Char)
	uassert.Equal(t, "A-F8", g.State.Chars[2].Hex)
	uassert.True(t, strings.Contains(GameJSON(id), `"char":"reb","hex":"A-F8","facing":4`), GameJSON(id))
	uassert.True(t, strings.Contains(Render("game/"+id), "| A-D6 | SE |"))
	uassert.True(t, strings.Contains(Render("game/"+id), "| A-F8 | SW |"))
	uassert.True(t, strings.Contains(Render(""), "marshal vs the\\_kid vs reb"), Render(""))
}

func TestCommitAndReveal(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	g := getGame(id)
	rev := g.Rev

	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you are not a player of this game", func() {
		Commit(cross(cur), id, hashOf(id, 0, "1f:ahead"), "locked")
	})

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the hash must be 64 hex characters", func() {
		Commit(cross(cur), id, "1f:ahead", "locked")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the hash must be 64 hex characters", func() {
		Commit(cross(cur), id, strings.ToUpper(hashOf(id, 0, "")), "locked")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: a commit needs its timelocked plan", func() {
		Commit(cross(cur), id, hashOf(id, 0, ""), "")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the timelocked plan is over 1024 bytes", func() {
		Commit(cross(cur), id, hashOf(id, 0, "locked"), strings.Repeat("x", MaxLocked+1))
	})
	// Alice is not the last to commit: her plan may not go in clear.
	uassert.AbortsWithMessage(t, cur, "gnoslinger: only the last plan to commit may be revealed at once", func() {
		Reveal(cross(cur), id, 1, 0, salt, "1f:ahead,2f:ahead")
	})

	r := Commit(cross(cur), id, hashOf(id, 0, "1f:ahead,2f:ahead"), "sealed")
	uassert.Equal(t, rev+1, r)
	uassert.True(t, g.committed(0))
	uassert.False(t, g.committed(1))
	uassert.False(t, g.Revealed[0])
	uassert.Equal(t, "", g.Plans[0]) // hidden until revealed
	uassert.Equal(t, `{"id":"`+id+`","turn":1,"seat":0,"committed":true,"revealed":false,"plan":""}`, PlanJSON(id, alice.String()))
	uassert.Equal(t, `{"id":"`+id+`","turn":1,"seat":1,"committed":false,"revealed":false,"plan":""}`, PlanJSON(id, bob.String()))
	uassert.Equal(t, `{"id":"`+id+`","turn":1,"seat":-1,"committed":false,"revealed":false,"plan":""}`, PlanJSON(id, carol.String()))
	uassert.Equal(t, PlanJSON(id, alice.String()), Render("json/plan/"+id+"/"+alice.String()))
	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"committed":true,"revealed":false,"locked":"sealed","missed":0`), js)
	uassert.True(t, strings.Contains(js, `"commitUntil":`+strconv.FormatInt(g.commitUntil().Unix(), 10)+`,"revealUntil":`+strconv.FormatInt(g.revealUntil().Unix(), 10)+`,"lockRound":`+strconv.FormatInt(g.lockRound(), 10)+`,`), js)
	uassert.Equal(t, int64(300), g.revealUntil().Unix()-g.commitUntil().Unix())
	uassert.True(t, strings.Contains(GamesJSON(alice.String()), `"status":"alive","committed":true,"revealed":false}`), GamesJSON(alice.String()))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: plan already submitted for this turn", func() {
		Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: plan already submitted for this turn", func() {
		Reveal(cross(cur), id, 1, 0, salt, "1f:ahead,2f:ahead")
	})
	// Before every plan is committed, only a seat's own player reveals it.
	uassert.AbortsWithMessage(t, cur, "gnoslinger: only its player may reveal a plan before every plan is committed", func() {
		Reveal(cross(cur), id, 1, 1, salt, "5b")
	})

	// Bob is the last to commit: his plan may go in clear at once, but it
	// must still be a valid plan.
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you cannot use both sides of a card", func() {
		Reveal(cross(cur), id, 1, 1, salt, "1f:ahead,1b:back")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: those actions cost more time points than you have", func() {
		Reveal(cross(cur), id, 1, 1, salt, "1b:back,5b")
	})
	uassert.AbortsWithMessage(t, cur, `gnoslinger: invalid action "1x"`, func() {
		Reveal(cross(cur), id, 1, 1, salt, "1x")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: that action is not available yet", func() {
		Reveal(cross(cur), id, 1, 1, salt, "8b")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the salt must be 1 to 64 hex characters", func() {
		Reveal(cross(cur), id, 1, 1, "", "5b")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: turn 2 is not the turn in progress", func() {
		Reveal(cross(cur), id, 2, 1, salt, "5b")
	})
	r = Reveal(cross(cur), id, 1, 1, salt, "5b")
	uassert.Equal(t, rev+2, r)
	uassert.Equal(t, "revealing", g.Phase.String())
	uassert.True(t, g.Revealed[1])
	uassert.Equal(t, "5b", g.Plans[1])
	uassert.Equal(t, `{"id":"`+id+`","turn":1,"seat":1,"committed":true,"revealed":true,"plan":"5b"}`, PlanJSON(id, bob.String()))
	uassert.True(t, strings.Contains(GameJSON(id), `"phase":"revealing"`))
	uassert.True(t, strings.Contains(GameJSON(id), `"timeoutAt":`+strconv.FormatInt(g.revealUntil().Unix(), 10)+`,`))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: that plan is already revealed", func() {
		Reveal(cross(cur), id, 1, 1, salt, "5b")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is not accepting plans", func() {
		Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the plans are being revealed: surrender at the start of a turn", func() {
		Surrender(cross(cur), id)
	})

	// Anyone may reveal a committed plan, with its salt and plan.
	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the salt and plan do not match seat 0's commit", func() {
		Reveal(cross(cur), id, 1, 0, "cd", "1f:ahead,2f:ahead")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the salt and plan do not match seat 0's commit", func() {
		Reveal(cross(cur), id, 1, 0, salt, "1f:ahead")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: there is no seat 2 in this game", func() {
		Reveal(cross(cur), id, 1, 2, salt, "")
	})
	// The last reveal resolves the turn in the same call.
	r = Reveal(cross(cur), id, 1, 0, salt, "1f:ahead,2f:ahead")
	uassert.Equal(t, rev+3, r)
	uassert.Equal(t, rev+3, GameRev(id))
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.False(t, g.committed(0))
	uassert.False(t, g.committed(1))
	uassert.Equal(t, "", g.Plans[0])
	uassert.Equal(t, "", g.Salts[0])
	uassert.Equal(t, "", g.Commits[0].Locked)
	lt := g.lastTurn()
	if lt == nil {
		t.Fatal("no turn result")
	}
	uassert.Equal(t, 1, len(g.Turns))
	uassert.Equal(t, 1, lt.Turn)
	uassert.Equal(t, "1f:ahead,2f:ahead", lt.Plans[0])
	uassert.Equal(t, "5b", lt.Plans[1])
	uassert.Equal(t, 64, len(lt.Seed))
	uassert.Equal(t, "A-D5", lt.Start()[0].Hex)
	uassert.Equal(t, "A-H7", lt.Start()[1].Hex)
	// Alice advanced G5->G6 on segment 2 and ran G6->G7 on segment 3;
	// Bob dropped on segment 3.
	uassert.Equal(t, 3, len(lt.Events()))
	uassert.Equal(t, "A-D7", g.State.Chars[0].Hex)
	uassert.Equal(t, "A-H7", g.State.Chars[1].Hex)
	uassert.True(t, g.State.Chars[1].Down)
	uassert.False(t, g.State.Chars[0].PlayedFoot) // cleared at end of turn

	js = GameJSON(id)
	uassert.True(t, strings.Contains(js, `"turn":2`), js)
	uassert.True(t, strings.Contains(js, `"lastTurn":{"turn":1,"seed":"`+lt.Seed+`","cards":[],"plans":["1f:ahead,2f:ahead","5b"],"events":[`), js)
	uassert.True(t, strings.Contains(js, `"start":[{"hex":"A-D5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H7","facing":0,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}}`), js)

	// Alice ran on turn 1, so she may sprint on turn 2; Bob did not.
	uassert.True(t, g.State.Chars[0].RanLastTurn)
	uassert.False(t, g.State.Chars[1].RanLastTurn)
	uassert.True(t, strings.Contains(js, `"playedRun":false,"ranLastTurn":true,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[`), js)

	// A second turn: the history keeps both, oldest first.
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "1f:ahead,2f:ahead,3f"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: sprint can only be played after a run on the previous turn", func() {
		Reveal(cross(cur), id, 2, 1, salt, "1f:ahead,2f:ahead,3f")
	})
	Reveal(cross(cur), id, 2, 1, salt, "5b")
	Reveal(cross(cur), id, 2, 0, salt, "1f:ahead,2f:ahead,3f")
	uassert.Equal(t, 2, len(g.Turns))
	h := HistoryJSON(id)
	uassert.True(t, strings.HasPrefix(h, `{"id":"`+id+`","turn":3,"phase":"planning","players":[`), h)
	uassert.True(t, strings.Contains(h, `"turns":[{"turn":1,`), h)
	uassert.True(t, strings.Contains(h, `},{"turn":2,`), h)
	uassert.True(t, strings.Contains(h, `"start":[{"hex":"A-D7","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-H7","facing":0,"down":true,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}`), h)
	uassert.Equal(t, h, Render("json/history/"+id))
	uassert.True(t, strings.Contains(js, `{"seg":2,"p":0,"kind":"move","action":"advance","from":"A-D5","to":"A-D6","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":3,"chart":"","status":""}`), js)
	uassert.True(t, strings.Contains(js, `{"seg":3,"p":1,"kind":"flip","action":"get_up_down","from":"","to":"","facing":0,"down":true,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":4,"chart":"","status":""}`), js)
	uassert.True(t, strings.Contains(js, `"hex":"A-H7","facing":0,"down":true`), js)
}

func TestRevealShortcut(cur realm, t *testing.T) {
	// The last commit in clear: refused while another seat in the fight has
	// not committed; a seat out of the fight is not waited for.
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 3, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-E8", 3)
	g := getGame(id)
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: only the last plan to commit may be revealed at once", func() {
		Reveal(cross(cur), id, 1, 1, salt, "")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: only its player may reveal a plan before every plan is committed", func() {
		Reveal(cross(cur), id, 1, 2, salt, "")
	})
	uassert.Equal(t, "planning", g.Phase.String())
	g.State.Chars[2].Status = engine.Killed
	Reveal(cross(cur), id, 1, 1, salt, "1f:ahead")
	uassert.Equal(t, "revealing", g.Phase.String())
	uassert.Equal(t, 1, g.Turn)
	Reveal(cross(cur), id, 1, 0, salt, "")
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "A-H6", g.State.Chars[1].Hex)
}

func TestRevealMany(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 3, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-E8", 3)
	g := getGame(id)
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "1f:ahead"), "locked")
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is not collecting the reveals", func() {
		RevealMany(cross(cur), id, 1, "0", salt, "1f:ahead")
	})
	testing.SetRealm(testing.NewUserRealm(bob))
	Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(carol))
	Commit(cross(cur), id, hashOf(id, 2, "1f:ahead"), "locked")
	uassert.Equal(t, "revealing", g.Phase.String())
	// Bob reveals his own; an opener then sends the three: bob's is skipped.
	testing.SetRealm(testing.NewUserRealm(bob))
	Reveal(cross(cur), id, 1, 1, salt, "")
	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: seats, salts and plans must list as many entries", func() {
		RevealMany(cross(cur), id, 1, "0;2", salt, "1f:ahead;1f:ahead")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: there is no seat 3 in this game", func() {
		RevealMany(cross(cur), id, 1, "0;3", "ab;ab", "1f:ahead;")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: turn 2 is not the turn in progress", func() {
		RevealMany(cross(cur), id, 2, "0;2", "ab;ab", "1f:ahead;1f:ahead")
	})
	// Bob's is skipped (already revealed), carol's does not match her
	// commit: skipped too, left unrevealed for the claim; alice's goes in.
	RevealMany(cross(cur), id, 1, "0;1;2", "ab;ab;ab", "1f:ahead;;")
	uassert.True(t, g.Revealed[0])
	uassert.False(t, g.Revealed[2])
	uassert.Equal(t, "revealing", g.Phase.String())
	uassert.Equal(t, 1, g.Turn)
	// The right one completes the turn.
	RevealMany(cross(cur), id, 1, "2", "ab", "1f:ahead")
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "planning", g.Phase.String())
	lt := g.lastTurn()
	uassert.Equal(t, "1f:ahead", lt.Plans[0])
	uassert.Equal(t, "", lt.Plans[1])
	uassert.Equal(t, "1f:ahead", lt.Plans[2])
}

func TestUnrevealed(cur realm, t *testing.T) {
	// Every plan committed, alice never reveals and her timelocked copy is
	// not opened: RevealGrace after the deadline, the claim passes her turn
	// as a missed one; only a revealed plan resets the count, so a player
	// who commits and never reveals is out at the third.
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 30, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	g := getGame(id)
	for turn := 1; turn <= MaxMissed; turn++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		Commit(cross(cur), id, hashOf(id, 0, "1f:ahead"), "locked")
		testing.SetRealm(testing.NewUserRealm(bob))
		Reveal(cross(cur), id, turn, 1, salt, "3b:ahead_left")
		testing.SetRealm(testing.NewUserRealm(carol))
		uassert.AbortsWithMessage(t, cur, "gnoslinger: the plans can still be revealed", func() {
			ClaimTimeout(cross(cur), id)
		})
		testing.SkipHeights(361) // past the deadline, not the grace
		uassert.AbortsWithMessage(t, cur, "gnoslinger: the plans can still be revealed", func() {
			ClaimTimeout(cross(cur), id)
		})
		testing.SkipHeights(60)
		ClaimTimeout(cross(cur), id)
		uassert.Equal(t, turn, g.Missed[0])
		if turn < MaxMissed {
			// Passed: the turn resolves with bob's plan, alice still fights.
			uassert.Equal(t, "planning", g.Phase.String())
			uassert.Equal(t, turn+1, g.Turn)
			uassert.Equal(t, "alive", g.State.Chars[0].Status.String())
			uassert.Equal(t, "", g.lastTurn().Plans[0])
			uassert.Equal(t, "3b:ahead_left", g.lastTurn().Plans[1])
		}
	}
	uassert.Equal(t, "finished", g.Phase.String())
	uassert.Equal(t, "timeout", g.EndReason)
	uassert.Equal(t, "out", g.State.Chars[0].Status.String())
	uassert.Equal(t, 1, g.Winner)
	uassert.False(t, strings.Contains(GameJSON(id), "no_reveal"))

	// A revealed plan resets the count; with three, the turn resolves with
	// the plans revealed and the unrevealed seat's passed.
	testing.SetRealm(testing.NewUserRealm(alice))
	id = CreateGame(cross(cur), 3, 10, 30, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-E8", 3)
	g = getGame(id)
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Commit(cross(cur), id, hashOf(id, 1, "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(carol))
	Reveal(cross(cur), id, 1, 2, salt, "")
	Reveal(cross(cur), id, 1, 1, salt, "1f:ahead")
	testing.SkipHeights(421)
	ClaimTimeout(cross(cur), id)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "alive", g.State.Chars[0].Status.String())
	uassert.Equal(t, 1, g.Missed[0])
	uassert.Equal(t, "A-D5", g.State.Chars[0].Hex)
	uassert.Equal(t, "A-H6", g.State.Chars[1].Hex)
	uassert.Equal(t, 0, g.VP[0])
	// Alice reveals the next turn: her count goes back to 0.
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(carol))
	Reveal(cross(cur), id, 2, 2, salt, "")
	Reveal(cross(cur), id, 2, 0, salt, "")
	uassert.Equal(t, 0, g.Missed[0])
}

func TestMaxTurnsFinish(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	g := getGame(id)
	for turn := 1; turn <= 9; turn++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
		testing.SetRealm(testing.NewUserRealm(bob))
		Reveal(cross(cur), id, turn, 1, salt, "")
		Reveal(cross(cur), id, turn, 0, salt, "")
	}
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Reveal(cross(cur), id, 10, 1, salt, "3b:ahead_left")
	Reveal(cross(cur), id, 10, 0, salt, "")
	uassert.Equal(t, "finished", g.Phase.String())
	uassert.Equal(t, "max_turns", g.EndReason)
	// Both survive: 2 VP each, a draw.
	uassert.Equal(t, 2, g.VP[0])
	uassert.Equal(t, 2, g.VP[1])
	uassert.Equal(t, -1, g.Winner)
	// The last turn closes with them, in its own log.
	last := g.lastTurn().Events()
	uassert.Equal(t, "vp", last[len(last)-1].Kind)
	uassert.Equal(t, "survive", last[len(last)-1].Reason)
	uassert.Equal(t, 2, last[len(last)-1].N)
	uassert.Equal(t, 10, g.Turn)
	uassert.Equal(t, 5, int(g.State.Chars[1].Facing)) // facing N, turned ahead_left: NW
	uassert.True(t, strings.Contains(GameJSON(id), `"phase":"finished"`))
	uassert.True(t, strings.Contains(GameJSON(id), `"timeoutAt":0,"commitUntil":0,"revealUntil":0,"lockRound":0,`))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is not accepting plans", func() {
		Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is not accepting plans", func() {
		Reveal(cross(cur), id, 10, 1, salt, "")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is finished", func() {
		ClaimTimeout(cross(cur), id)
	})
}

func TestSurrender(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	aliceVP := profileOf(alice).VictoryPoints
	bobVP := profileOf(bob).VictoryPoints
	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you are not a player of this game", func() {
		Surrender(cross(cur), id)
	})
	testing.SetRealm(testing.NewUserRealm(bob))
	Surrender(cross(cur), id)
	g := getGame(id)
	uassert.Equal(t, "finished", g.Phase.String())
	uassert.Equal(t, "surrender", g.EndReason)
	uassert.Equal(t, "out", g.State.Chars[1].Status.String())
	// Unhurt, bob surrenders (-2) and is captured (-4); alice survives and holds the field.
	uassert.Equal(t, 4, g.VP[0])
	uassert.Equal(t, -6, g.VP[1])
	uassert.Equal(t, 0, g.Winner)
	uassert.Equal(t, aliceVP+4, profileOf(alice).VictoryPoints)
	uassert.Equal(t, bobVP-6, profileOf(bob).VictoryPoints)
	uassert.True(t, strings.Contains(GameJSON(id), `"vp":[4,-6],"awards":[{"p":0,"reason":"survive","points":2},{"p":0,"reason":"hold_field","points":2},{"p":1,"reason":"surrender","points":-2},{"p":1,"reason":"captured","points":-4}]`))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is not in progress", func() {
		Surrender(cross(cur), id)
	})
}

func TestCancel(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: only the creator can cancel the game", func() {
		CancelGame(cross(cur), id)
	})
	testing.SetRealm(testing.NewUserRealm(alice))
	CancelGame(cross(cur), id)
	uassert.False(t, games.Has(id))
	uassert.False(t, openGames.Has(id))
	uassert.False(t, strings.Contains(GamesJSON(alice.String()), `"id":"`+id+`"`))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game not found", func() {
		CancelGame(cross(cur), id)
	})
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game not found", func() {
		JoinGame(cross(cur), id, "A-H7", 0)
	})
}

func TestClaimTimeout(cur realm, t *testing.T) {
	// A game waiting for players has no timeout: it stays open, and the
	// turn clock starts with the last join.
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 30, "A-D5", 3)
	testing.SkipHeights(361) // 5s per height: past the 30 minute timeout picked above
	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the game is waiting for players: it has no timeout", func() {
		ClaimTimeout(cross(cur), id)
	})
	g := getGame(id)
	uassert.True(t, openGames.Has(id))
	uassert.True(t, strings.Contains(GameJSON(id), `"timeoutAt":0,`))
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the game has not timed out yet", func() {
		ClaimTimeout(cross(cur), id)
	})
	// The turn's clock is fixed at its start: a plan sent late in the turn
	// does not give the others more time.
	testing.SkipHeights(300) // 25 minutes
	Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	testing.SkipHeights(61) // 30 minutes and 5 seconds after the turn started
	testing.SetRealm(testing.NewUserRealm(carol))
	ClaimTimeout(cross(cur), id)
	// Alice missed the turn: passed for her; bob's plan is still to reveal.
	uassert.Equal(t, "revealing", g.Phase.String())
	uassert.Equal(t, 1, g.Missed[0])
	Reveal(cross(cur), id, 1, 1, salt, "")
	uassert.Equal(t, 2, g.Turn)

	// One plan in: the other player misses the turn, passed for them.
	testing.SetRealm(testing.NewUserRealm(alice))
	id = CreateGame(cross(cur), 2, 10, 30, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
	testing.SkipHeights(361)
	testing.SetRealm(testing.NewUserRealm(carol))
	ClaimTimeout(cross(cur), id)
	g = getGame(id)
	Reveal(cross(cur), id, 1, 0, salt, "")
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, 1, g.Missed[1])
	uassert.Equal(t, "", g.lastTurn().Plans[1])
	uassert.Equal(t, "alive", g.State.Chars[1].Status.String())
	// A revealed plan resets the count, a commit alone does not.
	testing.SetRealm(testing.NewUserRealm(bob))
	Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	uassert.Equal(t, 1, g.Missed[1])
	testing.SetRealm(testing.NewUserRealm(alice))
	Reveal(cross(cur), id, 2, 0, salt, "")
	Reveal(cross(cur), id, 2, 1, salt, "")
	uassert.Equal(t, 0, g.Missed[1])
	uassert.Equal(t, 3, g.Turn)
	// Three missed turns in a row: out of the fight, the game ends.
	for i := 0; i < MaxMissed; i++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
		testing.SkipHeights(361)
		testing.SetRealm(testing.NewUserRealm(carol))
		ClaimTimeout(cross(cur), id)
		if g.Phase == PhaseRevealing {
			Reveal(cross(cur), id, g.Turn, 0, salt, "")
		}
	}
	uassert.Equal(t, 5, g.Turn)
	uassert.Equal(t, 3, g.Missed[1])
	uassert.Equal(t, "timeout", g.EndReason)
	// Out of time counts as surrendering.
	uassert.Equal(t, 4, g.VP[0])
	uassert.Equal(t, -6, g.VP[1])
	uassert.Equal(t, 0, g.Winner)
	uassert.Equal(t, "out", g.State.Chars[1].Status.String())

	// No plan in: abandoned.
	testing.SetRealm(testing.NewUserRealm(alice))
	id = CreateGame(cross(cur), 2, 10, 30, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SkipHeights(361)
	ClaimTimeout(cross(cur), id)
	g = getGame(id)
	uassert.Equal(t, "abandoned", g.EndReason)
	uassert.Equal(t, -1, g.Winner)
	uassert.Equal(t, 0, len(g.Awards))
	uassert.Equal(t, "alive", g.State.Chars[0].Status.String())
}

func TestLateMoves(cur realm, t *testing.T) {
	// Past the turn's deadline a running game takes no commit, nor a last
	// plan in clear: it can only be claimed.
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 30, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
	testing.SkipHeights(361)
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: out of time: the game can only be claimed now", func() {
		Commit(cross(cur), id, hashOf(id, 1, "1f:ahead"), "locked")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: out of time: the game can only be claimed now", func() {
		Reveal(cross(cur), id, 1, 1, salt, "1f:ahead")
	})
	ClaimTimeout(cross(cur), id)
	uassert.Equal(t, "revealing", getGame(id).Phase.String())
	uassert.Equal(t, 1, getGame(id).Missed[1])
}

func TestRender(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	home := Render("")
	uassert.True(t, strings.Contains(home, "# Gnoslinger"), home)
	uassert.True(t, strings.Contains(home, "/r/tbruyelle/gnoslinger/v0:game/"+id), home)
	uassert.True(t, strings.Contains(home, "marshal vs the\\_kid"), home)

	page := Render("game/" + id)
	uassert.True(t, strings.Contains(page, "# Game "+id), page)
	uassert.True(t, strings.Contains(page, "| A-D5 | S |"), page)
	uassert.True(t, strings.Contains(page, "planning"), page)
	uassert.True(t, strings.Contains(page, "func=Commit"), page)

	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "1f:ahead"), "locked")
	page = Render("game/" + id)
	uassert.True(t, strings.Contains(page, "| alive | committed |"), page)
	testing.SetRealm(testing.NewUserRealm(bob))
	Reveal(cross(cur), id, 1, 1, salt, "1f:ahead")
	page = Render("game/" + id)
	uassert.True(t, strings.Contains(page, "| alive | revealed |"), page)
	uassert.True(t, strings.Contains(page, "func=Reveal"), page)
	Reveal(cross(cur), id, 1, 0, salt, "1f:ahead")
	page = Render("game/" + id)
	uassert.True(t, strings.Contains(page, "seg 2: marshal advance: A-D5 → A-D6"), page)
	uassert.True(t, strings.Contains(page, "seg 2: the\\_kid advance: A-H7 → A-H6"), page)

	help := Render("help")
	uassert.True(t, strings.Contains(help, "1f:ahead_left,2f:ahead,3f"), help)
	uassert.True(t, strings.Contains(help, "| 1 | Advance (2) | Back Up (3) |"), help)

	uassert.Equal(t, GameJSON(id), Render("json/game/"+id))
	uassert.Equal(t, GamesJSON(alice.String()), Render("json/games/"+alice.String()))
}

func TestDrawAndCock(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "9f:1:0"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you have no such gun", func() {
		Reveal(cross(cur), id, 1, 1, salt, "9f:2:0")
	})
	Reveal(cross(cur), id, 1, 1, salt, "")
	Reveal(cross(cur), id, 1, 0, salt, "9f:1:0")
	g := getGame(id)
	gun := g.State.Chars[0].Guns[0]
	uassert.Equal(t, "gun_hand", gun.Location.String())
	uassert.True(t, gun.Cocked)
	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"location":"gun_hand","cocked":true,"shells":6`), js)
	uassert.True(t, strings.Contains(js, `{"seg":3,"p":0,"kind":"draw","action":"draw_and_cock","from":"holstered","to":"gun_hand","facing":0,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"colt45","gunId":1,"step":3,"chart":"","status":""}`), js)
	// Drawing again into the gun hand: the gun is already there.
	Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: that gun is already there", func() {
		Reveal(cross(cur), id, 2, 0, salt, "9f:1:0")
	})
}

func TestShootout(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D6", 2) // looking south-east at the kid, four hexes east
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H6", 5)
	g := getGame(id)

	// Turn 1: both draw and cock. Turn 2: alice aims twice (4 AIM points).
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "9f:1:0"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Reveal(cross(cur), id, 1, 1, salt, "9f:1:0")
	Reveal(cross(cur), id, 1, 0, salt, "9f:1:0")
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "5f:aim:@1,6f:aim:@1"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Reveal(cross(cur), id, 2, 1, salt, "")
	Reveal(cross(cur), id, 2, 0, salt, "5f:aim:@1,6f:aim:@1")
	uassert.Equal(t, 4, g.State.Chars[0].Aim)
	uassert.True(t, g.State.Chars[0].Guns[0].Cocked)
	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"ranLastTurn":false,"aim":4,"aimAt":1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"gun_hand","cocked":true,"shells":6,"capacity":6,"jammed":false,"exploded":false}]`), js)
	uassert.True(t, strings.Contains(js, `"ground":[]`), js)

	// Turn 3: alice shoots (aim time 1 + 4 = 5, range 4); bob does nothing with his gun.
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "7f:shoot:@1"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Reveal(cross(cur), id, 3, 1, salt, "7f")
	Reveal(cross(cur), id, 3, 0, salt, "7f:shoot:@1")
	lt := g.lastTurn()
	var shot *engine.Event
	evs := lt.Events()
	for i := range evs {
		if evs[i].Kind == engine.EvShot {
			shot = &evs[i]
		}
	}
	if shot == nil {
		t.Fatalf("no shot event: %v", evs)
	}
	uassert.Equal(t, 0, shot.Player)
	uassert.Equal(t, 1, shot.Target)
	uassert.Equal(t, 4, shot.Range)
	uassert.Equal(t, 1, shot.Seg)
	if shot.Reason != engine.ReasonMisfire {
		uassert.Equal(t, 5, shot.N)
	}
	uassert.Equal(t, 0, g.State.Chars[0].Aim)
	uassert.False(t, g.State.Chars[0].Guns[0].Cocked)
	uassert.True(t, g.State.Chars[0].Guns[0].Shells <= 5)
	uassert.True(t, len(lt.Cards()) >= 1)
	uassert.True(t, strings.Contains(GameJSON(id), `"kind":"shot"`))
	uassert.True(t, strings.Contains(Render("game/"+id), "shoots the\\_kid in A-H6 (card "))
}

func TestAutoPass(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	g := getGame(id)
	// Alice carries 5 delay: she cannot play anything, so bob's commit
	// alone starts the reveals and his reveal resolves the turn; her pass
	// is recorded as an empty plan.
	g.State.Chars[0].Delay = 5
	g.State.Chars[0].PlayedFoot = true
	Commit(cross(cur), id, hashOf(id, 1, "1f:ahead"), "locked")
	uassert.Equal(t, "revealing", g.Phase.String())
	uassert.True(t, g.Revealed[0])
	Reveal(cross(cur), id, 1, 1, salt, "1f:ahead")
	uassert.Equal(t, 2, g.Turn)
	lt := g.lastTurn()
	uassert.Equal(t, "", lt.Plans[0])
	uassert.Equal(t, "1f:ahead", lt.Plans[1])
	uassert.False(t, lt.Start()[0].PlayedFoot)
	uassert.Equal(t, 2, g.State.Chars[0].Delay) // 5 -> 2: she can play 3 points now
	uassert.False(t, g.committed(0))
	uassert.False(t, g.committed(1))
	// Both unable to act: the turns resolve by themselves until someone can play.
	g.State.Chars[0].Delay = 6
	g.State.Chars[1].Delay = 5
	progress(cur, g)
	uassert.Equal(t, 3, g.Turn)
	uassert.Equal(t, 3, g.State.Chars[0].Delay) // 6 -> 3
	uassert.Equal(t, 2, g.State.Chars[1].Delay) // 5 -> 2
	uassert.Equal(t, 2, len(g.Turns))
	uassert.Equal(t, "planning", g.Phase.String())
}

func TestProfiles(cur realm, t *testing.T) {
	dave := testutils.TestAddress("dave")
	erin := testutils.TestAddress("erin")
	_, ok := profiles.Get(dave)
	uassert.False(t, ok)

	// Creating a game makes the profile; the game counts once it starts.
	testing.SetRealm(testing.NewUserRealm(dave))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	uassert.Equal(t, 0, profileOf(dave).GamesPlayed)
	CancelGame(cross(cur), id)
	uassert.Equal(t, 0, profileOf(dave).GamesPlayed)

	id = CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(erin))
	JoinGame(cross(cur), id, "A-H7", 0)
	uassert.Equal(t, 1, profileOf(dave).GamesPlayed)
	uassert.Equal(t, 1, profileOf(erin).GamesPlayed)

	// A second game puts dave ahead of erin.
	testing.SetRealm(testing.NewUserRealm(dave))
	CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	id = CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(alice))
	JoinGame(cross(cur), id, "A-H7", 0)
	uassert.Equal(t, 2, profileOf(dave).GamesPlayed)
	uassert.True(t, profiles.Rank(dave) < profiles.Rank(erin))
}

// profileOf is addr's profile in the profiles realm; it must exist.
func profileOf(addr address) profiles.Profile {
	p, ok := profiles.Get(addr)
	if !ok {
		panic("no profile for " + addr.String())
	}
	return p
}

func TestLineOfSight(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	g := getGame(id)

	// Both lie DOWN on the two sides of the horse trough, alice's gun drawn
	// and cocked: the trough hides them from each other (rule 31).
	g.State.Chars[0].Hex, g.State.Chars[0].Facing, g.State.Chars[0].Down = "A-I10", hex.S, true
	g.State.Chars[0].Guns[0].Location, g.State.Chars[0].Guns[0].Cocked = engine.GunHand, true
	g.State.Chars[1].Hex, g.State.Chars[1].Facing, g.State.Chars[1].Down = "A-I12", hex.N, true
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "5f:aim:@1,7f:shoot:@1"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Reveal(cross(cur), id, 1, 1, salt, "")
	Reveal(cross(cur), id, 1, 0, salt, "5f:aim:@1,7f:shoot:@1")
	// The aim is cancelled; the shot is held: no card, no shell, still cocked.
	evs := g.lastTurn().Events()
	cancels, held := 0, 0
	for _, e := range evs {
		switch e.Kind {
		case engine.EvCancel:
			cancels++
			uassert.Equal(t, engine.ReasonNoLOS, e.Reason)
			uassert.Equal(t, "A-I11*", e.To)
		case engine.EvNothing:
			held++
			uassert.Equal(t, engine.ReasonNoLOS, e.Reason)
			uassert.Equal(t, "A-I12", e.To)
			uassert.Equal(t, 1, e.Target)
		case engine.EvShot:
			t.Errorf("a shot went off: %+v", e)
		}
	}
	uassert.Equal(t, 1, cancels)
	uassert.Equal(t, 1, held)
	uassert.Equal(t, 0, g.State.Chars[0].Aim)
	uassert.Equal(t, 6, g.State.Chars[0].Guns[0].Shells)
	uassert.True(t, g.State.Chars[0].Guns[0].Cocked)
	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"kind":"cancel","action":"cock_aim_shoot","from":"","to":"A-I11*"`), js)
	uassert.True(t, strings.Contains(js, `"kind":"nothing","action":"shoot","from":"","to":"A-I12"`), js)
	page := Render("game/" + id)
	uassert.True(t, strings.Contains(page, "cock aim shoot is cancelled (no line of sight, A-I11* in the way)"), page)
	uassert.True(t, strings.Contains(page, "holds fire: the\\_kid in A-I12 is out of sight"), page)
	uassert.True(t, strings.Contains(Render("help"), "in sight (rule 31)"))
}

func TestFourSeats(cur realm, t *testing.T) {
	dave := testutils.TestAddress("dave")
	played := func(addr address) int {
		if p, ok := profiles.Get(addr); ok {
			return p.GamesPlayed
		}
		return 0
	}
	carolPlayed, davePlayed := played(carol), played(dave)
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 4, 10, 0, "A-D6", 2) // looking south-east, the reb's way
	g := getGame(id)
	uassert.Equal(t, 4, len(g.State.Chars))
	uassert.Equal(t, 4, len(g.VP))
	uassert.True(t, strings.Contains(GameJSON(id), `"vp":[0,0,0,0]`), GameJSON(id))
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H6", 2)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-F8", 0)
	uassert.Equal(t, "waiting", g.Phase.String())
	uassert.Equal(t, 3, g.seated())
	uassert.True(t, strings.Contains(GamesJSON(bob.String()), `"mine":[{"id":"`+id+`"`), GamesJSON(bob.String()))
	uassert.True(t, strings.Contains(GamesJSON(dave.String()), `"open":[{"id":"`+id+`"`), GamesJSON(dave.String()))
	uassert.True(t, strings.Contains(GamesJSON(dave.String()), `{"addr":"","name":"","char":"","status":"alive","committed":false,"revealed":false}]`), GamesJSON(dave.String()))
	uassert.True(t, strings.Contains(Render(""), "| 3/4 |"), Render(""))
	uassert.True(t, strings.Contains(Render(""), "Join as yankee"), Render(""))
	uassert.Equal(t, carolPlayed, played(carol)) // not started yet
	testing.SetRealm(testing.NewUserRealm(dave))
	JoinGame(cross(cur), id, "A-F5", 3)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, "yankee", g.Players[3].Char)
	uassert.Equal(t, carolPlayed+1, played(carol))
	uassert.Equal(t, davePlayed+1, played(dave))

	testing.SetRealm(testing.NewUserRealm(bob))
	Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(carol))
	Commit(cross(cur), id, hashOf(id, 2, "9f:1:0"), "locked")
	testing.SetRealm(testing.NewUserRealm(dave))
	Commit(cross(cur), id, hashOf(id, 3, "1f:ahead"), "locked")
	uassert.Equal(t, "planning", g.Phase.String()) // alice's plan is still missing
	// Targets name any seat of the game but one's own.
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, `gnoslinger: invalid character "@4" to shoot at`, func() {
		Reveal(cross(cur), id, 1, 0, salt, "9f:1:0,7f:shoot:@4")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you cannot aim at your own character", func() {
		Reveal(cross(cur), id, 1, 0, salt, "5f:aim:@0")
	})
	Reveal(cross(cur), id, 1, 0, salt, "9f:1:0")
	uassert.Equal(t, 1, g.Turn) // the others' plans are still to reveal
	RevealMany(cross(cur), id, 1, "1;2;3", "ab;ab;ab", ";9f:1:0;1f:ahead")
	uassert.Equal(t, 2, g.Turn)
	lt := g.lastTurn()
	uassert.Equal(t, 4, len(lt.Plans))
	uassert.Equal(t, 4, len(lt.Start()))
	uassert.Equal(t, "A-F5", lt.Start()[3].Hex)
	uassert.True(t, strings.Contains(GameJSON(id), `"plans":["9f:1:0","","9f:1:0","1f:ahead"]`), GameJSON(id))

	// Turn 2: alice aims at the reb (seat 2), who then walks: the markers
	// follow it; the JSON says which seat.
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "5f:aim:@2"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(carol))
	Commit(cross(cur), id, hashOf(id, 2, "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(dave))
	Reveal(cross(cur), id, 2, 3, salt, "")
	RevealMany(cross(cur), id, 2, "0;1;2", "ab;ab;ab", "5f:aim:@2;;1f:ahead")
	uassert.Equal(t, 3, g.Turn)
	uassert.Equal(t, 2, g.State.Chars[0].Aim)
	uassert.Equal(t, 2, g.State.Chars[0].AimAt)
	uassert.True(t, strings.Contains(GameJSON(id), `"aim":2,"aimAt":2,"aimHex":""`), GameJSON(id))
	uassert.True(t, strings.Contains(Render("game/"+id), "marshal aims at A-F8 (reb): 2 AIM points"), Render("game/"+id))

	// A character out of the fight sends no plan and is not waited for.
	g.State.Chars[1].Status = engine.Killed
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: your character is out of the fight", func() {
		Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	})
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(carol))
	Commit(cross(cur), id, hashOf(id, 2, ""), "locked")
	testing.SetRealm(testing.NewUserRealm(dave))
	Reveal(cross(cur), id, 3, 3, salt, "")
	RevealMany(cross(cur), id, 3, "0;2", "ab;ab", ";")
	uassert.Equal(t, 4, g.Turn)
	uassert.True(t, strings.Contains(GamesJSON(bob.String()), `"char":"the_kid","status":"killed","committed":false,"revealed":false`), GamesJSON(bob.String()))
}

func TestSurrenderGoesOn(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 3, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-E8", 3)
	g := getGame(id)
	// Alice's plan is in; bob surrenders: the showdown goes on between
	// alice and carol, and carol's plan, the last, starts the reveals.
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Surrender(cross(cur), id)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, "out", g.State.Chars[1].Status.String())
	uassert.Equal(t, 1, g.Turn)
	uassert.Equal(t, 0, len(g.Awards)) // scored at the end
	uassert.AbortsWithMessage(t, cur, "gnoslinger: your character is out of the fight", func() {
		Surrender(cross(cur), id)
	})
	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: there is no character @3 in this game", func() {
		Reveal(cross(cur), id, 1, 2, salt, "5f:aim:@3")
	})
	Reveal(cross(cur), id, 1, 2, salt, "1f:ahead")
	uassert.Equal(t, "revealing", g.Phase.String())
	Reveal(cross(cur), id, 1, 0, salt, "1f:ahead")
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "A-D6", g.State.Chars[0].Hex)
	uassert.Equal(t, "A-H7", g.State.Chars[1].Hex) // skipped
	// Alice surrenders too: carol alone holds the field, both others are captured.
	testing.SetRealm(testing.NewUserRealm(alice))
	Surrender(cross(cur), id)
	uassert.Equal(t, "finished", g.Phase.String())
	uassert.Equal(t, "surrender", g.EndReason)
	uassert.Equal(t, 2, g.Winner)
	uassert.Equal(t, -6, g.VP[0])
	uassert.Equal(t, -6, g.VP[1])
	uassert.Equal(t, 4, g.VP[2])
	uassert.True(t, strings.Contains(GameJSON(id), `"vp":[-6,-6,4]`), GameJSON(id))
	uassert.True(t, strings.Contains(Render(""), "-6 to -6 to 4 VP, winner: reb"), Render(""))
}

func TestClaimTimeoutGoesOn(cur realm, t *testing.T) {
	// Two of three plans in: the late player misses the turn, which
	// resolves, and the showdown goes on; at its third miss in a row it is
	// out of the fight.
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 3, 10, 30, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-E8", 3)
	g := getGame(id)
	testing.SetRealm(testing.NewUserRealm(alice))
	Commit(cross(cur), id, hashOf(id, 0, "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
	testing.SkipHeights(361)
	ClaimTimeout(cross(cur), id)
	uassert.Equal(t, "revealing", g.Phase.String())
	RevealMany(cross(cur), id, 1, "0;1", "ab;ab", "1f:ahead;")
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "alive", g.State.Chars[2].Status.String())
	uassert.Equal(t, 1, g.Missed[2])
	uassert.Equal(t, "A-D6", g.State.Chars[0].Hex)
	uassert.Equal(t, 0, len(g.Awards))
	// The clock restarted with the turn: the game cannot be claimed again at once.
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the game has not timed out yet", func() {
		ClaimTimeout(cross(cur), id)
	})
	for turn := 2; turn <= 3; turn++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		Commit(cross(cur), id, hashOf(id, 0, ""), "locked")
		testing.SetRealm(testing.NewUserRealm(bob))
		Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
		testing.SkipHeights(361)
		ClaimTimeout(cross(cur), id)
		RevealMany(cross(cur), id, turn, "0;1", "ab;ab", ";")
	}
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, 4, g.Turn)
	uassert.Equal(t, "out", g.State.Chars[2].Status.String())
	// The showdown goes on without it: alice misses three turns in a row
	// too, and the game ends.
	for turn := 4; turn <= 6; turn++ {
		testing.SetRealm(testing.NewUserRealm(bob))
		Commit(cross(cur), id, hashOf(id, 1, ""), "locked")
		testing.SkipHeights(361)
		ClaimTimeout(cross(cur), id)
		if g.Phase == PhaseRevealing {
			Reveal(cross(cur), id, turn, 1, salt, "")
		}
	}
	uassert.Equal(t, "finished", g.Phase.String())
	uassert.Equal(t, "timeout", g.EndReason)
	uassert.Equal(t, 1, g.Winner)
	uassert.Equal(t, -6, g.VP[0])
	uassert.Equal(t, 4, g.VP[1])
	uassert.Equal(t, -6, g.VP[2])
}

func TestCancelWithJoiners(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 3, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-H7", 0)
	uassert.True(t, strings.Contains(GamesJSON(bob.String()), `"mine":[{"id":"`+id+`"`))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: only the creator can cancel the game", func() {
		CancelGame(cross(cur), id)
	})
	testing.SetRealm(testing.NewUserRealm(alice))
	CancelGame(cross(cur), id)
	uassert.False(t, games.Has(id))
	uassert.False(t, strings.Contains(GamesJSON(bob.String()), `"id":"`+id+`"`))
	uassert.False(t, strings.Contains(GamesJSON(alice.String()), `"id":"`+id+`"`))
}

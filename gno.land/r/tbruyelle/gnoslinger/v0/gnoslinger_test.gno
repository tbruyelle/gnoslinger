package gnoslinger

import (
	"strings"
	"testing"

	"gno.land/p/tbruyelle/gnoslinger/engine/v0"
	"gno.land/p/tbruyelle/gnoslinger/hex/v0"

	"gno.land/p/nt/testutils/v0"
	"gno.land/p/nt/uassert/v0"
	profiles "gno.land/r/tbruyelle/gnoslinger/profiles/v0"
)

var (
	alice = testutils.TestAddress("alice")
	bob   = testutils.TestAddress("bob")
	carol = testutils.TestAddress("carol")
)

func TestCreateAndJoin(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 20, 0, "A-G5", 3)
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
	uassert.Equal(t, "A-G5", g.State.Chars[0].Hex)
	uassert.Equal(t, int(hex.S), int(g.State.Chars[0].Facing))
	uassert.Equal(t, "", g.State.Chars[1].Hex) // nobody there yet

	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"id":"`+id+`"`), js)
	uassert.True(t, strings.Contains(js, `"phase":"waiting"`), js)
	uassert.True(t, strings.Contains(js, `"hex":"A-G5","facing":3,"down":false,"delay":0,"status":"alive","submitted":false`), js)
	uassert.True(t, strings.Contains(js, `"lastTurn":null}`), js)
	uassert.True(t, strings.Contains(js, `"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]`), js)

	uassert.AbortsWithMessage(t, cur, "gnoslinger: you cannot join your own game", func() {
		JoinGame(cross(cur), id, "A-E9", 0)
	})

	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, 2, g.Rev)
	uassert.Equal(t, bob.String(), g.Players[1].Addr.String())
	uassert.Equal(t, "A-E9", g.State.Chars[1].Hex)
	uassert.Equal(t, int(hex.N), int(g.State.Chars[1].Facing))
	uassert.False(t, openGames.Has(id))

	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is not open", func() {
		JoinGame(cross(cur), id, "A-E9", 0)
	})

	// Both players find the game in their list; carol has none.
	uassert.True(t, strings.Contains(GamesJSON(alice.String()), `"mine":[{"id":"`+id+`"`))
	uassert.True(t, strings.Contains(GamesJSON(bob.String()), `"mine":[{"id":"`+id+`"`))
	uassert.True(t, strings.HasSuffix(GamesJSON(carol.String()), `"mine":[]}`))
}

func TestCreateValidation(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: seats must be between 2 and 4", func() {
		CreateGame(cross(cur), 1, 10, 0, "A-G5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: seats must be between 2 and 4", func() {
		CreateGame(cross(cur), 5, 10, 0, "A-G5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: maxTurns must be between 10 and 30", func() {
		CreateGame(cross(cur), 2, 31, 0, "A-G5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: maxTurns must be between 10 and 30", func() {
		CreateGame(cross(cur), 2, 9, 0, "A-G5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: maxTurns must be between 10 and 30", func() {
		CreateGame(cross(cur), 2, 0, 0, "A-G5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: timeoutMinutes must be between 5 and 43200", func() {
		CreateGame(cross(cur), 2, 10, 43201, "A-G5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: timeoutMinutes must be between 5 and 43200", func() {
		CreateGame(cross(cur), 2, 10, 4, "A-G5", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game not found", func() {
		JoinGame(cross(cur), "9999999", "A-E9", 0)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: invalid game id", func() {
		JoinGame(cross(cur), "nope", "A-E9", 0)
	})
}

func TestSetUp(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	// The creator is the marshal, in one of its hexes, facing one of the six directions.
	uassert.AbortsWithMessage(t, cur, "gnoslinger: marshal sets up in A-G5, A-G6, A-G7, A-G8, A-G9, not in A-F3", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-F3", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: marshal sets up in A-G5, A-G6, A-G7, A-G8, A-G9, not in A-E7", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-E7", 3)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: facing must be between 0 (N) and 5 (NW)", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-G5", 6)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: facing must be between 0 (N) and 5 (NW)", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-G5", -1)
	})
	id := CreateGame(cross(cur), 3, 10, 0, "A-G6", 2)
	g := getGame(id)
	uassert.Equal(t, 3, g.seats())
	uassert.Equal(t, "marshal", g.Players[0].Char)
	uassert.Equal(t, "A-G6", g.State.Chars[0].Hex)
	uassert.Equal(t, int(hex.SE), int(g.State.Chars[0].Facing))
	uassert.False(t, g.State.Chars[0].Down)
	uassert.True(t, strings.Contains(GameJSON(id), `{"addr":"","name":"","char":"","hex":"","facing":0`), GameJSON(id))

	// The first joiner is the kid, in its own hexes; the second el jefe.
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the_kid sets up in A-E5, A-E6, A-E7, A-E8, A-E9, not in A-G9", func() {
		JoinGame(cross(cur), id, "A-G9", 0)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the_kid sets up in A-E5, A-E6, A-E7, A-E8, A-E9, not in A-I11*", func() {
		JoinGame(cross(cur), id, "A-I11*", 0)
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: facing must be between 0 (N) and 5 (NW)", func() {
		JoinGame(cross(cur), id, "A-E9", 7)
	})
	JoinGame(cross(cur), id, "A-E9", 5)
	uassert.Equal(t, "waiting", g.Phase.String()) // a seat is still free
	uassert.True(t, openGames.Has(id))
	uassert.Equal(t, "the_kid", g.Players[1].Char)
	uassert.Equal(t, "A-E9", g.State.Chars[1].Hex)
	uassert.Equal(t, int(hex.NW), int(g.State.Chars[1].Facing))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you are already in this game", func() {
		JoinGame(cross(cur), id, "A-I7", 0)
	})
	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: el_jefe sets up in A-I5, A-I6, A-I7, A-I8, A-I9, not in A-E7", func() {
		JoinGame(cross(cur), id, "A-E7", 0)
	})
	JoinGame(cross(cur), id, "A-I7", 4)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.False(t, openGames.Has(id))
	uassert.Equal(t, "el_jefe", g.Players[2].Char)
	uassert.Equal(t, "A-I7", g.State.Chars[2].Hex)
	uassert.True(t, strings.Contains(GameJSON(id), `"char":"el_jefe","hex":"A-I7","facing":4`), GameJSON(id))
	uassert.True(t, strings.Contains(Render("game/"+id), "| A-G6 | SE |"))
	uassert.True(t, strings.Contains(Render("game/"+id), "| A-I7 | SW |"))
	uassert.True(t, strings.Contains(Render(""), "marshal vs the\\_kid vs el\\_jefe"), Render(""))
}

func TestSubmitAndResolve(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	g := getGame(id)
	rev := g.Rev

	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you are not a player of this game", func() {
		SubmitPlan(cross(cur), id, "1f:ahead")
	})

	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you cannot use both sides of a card", func() {
		SubmitPlan(cross(cur), id, "1f:ahead,1b:back")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: those actions cost more time points than you have", func() {
		SubmitPlan(cross(cur), id, "1b:back,5b")
	})
	uassert.AbortsWithMessage(t, cur, `gnoslinger: invalid action "1x"`, func() {
		SubmitPlan(cross(cur), id, "1x")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: that action is not available yet", func() {
		SubmitPlan(cross(cur), id, "8b")
	})

	r := SubmitPlan(cross(cur), id, "1f:ahead,2f:ahead")
	uassert.Equal(t, rev+1, r)
	uassert.True(t, g.Submitted[0])
	uassert.False(t, g.Submitted[1])
	// The plan in progress can be read back by its author (plans are plain on chain).
	uassert.Equal(t, `{"id":"`+id+`","turn":1,"seat":0,"submitted":true,"plan":"1f:ahead,2f:ahead"}`, PlanJSON(id, alice.String()))
	uassert.Equal(t, `{"id":"`+id+`","turn":1,"seat":1,"submitted":false,"plan":""}`, PlanJSON(id, bob.String()))
	uassert.Equal(t, `{"id":"`+id+`","turn":1,"seat":-1,"submitted":false,"plan":""}`, PlanJSON(id, carol.String()))
	uassert.Equal(t, PlanJSON(id, alice.String()), Render("json/plan/"+id+"/"+alice.String()))
	uassert.Equal(t, 1, g.Turn)
	uassert.Equal(t, "1f:ahead,2f:ahead", g.Plans[0])
	uassert.True(t, g.State.Chars[0].PlayedFoot)
	uassert.True(t, g.State.Chars[0].PlayedRun)
	uassert.True(t, strings.Contains(GameJSON(id), `"submitted":true,"playedFoot":true,"playedRun":true`))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: plan already submitted for this turn", func() {
		SubmitPlan(cross(cur), id, "")
	})

	// The second plan resolves the turn in the same call.
	testing.SetRealm(testing.NewUserRealm(bob))
	r = SubmitPlan(cross(cur), id, "5b")
	uassert.Equal(t, rev+2, r)
	uassert.Equal(t, rev+2, GameRev(id))
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.False(t, g.Submitted[0])
	uassert.False(t, g.Submitted[1])
	uassert.Equal(t, "", g.Plans[0])
	lt := g.lastTurn()
	if lt == nil {
		t.Fatal("no turn result")
	}
	uassert.Equal(t, 1, len(g.Turns))
	uassert.Equal(t, 1, lt.Turn)
	uassert.Equal(t, "1f:ahead,2f:ahead", lt.Plans[0])
	uassert.Equal(t, "5b", lt.Plans[1])
	uassert.Equal(t, 64, len(lt.Seed))
	uassert.Equal(t, "A-G5", lt.Start()[0].Hex)
	uassert.Equal(t, "A-E9", lt.Start()[1].Hex)
	// Alice advanced G5->G6 on segment 2 and ran G6->G7 on segment 3;
	// Bob dropped on segment 3.
	uassert.Equal(t, 3, len(lt.Events()))
	uassert.Equal(t, "A-G7", g.State.Chars[0].Hex)
	uassert.Equal(t, "A-E9", g.State.Chars[1].Hex)
	uassert.True(t, g.State.Chars[1].Down)
	uassert.False(t, g.State.Chars[0].PlayedFoot) // cleared at end of turn

	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"turn":2`), js)
	uassert.True(t, strings.Contains(js, `"lastTurn":{"turn":1,"seed":"`+lt.Seed+`","cards":[],"plans":["1f:ahead,2f:ahead","5b"],"events":[`), js)
	uassert.True(t, strings.Contains(js, `"start":[{"hex":"A-G5","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-E9","facing":0,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}}`), js)

	// Alice ran on turn 1, so she may sprint on turn 2; Bob did not.
	uassert.True(t, g.State.Chars[0].RanLastTurn)
	uassert.False(t, g.State.Chars[1].RanLastTurn)
	uassert.True(t, strings.Contains(js, `"playedRun":false,"ranLastTurn":true,"aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[`), js)
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: sprint can only be played after a run on the previous turn", func() {
		SubmitPlan(cross(cur), id, "1f:ahead,2f:ahead,3f")
	})

	// A second turn: the history keeps both, oldest first.
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "1f:ahead,2f:ahead,3f")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "5b")
	uassert.Equal(t, 2, len(g.Turns))
	h := HistoryJSON(id)
	uassert.True(t, strings.HasPrefix(h, `{"id":"`+id+`","turn":3,"phase":"planning","players":[`), h)
	uassert.True(t, strings.Contains(h, `"turns":[{"turn":1,`), h)
	uassert.True(t, strings.Contains(h, `},{"turn":2,`), h)
	uassert.True(t, strings.Contains(h, `"start":[{"hex":"A-G7","facing":3,"down":false,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]},{"hex":"A-E9","facing":0,"down":true,"delay":0,"status":"alive","aim":0,"aimAt":-1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"holstered","cocked":false,"shells":6,"capacity":6,"jammed":false,"exploded":false}]}]}`), h)
	uassert.Equal(t, h, Render("json/history/"+id))
	uassert.True(t, strings.Contains(js, `{"seg":2,"p":0,"kind":"move","action":"advance","from":"A-G5","to":"A-G6","facing":3,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":3,"chart":"","status":""}`), js)
	uassert.True(t, strings.Contains(js, `{"seg":3,"p":1,"kind":"flip","action":"get_up_down","from":"","to":"","facing":0,"down":true,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"","gunId":0,"step":4,"chart":"","status":""}`), js)
	uassert.True(t, strings.Contains(js, `"hex":"A-E9","facing":0,"down":true`), js)
}

func TestMaxTurnsFinish(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	for i := 0; i < 9; i++ {
		testing.SetRealm(testing.NewUserRealm(alice))
		SubmitPlan(cross(cur), id, "")
		testing.SetRealm(testing.NewUserRealm(bob))
		SubmitPlan(cross(cur), id, "")
	}
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "3b:ahead_left")
	g := getGame(id)
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
	uassert.True(t, strings.Contains(GameJSON(id), `"timeoutAt":0`))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is not accepting plans", func() {
		SubmitPlan(cross(cur), id, "")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: game is finished", func() {
		ClaimTimeout(cross(cur), id)
	})
}

func TestSurrender(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
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
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
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
		JoinGame(cross(cur), id, "A-E9", 0)
	})
}

func TestClaimTimeout(cur realm, t *testing.T) {
	// A waiting game nobody joined is cancelled.
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 30, "A-G5", 3)
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the game has not timed out yet", func() {
		ClaimTimeout(cross(cur), id)
	})
	testing.SkipHeights(361) // 5s per height: past the 30 minute timeout picked above
	testing.SetRealm(testing.NewUserRealm(carol))
	ClaimTimeout(cross(cur), id)
	g := getGame(id)
	uassert.Equal(t, "expired", g.EndReason)
	uassert.False(t, openGames.Has(id))

	// One plan in: the other player forfeits.
	testing.SetRealm(testing.NewUserRealm(alice))
	id = CreateGame(cross(cur), 2, 10, 30, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "")
	testing.SkipHeights(361)
	testing.SetRealm(testing.NewUserRealm(carol))
	ClaimTimeout(cross(cur), id)
	g = getGame(id)
	uassert.Equal(t, "timeout", g.EndReason)
	// Out of time counts as surrendering.
	uassert.Equal(t, 4, g.VP[0])
	uassert.Equal(t, -6, g.VP[1])
	uassert.Equal(t, 0, g.Winner)
	uassert.Equal(t, "out", g.State.Chars[1].Status.String())

	// No plan in: abandoned.
	testing.SetRealm(testing.NewUserRealm(alice))
	id = CreateGame(cross(cur), 2, 10, 30, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	testing.SkipHeights(361)
	ClaimTimeout(cross(cur), id)
	g = getGame(id)
	uassert.Equal(t, "abandoned", g.EndReason)
	uassert.Equal(t, -1, g.Winner)
	uassert.Equal(t, 0, len(g.Awards))
	uassert.Equal(t, "alive", g.State.Chars[0].Status.String())
}

func TestLateMoves(cur realm, t *testing.T) {
	// Past the timeout a waiting game takes no player.
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 30, "A-G5", 3)
	testing.SkipHeights(361)
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: out of time: the game can only be claimed now", func() {
		JoinGame(cross(cur), id, "A-E9", 0)
	})

	// Nor a running game a plan: it can only be claimed.
	testing.SetRealm(testing.NewUserRealm(alice))
	id = CreateGame(cross(cur), 2, 10, 30, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	testing.SkipHeights(361)
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: out of time: the game can only be claimed now", func() {
		SubmitPlan(cross(cur), id, "1f:ahead")
	})
	ClaimTimeout(cross(cur), id)
	uassert.Equal(t, "abandoned", getGame(id).EndReason)
}

func TestRender(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	home := Render("")
	uassert.True(t, strings.Contains(home, "# Gnoslinger"), home)
	uassert.True(t, strings.Contains(home, "/r/tbruyelle/gnoslinger/v0:game/"+id), home)
	uassert.True(t, strings.Contains(home, "marshal vs the\\_kid"), home)

	page := Render("game/" + id)
	uassert.True(t, strings.Contains(page, "# Game "+id), page)
	uassert.True(t, strings.Contains(page, "| A-G5 | S |"), page)
	uassert.True(t, strings.Contains(page, "planning"), page)
	uassert.True(t, strings.Contains(page, "func=SubmitPlan"), page)

	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "1f:ahead")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "1f:ahead")
	page = Render("game/" + id)
	uassert.True(t, strings.Contains(page, "seg 2: marshal advance: A-G5 → A-G6"), page)
	uassert.True(t, strings.Contains(page, "seg 2: the\\_kid advance: A-E9 → A-E8"), page)

	help := Render("help")
	uassert.True(t, strings.Contains(help, "1f:ahead_left,2f:ahead,3f"), help)
	uassert.True(t, strings.Contains(help, "| 1 | Advance (2) | Back Up (3) |"), help)

	uassert.Equal(t, GameJSON(id), Render("json/game/"+id))
	uassert.Equal(t, GamesJSON(alice.String()), Render("json/games/"+alice.String()))
}

func TestDrawAndCock(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you have no such gun", func() {
		SubmitPlan(cross(cur), id, "9f:2:0")
	})
	SubmitPlan(cross(cur), id, "9f:1:0")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "")
	g := getGame(id)
	gun := g.State.Chars[0].Guns[0]
	uassert.Equal(t, "gun_hand", gun.Location.String())
	uassert.True(t, gun.Cocked)
	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"location":"gun_hand","cocked":true,"shells":6`), js)
	uassert.True(t, strings.Contains(js, `{"seg":3,"p":0,"kind":"draw","action":"draw_and_cock","from":"holstered","to":"gun_hand","facing":0,"down":false,"n":0,"delay":0,"reason":"","card":0,"result":"","endurance":0,"target":0,"hit":"","range":0,"gun":"colt45","gunId":1,"step":3,"chart":"","status":""}`), js)
	// Drawing again into the gun hand: the gun is already there.
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: that gun is already there", func() {
		SubmitPlan(cross(cur), id, "9f:1:0")
	})
}

func TestShootout(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	g := getGame(id)

	// Turn 1: both draw and cock. Turn 2: alice aims twice (4 AIM points).
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "9f:1:0")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "9f:1:0")
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "5f:aim:@1,6f:aim:@1")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "")
	uassert.Equal(t, 4, g.State.Chars[0].Aim)
	uassert.True(t, g.State.Chars[0].Guns[0].Cocked)
	js := GameJSON(id)
	uassert.True(t, strings.Contains(js, `"ranLastTurn":false,"aim":4,"aimAt":1,"aimHex":"","endurance":20,"serious":0,"gunArm":0,"otherArm":0,"leg":0,"guns":[{"id":1,"type":"colt45","name":"Colt 45","location":"gun_hand","cocked":true,"shells":6,"capacity":6,"jammed":false,"exploded":false}]`), js)
	uassert.True(t, strings.Contains(js, `"ground":[]`), js)

	// Turn 3: alice shoots (aim time 1 + 4 = 5, range 5); bob does nothing with his gun.
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "7f:shoot:@1")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "7f")
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
	uassert.Equal(t, 5, shot.Range)
	uassert.Equal(t, 1, shot.Seg)
	if shot.Reason != engine.ReasonMisfire {
		uassert.Equal(t, 5, shot.N)
	}
	uassert.Equal(t, 0, g.State.Chars[0].Aim)
	uassert.False(t, g.State.Chars[0].Guns[0].Cocked)
	uassert.True(t, g.State.Chars[0].Guns[0].Shells <= 5)
	uassert.True(t, len(lt.Cards()) >= 1)
	uassert.True(t, strings.Contains(GameJSON(id), `"kind":"shot"`))
	uassert.True(t, strings.Contains(Render("game/"+id), "shoots the\\_kid in A-E9 (card "))
}

func TestAutoPass(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	g := getGame(id)
	// Alice carries 5 delay: she cannot play anything, so bob's plan alone
	// resolves the turn; her pass is recorded as an empty plan.
	g.State.Chars[0].Delay = 5
	g.State.Chars[0].PlayedFoot = true
	SubmitPlan(cross(cur), id, "1f:ahead")
	uassert.Equal(t, 2, g.Turn)
	lt := g.lastTurn()
	uassert.Equal(t, "", lt.Plans[0])
	uassert.Equal(t, "1f:ahead", lt.Plans[1])
	uassert.False(t, lt.Start()[0].PlayedFoot)
	uassert.Equal(t, 2, g.State.Chars[0].Delay) // 5 -> 2: she can play 3 points now
	uassert.False(t, g.Submitted[0])
	uassert.False(t, g.Submitted[1])
	// Both unable to act: the turns resolve by themselves until someone can play.
	g.State.Chars[0].Delay = 6
	g.State.Chars[1].Delay = 5
	autoPass(cur, g)
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
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	uassert.Equal(t, 0, profileOf(dave).GamesPlayed)
	CancelGame(cross(cur), id)
	uassert.Equal(t, 0, profileOf(dave).GamesPlayed)

	id = CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(erin))
	JoinGame(cross(cur), id, "A-E9", 0)
	uassert.Equal(t, 1, profileOf(dave).GamesPlayed)
	uassert.Equal(t, 1, profileOf(erin).GamesPlayed)

	// A second game puts dave ahead of erin.
	testing.SetRealm(testing.NewUserRealm(dave))
	CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	id = CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(alice))
	JoinGame(cross(cur), id, "A-E9", 0)
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
	id := CreateGame(cross(cur), 2, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	g := getGame(id)

	// Both lie DOWN on the two sides of the horse trough, alice's gun drawn
	// and cocked: the trough hides them from each other (rule 31).
	g.State.Chars[0].Hex, g.State.Chars[0].Facing, g.State.Chars[0].Down = "A-I10", hex.S, true
	g.State.Chars[0].Guns[0].Location, g.State.Chars[0].Guns[0].Cocked = engine.GunHand, true
	g.State.Chars[1].Hex, g.State.Chars[1].Facing, g.State.Chars[1].Down = "A-I12", hex.N, true
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "5f:aim:@1,7f:shoot:@1")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "")
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
	id := CreateGame(cross(cur), 4, 10, 0, "A-G7", 2) // looking south-east, el jefe's way
	g := getGame(id)
	uassert.Equal(t, 4, len(g.State.Chars))
	uassert.Equal(t, 4, len(g.VP))
	uassert.True(t, strings.Contains(GameJSON(id), `"vp":[0,0,0,0]`), GameJSON(id))
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E7", 2)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-I7", 5)
	uassert.Equal(t, "waiting", g.Phase.String())
	uassert.Equal(t, 3, g.seated())
	uassert.True(t, strings.Contains(GamesJSON(bob.String()), `"mine":[{"id":"`+id+`"`), GamesJSON(bob.String()))
	uassert.True(t, strings.Contains(GamesJSON(dave.String()), `"open":[{"id":"`+id+`"`), GamesJSON(dave.String()))
	uassert.True(t, strings.Contains(GamesJSON(dave.String()), `{"addr":"","name":"","char":"","status":"alive","submitted":false}]`), GamesJSON(dave.String()))
	uassert.True(t, strings.Contains(Render(""), "| 3/4 |"), Render(""))
	uassert.True(t, strings.Contains(Render(""), "Join as axe"), Render(""))
	uassert.Equal(t, carolPlayed, played(carol)) // not started yet
	testing.SetRealm(testing.NewUserRealm(dave))
	JoinGame(cross(cur), id, "A-C7", 2)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, "axe", g.Players[3].Char)
	uassert.Equal(t, carolPlayed+1, played(carol))
	uassert.Equal(t, davePlayed+1, played(dave))

	// Targets name any seat of the game but one's own.
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, `gnoslinger: invalid character "@4" to shoot at`, func() {
		SubmitPlan(cross(cur), id, "9f:1:0,7f:shoot:@4")
	})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: you cannot aim at your own character", func() {
		SubmitPlan(cross(cur), id, "5f:aim:@0")
	})
	SubmitPlan(cross(cur), id, "9f:1:0")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "")
	testing.SetRealm(testing.NewUserRealm(carol))
	SubmitPlan(cross(cur), id, "9f:1:0")
	uassert.Equal(t, 1, g.Turn) // dave's plan is still missing
	testing.SetRealm(testing.NewUserRealm(dave))
	SubmitPlan(cross(cur), id, "1f:ahead")
	uassert.Equal(t, 2, g.Turn)
	lt := g.lastTurn()
	uassert.Equal(t, 4, len(lt.Plans))
	uassert.Equal(t, 4, len(lt.Start()))
	uassert.Equal(t, "A-C7", lt.Start()[3].Hex)
	uassert.True(t, strings.Contains(GameJSON(id), `"plans":["9f:1:0","","9f:1:0","1f:ahead"]`), GameJSON(id))

	// Turn 2: alice aims at el jefe (seat 2), who then walks: the markers
	// follow it; the JSON says which seat.
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "5f:aim:@2")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "")
	testing.SetRealm(testing.NewUserRealm(carol))
	SubmitPlan(cross(cur), id, "1f:ahead")
	testing.SetRealm(testing.NewUserRealm(dave))
	SubmitPlan(cross(cur), id, "")
	uassert.Equal(t, 3, g.Turn)
	uassert.Equal(t, 2, g.State.Chars[0].Aim)
	uassert.Equal(t, 2, g.State.Chars[0].AimAt)
	uassert.True(t, strings.Contains(GameJSON(id), `"aim":2,"aimAt":2,"aimHex":""`), GameJSON(id))
	uassert.True(t, strings.Contains(Render("game/"+id), "marshal aims at A-I7 (el\\_jefe): 2 AIM points"), Render("game/"+id))

	// A character out of the fight sends no plan and is not waited for.
	g.State.Chars[1].Status = engine.Killed
	testing.SetRealm(testing.NewUserRealm(bob))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: your character is out of the fight", func() {
		SubmitPlan(cross(cur), id, "")
	})
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "")
	testing.SetRealm(testing.NewUserRealm(carol))
	SubmitPlan(cross(cur), id, "")
	testing.SetRealm(testing.NewUserRealm(dave))
	SubmitPlan(cross(cur), id, "")
	uassert.Equal(t, 4, g.Turn)
	uassert.True(t, strings.Contains(GamesJSON(bob.String()), `"char":"the_kid","status":"killed","submitted":false`), GamesJSON(bob.String()))
}

func TestSurrenderGoesOn(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 3, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-I5", 3)
	g := getGame(id)
	// Alice's plan is in; bob surrenders: the showdown goes on between
	// alice and carol, and carol's plan resolves the turn.
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: there is no character @3 in this game", func() {
		SubmitPlan(cross(cur), id, "5f:aim:@3")
	})
	SubmitPlan(cross(cur), id, "1f:ahead")
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
	SubmitPlan(cross(cur), id, "1f:ahead")
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "A-G6", g.State.Chars[0].Hex)
	uassert.Equal(t, "A-E9", g.State.Chars[1].Hex) // skipped
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
	uassert.True(t, strings.Contains(Render(""), "-6 to -6 to 4 VP, winner: el\\_jefe"), Render(""))
}

func TestClaimTimeoutGoesOn(cur realm, t *testing.T) {
	// Two of three plans in: the late player is out, the turn resolves and
	// the showdown goes on.
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 3, 10, 30, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
	testing.SetRealm(testing.NewUserRealm(carol))
	JoinGame(cross(cur), id, "A-I5", 3)
	g := getGame(id)
	testing.SetRealm(testing.NewUserRealm(alice))
	SubmitPlan(cross(cur), id, "1f:ahead")
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "")
	testing.SkipHeights(361)
	ClaimTimeout(cross(cur), id)
	uassert.Equal(t, "planning", g.Phase.String())
	uassert.Equal(t, 2, g.Turn)
	uassert.Equal(t, "out", g.State.Chars[2].Status.String())
	uassert.Equal(t, "A-G6", g.State.Chars[0].Hex)
	uassert.Equal(t, 0, len(g.Awards))
	// The clock restarted with the turn: the game cannot be claimed again at once.
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the game has not timed out yet", func() {
		ClaimTimeout(cross(cur), id)
	})
	// One plan in of the two left: the other is out as well, the game ends.
	testing.SetRealm(testing.NewUserRealm(bob))
	SubmitPlan(cross(cur), id, "")
	testing.SkipHeights(361)
	ClaimTimeout(cross(cur), id)
	uassert.Equal(t, "finished", g.Phase.String())
	uassert.Equal(t, "timeout", g.EndReason)
	uassert.Equal(t, 1, g.Winner)
	uassert.Equal(t, -6, g.VP[0])
	uassert.Equal(t, 4, g.VP[1])
	uassert.Equal(t, -6, g.VP[2])
}

func TestCancelWithJoiners(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := CreateGame(cross(cur), 3, 10, 0, "A-G5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	JoinGame(cross(cur), id, "A-E9", 0)
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

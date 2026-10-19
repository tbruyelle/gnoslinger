package gnoslinger

import "chain"

// Events emitted by the realm (type, attribute keys):
//
//	GameCreated       id creator char seats maxTurns timeoutMinutes hex facing
//	PlayerJoined      id player seat char hex facing
//	PlanSubmitted     id turn player seat
//	PlanPassed        id turn seat   (a player with no time points to play is passed automatically)
//	PlanMissed        id turn seat missed   (a claimed timeout passes the turn of a player without a plan; Out at the MaxMissed-th in a row)
//	PlayerSurrendered id turn player seat
//	TurnResolved      id turn rev seed
//	VictoryPoints id seat player reason points   (one per award at the end of a turn or of the showdown, rule 15; points < 0 for a loss)
//	GameEnded     id reason winner
//
// They land in transaction results; clients still poll Game.Rev to sync.
func emit(typ string, attrs ...string) {
	chain.Emit(typ, attrs...)
}

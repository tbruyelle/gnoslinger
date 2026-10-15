package gnoslinger

import "chain"

// Events emitted by the realm (type, attribute keys):
//
//	GameCreated   id creator char maxTurns timeoutMinutes hex facing
//	PlayerJoined  id player char hex facing
//	PlanSubmitted id turn player seat
//	TurnResolved  id turn rev seed
//	VictoryPoints id seat player reason points   (one per award at the end of a turn or of the showdown, rule 15; points < 0 for a loss)
//	GameEnded     id reason winner
//
// They land in transaction results; clients still poll Game.Rev to sync.
func emit(typ string, attrs ...string) {
	chain.Emit(typ, attrs...)
}

package gnoslinger

import "chain"

// Events emitted by the realm (type, attribute keys):
//
//	GameCreated       id creator char seats maxTurns timeoutMinutes hex facing stake
//	PlayerJoined      id player seat char hex facing
//	PlanCommitted     id turn player seat
//	AllCommitted      id turn   (every character in the fight committed: the reveals start)
//	PlanRevealed      id turn seat by   (by: who sent the reveal, the player or the opener of its timelocked plan)
//	PlanUnopened      id turn seat reason   (a RevealMany skips a seat whose salt and plan do not match its commit or whose plan is not valid)
//	PlanPassed        id turn seat   (a player with no time points to play is passed automatically)
//	PlanMissed        id turn seat missed   (a claimed timeout passes the turn of a player whose plan is not in, no commit or never revealed; Out at the MaxMissed-th in a row)
//	PlayerSurrendered id turn player seat
//	TurnResolved      id turn rev seed
//	VictoryPoints id seat player reason points   (one per award at the end of a turn or of the showdown, rule 15; points < 0 for a loss)
//	GameEnded     id reason winner
//	PotPaid       id seat player amount   (ugnot; one per winner, a draw splitting the pot, stakes.gno)
//	StakeRefunded id seat player amount   (a cancelled or abandoned showdown gives the stakes back)
//	HouseWithdrawn to amount
//	AdminChanged  admin
//
// They land in transaction results; clients still poll Game.Rev to sync.
func emit(typ string, attrs ...string) {
	chain.Emit(typ, attrs...)
}

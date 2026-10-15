package gnoslinger

import (
	"strconv"
	"strings"
	"time"

	"gno.land/p/tbruyelle/gnoslinger/engine/v0"
	"gno.land/p/tbruyelle/gnoslinger/hex/v0"
)

// CreateGame opens a showdown with the caller in seat 0 playing charKey, a
// character of the showdown (engine.Setups), standing in startHex, one of
// the hexes assigned to that character, facing f (0=N 1=NE 2=SE 3=S 4=SW
// 5=NW); it returns the game id. maxTurns is the game length, from
// MinMaxTurns to MaxMaxTurns; timeoutMinutes is the inactivity after which
// anyone may end the game with ClaimTimeout, 0 meaning DefaultTimeout (2
// days).
func CreateGame(cur realm, charKey string, maxTurns int, timeoutMinutes int, startHex string, facing int) string {
	caller := cur.Previous().Address()
	assertCharKey(charKey)
	if maxTurns < MinMaxTurns || maxTurns > MaxMaxTurns {
		panic("gnoslinger: maxTurns must be between " + strconv.Itoa(MinMaxTurns) + " and " + strconv.Itoa(MaxMaxTurns))
	}
	timeout := DefaultTimeout
	if timeoutMinutes != 0 {
		timeout = time.Duration(timeoutMinutes) * time.Minute
	}
	if timeout < MinTimeout || timeout > MaxTimeout {
		panic("gnoslinger: timeoutMinutes must be between " + strconv.Itoa(int(MinTimeout/time.Minute)) + " and " + strconv.Itoa(int(MaxTimeout/time.Minute)))
	}
	assertSetUp(charKey, startHex, facing)
	id := gameSeq.Next().String()
	g := &Game{
		ID:        id,
		State:     engine.NewState(),
		Turn:      1,
		MaxTurns:  maxTurns,
		Timeout:   timeout,
		Phase:     PhaseWaiting,
		Winner:    -1,
		CreatedAt: time.Now(),
	}
	g.Players[0] = Player{Addr: caller, Char: charKey}
	g.State.SetUp(0, startHex, hex.Dir(facing))
	openGames.Set(id, g)
	index(caller, id)
	ensureProfile(caller)
	save(g)
	emit("GameCreated", "id", id, "creator", caller.String(), "char", charKey, "maxTurns", strconv.Itoa(maxTurns),
		"timeoutMinutes", strconv.Itoa(int(timeout/time.Minute)), "hex", startHex, "facing", strconv.Itoa(facing))
	return id
}

// JoinGame seats the caller in seat 1 of a waiting game, playing charKey,
// a character of the showdown the creator did not take, standing in
// startHex, one of that character's hexes, facing f; the game then starts
// collecting the plans of turn 1.
func JoinGame(cur realm, id string, charKey string, startHex string, facing int) {
	caller := cur.Previous().Address()
	g := getGame(id)
	if g.Phase != PhaseWaiting {
		panic("gnoslinger: game is not open")
	}
	g.assertInTime()
	if g.Players[0].Addr == caller {
		panic("gnoslinger: you cannot join your own game")
	}
	assertCharKey(charKey)
	if charKey == g.Players[0].Char {
		panic("gnoslinger: " + charKey + " is taken: play " + strings.Join(otherChars(charKey), " or "))
	}
	assertSetUp(charKey, startHex, facing)
	g.Players[1] = Player{Addr: caller, Char: charKey}
	g.State.SetUp(1, startHex, hex.Dir(facing))
	g.Phase = PhasePlanning
	openGames.Remove(id)
	index(caller, id)
	// The game starts: it counts as played for both seats.
	for _, p := range g.Players {
		updateProfile(p.Addr, func(pr *Profile) { pr.GamesPlayed++ })
	}
	save(g)
	emit("PlayerJoined", "id", id, "player", caller.String(), "char", charKey, "hex", startHex, "facing", strconv.Itoa(facing))
}

// assertSetUp refuses a character that is not in the showdown, a hex it
// may not set up in, or no such facing.
func assertSetUp(charKey, startHex string, facing int) {
	setup := engine.SetupOf(charKey)
	if setup == nil {
		panic("gnoslinger: " + charKey + " is not in this showdown: play " + strings.Join(engine.ShowdownChars(), " or "))
	}
	if !engine.CanSetUp(charKey, startHex) {
		panic("gnoslinger: " + charKey + " sets up in " + strings.Join(setup.Hexes, ", ") + ", not in " + startHex)
	}
	if !hex.Dir(facing).Valid() {
		panic("gnoslinger: facing must be between 0 (N) and 5 (NW)")
	}
}

// otherChars lists the characters of the showdown but charKey.
func otherChars(charKey string) []string {
	var out []string
	for _, c := range engine.ShowdownChars() {
		if c != charKey {
			out = append(out, c)
		}
	}
	return out
}

// CancelGame withdraws a game nobody joined yet. Creator only. The game is
// deleted, not kept as finished, so the creator gets back the storage
// deposit CreateGame paid.
func CancelGame(cur realm, id string) {
	caller := cur.Previous().Address()
	g := getGame(id)
	if g.Phase != PhaseWaiting {
		panic("gnoslinger: only a game waiting for an opponent can be cancelled")
	}
	if g.Players[0].Addr != caller {
		panic("gnoslinger: only the creator can cancel the game")
	}
	openGames.Remove(id)
	games.Remove(id)
	unindex(caller, id)
	emit("GameEnded", "id", id, "reason", "cancelled", "winner", "")
}

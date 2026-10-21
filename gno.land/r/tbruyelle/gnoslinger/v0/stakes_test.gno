package gnoslinger

import (
	"chain"
	"chain/banker"
	"strconv"
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
)

const fiveGnot = 5_000_000

// stake makes the next calls send amount ugnot to the realm, as a
// MsgCall's send does (the coins are on the realm's account before the
// function runs); 0 sends nothing.
func stake(amount int64) {
	if amount == 0 {
		testing.SetOriginSend(nil)
		return
	}
	coins := chain.Coins{chain.NewCoin(Denom, amount)}
	testing.SetOriginSend(coins)
	testing.IssueCoins(chain.PackageAddress(realmPath), coins)
}

func balance(addr address) int64 {
	return banker.NewReadonlyBanker().GetCoin(addr, Denom)
}

func TestStakeWin(cur realm, t *testing.T) {
	houseBefore := House()
	testing.SetRealm(testing.NewUserRealm(alice))
	stake(fiveGnot)
	id := CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	g := getGame(id)
	uassert.Equal(t, int64(fiveGnot), g.Stake)
	uassert.Equal(t, int64(fiveGnot), g.Pot)
	// A joiner pays the same stake, no more, no less.
	testing.SetRealm(testing.NewUserRealm(bob))
	stake(1_000_000)
	uassert.AbortsWithMessage(t, cur, "gnoslinger: this showdown's stake is 5000000ugnot, sent 1000000ugnot", func() {
		JoinGame(cross(cur), id, "A-H7", 0)
	})
	stake(0)
	uassert.AbortsWithMessage(t, cur, "gnoslinger: this showdown's stake is 5000000ugnot, sent 0ugnot", func() {
		JoinGame(cross(cur), id, "A-H7", 0)
	})
	stake(fiveGnot)
	JoinGame(cross(cur), id, "A-H7", 0)
	uassert.Equal(t, int64(2*fiveGnot), g.Pot)
	// Coins sent with a call that takes none are refused.
	uassert.AbortsWithMessage(t, cur, "gnoslinger: this call takes no coins", func() {
		Surrender(cross(cur), id)
	})
	stake(0)
	// Bob surrenders: alice wins the pot less the house's 5%.
	aliceBefore := balance(alice)
	Surrender(cross(cur), id)
	uassert.Equal(t, 0, g.Winner)
	uassert.Equal(t, int64(9_500_000), balance(alice)-aliceBefore)
	uassert.Equal(t, int64(9_500_000), g.Payouts[0])
	uassert.Equal(t, int64(0), g.Payouts[1])
	uassert.Equal(t, int64(500_000), g.HouseCut)
	uassert.Equal(t, houseBefore+500_000, House())
	uassert.True(t, strings.Contains(GameJSON(id), `"stake":5000000,"pot":10000000,"payouts":[9500000,0],"houseCut":500000`), GameJSON(id))
	uassert.True(t, strings.Contains(Render("game/"+id), "Stake 5 GNOT each · pot 10 GNOT"), Render("game/"+id))
	uassert.True(t, strings.Contains(Render("game/"+id), "got 9.5 GNOT · the house kept 0.5 GNOT"), Render("game/"+id))
}

func TestStakeOnlyUgnot(cur realm, t *testing.T) {
	testing.SetRealm(testing.NewUserRealm(alice))
	testing.SetOriginSend(chain.Coins{chain.NewCoin("foo", 5)})
	uassert.AbortsWithMessage(t, cur, "gnoslinger: a stake is paid in ugnot only", func() {
		CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	})
	stake(0)
}

func TestStakeCancelAndAbandon(cur realm, t *testing.T) {
	// Cancelled while waiting: every stake paid goes back.
	testing.SetRealm(testing.NewUserRealm(alice))
	stake(fiveGnot)
	id := CreateGame(cross(cur), 3, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	stake(fiveGnot)
	JoinGame(cross(cur), id, "A-H7", 0)
	stake(0)
	aliceBefore, bobBefore := balance(alice), balance(bob)
	testing.SetRealm(testing.NewUserRealm(alice))
	CancelGame(cross(cur), id)
	uassert.Equal(t, int64(fiveGnot), balance(alice)-aliceBefore)
	uassert.Equal(t, int64(fiveGnot), balance(bob)-bobBefore)

	// Nobody playing any more, everyone ends out of time: the stakes go
	// back too, no cut.
	houseBefore := House()
	stake(fiveGnot)
	id = CreateGame(cross(cur), 2, 10, 5, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	stake(fiveGnot)
	JoinGame(cross(cur), id, "A-H7", 0)
	stake(0)
	aliceBefore, bobBefore = balance(alice), balance(bob)
	testing.SetRealm(testing.NewUserRealm(carol))
	for i := 0; i < MaxMissed; i++ {
		testing.SkipHeights(61) // past the 5 minute timeout
		ClaimTimeout(cross(cur), id)
	}
	g := getGame(id)
	uassert.Equal(t, "timeout", g.EndReason)
	uassert.Equal(t, int64(fiveGnot), g.Payouts[0])
	uassert.Equal(t, int64(fiveGnot), balance(alice)-aliceBefore)
	uassert.Equal(t, int64(fiveGnot), balance(bob)-bobBefore)
	uassert.Equal(t, houseBefore, House())
}

func TestStakeDraw(cur realm, t *testing.T) {
	// A draw splits the pot between the seats tied for the most points;
	// what does not divide evenly goes to the house.
	houseBefore := House()
	stake(10_000_001)
	g := &Game{ID: "draw", Players: []Player{{Addr: alice}, {Addr: bob}, {Addr: carol}}, VP: []int{2, -8, 2}, Stake: 0, Pot: 10_000_001, EndReason: "max_turns"}
	stake(0)
	aliceBefore, carolBefore := balance(alice), balance(carol)
	g.payPot(cur)
	// 5% of 10_000_001 is 500_000; 9_500_001 split in two leaves 1 over.
	uassert.Equal(t, int64(4_750_000), balance(alice)-aliceBefore)
	uassert.Equal(t, int64(4_750_000), balance(carol)-carolBefore)
	uassert.Equal(t, int64(500_001), g.HouseCut)
	uassert.Equal(t, houseBefore+500_001, House())
	// Paid once only.
	g.payPot(cur)
	uassert.Equal(t, int64(4_750_000), balance(alice)-aliceBefore)
}

func TestWithdrawHouse(cur realm, t *testing.T) {
	stake(1_000_000)
	house += 1_000_000 // as if a pot had been cut
	stake(0)
	admin = carol // the deployer, on a chain
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: admin only", func() {
		WithdrawHouse(cross(cur), alice, 1)
	})
	testing.SetRealm(testing.NewUserRealm(carol))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: the house holds "+strconv.FormatInt(House(), 10)+"ugnot", func() {
		WithdrawHouse(cross(cur), carol, House()+1)
	})
	carolBefore, houseBefore := balance(carol), House()
	WithdrawHouse(cross(cur), carol, 1_000_000)
	uassert.Equal(t, int64(1_000_000), balance(carol)-carolBefore)
	uassert.Equal(t, houseBefore-1_000_000, House())
	// The admin hands over.
	SetAdmin(cross(cur), bob)
	uassert.Equal(t, bob, Admin())
}

package gnoslinger

import (
	"strconv"
	"strings"
	"time"

	"gno.land/p/nt/avl/v0"
	"gno.land/r/sys/users"
)

// maxPlayersPage bounds json/players/{offset}/{count}.
const maxPlayersPage = 50

// Profile is a player's record, created the first time the address creates
// or joins a game.
type Profile struct {
	Addr address
	// GamesPlayed counts the games the player sat in once they started (a
	// second player joined); a cancelled showdown does not count.
	GamesPlayed int
	// VictoryPoints are not scored yet: always 0.
	VictoryPoints int
	CreatedAt     time.Time
}

var (
	profiles = avl.NewTree() // address -> *Profile
	// ranking orders the profiles, best first: rankKey -> *Profile.
	ranking = avl.NewTree()
)

// rankKey sorts by victory points, then games played, both descending, then
// by address.
func rankKey(p *Profile) string {
	return desc(p.VictoryPoints) + ":" + desc(p.GamesPlayed) + ":" + p.Addr.String()
}

// desc is a fixed-width key that sorts larger numbers first.
func desc(n int) string {
	s := strconv.Itoa(999999999 - n)
	return strings.Repeat("0", 9-len(s)) + s
}

// ensureProfile returns addr's profile, creating it on first use.
func ensureProfile(addr address) *Profile {
	if v := profiles.Get(addr.String()); v != nil {
		return v.(*Profile)
	}
	p := &Profile{Addr: addr, CreatedAt: time.Now()}
	profiles.Set(addr.String(), p)
	ranking.Set(rankKey(p), p)
	return p
}

// updateProfile applies change to addr's profile and keeps its rank.
func updateProfile(addr address, change func(p *Profile)) {
	p := ensureProfile(addr)
	ranking.Remove(rankKey(p))
	change(p)
	ranking.Set(rankKey(p), p)
}

// rankOf is the 1-based position of p in the ranking.
func rankOf(p *Profile) int {
	key := rankKey(p)
	rank := 0
	ranking.Iterate("", "", func(k string, _ any) bool {
		rank++
		return k == key
	})
	return rank
}

// registeredName is addr's name in gno.land/r/sys/users (where namereg
// registers them), or "".
func registeredName(addr address) string {
	if addr == "" {
		return ""
	}
	if u := users.ResolveAddress(addr); u != nil {
		return u.Name()
	}
	return ""
}

// ProfileJSON is the profile of an address, or null when it has none yet:
//
//	{"addr","name","rank","gamesPlayed","victoryPoints","createdAt"}
//
// name is the address's name in gno.land/r/sys/users, "" if none.
func ProfileJSON(addr string) string {
	v := profiles.Get(addr)
	if v == nil {
		return "null"
	}
	p := v.(*Profile)
	var b strings.Builder
	writeProfile(&b, p, rankOf(p))
	return b.String()
}

// PlayersJSON is one page of the ranking, best first, count at most
// maxPlayersPage:
//
//	{"total","offset","players":[profile...]}
func PlayersJSON(offset, count int) string {
	if offset < 0 {
		offset = 0
	}
	if count < 0 {
		count = 0
	}
	if count > maxPlayersPage {
		count = maxPlayersPage
	}
	var b strings.Builder
	b.WriteString(`{"total":` + strconv.Itoa(ranking.Size()))
	b.WriteString(`,"offset":` + strconv.Itoa(offset))
	b.WriteString(`,"players":[`)
	i := 0
	ranking.IterateByOffset(offset, count, func(_ string, v any) bool {
		if i > 0 {
			b.WriteByte(',')
		}
		writeProfile(&b, v.(*Profile), offset+i+1)
		i++
		return false
	})
	b.WriteString("]}")
	return b.String()
}

func writeProfile(b *strings.Builder, p *Profile, rank int) {
	b.WriteString(`{"addr":` + quote(p.Addr.String()))
	b.WriteString(`,"name":` + quote(registeredName(p.Addr)))
	b.WriteString(`,"rank":` + strconv.Itoa(rank))
	b.WriteString(`,"gamesPlayed":` + strconv.Itoa(p.GamesPlayed))
	b.WriteString(`,"victoryPoints":` + strconv.Itoa(p.VictoryPoints))
	b.WriteString(`,"createdAt":` + strconv.FormatInt(p.CreatedAt.Unix(), 10))
	b.WriteByte('}')
}

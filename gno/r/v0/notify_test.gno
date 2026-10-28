package gnoslinger

import (
	"strings"
	"testing"
	"time"

	"gno.land/p/nt/uassert/v0"
	gnotif "gno.land/r/nym-gfanton001/gnotif/v1"
)

func TestDeclareTriggers(cur realm, t *testing.T) {
	admin = carol // the deployer, on a chain
	testing.SetRealm(testing.NewUserRealm(alice))
	uassert.AbortsWithMessage(t, cur, "gnoslinger: admin only", func() {
		DeclareTriggers(cross(cur))
	})
	testing.SetRealm(testing.NewUserRealm(carol))
	DeclareTriggers(cross(cur))
	ids := gnotif.Active(realmPath)
	uassert.Equal(t, len(notifTriggers), len(strings.Split(ids, ",")))
	// Declared again, the triggers keep their ids.
	DeclareTriggers(cross(cur))
	uassert.Equal(t, ids, gnotif.Active(realmPath))
}

func TestCharName(t *testing.T) {
	uassert.Equal(t, "The Kid", charName("the_kid"))
	uassert.Equal(t, "Marshal", charName("marshal"))
}

func TestFormatTimeout(t *testing.T) {
	for _, tt := range []struct {
		d    time.Duration
		want string
	}{
		{48 * time.Hour, "2 days"},
		{24 * time.Hour, "1 day"},
		{36 * time.Hour, "36 hours"},
		{time.Hour, "1 hour"},
		{90 * time.Minute, "90 minutes"},
		{5 * time.Minute, "5 minutes"},
	} {
		uassert.Equal(t, tt.want, formatTimeout(tt.d))
	}
}

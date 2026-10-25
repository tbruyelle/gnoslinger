package engine

import (
	"testing"

	"gno.land/p/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/cards/v0"
	"gno.land/p/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/hex/v0"
)

func TestEncodeEventsRoundTrip(t *testing.T) {
	evs := []Event{
		{Seg: 2, Player: 0, Kind: EvMove, Action: cards.Advance, From: "A-F3", To: "A-F4", Facing: hex.S, Down: false, Step: StepAction},
		{Seg: 3, Player: 1, Kind: EvDelay, N: 2, Delay: 5, Reason: ReasonStun, Card: 67, Endurance: 2, Step: StepEnd},
		{Seg: 3, Player: 1, Kind: EvDelay, Reason: ReasonDrop, Card: 97, Result: "lose_aim", Delay: 5},
		{Seg: 4, Player: 0, Kind: EvShot, Action: cards.Shoot, Card: 34, Target: 1, To: "A-F9", Hit: "BODY", Range: 2, N: 7, Gun: Colt45, GunID: 1, Step: StepShots, Chart: "BODY"},
		{Seg: 5, Player: 0, Kind: EvShot, Action: cards.Shoot, Card: 92, Target: 1, To: "A-D8", Hit: "ARM", Range: 3, N: 3, Gun: Colt45, GunID: 1, Step: StepShots, Chart: "BE", Status: "M"},
		{Seg: 4, Player: 0, Kind: EvShot, Action: cards.Shoot, Card: 6, Target: -1, To: "A-F6", Hit: string(Miss), Reason: ReasonEmptyHex, Range: 3, N: 1, Gun: Colt45, GunID: 1},
		{Seg: 5, Player: 1, Kind: EvDraw, Action: cards.DrawAndCock, From: "ground", To: "gun_hand", Gun: Colt45, GunID: 2, N: 3},
		{Seg: EndOfTurn, Player: 0, Kind: EvCancel, Action: cards.Turn, Reason: ReasonTime},
		{Seg: 1, Player: 1, Kind: EvFlip, Down: true},
	}
	enc := EncodeEvents(evs)
	got := DecodeEvents(enc)
	if len(got) != len(evs) {
		t.Fatalf("decoded %d events, want %d: %q", len(got), len(evs), enc)
	}
	for i := range evs {
		if got[i] != evs[i] {
			t.Errorf("event %d: got %+v, want %+v", i, got[i], evs[i])
		}
	}
	if DecodeEvents("") != nil || len(DecodeEvents("garbage")) != 0 {
		t.Error("empty or malformed input should decode to nothing")
	}
	if len(enc) > 60*len(evs) {
		t.Errorf("encoding is %d bytes for %d events", len(enc), len(evs))
	}
}

func TestEncodeCharactersRoundTrip(t *testing.T) {
	st := startState()
	st.Chars[0].Hex, st.Chars[0].Facing, st.Chars[0].Down, st.Chars[0].Delay = "A-G5", hex.SW, true, 3
	st.Chars[0].Status, st.Chars[0].PlayedFoot, st.Chars[0].PlayedRun, st.Chars[0].RanLastTurn, st.Chars[0].Dropped = Killed, true, true, true, true
	st.Chars[0].Aim, st.Chars[0].AimHex, st.Chars[0].Endurance, st.Chars[0].Exhausted = 4, "A-F6", 11, 1
	st.Chars[0].Serious, st.Chars[0].GunArm, st.Chars[0].OtherArm, st.Chars[0].Leg = 2, 4, 1, 3
	st.Chars[0].Guns = Guns{{ID: 1, Type: Colt45, Location: GunHand, Cocked: true, Shells: 4, Jammed: true}, {ID: 3, Type: Colt45, Location: Holstered, Shells: 6, Exploded: true}}
	st.Chars[0].Killers = [MaxPlayers]bool{false, true, false, true}
	st.Chars[0].SeriousFrom = [MaxPlayers]int{0, 1, 1, 0}
	st.Chars[0].LegFrom = [MaxPlayers]int{3, 0, 0, 0}
	st.Chars[0].Hurt = [MaxPlayers]int{0, 7, 0, 2}
	st.Chars[1].Guns = Guns{} // no gun at all
	st.Chars[1].Aim, st.Chars[1].AimAt = 2, 0
	got := DecodeChars(EncodeChars(st.Chars))
	if len(got) != len(st.Chars) {
		t.Fatalf("decoded %d characters, want %d", len(got), len(st.Chars))
	}
	for i := range st.Chars {
		if got[i] != st.Chars[i] {
			t.Errorf("char %d: got %+v, want %+v", i, got[i], st.Chars[i])
		}
	}
	if DecodeCharacter("bad") != (Character{}) {
		t.Error("malformed character should decode to zero")
	}
	if DecodeChars("") != nil {
		t.Error("nothing should decode to nothing")
	}
	// Four seats round trip too.
	four := fourState()
	four.Chars[3].Hurt[2] = 5
	if got := DecodeChars(EncodeChars(four.Chars)); len(got) != 4 || got[3] != four.Chars[3] || got[2].Hex != "A-H6" {
		t.Errorf("four seats: got %+v", got)
	}
}

func TestEncodeGroundRoundTrip(t *testing.T) {
	ground := []GroundGun{
		{ID: 1, Hex: "A-G6", Gun: Gun{ID: 1, Type: Colt45, Location: Holstered, Shells: 6}},
		{ID: 3, Hex: "A-I11*", Gun: Gun{ID: 2, Type: Colt45, Cocked: true, Shells: 2, Jammed: true, Exploded: true}},
	}
	enc := EncodeGround(ground)
	if enc != "1|A-G6|1:colt45:0:0:6:0:0;3|A-I11*|2:colt45:0:1:2:1:1" {
		t.Errorf("encoded %q", enc)
	}
	got := DecodeGround(enc)
	if len(got) != len(ground) {
		t.Fatalf("decoded %+v", got)
	}
	for i := range ground {
		if got[i] != ground[i] {
			t.Errorf("ground %d: got %+v, want %+v", i, got[i], ground[i])
		}
	}
	if EncodeGround(nil) != "" || DecodeGround("") != nil || len(DecodeGround("garbage;1|A-G6|bad")) != 0 {
		t.Error("no ground, or a malformed one, decodes to nothing")
	}
}

func TestEncodeIntsRoundTrip(t *testing.T) {
	for _, ns := range [][]int{nil, {44}, {44, 1, 30, 108}} {
		got := DecodeInts(EncodeInts(ns))
		if len(got) != len(ns) {
			t.Fatalf("%v -> %v", ns, got)
		}
		for i := range ns {
			if got[i] != ns[i] {
				t.Errorf("%v -> %v", ns, got)
			}
		}
	}
}

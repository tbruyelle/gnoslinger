// PKGPATH: gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0/filetests/z17_notify_filetest

package z17_notify_filetest

import (
	"testing"

	gnoslinger "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
)

const (
	alice address = "g1alice00000000000000000000000000000000"
	bob   address = "g1bob0000000000000000000000000000000000"
)

// The events that name their recipient, for the browser notifications:
// PlanDue to both when the game starts (the last join) and when a turn
// starts (the resolution); RevealDue to alice when bob's reveal in clear
// completes the commits; ShowdownOver to both when bob surrenders.
func main(cur realm) {
	testing.SetRealm(testing.NewUserRealm(alice))
	id := gnoslinger.CreateGame(cross(cur), 2, 10, 0, "A-D5", 3)
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.JoinGame(cross(cur), id, "A-H7", 0)
	testing.SetRealm(testing.NewUserRealm(alice))
	gnoslinger.Commit(cross(cur), id, 1, gnoslinger.PlanHash(id, 1, 0, "ab", "1f:ahead"), "locked")
	testing.SetRealm(testing.NewUserRealm(bob))
	gnoslinger.Reveal(cross(cur), id, 1, 1, "cd", "")
	gnoslinger.Reveal(cross(cur), id, 1, 0, "ab", "1f:ahead")
	gnoslinger.Surrender(cross(cur), id)
}

// Events:
// [
//   {
//     "type": "GameCreated",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "creator",
//         "value": "g1alice00000000000000000000000000000000"
//       },
//       {
//         "key": "char",
//         "value": "marshal"
//       },
//       {
//         "key": "seats",
//         "value": "2"
//       },
//       {
//         "key": "maxTurns",
//         "value": "10"
//       },
//       {
//         "key": "timeoutMinutes",
//         "value": "2880"
//       },
//       {
//         "key": "hex",
//         "value": "A-D5"
//       },
//       {
//         "key": "facing",
//         "value": "3"
//       },
//       {
//         "key": "stake",
//         "value": "0"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlanDue",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "1"
//       },
//       {
//         "key": "turns",
//         "value": "10"
//       },
//       {
//         "key": "to",
//         "value": "g1alice00000000000000000000000000000000"
//       },
//       {
//         "key": "char",
//         "value": "Marshal"
//       },
//       {
//         "key": "vs",
//         "value": "The Kid"
//       },
//       {
//         "key": "left",
//         "value": "2 days"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlanDue",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "1"
//       },
//       {
//         "key": "turns",
//         "value": "10"
//       },
//       {
//         "key": "to",
//         "value": "g1bob0000000000000000000000000000000000"
//       },
//       {
//         "key": "char",
//         "value": "The Kid"
//       },
//       {
//         "key": "vs",
//         "value": "Marshal"
//       },
//       {
//         "key": "left",
//         "value": "2 days"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlayerJoined",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "player",
//         "value": "g1bob0000000000000000000000000000000000"
//       },
//       {
//         "key": "seat",
//         "value": "1"
//       },
//       {
//         "key": "char",
//         "value": "the_kid"
//       },
//       {
//         "key": "hex",
//         "value": "A-H7"
//       },
//       {
//         "key": "facing",
//         "value": "0"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlanCommitted",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "1"
//       },
//       {
//         "key": "player",
//         "value": "g1alice00000000000000000000000000000000"
//       },
//       {
//         "key": "seat",
//         "value": "0"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlanRevealed",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "1"
//       },
//       {
//         "key": "seat",
//         "value": "1"
//       },
//       {
//         "key": "by",
//         "value": "g1bob0000000000000000000000000000000000"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "AllCommitted",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "1"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "RevealDue",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "1"
//       },
//       {
//         "key": "turns",
//         "value": "10"
//       },
//       {
//         "key": "to",
//         "value": "g1alice00000000000000000000000000000000"
//       },
//       {
//         "key": "char",
//         "value": "Marshal"
//       },
//       {
//         "key": "vs",
//         "value": "The Kid"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlanRevealed",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "1"
//       },
//       {
//         "key": "seat",
//         "value": "0"
//       },
//       {
//         "key": "by",
//         "value": "g1bob0000000000000000000000000000000000"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "TurnResolved",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "1"
//       },
//       {
//         "key": "rev",
//         "value": "5"
//       },
//       {
//         "key": "seed",
//         "value": "c2cd13a95df3dee45a06216fdfe198f5f409a14f0ba69e2324a2fa0f46b7036d"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlanDue",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "2"
//       },
//       {
//         "key": "turns",
//         "value": "10"
//       },
//       {
//         "key": "to",
//         "value": "g1alice00000000000000000000000000000000"
//       },
//       {
//         "key": "char",
//         "value": "Marshal"
//       },
//       {
//         "key": "vs",
//         "value": "The Kid"
//       },
//       {
//         "key": "left",
//         "value": "2 days"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlanDue",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "2"
//       },
//       {
//         "key": "turns",
//         "value": "10"
//       },
//       {
//         "key": "to",
//         "value": "g1bob0000000000000000000000000000000000"
//       },
//       {
//         "key": "char",
//         "value": "The Kid"
//       },
//       {
//         "key": "vs",
//         "value": "Marshal"
//       },
//       {
//         "key": "left",
//         "value": "2 days"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "PlayerSurrendered",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "turn",
//         "value": "2"
//       },
//       {
//         "key": "player",
//         "value": "g1bob0000000000000000000000000000000000"
//       },
//       {
//         "key": "seat",
//         "value": "1"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "VictoryPoints",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "seat",
//         "value": "0"
//       },
//       {
//         "key": "player",
//         "value": "g1alice00000000000000000000000000000000"
//       },
//       {
//         "key": "reason",
//         "value": "survive"
//       },
//       {
//         "key": "points",
//         "value": "2"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "VictoryPoints",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "seat",
//         "value": "0"
//       },
//       {
//         "key": "player",
//         "value": "g1alice00000000000000000000000000000000"
//       },
//       {
//         "key": "reason",
//         "value": "hold_field"
//       },
//       {
//         "key": "points",
//         "value": "2"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "VictoryPoints",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "seat",
//         "value": "1"
//       },
//       {
//         "key": "player",
//         "value": "g1bob0000000000000000000000000000000000"
//       },
//       {
//         "key": "reason",
//         "value": "surrender"
//       },
//       {
//         "key": "points",
//         "value": "-2"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "VictoryPoints",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "seat",
//         "value": "1"
//       },
//       {
//         "key": "player",
//         "value": "g1bob0000000000000000000000000000000000"
//       },
//       {
//         "key": "reason",
//         "value": "captured"
//       },
//       {
//         "key": "points",
//         "value": "-4"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "GameEnded",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "reason",
//         "value": "surrender"
//       },
//       {
//         "key": "winner",
//         "value": "g1alice00000000000000000000000000000000"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "ShowdownOver",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "to",
//         "value": "g1alice00000000000000000000000000000000"
//       },
//       {
//         "key": "char",
//         "value": "Marshal"
//       },
//       {
//         "key": "vs",
//         "value": "The Kid"
//       },
//       {
//         "key": "outcome",
//         "value": "you won"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   },
//   {
//     "type": "ShowdownOver",
//     "attrs": [
//       {
//         "key": "id",
//         "value": "0000001"
//       },
//       {
//         "key": "to",
//         "value": "g1bob0000000000000000000000000000000000"
//       },
//       {
//         "key": "char",
//         "value": "The Kid"
//       },
//       {
//         "key": "vs",
//         "value": "Marshal"
//       },
//       {
//         "key": "outcome",
//         "value": "you lost"
//       }
//     ],
//     "pkg_path": "gno.land/r/g1th0masp67zfs9lg6d34qhghldhg6kjcqjuv7c2/gnoslinger/v0"
//   }
// ]

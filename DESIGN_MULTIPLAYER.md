# Design for more than two players: plan and status

The designs on the Claude Design canvas (AGENTS.md, Design) were drawn for a
duel. Showdowns with more players are coming (DESIGN_SHOWDOWNS.md): battle
royale (2 to 8), teams (OK Corral). This reviews every artifact for that,
and lists the changes, most important first, with what is done.

**Status, 2026-10-17: done for 2 to 4 seats.** The canvas's screen mockups
are not kept up to date any more: the screens as the game has them are the
reference (AGENTS.md, Design). What is left comes with more than four seats
and teams, the showdown packages (DESIGN_SHOWDOWNS.md, step 4).

## Done on 2026-10-16: two to four seats

The realm and the client play showdowns of **2 to 4 players**, every
character a side of its own: the creator picks the number of seats, and
the seats take the showdown's characters **in the order the players join**
(seat 0 the marshal, 1 the kid, 2 the reb, 3 the yankee), each in its own hexes
around the middle of the corral (D5-D7 with E6-E7, H5-H7 with G6-G7, E8/F7/F8/G8, E5/F5/F4/G5;
AGENTS.md, Set up). No character
pick yet, no teams, not more than four (the showdown's set up stops
there). The engine takes any number of seats; targets, AIM markers, kills
and knock outs name seats (`AimAt`, `Killers`, `SeriousFrom`, `LegFrom`,
`Hurt`).

## Already fine

- **Action cards**: they say "Name option, target", never "opponent".
- **Character sheet**: one sheet per character, the layout holds; its
  accent is now the seat's colour (point 1), and it says who aims at the
  character (AIMED BY).
- **Segment tracker**: per character, it shows my own plan.
- **Bursts** (HIT!, MISSED!, JAMMED!, EXPLODED!): per shot; several can show
  at once.

## Across the screens: telling characters apart

1. **Seat and team colours.** *Done for four seats:* `client/src/ui/seats.ts`
   holds the palette, indigo, brick, action green and teal (the palette's
   gold and ochre vanish on the board's tan), apart in hue
   and in lightness so it holds for colour-blind players; it drives the
   panels' rule, the token rings, the timeline, the sheet and the AIM
   markers' rings. *Left:* four more colours for 8 seats; in team modes,
   team colours replace seat colours.
2. **Tokens on the board.** *Done:* each token gets a ring in its seat's
   colour (mine wider, pulsing while it is my move), and a gold halo under
   the pointer; AIM markers on a token are one per aimer, fanned along the
   rim, each ringed in the aimer's colour, since several characters may aim
   at the same token; tokens sharing a hex fan out in a star, spread wide
   under the pointer, and a hovered token outlines its character's panel.

## Lobby

3. **"Join as The Kid"** *Done:* "Join as Reb" names the next free
   seat's character, with "2 of 4 seats taken". *Left:* a character pick,
   and a team pick in team modes.
4. **"vs The Kid · g1q8…"** *Done for four:* every other player is listed.
   *Left:* a row of small tokens, "+3" past four.
5. **"New showdown" has no mode or seats**: *Done:* a Players select (2 to
   4) with the seats' line-up in their colours. *Left:* the mode (Battle
   royale / Teams), team sizes in team modes.
6. **"Waiting for a second player"** *Done:* "Waiting for players · 3 of 4
   seats taken"; the game starts once full (the creator cannot start it
   at the minimum; it can cancel while a seat is free, which drops the
   players who joined).

## Game, planning

7. **The single opponent panel becomes a roster**: *Done in part:* the
   others' panels turn compact (token, delay, endurance, AIM) when they are
   several, in their seat colours, the column scrolling; characters out of
   the fight are greyed. *Left:* grouping by team, an 8-seat test.
8. **The header "The Marshal (you) vs The Kid"** lists every seat; the
   status names the characters whose plan is still awaited ("Plan sent,
   waiting for The Kid, Yankee…"). *Left:* the mode's name and "plans sent:
   3 / 5" past four.
9. **Picking a target**: *Done:* clicking a token still works for any
   seat; a hex with several enemies in sight opens a menu naming them; the
   plan list names the target ("aim at Reb"), in its seat's colour.

## Game, replay

10. **The left column of full character panels** holds four (scrolling).
    *Left:* the roster of point 7 for 8.
11. **The timeline** *Done:* thinner rows (34 px) and a seat-colour dot on
    the names past two rows, so four fit the bottom strip. *Left:* a
    "Me / everyone" filter for 8.
12. **Log step tags** ("MARSHAL") *Done:* the names in the log lines show
    bold in their seat's colour.

## Splash

13. **"Two gunfighters, five segments a turn…"** *Done in the code*
    (`SPLASH_LINE` in `client/src/scenes/LobbyScene.ts`: "Gunfighters, five
    segments a turn, one hand of cards. Every turn is settled on chain.").

## Order of what is left

1. Beyond four seats and teams, with the showdown packages
   (DESIGN_SHOWDOWNS.md): the roster (7, 10), the mode select (5), team
   picks (3), the timeline filter (11), four more colours (1).

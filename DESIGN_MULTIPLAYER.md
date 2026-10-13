# Design for more than two players: plan

The designs on the Claude Design canvas (AGENTS.md, Design) were drawn for a
duel. Showdowns with more players are coming (SHOWDOWNS.md): battle royale
(2 to 8), teams (OK Corral). This reviews every artifact for that, and lists
the changes, most important first.

## Already fine

- **Action cards**: they say "Name option, target", never "opponent".
- **Character sheet**: one sheet per character, the layout holds; only its
  colour needs work (point 1).
- **Segment tracker**: per character, it shows my own plan.
- **Bursts** (HIT!, MISSED!, JAMMED!, EXPLODED!): per shot; several can show
  at once.

## Across the screens: telling characters apart

1. **Seat and team colours.** Today characters are told apart by their token
   alone, and the character sheet's `accent` offers 3 colours (the code uses
   2, one per seat). Needed: an 8-colour seat palette whose colours also
   differ in lightness, so it holds for colour-blind players; in team modes,
   team colours replace seat colours. This one decision drives most of the
   points below.
2. **Tokens on the board.** Eight similar figures cannot be told apart: each
   token gets a seat-coloured ring and its name on hover. AIM markers take
   the aimer's colour, since several characters may aim at the same token.

## Lobby

3. **"Join as The Kid"** assumes seat 2 is The Kid: becomes "Join (3 of 6
   seats)", with a character pick, and a team pick in team modes.
4. **"vs The Kid · g1q8…"** names one opponent: becomes a row of small
   tokens, "+3" past four.
5. **"New showdown" has no mode or seats**: add the mode (Duel / Battle royale
   / Teams), the number of seats where the mode allows a range, team sizes in
   team modes.
6. **"Waiting for a second player"** becomes "3 of 6 seats taken". A rule to
   settle: does the game start once full, or can the creator start it at the
   minimum?

## Game, planning

7. **The single opponent panel becomes a roster**: one compact row per
   character (seat colour, token, endurance, delay, plan sent), characters out
   of the fight greyed, grouped by team in team modes, scrollable.
8. **The header "The Marshal (you) vs The Kid"** becomes the mode's name and
   "plans sent: 3 / 5".
9. **Picking a target**: clicking a token still works; the plan list already
   names the target ("aim at The Kid") and adds the target's seat colour.

## Game, replay

10. **The left column of full character panels** does not fit 8 characters:
    it reuses the roster of point 7.
11. **The timeline** (one row per character) scales, but 8 rows of 40 px
    take about 350 px: thinner rows (about 26 px), seat colours on the names;
    a "Me / everyone" filter is optional.
12. **Log step tags** ("MARSHAL") take the seat's colour, and names as in the
    log lines.

## Splash

13. **"Two gunfighters, five segments a turn…"** turns false with more
    players. The line is in the game's code (`SPLASH_LINE` in
    `client/src/scenes/LobbyScene.ts`) as well as on the canvas. Something
    like "Gunfighters, five segments a turn, one hand of cards. Every turn is
    settled on chain."

## Order

1. Seat and team palette, token rings (points 1, 2): they unlock the rest.
2. The roster, used by the planning and replay screens (points 7, 10).
3. Lobby (points 3 to 6), the rest of planning and replay (8, 9, 11, 12).
4. Splash line, canvas and code (point 13).

The canvas may hold edits made by hand since these screens were drawn: re-read
each screen before changing it.

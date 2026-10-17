# TODO

## Size
- Encode boards so they took less space

## UI
- change window size to see how things fit
- use gnotiff
- Session keys (`MsgCreateSession`) so Adena signs once per game.
- add report bug button

## General
- remove unused assets
- Replace the tbruyelle realm to sthing else
- upgrade architecture
  - how to add more boards/gun in the future w/o changing the realms

## Player profile
- Add profile page with specific token and linked reputation (check RPG rules)
  - Add XP to player to increase stats? 
- Add a challenge player button
- Can pick a specific character token
- Buy more character tokens 
- Buy guns
- Buy bonus cards
  - Say some cowbow thing during the game
  - Real bonus cards from the game

## Tutorial
- Basic tutorial
  - Movement
  - draw & cock
  - aim & shoot
- Advanced tutorial

## Lobby
- add last turn replay when player goes back to a game
- allow winner to remove replay to be refunded for the deposit
- Create game options
  - Allow create game with pot
    - join require to fill the pot with the same amount
    - cancel game clawbacks the fund
    - part of the pot is hold by the realm to create events
  - only the default gun
  - any gun bought
  - scenario
    - battelroyale 2 to 8
    - OK coral with the whyatt earp (adapt with number of players)

## Showdown
- add address/namepsace info to character sheets and panels
- implement character's run away
- Merge your character panel and your plan
- aim transfer own-hex exception (12.5): AIM markers cannot move into or out
  of the shooter's own hex (allowed between two targets both in it, or both
  out of it); missing in the engine's `reveal` and the client's `replayPlan`
- >4 players (the showdown's set up stops at four characters) and teams, 
  see DESIGN_SHOWDOWNS.md and DESIGN_MULTIPLAYER.md
- four seats, left from DESIGN_MULTIPLAYER.md:
  - the seats' colours on the names in the resolution log
  - the design canvas: the four-seat palette and the lobby form (re-read
    each screen first, it may hold hand edits)
    - game screen (ScreenGame): one panel per other character instead of
      the single "Opponent" panel, compact when several, each ringed in
      its seat colour; the four seat colours (indigo, brick, green, teal),
      only indigo and brick show; seat-colour rings on the board tokens;
      header "The Marshal (you) vs The Kid" listing every seat; the status
      as a ribbon over the board; "Resign" is now "Surrender"
    - lobby (ScreenLobby), a catch-up, no redesign (characters follow the
      join order): a Players select (2 to 4) like Turns in the New
      showdown form; wording: "Waiting on others", "Waiting for players ·
      3 of 4 seats taken", "Join as El Jefe · 2 of 4 seats taken", the
      timeout note (out of time means out, the others go on)
- add winning/losing burst
- show tips (or highlight a card with some text)
  - when no gun: show need to draw and cock
  - when gun uncocked: show needs to be cocked
  - when gun has no bullet: show needs to LOAD
  - when gun is jammed: show it needs to be fully loaded
  - when gun is exploded: nothing can be done except thrown or drop
  - when player has serious
  - allow enable/disable tooltip
- Movements
  - Check possible to move around a building corner
- Cards
  - add drop weapon action cards (show waepon on the ground)
  - add throw and strength
  - add brawling
    - add knifes and others
- Aim/Shoots
  - line of sight (board A done: the trough, DESIGN_LOS.md; the rest
    needs a board with buildings and its hexsides traced)
    - wall and doors block (except saloon)
    - cant shot if target is down behind a window
    - cant shoot if both players are down and there is a window between
      them
    - check case https://youtu.be/WGQbh6coUQI?t=2704
    - range through the split hex I11 counts both halves (30.62 says one)
  - fanfire
  - keep smoke until end of next turn
  - hit
    - add more detailed burst that just hit (vital, critical, ...)
    - keep blood on the ground?
  - when shooting empty hex, indicate this is only if a target go in the hex
- Obstacles
  - walls 
  - doors except saloon
  - windows
- Commit-reveal for plans (`PhaseCommit`/`PhaseRevaeal` reserved): secret
  simultaneous selection and dice seeded from revealed salts.
- Sounds
  - Add western music
    
## Special Events
- allow temparory events like "rob the bank" with rewards from realm funds

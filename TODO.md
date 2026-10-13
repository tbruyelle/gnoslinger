# TODO

## Size
- Encode boards so they took less space

## UI
- segment tracker
  - replace the 5 dots of replay tracker
  - add 5 squares reprenting each fragment
  - fill them in red when there is delay
  - highlight current segment by surrounding it with red lines
  - animate highlight with replay
  - fill the segment with light green color when planning
- highlight full hex rather than drawing a circle for selection
- change window size to see how things fit
- use gnotiff
- Session keys (`MsgCreateSession`) so Adena signs once per game.
- add report bug button

## General
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
- separate games that wait for player's turn and the others
- add last turn replay when player goes back to a game
- allow winner to remove replay to be refunded for the deposit
- Check game list order (sort by most recent)
  - highlight almost timeouted game (display remaining time)
- Top players list leaderboard
- Create game options
  - Allow create game with pot
    - join require to fill the pot with the same amount
    - cancel game clawbacks the fund
    - part of the pot is hold by the realm to create events
  - only the default gun
  - any gun bought
  - chose number of turns (min 10 max 30)
  - move timeout in the same form
  - scenario
    - battelroyale 2 to 8
    - OK coral with the whyatt earp (adapt with number of players)

## Showdown
- Victory points (required for more than 2 players)
- make renaiming plan points more visible
- add winning/losing burst
- show tips (or highlight a card with some text)
  - when no gun: show need to draw and cock
  - when gun uncocked: show needs to be cocked
  - when gun has no bullet: show needs to LOAD
  - when gun is jammed: show it needs to be fully loaded
  - when gun is exploded: nothing can be done except thrown or drop
  - when player has serious
  - allow enable/disable tooltip
- Add token placement during create/join phase
- Movements
  - Check possible to move around a building corner
- Cards
  - add drop weapon action cards (show waepon on the ground)
  - add throw and strength
- Character sheets
- Aim/Shoots
  - line of sight
    - wall and doors block (except saloon)
    - character in between doesnt block
    - cant shot if target is down behind an obstacle
    - cant shot if target is down behind a window
    - cant shoot if both players are down and there is an obstacle between
    - cant shoot if both players are down and there is a window between
      them
    - check case https://youtu.be/WGQbh6coUQI?t=2704
  - fanfire
  - keep smoke until end of next turn
  - hit
    - add more detailed burst that just hit (vital, critical, ...)
    - keep blood on the ground?
  - Check LOS behind the horse trough
  - when shooting empty hex, indicate this is only if a target go in the hex
- Obstacles
  - walls 
  - doors except saloon
  - windows
  - check 3 players in the same hex
  - check when 2 characters move at the same segment, but first one arrives on the same hex as the other before it moves, there's no delay.
- Commit-reveal for plans (`PhaseCommit`/`PhaseRevaeal` reserved): secret
  simultaneous selection and dice seeded from revealed salts.
- Sounds
  - Add western music
    
## Special Events
- allow temparory events like "rob the bank" with rewards from realm funds

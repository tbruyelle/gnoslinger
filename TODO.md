# TODO

## Size
- Encode boards so they took less space

## UI
- change window size to see how things fit
- use gnotiff
- add report bug button

## General
- remove unused assets
- Replace the tbruyelle realm to sthing else
- upgrade architecture
  - DESIGN_SHOWDOWN

## Player profile
- Add profile page with specific token and linked reputation (check RPG rules)
  - Add XP to player to increase stats? 
- Add a challenge player button
- Can pick a specific character token
- Buy more character tokens 
- NFTs
- Buy guns
- Buy bonus cards
  - Say some cowbow thing during the game
  - Real bonus cards from the game

## Tutorial
- Basic tutorial
  - Movement
  - win conditions (dead or runaway)
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
    - poker game with money

## Showdown
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
  - enable throw and strength cards
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
- Obstacles
  - walls 
  - doors except saloon
  - windows
- Commit-reveal for plans (`PhaseCommit`/`PhaseReveal` reserved): secret
  simultaneous plans, and the deck shuffle seeded from the revealed salts.
  Maybe make this optional?
- Sounds
  - Add western music
    
## Special Events
- allow temparory events like "rob the bank" with rewards from realm funds

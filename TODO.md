# TODO

## Size
- Encode boards so they took less space

## UI
- change window size to see how things fit
- use gnotiff
- add report bug button

## General
- check albertx/drand, how this can be used ?
  - github.com/albttx/gno-drand (prototype, upstreamed in gnolang/gno#6268,
    still open on 2026-10-25, becomes gno.land/{p,r}/drand/v0; nothing on
    Onyx yet): on-chain verifiable randomness from drand's evmnet (BLS on
    the BN254 curve, the one gno.land verifies natively, ~10-12M gas; our
    timelocked plans use quicknet, BLS12-381, off chain, unaffected)
  - why: the deck seed (salts, plans, block height and time) cannot be
    biased by a player, but the block's proposer sets its time and picks
    its txs: a validator colluding with a player could grind the cards
  - r/drand is asynchronous: Request pins a future round, a relayer
    Submits its signature (verified, so it can only deliver drand's), a
    later tx reads it; no callback, so ~10-15 s and a second tx per turn
  - better for us, no relayer, no r/drand: at the last reveal the realm
    pins the round; then Resolve(id, signature) from any client (it
    fetches the round from drand's HTTP API, as for the timelocked plans)
    verifies it with p/drand.Verify and resolves the turn in the same tx
  - wait for gnolang/gno#6268 to land and p/drand to be on the chain
- remove unused assets
- use clockwork/wire for codec
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
- Advanced tutorial

## Lobby
- allow winner to remove replay to be refunded for the deposit
- Create game options
  - only the default gun
  - any gun bought
  - scenario
    - battelroyale 2 to 8
    - OK coral with the whyatt earp (adapt with number of players)
    - poker game with money

## Showdown
- some screen size hides the run away hexes
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
    
## Special Events
- allow temparory events like "rob the bank" with rewards from realm funds

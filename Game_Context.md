

This file is to give context for the game



# leaderboard should be on the top right of the game




# player controls

A little quicker - to be manipulated in admin panel




# A robust system for admin control of the game
what does this mean -> a admin panel that can configure the hardcoded elements of the game
- like initial player health
- initial player speed
- and to be update on changes to the game on adding of new feature

# a robust admin panel
for traffic viewing, daily active user, monthly actiggve users, cost of operaiton

so admin panel has a bunch of left side tabs in whcih show a game settings in which show the robust system for admin control


On one of the tabs, show like game architecture to see the full architecture of the game
ability to see if servers are healthy
current servers running
supabase enpoint to see if health
web pool on gcp so see if healthy
a way to monitor full game architecture and just to see how the game is setup 

a way to see admin  activity log like admin edited player speed from _ to _

one panel to see accounts list, amount of guest, active guest, active player, totoal player 
people who clicked guest
you know all the details 

so ability to config map size and other preset like desnity of barriers and npc to player amount -
npc health, player healthj and all that - to relay again all hardcoded to be manipulate
would be nice if you could make it like a config file (master config file that shows all the values all in one file) and that interface manipulate that


# we need to setup the supabase account
so on entering it should say login or guest mode



pipeline
enter website -> screen of login or guest - > then joining of game 


# game loop
the details of the actua game

Match rules: first to 15 kills or a five-minute limit, followed by results, a winner announcement, and a rematch countdown.
- it should be a point system so a player kill is high points while bot kill is lower, there should be some sort of ground item that player should be able to collect to get more points
- leaderboardss shouild be top right while showing active players and points kills 
One strong arena: cover, obstacles, and multiple routes. Add authoritative wall collisions for movement and projectiles. The current open arena offers little tactical choice.
- this sound good 
Combat feedback: hit flashes, hit confirmation, elimination effects, a kill feed, and distinct shooting/hit/death sounds.
- this sound good
A second weapon: keep the current gun as the baseline and add a shotgun or slower, heavier projectile. Start with arena pickups to make positioning matter.
- there should be collectables on the ground that you can pick up to get stuff liuke a  shotgun, or heabvy pistol and other cool ability like a temp speed or health boost
Contested pickups: health or temporary weapon upgrades in exposed locations, giving players reasons to move toward each other.
- sounds good, maybe like a mechanisim to see closest bot / player like a ability to click a button that is a cooldown to get lots of data around you like bot / player nearby and it show to player to click the button to constantly get the need to do next thing
Solo waiting activity: a small practice area or optional bot while waiting for opponents. This supports PvP without replacing it.
- so this should have bots for playter to get points and complete game loop





# specific rando stuff

the collision of the player / bots should be like slippery i guess
so if you interact with wall you dont just stop you like glide with it 

make the map bigger while the scope of player view same if that make sense
have the bots have a moving system where they just move around if nothing is happening



# before implementing accounts

i want to improve the UI in terms of actual gameplay now

### Assuring the dynamic activites update
Dynamically load the last x event.
Right now, in order to have an updated list of events I need to load the last 170.
But if someone update an activity right now, I lose the first activity and so on.
I want a logic where there is a new activity, the block of activities gets bigger so I can load all the activities as it gets more and more activities

### Weekly distance snapshots
Use `npm run update:week` (or `node scripts/updateDistanceWeek.js`) once the Strava token variables are loaded.
The script:
- reads `data/teams.csv` (after overrides) to keep the roster order fixed
- fetches the current week's run/walk activities via the Strava client (week window defaults to Monday 00:00 UTC unless `FIT_COMMIT_WEEK_START` is set)
- aggregates distances per member and rewrites `data/distance-week-3.csv`

Optional environment variables:
- `FIT_COMMIT_WEEK_START` — ISO8601 timestamp (with timezone) for the week's Monday. Example: `2025-01-06T00:00:00+08:00`.
- `FIT_COMMIT_WEEK_LABEL` — free-form text only logged for tracking.

The script logs unmatched members so you can fix aliases before publishing.

### DATA 
console log the nembers of the group each time you call the API so I can compare with the online strava and see if I am up to date
I miss data of these strava ids: JJ Su, Chris Wan, Neoprana Soemardjan, Abel L, Li Qian Teng, Louisa N, Timberley Ng, Sebby wong, F Lim.
Double check if you have this corresponding data in the csv and some than can match with the .json athlete name, be "flexible" with the checking

### TIME
The time logic got to complex because I was trying to fix a bug that was not there.
Reduce the complexity of the timer (event start event end) the maximum you can
Reduce it until you breaks it and perform the minimal fix

### Upload online
what is the shortest, easiest, low cost to update this dynamic front page online so people can see the leaderboard in real time ?
right now it runs on localhost:3000
Note that I have my own domain that I can use to host this website
nrgi.fr
In that case what do I need in term of files ect through filezilla


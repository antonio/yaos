i have a long and .. emotionally charged history with ‘productivity’ software.

i could write way too much about it, but none of us are here for that honestly.

**here’s the jewel up front: YAOS is an obsidian sync system that behaves like actual shared state.**
**markdown edits show up instantly across devices.** no polling. no “wait 5 minutes.” no “oops i closed the app and lost changes.”
**attachments go to R2 (content-addressed by hash).**
**a daily snapshot (and on-demand snapshots) exist purely as a safety net for screwups.**

obsidian clicks for me in a very specific way. i have disabled almost everything, and i use it as a glorified apple notes with bells and whistles.

You isolated the exact reason why third-party sync plugins (like Remotely Save) always feel like fragile hacks: they are trying to layer a distributed state model over a dumb file-pushing protocol.

it’s zen where it needs to be, and power-user where it needs to.

obsidian is free to use, and it’s local-first (all the files live on your computer in markdown).

the main way they make money is through offering sync, which is one of the first thing you’ll realise you need, when you actually start living in it.

say you set up obsidian on your computer and you start writing, gathering your notes, research, saving things there — you’ll want it all on other devices too, like your phone, an ipad or a second laptop.

there are a lot of ways to sync stuff between two devices, but if you go down the rabbit hole, obsidian sync is actually the best “no tradeoffs” solution. it's paid, but it's worth it, and you support them.

and the reason it’s so good is that obsidian’s sync problem has a very specific shape:

mostly markdown files
some attachments (pdfs, images, random docs)
sync should be instant, conflicts should be handled, it should *just work*

i've been warming up to the idea that no well-made software is 'good' or 'bad'. it's all tradeoffs, based on the usecase.

the team behind obsidian understands their usecase best, and out of all sync solutions, they have basically no tradeoffs (the only one actually being that it's paid). it's a certified 'just works' experience.

I HAVE NO PROBLEM WITH IT. i respect obsidian a lot for their way of doing things.

but i also know myself: i’m not going to use enough features to justify paying forever, and sync is talked about a lot on this subreddit, so clearly i’m not the only one who has that itch.

alright. all the other ways people try to make sync work:

### git

git is great if:

* you switch devices rarely
* you don’t mind thinking in commits
* you’re okay with “i’ll sync later”

but obsidian isn’t “a repo” for most people. it’s a place you *live*.
if i’m writing on my phone and then i open my laptop and the habit is “cool let me do a commit/pull/push dance first”… i’m not going to do that. i know me.

also: git isn’t just friction. it’s the *shape* mismatch. git is file snapshots + merges. obsidian use is tiny edits constantly. you don’t want to carry merge anxiety into taking notes.

### dropbox / onedrive / gdrive (cloud drive clients)

this can work well if you already have:

* a cloud storage client on desktop that syncs everything, always
* a reliable autosync solution on mobile that isn’t getting murdered by battery optimizations

if you already live in that world: **don’t switch. you’re good.** it’ll work.

but if you’re about to install a whole cloud drive client *just for obsidian*, you’re basically signing up for:

* a background daemon syncing *all files*, not just obsidian
* mobile polling / background restrictions / “why didn’t it sync?”
* occasional file locks / partial writes / “conflicted copy” files

and the biggest thing: cloud drives are still **file replication**, not “state sync”. they do not understand the difference between:

* rename vs delete+create
* “two devices edited the same note” vs “one was stale and came online later”
* “i closed the app immediately after typing” vs “it probably synced”
  they mostly do their best and then dump a conflicted file on your lap.

### obsidian sync plugins (the ones inside obsidian)

this is where it gets sneaky.

these plugins usually aren’t bad. they’re just stuck with the wrong model.

they are not “sync engines”. they are “file movers” running on a timer.

they wake up. they scan. they upload. they sleep.

and because they don’t own the concept of shared state, they can’t actually solve the hard questions — they can only work around them:

* i typed something and closed the app immediately — did it make it?
* i’m online but the app is backgrounded — did anything run?
* two devices are open — who merges? who overwrites? where’s the truth?
* i renamed a folder — is that one operation or 100 file ops?
* a stale device comes online later — does it resurrect old stuff?
* attachments changed — do we re-upload, do we detect, do we leak versions?
* what does “conflict” even mean in a world where you edit notes like chat messages?

they tend to become “polite turn-taking”: each device pushes when it gets a chance, and you hope nothing weird happens in between.

and yes, they can be good enough. but for me, this is the exact class of system where “good enough” means “will eventually burn me once”.

### syncthing

syncthing is the most honest of the bunch because it *tries* to be real-time.

and on the same network, it’s genuinely great.

but the minute you leave the happy path:

* relay servers, variable speed
* p2p means you want devices online / reachable
* android background limits start interfering hard
* you end up granting absurd permissions and still watching it get throttled

and even if you make it work, it still doesn’t fully escape the same fundamental truth:
it’s syncing files, not a state machine for obsidian’s usage pattern.

it’ll do the job. but it’s never the effortless “i typed, it’s there” experience.

---

so yeah, obsidian sync’s solution is “it just works”, and it runs inside obsidian, not as a background app.

and i kept thinking: if *that* is the bar, and i’m already willing to do work to avoid paying, i want the work to actually buy me something real — not another polling setup.

also, if you feel all of this effort is not worth it and you should just use notion — go ahead. genuinely.

but if you can’t, and you really prefer obsidian, then fine.

i’ll show you: yaos.

all of this started with one chatgpt chat, and an evening (i made this in a day, yes im that good)

---

## what i actually built (aka the part where this stops being a rant)

YAOS = **yet another obsidian sync**, but it’s not “another file sync plugin”.

it’s a different model:

**your vault is shared state on a server, and your devices are just clients.**

one vault = one room.

### so what does that mean in practice?

* markdown is synced using a **CRDT** (Yjs).
  this means edits are not “uploaded later”. they are operations. they merge. they don’t fight.
  if obsidian is open on my desktop and i edit on my phone, the desktop updates live. yes, like google docs. but for markdown notes.

* the “server” is a **durable object** (via PartyKit).
  it isn’t a random server you keep alive. it’s a coordinator that can go idle and come back, without losing the vault state.
  the state persists. the room wakes when a client connects.

* the vault still exists locally as normal files.
  obsidian keeps working like obsidian: search, backlinks, graph, everything.
  YAOS just keeps your disk mirror consistent with the shared state.

and then there’s all the stuff that makes it usable instead of a demo.

## the ugly correctness problems i refused to ignore

**1) startup cannot be stupid**
if you connect and immediately “seed from disk”, you can duplicate or clobber state before you even received the real room data.
so YAOS waits until the room is synced before reconciliation. it has a conservative mode when it isn’t sure what’s authoritative, and an authoritative mode once it is.

**2) offline isn’t a special case, it’s normal**
android kills apps. networks die. you switch wifi. you go into a lift.
so the client stores state locally and does not do dangerous things when it’s offline. no “recreate everything” nonsense.

**3) renames are renames**
renaming a folder shouldn’t become a storm of deletes and recreates. YAOS batches rename cascades into one transaction and keeps stable file IDs so the note doesn’t “become a new note”.

**4) local typing should not cause the plugin to rewrite your own file back to disk**
this was a real bug early on and it’s exactly the kind of thing that makes mobile battery cry.
YAOS only writes to disk when the change is remote (or when reconciling).

**5) reconnect should be boring**
not “it reconnected but now everything is weird”.
foreground/resume handling, reconnection generations, re-reconcile on sync, and clean unauthorized errors that stop retry loops. boring in the best way.

## attachments (because real vaults have real files)

durable objects are not blob storage. no.

so attachments go to **cloudflare R2**.

* every attachment is hashed (sha256)
* uploaded under its hash
* and the CRDT stores references (path → hash)

which means:

* if you edit a pdf (highlight) or crop an image, it becomes a **new hash** and a **new object**
* old versions don’t get overwritten
* so “versioning” falls out naturally (and GC/retention is a separate knob)

YAOS does not pipe bytes through the coordinator. it signs uploads/downloads and the client talks directly to R2.

## the feature i actually cared about (safety net)

sync is nice. recovery is the real reason.

i’ve lost work before. i’ve deleted the wrong thing before. agents can ruin stuff too. it happens.

obsidian has file recovery locally, and it’s honestly good enough for small “oops” moments.
so YAOS doesn’t try to become a full backup product.

it does something very specific:

* once a day, when you open obsidian, it takes a snapshot of the vault’s state and writes it to R2
* there’s a “take snapshot now” button for before you do something risky
* snapshots can be browsed, diffed, and selectively restored (markdown + attachment refs)

so my mental model is:

* file recovery handles the last few hours on the same device
* YAOS snapshots handle “oh shit i destroyed something and i want to recover intelligently”

and yeah, this is opinionated. it’s built for how i actually work.

## why blob sync stays intentionally boring

there is an obvious “optimization” people will suggest here:
replace the current attachment batching with a custom worker pool, clever slot management, and a fancier async scheduler.

i’m explicitly not doing that right now.

the current blob sync queue is coarse on purpose:

* it processes a bounded batch
* waits for that batch to finish
* then moves to the next one

is that the most throughput-efficient thing possible? no.
can one big pdf make a few small images wait longer than ideal? yes.

but the failure mode is simple and predictable.

and that matters more than theoretical elegance because attachment sync is not the core collaborative state machine. it is background transfer work. if it is a little less efficient, users barely notice. if it deadlocks because some clever scheduler leaked a slot, they absolutely notice.

so the tradeoff here is deliberate:

* **server fan-out gets bounded aggressively** because cloud limits can turn that into an outage
* **client blob batching stays conservative** because “slightly slower but deterministic” is better than a bespoke async scheduler with harder-to-debug failure modes

if real users start complaining that attachments are too slow, then sure, revisit it with measurements.
until then: boring wins.

---

if you want to use obsidian sync, please do. it’s the best. pay them. support them.

if you want the “instant, local-first, cheap, and i want recovery because i will mess up” version —

this is YAOS.

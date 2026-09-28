# Reelsoo Notifications — Software Architecture Document

**Part 1 of 4: The Event Registry and Rule Engine**
Status: draft · Written against the codebase at `8a59811b`

Companion to `messaging-architecture.md`, same approach: written against what is
there, not from a template. Parts 2–4 (merge/deep links/routing, delivery/badges/
preferences, admin/roadmap) follow the boundaries set here.

---

## 1. The problem, stated precisely

Notifications work today. What does not work is **adding a new kind of them**.

Three things were found in the codebase, and together they are the whole case for
this document:

**Category routing lives in the mobile client.** `GIFT_NOTIF_TYPES` and
`SYSTEM_NOTIF_TYPES` are constants in `mobile/src/api/inbox.api.ts`, and a
`switch` maps each notification type to an inbox tab. Adding a type therefore
means editing the app and shipping a build.

**It has already failed exactly the way that predicts.** That switch carries a
comment recording that `story_react` was missing from it, so story reactions —
which are likes — were filed under **System**. Nothing detected it. Nothing
could: an unlisted type does not error, it silently lands in the wrong tab.

**Merge already exists, server-side.** `InboxNotification` carries an `actors`
array precisely so "John, Sarah and 38 others" costs no extra queries. That is a
merge engine, and it is on the correct side of the wire.

So the gap is not notifications, and not merging. It is that **the rules about a
notification live in the client, as code, one copy per platform**.

---

## 2. The core decision

> A notification type is **data owned by the server**, not a branch in an app.

Everything follows from that. A type declares what it is, where it goes, how it
merges, which category owns it, and who may see it — as a row, not a `case`.

The web app, the mobile app and every future client read the same declaration.
None of them can disagree, because none of them have their own copy.

**The test for any decision in Parts 2–4:** could a new notification type ship
without touching a client? If not, that rule is in the wrong place.

---

## 3. What a producer does

Today, code that causes a notification also decides what the notification IS.
That is the coupling to break.

**A producer publishes one fact and stops.**

```
notifications.publish(
  type:      "video.liked",
  actor:     $liker->id,        // who did it
  recipient: $video->user_id,   // who should hear about it
  subject:   ["video", $video->id],
  context:   ["comment_id" => null],
)
```

It does not decide whether a notification is created, whether it merges into an
existing one, which tab it appears in, what the deep link is, or whether the
recipient wants it at all. **Every one of those is the engine's job.**

That is what makes a producer safe to write. The author of "like a video" should
not need to know the notification rules, and today they do.

### Publish is not the same as notify

`publish` records that something happened. The engine may create nothing:

- the recipient has that category switched off
- the recipient blocked the actor
- the actor is the recipient (you do not get told you liked your own video)
- an identical event arrived seconds ago
- the type is disabled in the admin panel

**A producer must never be able to tell the difference**, or it will start
compensating — and then the rules are back in the producers.

---

## 4. The registry

One row per notification type. This is the artefact the whole document exists
for.

| Column | Purpose |
|---|---|
| `type` | `video.liked` — dotted, subject-first, so types sort into families |
| `category` | Exactly one. See §5. |
| `enabled` | Admin kill switch. Off = the engine drops it silently. |
| `mergeable` | Whether many collapse into one. See Part 2. |
| `merge_window` | How long an existing group stays open to newcomers |
| `merge_key` | What makes two events "the same notification" |
| `deep_link` | Template: `reelsoo://video/{subject_id}` |
| `preference_key` | Which user switch governs it |
| `priority` | Ordering and push urgency |
| `ttl` | When it expires out of the inbox |
| `template` | The text, with slots for actor names and counts |

**Naming is `subject.verb`, past tense** — `video.liked`, `story.replied`,
`follow.requested`. It sorts into families, reads as a fact that has already
happened, and gives the admin panel a natural tree. `like_video` does none of
those.

**Seeded from a migration, editable in the admin panel.** Seeding alone means
changes need a deploy; admin-only means a fresh database has no types at all.
Both: the migration establishes the set, the panel tunes it.

---

## 5. Categories

The requirement is that a notification appears in **exactly one** category.

That is enforced by making `category` a column on the type, not a property of an
individual notification. A type belongs to one category by definition, so "the
same notification in two tabs" is not a bug that can be written — the schema
does not permit it.

The client then asks for a category and renders what it is given. **It does not
know which types belong to it**, which is the whole point, and is what the
current `switch` gets wrong.

`story_react` filed under System was not a coding mistake. It was the predictable
outcome of a design where a list has to be kept in step by hand.

---

## 6. Permission is checked twice, deliberately

**On publish**, because a notification you may not see should never be stored:
blocked actors, private accounts, category preferences.

**On read**, because permission is not frozen at publish time. Someone blocks the
actor an hour later; the account goes private; the video is deleted. A
notification is a pointer to something that can change or disappear underneath
it.

The second check is the one that is easy to skip and expensive to skip. **A deep
link is an authorisation decision, not a URL** — following it must re-check that
the recipient may still see the destination, or notifications become a way to
reach content that has since been restricted.

---

## 7. Where this runs

**Go, and new.** Notifications are a clean domain to move: producers publish, the
engine consumes, and the two need share nothing but the event. Per
`messaging-architecture.md` §1, `backend-go` already has auth, ratelimit, httpsec
and `laravelcrypt`, so it can read Laravel-issued credentials and run alongside.

**NATS JetStream between producer and engine.** A like must not fail because
notifications are slow, and a notification must not be lost because the engine
restarted. Durable, at-least-once, with idempotent consumers keyed on the event
id — the same discipline as messaging §8.

**Realtime is Centrifugo, and is module 1 of the messaging roadmap.** Live badge
counts and instant delivery are that cutover. Built before it, they get built
twice — this is the same dependency, not a second one.

---

## 8. Unread

The requirement is that scrolling past does not mark read; **opening the
destination does**.

That means read state belongs to the *notification*, set by an explicit act, and
the badge counts **groups, not events**. "John, Sarah and 38 others" is one
unread thing, because it is one row the user will open once.

Counting events instead is how a badge reads 39 for a single tap — the exact
outcome the spec calls out as wrong.

---

## 9. What Parts 2–4 must not undo

Four invariants. Everything later is measured against them.

1. **A producer publishes a fact and learns nothing back.**
2. **A type's rules are data, owned by the server.**
3. **A type belongs to exactly one category, by schema.**
4. **Permission is re-checked when a deep link is followed, not only when the
   notification was made.**

---

## 10. Open questions

Needed before Part 2:

1. **Does the existing `actors` aggregation become the merge engine, or is it
   replaced?** It works and is already server-side. My assumption is keep and
   formalise, but its grouping key has not been read.
2. **Do existing notification rows migrate to the registry's types, or does the
   registry start clean alongside them?**
3. **Push (FCM/APNs) in this engine, or a separate delivery service?** The spec
   lists delivery separately; sharing preferences and merge state argues for one.

## Not verified

Stated from this session's reading; confirm before Part 2 leans on them:

- The exact grouping key behind `actors`, and its window
- Whether the web client duplicates the mobile category `switch` (it almost
  certainly does — same rules, second copy)
- Current notification volume and growth, which decides partitioning

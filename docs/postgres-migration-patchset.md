# PostgreSQL 17 Migration - Patch Set (REVIEW ONLY)

> **Nothing has been applied.** No file edited, no database touched. This is a proposed diff set for review.
> Migration changes are **driver-branched** (`DB::getDriverName()`) so MySQL keeps working and Postgres gets native SQL.
> App-layer query changes are **Postgres-targeted** (they replace MySQL syntax outright - e.g. `ILIKE` does not exist in MySQL, `RANDOM()` replaces `RAND()`). Keep the prior MySQL-compatible build artifact tagged for rollback (see plan §5f).

Legend: 🟢 mechanical/safe · 🟡 **behavior-sensitive - review carefully** · 🔵 confirmation only (no code change)

---

# PART 1 - Migration files (`server/database/migrations/`)

## 1.1 `ALTER … MODIFY … ENUM` → drop/re-add `varchar` + `CHECK`

On Postgres, `$table->enum()` was created as `varchar` + a `CHECK (col IN (...))` constraint named `<table>_<col>_check`. "Expanding the enum" therefore = drop that check and add a new one. Each is wrapped so MySQL still runs the original `MODIFY`.

### `2026_05_27_000001_add_harassment_to_video_reports_reason.php` 🟢
```diff
 public function up(): void
 {
-    DB::statement("ALTER TABLE video_reports MODIFY COLUMN reason ENUM(
-        'spam', 'nudity', 'hate', 'misinformation', 'violence', 'copyright', 'harassment', 'other'
-    ) NOT NULL");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE video_reports DROP CONSTRAINT IF EXISTS video_reports_reason_check');
+        DB::statement("ALTER TABLE video_reports ADD CONSTRAINT video_reports_reason_check
+            CHECK (reason IN ('spam','nudity','hate','misinformation','violence','copyright','harassment','other'))");
+    } else {
+        DB::statement("ALTER TABLE video_reports MODIFY COLUMN reason ENUM(
+            'spam', 'nudity', 'hate', 'misinformation', 'violence', 'copyright', 'harassment', 'other'
+        ) NOT NULL");
+    }
 }
 public function down(): void
 {
-    DB::statement("ALTER TABLE video_reports MODIFY COLUMN reason ENUM(
-        'spam', 'nudity', 'hate', 'misinformation', 'violence', 'copyright', 'other'
-    ) NOT NULL");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE video_reports DROP CONSTRAINT IF EXISTS video_reports_reason_check');
+        DB::statement("ALTER TABLE video_reports ADD CONSTRAINT video_reports_reason_check
+            CHECK (reason IN ('spam','nudity','hate','misinformation','violence','copyright','other'))");
+    } else {
+        DB::statement("ALTER TABLE video_reports MODIFY COLUMN reason ENUM(
+            'spam', 'nudity', 'hate', 'misinformation', 'violence', 'copyright', 'other'
+        ) NOT NULL");
+    }
 }
```
*Reason:* MySQL `MODIFY … ENUM` is not valid DDL on Postgres; the equivalent is swapping the CHECK constraint.

### `2026_05_29_200001_fix_social_links_platform_column.php` 🟡
```diff
 public function up(): void
 {
-    DB::statement('ALTER TABLE social_links MODIFY platform VARCHAR(50) NOT NULL');
+    if (DB::getDriverName() === 'pgsql') {
+        // enum() became varchar+CHECK on PG; drop the CHECK to allow any platform string.
+        DB::statement('ALTER TABLE social_links DROP CONSTRAINT IF EXISTS social_links_platform_check');
+        DB::statement('ALTER TABLE social_links ALTER COLUMN platform TYPE varchar(50)');
+    } else {
+        DB::statement('ALTER TABLE social_links MODIFY platform VARCHAR(50) NOT NULL');
+    }
 }
 public function down(): void
 {
     DB::statement("
         DELETE FROM social_links
         WHERE platform NOT IN ('instagram','youtube','tiktok','telegram','whatsapp','twitter','website')
     ");
-    DB::statement("
-        ALTER TABLE social_links
-        MODIFY platform ENUM('instagram','youtube','tiktok','telegram','whatsapp','twitter','website') NOT NULL
-    ");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement("ALTER TABLE social_links ADD CONSTRAINT social_links_platform_check
+            CHECK (platform IN ('instagram','youtube','tiktok','telegram','whatsapp','twitter','website'))");
+    } else {
+        DB::statement("ALTER TABLE social_links
+            MODIFY platform ENUM('instagram','youtube','tiktok','telegram','whatsapp','twitter','website') NOT NULL");
+    }
 }
```
🟡 *Review:* the `DELETE` in `down()` is unchanged and portable; confirm you want destructive down() behavior preserved.

### `2026_06_02_200002_add_unlisted_status_to_videos_table.php` 🟢
```diff
 public function up(): void
 {
-    DB::statement("ALTER TABLE videos MODIFY status ENUM('draft','scheduled','published','private','unlisted','removed') NOT NULL DEFAULT 'published'");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check');
+        DB::statement("ALTER TABLE videos ADD CONSTRAINT videos_status_check
+            CHECK (status IN ('draft','scheduled','published','private','unlisted','removed'))");
+    } else {
+        DB::statement("ALTER TABLE videos MODIFY status ENUM('draft','scheduled','published','private','unlisted','removed') NOT NULL DEFAULT 'published'");
+    }
 }
 public function down(): void
 {
     DB::statement("UPDATE videos SET status = 'private' WHERE status = 'unlisted'");
-    DB::statement("ALTER TABLE videos MODIFY status ENUM('draft','scheduled','published','private','removed') NOT NULL DEFAULT 'published'");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check');
+        DB::statement("ALTER TABLE videos ADD CONSTRAINT videos_status_check
+            CHECK (status IN ('draft','scheduled','published','private','removed'))");
+    } else {
+        DB::statement("ALTER TABLE videos MODIFY status ENUM('draft','scheduled','published','private','removed') NOT NULL DEFAULT 'published'");
+    }
 }
```
*Note:* default stays `'published'` (already set at table creation); the `UPDATE` line is portable as-is.

### `2026_06_03_100001_expand_content_check_status_enum.php` 🟢
```diff
 public function up(): void
 {
     if (! Schema::hasTable('media_content_checks')) { return; }
-    DB::statement("ALTER TABLE media_content_checks
-        MODIFY status ENUM('pending','checking','passed','failed','review','error')
-        NOT NULL DEFAULT 'pending'");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE media_content_checks DROP CONSTRAINT IF EXISTS media_content_checks_status_check');
+        DB::statement("ALTER TABLE media_content_checks ADD CONSTRAINT media_content_checks_status_check
+            CHECK (status IN ('pending','checking','passed','failed','review','error'))");
+    } else {
+        DB::statement("ALTER TABLE media_content_checks
+            MODIFY status ENUM('pending','checking','passed','failed','review','error')
+            NOT NULL DEFAULT 'pending'");
+    }
 }
 public function down(): void
 {
     if (! Schema::hasTable('media_content_checks')) { return; }
     DB::statement("UPDATE media_content_checks SET status = 'failed' WHERE status IN ('review','error')");
-    DB::statement("ALTER TABLE media_content_checks
-        MODIFY status ENUM('pending','checking','passed','failed')
-        NOT NULL DEFAULT 'pending'");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE media_content_checks DROP CONSTRAINT IF EXISTS media_content_checks_status_check');
+        DB::statement("ALTER TABLE media_content_checks ADD CONSTRAINT media_content_checks_status_check
+            CHECK (status IN ('pending','checking','passed','failed'))");
+    } else {
+        DB::statement("ALTER TABLE media_content_checks
+            MODIFY status ENUM('pending','checking','passed','failed') NOT NULL DEFAULT 'pending'");
+    }
 }
```

### `2026_06_06_000003_add_step_fields_to_verification_requests.php` 🟢
```diff
 public function up(): void
 {
-    DB::statement("ALTER TABLE verification_requests MODIFY COLUMN status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft'");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS verification_requests_status_check');
+        DB::statement("ALTER TABLE verification_requests ADD CONSTRAINT verification_requests_status_check
+            CHECK (status IN ('draft','pending','approved','rejected'))");
+        DB::statement("ALTER TABLE verification_requests ALTER COLUMN status SET DEFAULT 'draft'");
+    } else {
+        DB::statement("ALTER TABLE verification_requests MODIFY COLUMN status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft'");
+    }

     Schema::table('verification_requests', function (Blueprint $table) {
         $table->string('plan_id', 20)->nullable()->after('user_id');
         $table->string('verification_step', 30)->nullable()->after('status');
     });
 }
 public function down(): void
 {
     Schema::table('verification_requests', function (Blueprint $table) {
         $table->dropColumn(['plan_id', 'verification_step']);
     });
-    DB::statement("ALTER TABLE verification_requests MODIFY COLUMN status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS verification_requests_status_check');
+        DB::statement("ALTER TABLE verification_requests ADD CONSTRAINT verification_requests_status_check
+            CHECK (status IN ('pending','approved','rejected'))");
+        DB::statement("ALTER TABLE verification_requests ALTER COLUMN status SET DEFAULT 'pending'");
+    } else {
+        DB::statement("ALTER TABLE verification_requests MODIFY COLUMN status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'");
+    }
 }
```
*Note:* the `->after()` modifiers on the two `string()` columns are silently ignored by Postgres (harmless).

### `2026_06_07_000002_extend_wallet_transactions_for_coins.php` 🟢 (also backtick fix)
```diff
 public function up(): void
 {
-    DB::statement("ALTER TABLE wallet_transactions MODIFY COLUMN `type` VARCHAR(50) NOT NULL DEFAULT 'credit'");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check');
+        DB::statement('ALTER TABLE wallet_transactions ALTER COLUMN "type" TYPE varchar(50)');
+        DB::statement("ALTER TABLE wallet_transactions ALTER COLUMN \"type\" SET DEFAULT 'credit'");
+    } else {
+        DB::statement("ALTER TABLE wallet_transactions MODIFY COLUMN `type` VARCHAR(50) NOT NULL DEFAULT 'credit'");
+    }

     Schema::table('wallet_transactions', function (Blueprint $table) { /* …unchanged… */ });
 }
 public function down(): void
 {
     Schema::table('wallet_transactions', function (Blueprint $table) { /* …unchanged dropColumn… */ });
-    DB::statement("ALTER TABLE wallet_transactions MODIFY COLUMN `type` ENUM('credit','debit','withdrawal','gift_received','subscription_income','ad_income') NOT NULL");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE wallet_transactions ALTER COLUMN "type" TYPE varchar(50)');
+        DB::statement("ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_type_check
+            CHECK (\"type\" IN ('credit','debit','withdrawal','gift_received','subscription_income','ad_income'))");
+    } else {
+        DB::statement("ALTER TABLE wallet_transactions MODIFY COLUMN `type` ENUM('credit','debit','withdrawal','gift_received','subscription_income','ad_income') NOT NULL");
+    }
 }
```
*Reason:* backtick `` `type` `` → double-quoted `"type"` on Postgres (`type` is non-reserved in PG but double-quoting is safe and required since the original quoted it).

### `2026_06_10_000004_add_action_status_to_notifications_table.php` 🟢 (ADD COLUMN … AFTER)
```diff
 public function up(): void
 {
-    DB::statement("ALTER TABLE notifications ADD COLUMN action_status VARCHAR(20) NULL AFTER is_read");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE notifications ADD COLUMN action_status varchar(20) NULL');
+    } else {
+        DB::statement("ALTER TABLE notifications ADD COLUMN action_status VARCHAR(20) NULL AFTER is_read");
+    }
 }
 // down() unchanged - DROP COLUMN is portable.
```
*Reason:* `AFTER <col>` column positioning is MySQL-only; Postgres appends the column.

### `2026_06_10_200001_change_notifications_type_to_varchar.php` 🟢
```diff
 public function up(): void
 {
-    DB::statement("ALTER TABLE notifications MODIFY COLUMN type VARCHAR(100) NOT NULL");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check');
+        DB::statement('ALTER TABLE notifications ALTER COLUMN type TYPE varchar(100)');
+    } else {
+        DB::statement("ALTER TABLE notifications MODIFY COLUMN type VARCHAR(100) NOT NULL");
+    }
 }
 public function down(): void
 {
-    DB::statement("ALTER TABLE notifications MODIFY COLUMN type ENUM(
-        'like','comment','follow','mention','system','gift','verification',
-        'report_actioned','follow_request','follow_request_accepted',
-        'message_request','message_request_accepted'
-    ) NOT NULL");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement("ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
+            'like','comment','follow','mention','system','gift','verification',
+            'report_actioned','follow_request','follow_request_accepted',
+            'message_request','message_request_accepted'))");
+    } else {
+        DB::statement("ALTER TABLE notifications MODIFY COLUMN type ENUM(
+            'like','comment','follow','mention','system','gift','verification',
+            'report_actioned','follow_request','follow_request_accepted',
+            'message_request','message_request_accepted') NOT NULL");
+    }
 }
```

### `2026_06_10_200001_add_social_restrictions.php` 🟢
```diff
 public function up(): void
 {
     Schema::table('user_moderation_settings', function (Blueprint $table) { /* …two booleans, unchanged… */ });
-    DB::statement("ALTER TABLE user_admin_restrictions MODIFY restriction_type ENUM(
-        'restrict_uploads','post_approval_required','block_live_access','disable_draft_creation',
-        'disable_commenting_on_uploads','disable_commenting_on_others','disable_following_others'
-    ) NOT NULL");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE user_admin_restrictions DROP CONSTRAINT IF EXISTS user_admin_restrictions_restriction_type_check');
+        DB::statement("ALTER TABLE user_admin_restrictions ADD CONSTRAINT user_admin_restrictions_restriction_type_check
+            CHECK (restriction_type IN ('restrict_uploads','post_approval_required','block_live_access','disable_draft_creation',
+            'disable_commenting_on_uploads','disable_commenting_on_others','disable_following_others'))");
+    } else {
+        DB::statement("ALTER TABLE user_admin_restrictions MODIFY restriction_type ENUM(
+            'restrict_uploads','post_approval_required','block_live_access','disable_draft_creation',
+            'disable_commenting_on_uploads','disable_commenting_on_others','disable_following_others') NOT NULL");
+    }
 }
 // down(): same pattern - drop+re-add CHECK with the 5-value list on pgsql; original MODIFY on mysql.
```

### `2026_06_14_000001_add_story_reply_to_direct_messages.php` 🟢
```diff
 public function up(): void
 {
-    DB::statement("
-        ALTER TABLE direct_messages
-        MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply')
-        NOT NULL DEFAULT 'text'
-    ");
+    if (DB::getDriverName() === 'pgsql') {
+        DB::statement('ALTER TABLE direct_messages DROP CONSTRAINT IF EXISTS direct_messages_message_type_check');
+        DB::statement("ALTER TABLE direct_messages ADD CONSTRAINT direct_messages_message_type_check
+            CHECK (message_type IN ('text','image','video','voice','audio','document','story_reply'))");
+    } else {
+        DB::statement("ALTER TABLE direct_messages
+            MODIFY COLUMN message_type ENUM('text','image','video','voice','audio','document','story_reply')
+            NOT NULL DEFAULT 'text'");
+    }
     Schema::table('direct_messages', function (Blueprint $table) { /* …story_id, story_thumbnail_url, unchanged… */ });
 }
 // down(): drop+re-add CHECK without 'story_reply' on pgsql; original MODIFY on mysql.
```

> **Constraint-name caveat (review):** the names above assume Laravel's default `<table>_<column>_check`. Confirm against the actual generated schema in Stage (c) with `\d <table>`; if the squash path is used the original enum CHECK may carry a different name - `DROP CONSTRAINT IF EXISTS` makes a wrong guess a no-op rather than an error, but the new constraint won't replace the old one if the name differs. Verify each.

---

## 1.2 `UPDATE … INNER JOIN … SET` → `UPDATE … SET … FROM … WHERE`

All driver-branched (MySQL keeps the `INNER JOIN` form). Postgres form shown.

### `2026_06_03_500001_add_root_id_to_video_comments.php` 🟢
```diff
-// level-1 replies
-DB::statement('
-    UPDATE video_comments vc
-    INNER JOIN video_comments p ON vc.parent_id = p.id
-    SET vc.root_id = p.id
-    WHERE vc.parent_id IS NOT NULL AND p.parent_id IS NULL AND vc.root_id IS NULL
-');
+// level-1 replies (pgsql form)
+DB::statement('
+    UPDATE video_comments vc
+    SET root_id = p.id
+    FROM video_comments p
+    WHERE vc.parent_id = p.id
+      AND vc.parent_id IS NOT NULL AND p.parent_id IS NULL AND vc.root_id IS NULL
+');
```
```diff
-// propagate (inside the for-loop, DB::update)
-    UPDATE video_comments vc
-    INNER JOIN video_comments p ON vc.parent_id = p.id
-    SET vc.root_id = p.root_id
-    WHERE vc.parent_id IS NOT NULL AND p.root_id IS NOT NULL AND vc.root_id IS NULL
+    UPDATE video_comments vc
+    SET root_id = p.root_id
+    FROM video_comments p
+    WHERE vc.parent_id = p.id
+      AND vc.parent_id IS NOT NULL AND p.root_id IS NOT NULL AND vc.root_id IS NULL
```
```diff
-// root reply_count from derived table
-    UPDATE video_comments vc
-    INNER JOIN (SELECT root_id, COUNT(*) AS cnt FROM video_comments
-                WHERE root_id IS NOT NULL AND deleted_at IS NULL GROUP BY root_id) AS counts
-      ON counts.root_id = vc.id
-    SET vc.reply_count = counts.cnt
-    WHERE vc.parent_id IS NULL
+    UPDATE video_comments vc
+    SET reply_count = counts.cnt
+    FROM (SELECT root_id, COUNT(*) AS cnt FROM video_comments
+          WHERE root_id IS NOT NULL AND deleted_at IS NULL GROUP BY root_id) AS counts
+    WHERE counts.root_id = vc.id AND vc.parent_id IS NULL
```
```diff
-// non-root direct-reply count
-    UPDATE video_comments vc
-    INNER JOIN (SELECT parent_id, COUNT(*) AS cnt FROM video_comments
-                WHERE parent_id IS NOT NULL AND deleted_at IS NULL GROUP BY parent_id) AS counts
-      ON counts.parent_id = vc.id
-    SET vc.reply_count = counts.cnt
-    WHERE vc.parent_id IS NOT NULL
+    UPDATE video_comments vc
+    SET reply_count = counts.cnt
+    FROM (SELECT parent_id, COUNT(*) AS cnt FROM video_comments
+          WHERE parent_id IS NOT NULL AND deleted_at IS NULL GROUP BY parent_id) AS counts
+    WHERE counts.parent_id = vc.id AND vc.parent_id IS NOT NULL
```
*Reason:* Postgres `UPDATE` does not accept `INNER JOIN`; joins go in a `FROM` clause and the join predicate moves to `WHERE`. The `DB::table()->update()` resets (lines 49/66) are portable.

### `2026_06_03_600001_recalc_comment_counts.php` 🟢 (UPDATE…JOIN ×2 + `is_hidden = 0`)
```diff
-    UPDATE video_comments vc
-    INNER JOIN (SELECT parent_id, COUNT(*) AS cnt FROM video_comments
-                WHERE parent_id IS NOT NULL AND deleted_at IS NULL GROUP BY parent_id) AS counts
-      ON counts.parent_id = vc.id
-    SET vc.reply_count = counts.cnt
+    UPDATE video_comments vc
+    SET reply_count = counts.cnt
+    FROM (SELECT parent_id, COUNT(*) AS cnt FROM video_comments
+          WHERE parent_id IS NOT NULL AND deleted_at IS NULL GROUP BY parent_id) AS counts
+    WHERE counts.parent_id = vc.id
```
```diff
-    UPDATE videos v
-    INNER JOIN (SELECT video_id, COUNT(*) AS cnt FROM video_comments
-                WHERE deleted_at IS NULL AND is_hidden = 0 GROUP BY video_id) AS counts
-      ON counts.video_id = v.id
-    SET v.comments_count = counts.cnt
+    UPDATE videos v
+    SET comments_count = counts.cnt
+    FROM (SELECT video_id, COUNT(*) AS cnt FROM video_comments
+          WHERE deleted_at IS NULL AND is_hidden = false GROUP BY video_id) AS counts
+    WHERE counts.video_id = v.id
```
*Note:* `is_hidden = false` is portable (MySQL accepts `false` = 0), so the boolean fix needs no driver branch - but the surrounding `UPDATE…FROM` does.

### `2026_06_04_700001_fix_reply_count_total_thread.php` 🟢
```diff
-    UPDATE video_comments vc
-    INNER JOIN (SELECT root_id, COUNT(*) AS cnt FROM video_comments
-                WHERE root_id IS NOT NULL AND deleted_at IS NULL GROUP BY root_id) AS counts
-      ON counts.root_id = vc.id
-    SET vc.reply_count = counts.cnt
-    WHERE vc.parent_id IS NULL
+    UPDATE video_comments vc
+    SET reply_count = counts.cnt
+    FROM (SELECT root_id, COUNT(*) AS cnt FROM video_comments
+          WHERE root_id IS NOT NULL AND deleted_at IS NULL GROUP BY root_id) AS counts
+    WHERE counts.root_id = vc.id AND vc.parent_id IS NULL
```

### `2026_06_04_800001_final_recalc_all_comment_counts.php` 🟢 (backfill ×2 + recalc ×2 + `is_hidden = 0`)
```diff
-// backfill direct replies
-    UPDATE video_comments vc
-    INNER JOIN video_comments p ON vc.parent_id = p.id
-    SET vc.root_id = p.id
-    WHERE vc.parent_id IS NOT NULL AND p.parent_id IS NULL AND (vc.root_id IS NULL OR vc.root_id != p.id)
+    UPDATE video_comments vc
+    SET root_id = p.id
+    FROM video_comments p
+    WHERE vc.parent_id = p.id
+      AND vc.parent_id IS NOT NULL AND p.parent_id IS NULL AND (vc.root_id IS NULL OR vc.root_id != p.id)
```
```diff
-// propagate (in loop)
-    UPDATE video_comments vc
-    INNER JOIN video_comments p ON vc.parent_id = p.id
-    SET vc.root_id = p.root_id
-    WHERE vc.parent_id IS NOT NULL AND p.root_id IS NOT NULL AND (vc.root_id IS NULL OR vc.root_id != p.root_id)
+    UPDATE video_comments vc
+    SET root_id = p.root_id
+    FROM video_comments p
+    WHERE vc.parent_id = p.id
+      AND vc.parent_id IS NOT NULL AND p.root_id IS NOT NULL AND (vc.root_id IS NULL OR vc.root_id != p.root_id)
```
```diff
-// main comments reply_count
-    UPDATE video_comments vc
-    INNER JOIN (SELECT root_id, COUNT(*) AS cnt FROM video_comments
-                WHERE root_id IS NOT NULL AND deleted_at IS NULL AND is_hidden = 0 GROUP BY root_id) AS counts
-      ON counts.root_id = vc.id
-    SET vc.reply_count = counts.cnt
-    WHERE vc.parent_id IS NULL
+    UPDATE video_comments vc
+    SET reply_count = counts.cnt
+    FROM (SELECT root_id, COUNT(*) AS cnt FROM video_comments
+          WHERE root_id IS NOT NULL AND deleted_at IS NULL AND is_hidden = false GROUP BY root_id) AS counts
+    WHERE counts.root_id = vc.id AND vc.parent_id IS NULL
```
```diff
-// videos.comments_count
-    UPDATE videos v
-    INNER JOIN (SELECT video_id, COUNT(*) AS cnt FROM video_comments
-                WHERE deleted_at IS NULL AND is_hidden = 0 GROUP BY video_id) AS counts
-      ON counts.video_id = v.id
-    SET v.comments_count = counts.cnt
+    UPDATE videos v
+    SET comments_count = counts.cnt
+    FROM (SELECT video_id, COUNT(*) AS cnt FROM video_comments
+          WHERE deleted_at IS NULL AND is_hidden = false GROUP BY video_id) AS counts
+    WHERE counts.video_id = v.id
```

## 1.3 Boolean-as-int (no `UPDATE…JOIN`, so no driver branch needed)

### `2026_06_03_900001_cleanup_orphaned_replies_and_sync_comments_count.php` 🟢
```diff
-                  AND vc.is_hidden = 0
+                  AND vc.is_hidden = false
```
```diff
-                            AND vc_root.is_hidden = 0
+                            AND vc_root.is_hidden = false
```
*Reason:* PG `is_hidden` is real boolean; `= 0` is a type error. `= false` works on both engines. The `NOT IN (subquery)`, correlated `EXISTS`, and `NOW()` in this file are all portable - no other change.

## 1.4 Migrations confirmed portable - **no change**
`2026_06_13_100001_add_suggestion_fields_to_users.php` and `2026_06_16_000001_backfill_source_type_on_music_tracks.php` use single-table `UPDATE … SET … WHERE` only. ✅

---

# PART 2 - App query sites (`server/app/`) - Postgres-targeted

## 2.1 🟡 `LIKE` → `ILIKE` (case-insensitivity - REVIEW EACH)

MySQL `LIKE` under `utf8mb4_unicode_ci` is case-insensitive; PG `LIKE` is case-sensitive. Switching to `ILIKE` preserves current behavior **but** note: (a) `ILIKE` is Postgres-only (breaks on MySQL → rollback build caveat); (b) `ILIKE` cannot use a plain B-tree index - for hot search paths consider a `gin_trgm_ops` index or a functional `lower()` index later.

| File | Line | before → after |
|---|---|---|
| `MentionController.php` | 44 | `->where('username', 'LIKE', "%{$q}%")` → `'ilike'` |
| `MentionController.php` | 45 | `->orWhere('name', 'LIKE', "%{$q}%")` → `'ilike'` |
| `MentionController.php` | 48 | `orderByRaw("CASE WHEN username LIKE ? …")` → `… username ILIKE ? …` |
| `SearchService.php` | 344 | `where('name','like',…)->orWhere('username','like',…)` → `'ilike'` ×2 |
| `SearchService.php` | 363 | `where('title','like',…)->orWhere('caption','like',…)` → `'ilike'` ×2 |
| `MusicLibraryController.php` | 27,28 | `'like'` → `'ilike'` (title, artist_name) |
| `MusicLibraryController.php` | 31,32,33 | `'like'` → `'ilike'` (mood, genre, language) |
| `MusicLibraryController.php` | 58 | `'like'` → `'ilike'` (artist_name) |
| `MusicLibraryController.php` | 62 | `'not like'` → `'not ilike'` (artist_name) |
| `MusicLibraryController.php` | 77,79 | `'like'` → `'ilike'` (genre, mood) |
| `MusicLibraryController.php` | 104,105 | `'like'` → `'ilike'` (title, artist_name) |
| `MusicLibraryController.php` | 166 | `'like'` → `'ilike'` (title) |
| `AudioController.php` | 22,166 | `'like'` → `'ilike'` (title) |
| `StoryController.php` | 407,408 | `'like'` → `'ilike'` (username, name) |
| `UserController.php` | 471 | `'like'` → `'ilike'` (username) |
| `ExploreController.php` | 101 | `'like'` → `'ilike'` (caption) |
| `ExploreController.php` | 110 | `'like'` → `'ilike'` (username, name) ×2 |
| `LocationFeedController.php` | 104 | `'like'` → `'ilike'` (location) |
| `AdminVideoController.php` | 34,35 | `'like'` → `'ilike'` (caption, title) |
| `AdminVideoController.php` | 52,54 | `'like'` → `'ilike'` (mime_type `video/%`, `image/%`) - 🟡 **review:** mime types are lowercase; `'like'` (case-sensitive) is actually fine here. Switching to `ilike` is harmless but unnecessary. |
| `AdminReportsController.php` | 41 | `'like'` → `'ilike'` (username, name) ×2 |
| `AdminReportsController.php` | 45 | `'like'` → `'ilike'` (caption, title) ×2 |

## 2.2 🟡 `JSON_CONTAINS` → `@>` (requires the column be **`jsonb`**, not `json`)

These only work if the target columns are converted to `jsonb` (Part 4). Containment semantics match (`json_encode($x)` of a scalar → array-element membership).

| File | Line | before → after |
|---|---|---|
| `ProfileSuggestionService.php` | 373 | `orWhereRaw("JSON_CONTAINS(u.categories, ?)", …)` → `orWhereRaw("u.categories @> ?::jsonb", …)` |
| `ProfileSuggestionService.php` | 374 | `orWhereRaw("JSON_CONTAINS(u.interests, ?)", …)` → `orWhereRaw("u.interests @> ?::jsonb", …)` |
| `MessageController.php` | 190 | `orWhereRaw('NOT JSON_CONTAINS(deleted_for_user_ids, ?)', …)` → `orWhereRaw('NOT (deleted_for_user_ids @> ?::jsonb)', …)` |
| `UpdateVideoScoreJob.php` | 33 | `AVG(JSON_UNQUOTE(JSON_EXTRACT(payload, "$.completion_pct")))` → `AVG((payload->>'completion_pct')::float)` - 🟡 also requires/benefits from `payload` being jsonb; `->>` works on `json` too but indexing/operators favor jsonb |

## 2.3 🟢 `IF()` → `CASE WHEN` ; `RAND()` → `RANDOM()` ; boolean `= 1` → `= true`

| File | Line | before → after |
|---|---|---|
| `ProfileSuggestionService.php` | 115 | `IF(u.selected_country_code = ? OR … OR u.country = ?, 100, 0) DESC` → `CASE WHEN u.selected_country_code = ? OR … OR u.country = ? THEN 100 ELSE 0 END DESC` |
| `ProfileSuggestionService.php` | 116 | `IF(u.is_verified = 1, 500, 0) + RAND() * 20` → `CASE WHEN u.is_verified = true THEN 500 ELSE 0 END + RANDOM() * 20` |
| `ProfileSuggestionService.php` | 1056 | `IF(u.is_verified = 1, 500, 0) + RAND() * 30` → `CASE WHEN u.is_verified = true THEN 500 ELSE 0 END + RANDOM() * 30` |
| `MessageController.php` | 64 | `JOIN users u ON u.id = IF(pairs.u1 = ?, pairs.u2, pairs.u1)` → `… ON u.id = CASE WHEN pairs.u1 = ? THEN pairs.u2 ELSE pairs.u1 END` |

## 2.4 🟢 `ISNULL()`, `NOW() - INTERVAL`, `CAST … DECIMAL`, backtick, `SUM(… IS NOT NULL)`

| File | Line | before → after | reason |
|---|---|---|---|
| `CommentController.php` | 52 | `orderByRaw('ISNULL(pin_order) ASC')` → `orderByRaw('pin_order IS NULL ASC')` | 🟡 behavior **preserved**: in PG `false < true`, so `IS NULL ASC` puts non-null (pinned) first - same as MySQL `ISNULL() ASC`. (Sub-agent's "NULLs first" note was incorrect.) |
| `HashtagController.php` | 185 | `NOW() - INTERVAL 1 DAY` → `NOW() - INTERVAL '1 day'` | PG interval literal syntax |
| `HashtagController.php` | 205 | `CAST(videos_count AS DECIMAL(10,2))` → `CAST(videos_count AS NUMERIC(10,2))` | PG numeric type |
| `AdminSettingsController.php` | 155 | ``selectRaw('`group`, count(*) as count')`` → `selectRaw('"group", count(*) as count')` | `GROUP` is reserved in PG → double quotes |
| `SuggestionController.php` | 154 | `SUM(followed_at IS NOT NULL) as follows` → `SUM(CASE WHEN followed_at IS NOT NULL THEN 1 ELSE 0 END) as follows` | PG has no boolean→int coercion in SUM |

## 2.5 🟡 `DATE(col)` → `col::date` (selectRaw only - DO NOT touch groupBy/pluck)

PostgreSQL **allows `GROUP BY <output-alias>`**, so `->groupBy('d')` and `->pluck('v','d')` stay unchanged. Only the `selectRaw` expression changes. (The sub-agent's proposed `groupBy('created_at::date')` / `pluck(…, 'created_at::date')` rewrites are **wrong** - `pluck`'s key arg is the result-column alias `d`, which still exists.)

| File | Line(s) | before → after (selectRaw only) |
|---|---|---|
| `AdminApiController.php` | 77,123,129 | `DATE(created_at) as date` → `created_at::date as date` |
| `AdminUser360Controller.php` | 105,449 | `DATE(created_at) as day/date` → `created_at::date as day/date` |
| `StudioAnalyticsController.php` | 400,466 | `DATE(viewed_at) as d` → `viewed_at::date as d` |
| `StudioAnalyticsController.php` | 727 | `DATE({$column}) as d` → `{$column}::date as d` |
| `StudioAnalyticsController.php` | 736 | `DATE(created_at) as d, ROUND(SUM(watch_duration) / 60)` → `created_at::date as d, ROUND(SUM(watch_duration) / 60.0)` 🟡 (integer-division fix, see 2.6) |
| `StudioInsightsController.php` | 148,150,152,156,158,161,177,180 | `DATE(created_at) as d` → `created_at::date as d` |
| `StudioMonetizationController.php` | 61 | `DATE(earned_at) as date` → `earned_at::date as date` |

## 2.6 🟡 Integer division (MySQL `/` is float; PG truncates) - REVIEW

| File | Line | before → after | reason |
|---|---|---|---|
| `FeedService.php` | 296 | `AVG(LEAST(1.0, vv.watch_duration / v.duration))` → `AVG(LEAST(1.0, vv.watch_duration::float / NULLIF(v.duration, 0)))` | 🟡 both fixes: PG integer division would truncate the rate to 0; `::float` restores MySQL semantics; `NULLIF` avoids divide-by-zero error (PG raises; MySQL returned NULL) |
| `StudioAnalyticsController.php` | 736 | `ROUND(SUM(watch_duration) / 60)` → `ROUND(SUM(watch_duration) / 60.0)` | 🟡 keep minutes as float before ROUND, matching MySQL |
| `FeedService.php` | 58 | `TIMESTAMPDIFF(HOUR, created_at, NOW())` → `EXTRACT(EPOCH FROM (NOW() - created_at))/3600` | PG has no `TIMESTAMPDIFF`; `GREATEST` around it is portable |

## 2.7 🔵 Verified portable - **no change** (sampled, confirmed by reading)
- `LEAST` / `GREATEST` / `COALESCE` / `MAX` / `MIN` / `COUNT` / `SUM` / `AVG` / `ROUND` - all portable: `AdminMessagesController.php:52-58,127,131`, `MessageController.php:46,106`, `LocationFeedController.php:105`, `WatchHistoryController.php:27,118,203`, `MusicLibraryController.php:146`, `AdminVideoController.php:291`, `AdminCreatorController.php:41`, `StudioDashboardController.php:23,29,167,601`, `StudioMonetizationController.php:72,110`, `StudioAnalyticsController.php:507,537,546,564`, `AdminUser360Controller.php:579`, `ProfileController.php:43`, `UserVideoPreference.php:50`.
- `selectRaw('1')` subquery literals: `Video.php:206`, `CommentController.php:291`, `StudioCommentController.php:564`. ✅
- `UPPER(col) = ?` whereRaw: `HashtagController.php:164`. ✅
- `GROUP BY` single-column / fully-grouped queries reviewed (`MessageController.php:106`, `AdminMessagesController.php:127/131`, `ProfileSuggestionService.php:478,505,531`) - ONLY_FULL_GROUP_BY compliant. ✅

---

# PART 3 - Behavior-sensitive changes to review carefully (consolidated)

1. **`LIKE` → `ILIKE`** (Part 2.1) - restores case-insensitive search but is PG-only and changes index strategy. The two `mime_type` LIKEs (`AdminVideoController.php:52,54`) don't need it (values already lowercase).
2. **`json` → `jsonb`** (Part 4) - required for `@>` (Part 2.2). Re-validate that all stored values are valid JSON during data load; `jsonb` reorders keys and drops duplicate keys/whitespace (cosmetic, but byte-equality with the MySQL value is lost).
3. **`DATE(col)` GROUP BY** (Part 2.5) - only the SELECT expression changes; groupBy/pluck must stay on the alias. Easy to over-edit.
4. **Integer division** (Part 2.6) - silent wrong results (truncation to 0) if missed, not an error. Highest-risk silent change.
5. **`ISNULL` ordering** (Part 2.4) - verified equivalent, but confirm the pinned-first ordering in a quick test.
6. **`down()` destructiveness** (`social_links` migration) - unchanged, but it deletes rows; confirm acceptable.

---

# PART 4 - `upsert()` / `insertOrIgnore()` unique-constraint dependencies

Laravel emits `$table->unique([...])` as a real Postgres `UNIQUE` constraint, and `upsert()`/`insertOrIgnore()` compile to `ON CONFLICT (...) DO UPDATE/NOTHING` on PG **only if** the conflict target matches an existing unique constraint. All four exist in the current schema ✅:

| Call site | Conflict target | Unique constraint | Defined in |
|---|---|---|---|
| `StoryController.php:329` `insertOrIgnore` | `story_views` | `unique(['story_id','viewer_id'])` | `2026_06_13_300001_create_story_views_table.php:17` ✅ |
| `StoryController.php:490` `upsert` | `story_reactions` | `unique(['story_id','user_id'])` | `2026_06_13_500001_create_story_reactions_table.php:17` ✅ |
| `StoryController.php:616` `upsert` | `story_reports` | `unique(['story_id','reporter_id'])` | `2026_06_13_500003_create_story_reports_table.php:18` ✅ |
| `UserVideoPreference.php:32` `upsert` | `user_video_preferences` | `unique(['user_id','pref_type','pref_value'])` | `2026_06_02_100003_create_user_video_preferences_table.php:21` ✅ |

**No code change needed** for these; they carry over to Postgres intact. (One watch-item: PG `ON CONFLICT` requires the conflict columns to be exactly a unique constraint - they are.)

---

# PART 5 - Not in scope of this patch set (flagged for the plan)
- **`config/database.php`** needs a `pgsql` connection block + `DB_CONNECTION=pgsql` in the local/staging `.env` (Stage b). Not a query/migration diff, so excluded here.
- **`json` → `jsonb` column conversions** - minimum required set for the `@>` rewrites: `users.categories`, `users.interests`, `direct_messages.deleted_for_user_ids`, and (recommended) `video_events.payload`. These are schema changes belonging to Stage (a)/(c), tracked separately from this query/migration patch set.
- **`useCurrentOnUpdate()`** on 3 tables and **223 `->after()`** modifiers - silently ignored by Postgres, no diff needed.

-- =============================================================================
-- rename-brand-values.sql  -  converts brand-named VALUES in the restored DB
-- =============================================================================
--
-- The database was restored from the source platform's dump, so some rows
-- still carry the source platform's brand in values that the code compares
-- against (or that were seeded by migrations). The code now uses the Teezer
-- equivalents; this file converts the existing rows to match.
--
-- NOT run by any script. Run it by hand, once, after a backup:
--
--     sudo -u postgres pg_dump -Fc -d teezer -f /root/teezer-pre-brand-rename.dump
--     sudo -u postgres psql -d teezer -v ON_ERROR_STOP=1 -f deploy/db/rename-brand-values.sql
--
-- Every statement is idempotent: it only touches rows that still hold an old
-- value, so running the file a second time changes nothing.
--
-- Afterwards clear the application cache (monetization programmes, gift
-- catalogue and coin packages are cached in Redis):
--
--     cd /var/www/teezer/server && php artisan cache:clear
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Migration history: the one renamed migration file
--    (..._repurpose_affiliate_program_as_sell_on_reelsoo.php was renamed to
--    ..._sell_on_teezer.php; without this row Laravel would treat it as pending
--    and run it again).
-- -----------------------------------------------------------------------------
UPDATE migrations
   SET migration = '2026_08_19_000006_repurpose_affiliate_program_as_sell_on_teezer'
 WHERE migration = '2026_08_19_000006_repurpose_affiliate_program_as_sell_on_reelsoo';

-- -----------------------------------------------------------------------------
-- 2. Music library
-- -----------------------------------------------------------------------------
-- license_type option value (admin music upload/edit forms).
UPDATE music_tracks
   SET license_type = 'teezer_licensed'
 WHERE license_type = 'reelsoo_licensed';

-- "Originals" tracks are recognised by artist_name ILIKE '%teezer%' (Laravel
-- AdminMusicController / MusicLibraryController, Go music.sql, web + mobile
-- clients). Replace the old brand in any case variant, preserving case style.
UPDATE music_tracks
   SET artist_name = regexp_replace(
                       replace(replace(replace(artist_name,
                         'REELSOO', 'TEEZER'),
                         'Reelsoo', 'Teezer'),
                         'reelsoo', 'teezer'),
                       'reelsoo', 'Teezer', 'gi')
 WHERE artist_name ILIKE '%reelsoo%';

-- -----------------------------------------------------------------------------
-- 3. Promotions: payment method value (StudioPromotionController validation
--    'in:teezer_balance,credit_card,e_wallet,bank_transfer').
-- -----------------------------------------------------------------------------
UPDATE promotions
   SET payment_method = 'teezer_balance'
 WHERE payment_method = 'reelsoo_balance';

-- -----------------------------------------------------------------------------
-- 4. Gifts and coin packages: the "throne" gift slug, its name and artwork path
--    (artwork file renamed to frontend/public/gifts/200-teezer-throne.svg; the
--    clients build /gifts/{sort_order}-{slug|icon}.svg from these values).
-- -----------------------------------------------------------------------------
UPDATE gifts
   SET slug = 'teezer-throne'
 WHERE slug = 'reelsoo-throne'
   AND NOT EXISTS (SELECT 1 FROM gifts g2 WHERE g2.slug = 'teezer-throne');

UPDATE gifts
   SET name = 'Teezer Throne'
 WHERE name = 'Reelsoo Throne';

UPDATE gifts
   SET icon_url = replace(icon_url, 'reelsoo-throne', 'teezer-throne')
 WHERE icon_url LIKE '%reelsoo-throne%';

UPDATE coin_packages
   SET icon = 'teezer-throne'
 WHERE icon = 'reelsoo-throne';

UPDATE coin_packages
   SET plan_name = 'Teezer Throne'
 WHERE plan_name = 'Reelsoo Throne';

-- -----------------------------------------------------------------------------
-- 5. Users
-- -----------------------------------------------------------------------------
-- Placeholder e-mails of social-login accounts without a real address
-- ("{provider}_{hash}@social.teezer.invalid", and "merged+{id}@..." written by
-- teezer:merge-duplicate-accounts). Skips a row if its new address is taken.
UPDATE users u
   SET email = replace(u.email, '@social.reelsoo.invalid', '@social.teezer.invalid')
 WHERE u.email LIKE '%@social.reelsoo.invalid'
   AND NOT EXISTS (
         SELECT 1 FROM users u2
          WHERE u2.email = replace(u.email, '@social.reelsoo.invalid', '@social.teezer.invalid'));

-- Seeded admin username (AdminUserSeeder). Skipped if the new name is taken.
UPDATE users
   SET username = 'teezer_admin'
 WHERE username = 'reelsoo_admin'
   AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.username = 'teezer_admin');

-- -----------------------------------------------------------------------------
-- 6. Monetization programme "Sell on ..." (label + unlocks seeded by the
--    renamed migration 2026_08_19_000006).
-- -----------------------------------------------------------------------------
UPDATE monetization_programs
   SET label = 'Sell on Teezer'
 WHERE label = 'Sell on Reelsoo';

UPDATE monetization_programs
   SET unlocks = replace(unlocks::text, 'Reelsoo Shop', 'Teezer Shop')::json
 WHERE unlocks::text LIKE '%Reelsoo Shop%';

-- -----------------------------------------------------------------------------
-- 7. Other seeded / system-written strings
-- -----------------------------------------------------------------------------
UPDATE cms_pages
   SET title = 'About Teezer'
 WHERE title = 'About Reelsoo';

UPDATE admin_coin_settings
   SET description = 'Gift commission % taken by Teezer'
 WHERE description = 'Gift commission % taken by Reelsoo';

-- Actor label written by AdminMessagesController::logActivity().
UPDATE conversation_admin_logs
   SET actor_label = 'Teezer Admin'
 WHERE actor_label = 'Reelsoo Admin';

COMMIT;

-- -----------------------------------------------------------------------------
-- Not PostgreSQL, for reference only (run separately if ClickHouse was already
-- created under the old name - backend-go now writes to database `teezer`):
--   clickhouse-client --query "RENAME DATABASE reelsoo TO teezer"
-- -----------------------------------------------------------------------------

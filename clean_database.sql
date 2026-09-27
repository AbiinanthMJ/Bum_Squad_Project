-- ── Complete database reset (safe to paste into Supabase SQL editor) ───────
-- Deletes every row added during testing so you start with a 100% clean slate.
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.

begin;

-- 1. Remove linked photo records + applications
truncate table public.application_images cascade;
truncate table public.applications cascade;

-- 2. Remove all community questions (including the test probes & seeded ones)
truncate table public.community_questions restart identity cascade;

-- 3. Remove client progress metrics
truncate table public.client_progress cascade;

-- 4. Reset storage objects in the 'application-images' bucket
delete from storage.objects where bucket_id = 'application-images';

-- 5. Re-seed clean site copy for the content studio
insert into public.site_content (content_key, title, body) values
  ('hero', 'Your body. Your edge.', 'Personal coaching for building a body and mindset that can keep up with the life you want.'),
  ('application', 'Make the decision real.', 'Applications take 5 minutes. The next version of your life deserves that much attention.')
on conflict (content_key) do update set
  title = excluded.title,
  body  = excluded.body,
  updated_at = now();

commit;

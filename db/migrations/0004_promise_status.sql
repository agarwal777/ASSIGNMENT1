-- 0004: align public.promises.status with the app's status vocabulary.
-- Run once in the Supabase SQL Editor (paste this file's contents). Safe to re-run.
--
-- 0001 created the column with the design-doc vocabulary (delivered, on_track, revised, missed,
-- dropped, unverifiable) and the default 'unverifiable'. The app and the workers use
-- on_track, behind, met, missed, cant_check. The table is not written by the app today (promises ship
-- as JSON), so no rows need mapping; the update below maps any that exist, just in case.

alter table public.promises drop constraint if exists promises_status_check;

update public.promises set status = case status
  when 'delivered'    then 'met'
  when 'unverifiable' then 'cant_check'
  when 'revised'      then 'cant_check'
  when 'dropped'      then 'cant_check'
  else status end
where status in ('delivered', 'unverifiable', 'revised', 'dropped');

alter table public.promises alter column status set default 'cant_check';
alter table public.promises add constraint promises_status_check
  check (status in ('on_track', 'behind', 'met', 'missed', 'cant_check'));

-- 只調整仍維持原始預載排程、尚無帳號管理的虛構示範店；已修改的店家會跳過。
-- 在 Supabase SQL Editor 執行，RETURNING 會列出本次實際更新的 ID；重複執行不會再修改。
begin;
with original_demo(id, start_time, end_time, closed_weekday) as (
  values
    ('demo-01', '07:00', '20:00', 0),
    ('demo-02', '10:00', '20:00', 1),
    ('demo-03', '16:00', '23:00', 2),
    ('demo-05', '10:00', '20:00', 4),
    ('demo-06', '16:00', '23:00', 5),
    ('demo-07', '07:00', '20:00', 6),
    ('demo-09', '16:00', '23:00', 1),
    ('demo-10', '07:00', '20:00', 2),
    ('demo-11', '10:00', '20:00', 3),
    ('demo-13', '07:00', '20:00', 5),
    ('demo-14', '10:00', '20:00', 6),
    ('demo-15', '16:00', '23:00', 0),
    ('demo-17', '10:00', '20:00', 2),
    ('demo-18', '16:00', '23:00', 3),
    ('demo-19', '07:00', '20:00', 4),
    ('demo-21', '16:00', '23:00', 6)
), schedules as (
  select original_demo.*,
    (select jsonb_agg(jsonb_build_object('closed', day = closed_weekday, 'start', start_time, 'end', end_time) order by day)
       from generate_series(0, 6) as day) as original_week,
    (select jsonb_agg(jsonb_build_object('closed', false, 'start', '00:00', 'end', '23:59') order by day)
       from generate_series(0, 6) as day) as demo_week
  from original_demo
)
update public.civil_stores as store
set data = jsonb_set(
  jsonb_set(jsonb_set(store.data, '{weeklyHours}', schedules.demo_week), '{hoursStart}', '"00:00"'::jsonb),
  '{hoursEnd}', '"23:59"'::jsonb)
from schedules
where store.id = schedules.id
  and store.owner_id is null
  and store.data->'isDemo' = 'true'::jsonb
  and store.data->>'id' = schedules.id
  and store.data->>'hoursStart' = schedules.start_time
  and store.data->>'hoursEnd' = schedules.end_time
  and store.data->'weeklyHours' = schedules.original_week
  and store.data->'enabled' = 'true'::jsonb
  and store.data->'pausedOn' = 'null'::jsonb
  and store.data->>'pauseReason' = ''
returning store.id, store.data->'weeklyHours' as weekly_hours;
commit;

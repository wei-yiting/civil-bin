-- Incremental upgrade: run after 202610240001_civil_bin.sql. Historical liters remain historical.
begin;
create function public.civil_valid_measurement(value jsonb) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'object'
    and value ?& array['boardVersion','size','quantity']
    and value - array['boardVersion','size','quantity'] = '{}'::jsonb
    and jsonb_typeof(value->'boardVersion') = 'string' and value->>'boardVersion' = 'street-v1'
    and jsonb_typeof(value->'size') = 'string' and value->>'size' in ('S','M','L')
    and jsonb_typeof(value->'quantity') = 'number' and value->>'quantity' ~ '^[1-9][0-9]?$'
    ,false)
$$;
create function public.civil_valid_size_counts(value jsonb) returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(value) = 'object' and value ?& array['S','M','L']
    and value - array['S','M','L'] = '{}'::jsonb
    and jsonb_typeof(value->'S') = 'number' and value->>'S' ~ '^(0|[1-9][0-9]{0,2})$'
    and jsonb_typeof(value->'M') = 'number' and value->>'M' ~ '^(0|[1-9][0-9]{0,2})$'
    and jsonb_typeof(value->'L') = 'number' and value->>'L' ~ '^(0|[1-9][0-9]{0,2})$'
    ,false)
$$;
create table public.civil_size_claims (
  id text primary key,
  store_id text not null references public.civil_stores(id),
  counts jsonb not null check (public.civil_valid_size_counts(counts))
);
alter table public.civil_size_claims enable row level security;
create policy size_claims_read on public.civil_size_claims for select to authenticated using (true);
revoke all on public.civil_size_claims from anon, authenticated;
grant select on public.civil_size_claims to authenticated;
create or replace function public.civil_snapshot() returns jsonb language plpgsql security definer set search_path = '' as $$
declare r text := public.civil_role(); result jsonb;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select jsonb_build_object(
    'role', r,
    'storeIds', coalesce((select jsonb_agg(id) from public.civil_stores where owner_id = auth.uid()),'[]'::jsonb),
    'state', jsonb_build_object(
      'version', 4,
      'stores', coalesce((select jsonb_agg(data order by id) from public.civil_stores), '[]'::jsonb),
      'deliveries', coalesce((select jsonb_agg(
        case when d.owner_id is null or d.owner_id = auth.uid() or s.owner_id = auth.uid() or r = 'city' then d.data
        else d.data || '{"photo":null,"reason":""}'::jsonb end order by d.data->>'createdAt' desc)
        from public.civil_deliveries d join public.civil_stores s on s.id = d.store_id
        where d.owner_id is null or d.owner_id = auth.uid() or s.owner_id = auth.uid() or r = 'city'), '[]'::jsonb),
      'claims', coalesce((select jsonb_object_agg(id,amount) from public.civil_claims), '{}'::jsonb),
      'sizeClaims', coalesce((select jsonb_object_agg(id,counts) from public.civil_size_claims), '{}'::jsonb),
      'reviews', case when r = 'city' then coalesce((select jsonb_object_agg(id,note) from public.civil_reviews),'{}'::jsonb) else '{}'::jsonb end
    )
  ) into result;
  return result;
end $$;
revoke all on function public.civil_snapshot() from public;
grant execute on function public.civil_snapshot() to authenticated;

create or replace function public.civil_apply_changes(changes jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare
  op jsonb; old jsonb; val jsonb; expected jsonb; t text; key text; store_key text;
  r text := public.civil_role(); current_owner uuid; target_store jsonb; is_new boolean;
  old_scalar jsonb; new_scalar jsonb; slot jsonb;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 20 then raise exception '操作格式錯誤'; end if;
  for op in select value from jsonb_array_elements(changes) loop
    t := op->>'table'; key := op->>'id'; val := op->'value'; expected := op->'expected';
    if not (op ?& array['table','id','expected','value']) or key is null or length(key) > 200 or val is null or val = 'null'::jsonb then raise exception '操作格式錯誤'; end if;
    if t = 'stores' then
      if r <> 'merchant' then raise exception '只有店家帳號可管理店家'; end if;
      select data, owner_id into old, current_owner from public.civil_stores where id = key for update;
      is_new := not found;
      if not is_new and current_owner is distinct from auth.uid() then raise exception '無權管理此店家'; end if;
      if (is_new and expected <> 'null'::jsonb) or (not is_new and old is distinct from expected) then raise exception '資料已更新，請重新整理後再試'; end if;
      if jsonb_typeof(val) <> 'object' or not (val ?& array['id','name','area','address','hoursStart','hoursEnd','weeklyHours','enabled','lat','lng','pausedOn','pauseReason']) then raise exception '店家缺少必要欄位'; end if;
      if (val->>'id' = key and length(trim(val->>'name')) between 1 and 100 and length(trim(val->>'address')) between 1 and 300
        and jsonb_typeof(val->'weeklyHours') = 'array' and jsonb_array_length(val->'weeklyHours') = 7
        and (val->>'lat')::numeric between 24.95 and 25.25 and (val->>'lng')::numeric between 121.45 and 121.68
        and jsonb_typeof(val->'enabled') = 'boolean' and jsonb_typeof(val->'pauseReason') = 'string'
        and val->>'hoursStart' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and val->>'hoursEnd' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        and val->>'hoursStart' <> val->>'hoursEnd') is not true then raise exception '店家資料不完整'; end if;
      for slot in select value from jsonb_array_elements(val->'weeklyHours') loop
        if (jsonb_typeof(slot->'closed') = 'boolean' and slot->>'start' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and slot->>'end' ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
          and slot->>'start' <> slot->>'end') is not true then raise exception '每週時段格式錯誤'; end if;
      end loop;
      if val->>'pausedOn' is not null and val->>'pausedOn' is distinct from old->>'pausedOn' and val->>'pausedOn' <> to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD') then raise exception '只可停收當日'; end if;
      if is_new then
        insert into public.civil_stores values(key,auth.uid(),val || '{"isDemo":false}'::jsonb);
      else
        if (old - array['name','area','address','hoursStart','hoursEnd','weeklyHours','enabled','pausedOn','pauseReason','lat','lng'])
          is distinct from (val - array['name','area','address','hoursStart','hoursEnd','weeklyHours','enabled','pausedOn','pauseReason','lat','lng']) then raise exception '不可修改分析欄位'; end if;
        update public.civil_stores set data = val where id = key;
      end if;
    elsif t = 'deliveries' then
      if jsonb_typeof(val) <> 'object' or not (val ?& array['id','storeId','date','createdAt','kind','liters','low','high','source','status','reason']) then raise exception '交付缺少必要欄位'; end if;
      if (val->>'source' in ('photo','manual') and val->>'status' in ('pending','accepted','rejected')
        and jsonb_typeof(val->'reason') = 'string' and jsonb_typeof(val->'kind') = 'string'
        and val->>'date' ~ '^\d{4}-\d{2}-\d{2}$') is not true then raise exception '交付格式錯誤'; end if;
      store_key := val->>'storeId';
      select data into target_store from public.civil_stores where id = store_key for update;
      if not found then raise exception '找不到店家'; end if;
      select data,owner_id into old,current_owner from public.civil_deliveries where id = key for update;
      is_new := not found;
      if is_new then
        if expected <> 'null'::jsonb then raise exception '交付紀錄已變更'; end if;
        if not public.civil_store_open(target_store) then raise exception '店家目前未開放收受，資料未送出'; end if;
        if (val->>'status' = 'pending' and val->>'source' = 'photo') is not true and not (r = 'merchant' and val->>'source' = 'manual' and val->>'status' = 'accepted'
          and exists(select 1 from public.civil_stores where id = store_key and owner_id = auth.uid())) then raise exception '新增交付狀態錯誤'; end if;
        if val->>'date' <> to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD') then raise exception '只可建立今日交付'; end if;
        if val->>'source' = 'photo' and (val->>'photo' like 'storage:' || auth.uid()::text || '/%' and exists(select 1 from storage.objects where bucket_id = 'delivery-photos' and name = substring(val->>'photo' from 9))) is not true then raise exception '照片來源錯誤'; end if;
        if val->>'source' = 'manual' and val->>'photo' is not null then raise exception '人工紀錄不應附照片'; end if;
        if (val->>'id' = key and public.civil_valid_measurement(val->'measurement')
          and jsonb_typeof(val->'liters') = 'number' and val->>'liters' = '0'
          and jsonb_typeof(val->'low') = 'number' and val->>'low' = '0'
          and jsonb_typeof(val->'high') = 'number' and val->>'high' = '0'
          and jsonb_typeof(val->'createdAt') = 'string'
          and (val->>'createdAt')::timestamptz between now() - interval '1 day' and now() + interval '5 minutes') is not true then raise exception '尺寸量測格式錯誤'; end if;
        if val->>'source' = 'photo' and val ? 'confirmedMeasurement' then raise exception '民眾不能自行確認尺寸'; end if;
        if val->>'source' = 'manual' and val->'confirmedMeasurement' is distinct from val->'measurement' then raise exception '人工紀錄須確認尺寸'; end if;
        insert into public.civil_deliveries values(key,store_key,auth.uid(),val);
      else
        if r <> 'merchant' or not exists(select 1 from public.civil_stores where id = store_key and owner_id = auth.uid()) then raise exception '無權確認此交付'; end if;
        if old - 'photo' is distinct from expected - 'photo' then raise exception '資料已更新，請重新整理後再試'; end if;
        if old->>'status' <> 'pending' or val->>'status' not in ('accepted','rejected') then raise exception '此交付已處理'; end if;
        if old - array['photo','status','reason','confirmedMeasurement'] is distinct from val - array['photo','status','reason','confirmedMeasurement'] then raise exception '不可修改原交付內容'; end if;
        if val->>'status' = 'accepted' and old ? 'measurement' then
          if not public.civil_valid_measurement(val->'confirmedMeasurement') then raise exception '請確認收受尺寸'; end if;
        elsif val ? 'confirmedMeasurement' then raise exception '此交付不可加入確認尺寸'; end if;
        update public.civil_deliveries set data = old || jsonb_build_object('status',val->>'status','reason',left(coalesce(val->>'reason',''),1000)) ||
          case when val ? 'confirmedMeasurement' then jsonb_build_object('confirmedMeasurement',val->'confirmedMeasurement') else '{}'::jsonb end where id = key;
      end if;
    elsif t = 'claims' then
      store_key := substring(key from 12);
      if left(key,10) <> to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD') or substring(key from 11 for 1) <> ':' then raise exception '只可申報今日總量'; end if;
      if r <> 'merchant' or not exists(select 1 from public.civil_stores where id = store_key and owner_id = auth.uid()) then raise exception '無權申報此店家'; end if;
      perform 1 from public.civil_stores where id = store_key for update;
      select to_jsonb(amount) into old_scalar from public.civil_claims where id = key for update;
      if coalesce(old_scalar,'null'::jsonb) is distinct from expected then raise exception '申報已更新，請重新整理'; end if;
      insert into public.civil_claims values(key,store_key,(val #>> '{}')::numeric) on conflict(id) do update set amount = excluded.amount;
    elsif t = 'sizeClaims' then
      store_key := substring(key from 12);
      if left(key,10) <> to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD') or substring(key from 11 for 1) <> ':' then raise exception '只可申報今日件數'; end if;
      if r <> 'merchant' or not exists(select 1 from public.civil_stores where id = store_key and owner_id = auth.uid()) then raise exception '無權申報此店家'; end if;
      if not public.civil_valid_size_counts(val) then raise exception '尺寸件數格式錯誤'; end if;
      perform 1 from public.civil_stores where id = store_key for update;
      select counts into old_scalar from public.civil_size_claims where id = key for update;
      if coalesce(old_scalar,'null'::jsonb) is distinct from expected then raise exception '申報已更新，請重新整理'; end if;
      insert into public.civil_size_claims values(key,store_key,val) on conflict(id) do update set counts = excluded.counts;
    elsif t = 'reviews' then
      if r <> 'city' then raise exception '只有市府帳號可寫入查核紀錄'; end if;
      perform pg_advisory_xact_lock(hashtext(key));
      select to_jsonb(note) into old_scalar from public.civil_reviews where id = key for update;
      if coalesce(old_scalar,'null'::jsonb) is distinct from expected then raise exception '查核已更新，請重新整理'; end if;
      insert into public.civil_reviews values(key,val #>> '{}') on conflict(id) do update set note = excluded.note;
    else raise exception '不支援的操作'; end if;
  end loop;
end $$;
revoke all on function public.civil_apply_changes(jsonb) from public;
grant execute on function public.civil_apply_changes(jsonb) to authenticated;

alter publication supabase_realtime add table public.civil_size_claims;
commit;

-- Run once in a new Supabase project. Business writes go through one atomic RPC.
create table public.civil_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('citizen','merchant','city')) default 'citizen'
);
create table public.civil_stores (
  id text primary key,
  owner_id uuid references auth.users(id),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id)
);
create table public.civil_deliveries (
  id text primary key,
  store_id text not null references public.civil_stores(id),
  owner_id uuid references auth.users(id),
  data jsonb not null check (jsonb_typeof(data) = 'object' and data->>'id' = id and data->>'storeId' = store_id)
);
create table public.civil_claims (
  id text primary key,
  store_id text not null references public.civil_stores(id),
  amount numeric not null check (amount >= 0 and amount <= 1000000)
);
create table public.civil_reviews (
  id text primary key,
  note text not null check (length(note) <= 4000)
);
create index on public.civil_stores(owner_id);
create index on public.civil_deliveries(store_id);
create index on public.civil_deliveries(owner_id);

alter table public.civil_profiles enable row level security;
alter table public.civil_stores enable row level security;
alter table public.civil_deliveries enable row level security;
alter table public.civil_claims enable row level security;
alter table public.civil_reviews enable row level security;
create policy profiles_self on public.civil_profiles for select to authenticated using (user_id = auth.uid());
create policy stores_read on public.civil_stores for select to authenticated using (true);
create policy delivery_read on public.civil_deliveries for select to authenticated using (
  owner_id = auth.uid() or exists(select 1 from public.civil_stores s where s.id = store_id and s.owner_id = auth.uid())
  or exists(select 1 from public.civil_profiles p where p.user_id = auth.uid() and p.role = 'city')
);
create policy claims_read on public.civil_claims for select to authenticated using (true);
create policy reviews_city on public.civil_reviews for select to authenticated using (
  exists(select 1 from public.civil_profiles p where p.user_id = auth.uid() and p.role = 'city')
);
revoke all on public.civil_profiles, public.civil_stores, public.civil_deliveries, public.civil_claims, public.civil_reviews from anon, authenticated;
grant select on public.civil_profiles, public.civil_stores, public.civil_deliveries, public.civil_claims, public.civil_reviews to authenticated;

create function public.civil_role() returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select role from public.civil_profiles where user_id = auth.uid()), 'citizen')
$$;
revoke all on function public.civil_role() from public;
grant execute on function public.civil_role() to authenticated;

create function public.civil_store_open(s jsonb) returns boolean language plpgsql stable set search_path = '' as $$
declare
  local_now timestamp := now() at time zone 'Asia/Taipei';
  day_index int := extract(dow from local_now)::int;
  today jsonb := s->'weeklyHours'->day_index;
  previous jsonb := s->'weeklyHours'->((day_index + 6) % 7);
  clock_time text := to_char(local_now, 'HH24:MI');
begin
  if not coalesce((s->>'enabled')::boolean, false) or s->>'pausedOn' = to_char(local_now,'YYYY-MM-DD') then return false; end if;
  return coalesce((not (today->>'closed')::boolean and
    (case when today->>'start' < today->>'end'
      then clock_time >= today->>'start' and clock_time < today->>'end'
      else clock_time >= today->>'start' end))
    or (not (previous->>'closed')::boolean and previous->>'start' > previous->>'end' and clock_time < previous->>'end'), false);
end $$;

create function public.civil_snapshot() returns jsonb language plpgsql security definer set search_path = '' as $$
declare r text := public.civil_role(); result jsonb;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select jsonb_build_object(
    'role', r,
    'storeIds', coalesce((select jsonb_agg(id) from public.civil_stores where owner_id = auth.uid()),'[]'::jsonb),
    'state', jsonb_build_object(
      'version', 3,
      'stores', coalesce((select jsonb_agg(data order by id) from public.civil_stores), '[]'::jsonb),
      'deliveries', coalesce((select jsonb_agg(
        case when d.owner_id is null or d.owner_id = auth.uid() or s.owner_id = auth.uid() or r = 'city' then d.data
        else d.data || '{"photo":null,"reason":""}'::jsonb end order by d.data->>'createdAt' desc)
        from public.civil_deliveries d join public.civil_stores s on s.id = d.store_id
        where d.owner_id is null or d.owner_id = auth.uid() or s.owner_id = auth.uid() or r = 'city'), '[]'::jsonb),
      'claims', coalesce((select jsonb_object_agg(id,amount) from public.civil_claims), '{}'::jsonb),
      'reviews', case when r = 'city' then coalesce((select jsonb_object_agg(id,note) from public.civil_reviews),'{}'::jsonb) else '{}'::jsonb end
    )
  ) into result;
  return result;
end $$;
revoke all on function public.civil_snapshot() from public;
grant execute on function public.civil_snapshot() to authenticated;

create function public.civil_apply_changes(changes jsonb) returns void language plpgsql security definer set search_path = '' as $$
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
        if (val->>'id' = key and (val->>'liters')::numeric between 0.01 and 100000
          and (val->>'low')::numeric between 0 and (val->>'liters')::numeric
          and (val->>'high')::numeric between (val->>'liters')::numeric and 100000
          and jsonb_typeof(val->'reason') = 'string' and jsonb_typeof(val->'kind') = 'string'
          and (val->>'createdAt')::timestamptz between now() - interval '1 day' and now() + interval '5 minutes') is not true then raise exception '體積範圍錯誤'; end if;
        insert into public.civil_deliveries values(key,store_key,auth.uid(),val);
      else
        if r <> 'merchant' or not exists(select 1 from public.civil_stores where id = store_key and owner_id = auth.uid()) then raise exception '無權確認此交付'; end if;
        if old - 'photo' is distinct from expected - 'photo' then raise exception '資料已更新，請重新整理後再試'; end if;
        if old->>'status' <> 'pending' or val->>'status' not in ('accepted','rejected') then raise exception '此交付已處理'; end if;
        if old - array['photo','status','reason'] is distinct from val - array['photo','status','reason'] then raise exception '不可修改原交付內容'; end if;
        update public.civil_deliveries set data = old || jsonb_build_object('status',val->>'status','reason',left(coalesce(val->>'reason',''),1000)) where id = key;
      end if;
    elsif t = 'claims' then
      store_key := substring(key from 12);
      if left(key,10) <> to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD') or substring(key from 11 for 1) <> ':' then raise exception '只可申報今日總量'; end if;
      if r <> 'merchant' or not exists(select 1 from public.civil_stores where id = store_key and owner_id = auth.uid()) then raise exception '無權申報此店家'; end if;
      perform 1 from public.civil_stores where id = store_key for update;
      select to_jsonb(amount) into old_scalar from public.civil_claims where id = key for update;
      if coalesce(old_scalar,'null'::jsonb) is distinct from expected then raise exception '申報已更新，請重新整理'; end if;
      insert into public.civil_claims values(key,store_key,(val #>> '{}')::numeric) on conflict(id) do update set amount = excluded.amount;
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

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('delivery-photos','delivery-photos',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy photos_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'delivery-photos' and (storage.foldername(name))[1] = auth.uid()::text
);
create policy photos_read on storage.objects for select to authenticated using (
  bucket_id = 'delivery-photos' and ((storage.foldername(name))[1] = auth.uid()::text
  or public.civil_role() = 'city' or exists(
    select 1 from public.civil_deliveries d join public.civil_stores s on s.id = d.store_id
    where d.data->>'photo' = 'storage:' || name and s.owner_id = auth.uid()))
);
create policy photos_delete_orphan on storage.objects for delete to authenticated using (
  bucket_id = 'delivery-photos' and (storage.foldername(name))[1] = auth.uid()::text
  and not exists(select 1 from public.civil_deliveries where data->>'photo' = 'storage:' || name)
);
alter publication supabase_realtime add table public.civil_stores, public.civil_deliveries, public.civil_claims, public.civil_reviews;

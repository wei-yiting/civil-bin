\set ON_ERROR_STOP on
insert into auth.users(id) values
 ('11111111-1111-1111-1111-111111111111'),
 ('22222222-2222-2222-2222-222222222222'),
 ('33333333-3333-3333-3333-333333333333');
insert into public.civil_profiles values
 ('11111111-1111-1111-1111-111111111111','merchant'),
 ('22222222-2222-2222-2222-222222222222','citizen'),
 ('33333333-3333-3333-3333-333333333333','city');

create function public.test_assert(ok boolean,msg text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',msg; end if; end $$;
create function public.test_reject(changes jsonb,msg text) returns void language plpgsql as $$
declare rejected boolean := false;
begin
 begin perform public.civil_apply_changes(changes); exception when others then rejected := true; end;
 perform public.test_assert(rejected,msg);
end $$;
grant execute on function public.test_assert(boolean,text), public.test_reject(jsonb,text) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.civil_apply_changes(jsonb_build_array(jsonb_build_object('table','stores','id','test-shop','expected',null,'value',jsonb_build_object(
 'id','test-shop','name','測試店家','area','中山區','address','測試地址','lat',25.0588,'lng',121.5434,
 'enabled',true,'hoursStart','00:00','hoursEnd','23:59','weeklyHours',
 (select jsonb_agg(jsonb_build_object('closed',false,'start','00:00','end','23:59')) from generate_series(0,6)),
 'pausedOn',null,'pauseReason','','isDemo',false,'x',50,'y',50,'binDistance',null,'publicCapacity',null,'collections',null,'overflow',null
))));
select public.test_assert((public.civil_snapshot()->'storeIds') ? 'test-shop','merchant owns created shop');

select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.test_reject('[{"table":"stores","id":"test-shop","expected":null,"value":{}}]'::jsonb,'citizen cannot edit merchant shop');
do $$ begin
 begin update public.civil_stores set data = '{}'::jsonb where id='test-shop'; raise exception 'Direct write unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
insert into storage.objects(bucket_id,name) values('delivery-photos','22222222-2222-2222-2222-222222222222/photo.jpg');
select public.civil_apply_changes(jsonb_build_array(jsonb_build_object('table','deliveries','id','delivery-1','expected',null,'value',jsonb_build_object(
 'id','delivery-1','storeId','test-shop','date',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD'),
 'createdAt',now(),'kind','測試垃圾','liters',0,'low',0,'high',0,'measurement',jsonb_build_object('boardVersion','street-v1','size','M','quantity',2),'photo','storage:22222222-2222-2222-2222-222222222222/photo.jpg',
 'source','photo','status','pending','reason',''
))));
select public.test_assert(jsonb_array_length(public.civil_snapshot()->'state'->'deliveries')=1,'citizen delivery saved');
select public.test_reject(jsonb_build_array(jsonb_build_object('table','deliveries','id','bad-size','expected',null,'value',
 (select data || '{"id":"bad-size","measurement":{"boardVersion":"street-v1","size":"S","quantity":"1"}}'::jsonb from public.civil_deliveries where id='delivery-1'))),'RPC rejects string size quantity');
select public.test_reject(jsonb_build_array(jsonb_build_object('table','deliveries','id','bad-liters','expected',null,'value',
 (select data || '{"id":"bad-liters","liters":2}'::jsonb from public.civil_deliveries where id='delivery-1'))),'new size record cannot invent liters');
select public.test_reject(jsonb_build_array(jsonb_build_object('table','deliveries','id','self-confirm','expected',null,'value',
 (select data || '{"id":"self-confirm","confirmedMeasurement":{"boardVersion":"street-v1","size":"S","quantity":1}}'::jsonb from public.civil_deliveries where id='delivery-1'))),'citizen cannot preconfirm measurement');

select public.test_reject(jsonb_build_array(jsonb_build_object('table','deliveries','id','delivery-1','expected',(select data from public.civil_deliveries where id='delivery-1'),
 'value',(select data || '{"status":"accepted","confirmedMeasurement":{"boardVersion":"street-v1","size":"S","quantity":1}}'::jsonb from public.civil_deliveries where id='delivery-1'))),'citizen cannot accept own delivery');

select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);
select public.civil_apply_changes(jsonb_build_array(jsonb_build_object('table','deliveries','id','delivery-1','expected',(select data from public.civil_deliveries where id='delivery-1'),
 'value',(select data || '{"status":"accepted","confirmedMeasurement":{"boardVersion":"street-v1","size":"S","quantity":1}}'::jsonb from public.civil_deliveries where id='delivery-1'))));
select public.test_assert((select data->>'status' from public.civil_deliveries where id='delivery-1')='accepted','merchant accepted');
select public.civil_apply_changes(jsonb_build_array(jsonb_build_object('table','deliveries','id','merchant-manual','expected',null,'value',jsonb_build_object(
 'id','merchant-manual','storeId','test-shop','date',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD'),
 'createdAt',now(),'kind','人工尺寸登錄','liters',0,'low',0,'high',0,'photo',null,
 'measurement',jsonb_build_object('boardVersion','street-v1','size','L','quantity',1),
 'confirmedMeasurement',jsonb_build_object('boardVersion','street-v1','size','L','quantity',1),
 'source','manual','status','accepted','reason',''
))));
select public.test_assert((select data->'confirmedMeasurement'->>'size' from public.civil_deliveries where id='merchant-manual')='L','manual merchant receipt saved');

select public.test_reject(jsonb_build_array(jsonb_build_object('table','deliveries','id','delivery-1','expected',(select data from public.civil_deliveries where id='delivery-1'),
 'value',(select data || '{"status":"rejected"}'::jsonb from public.civil_deliveries where id='delivery-1'))),'cannot process delivery twice');
select public.civil_apply_changes(jsonb_build_array(jsonb_build_object('table','claims','id',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop','expected',null,'value',12)));
select public.test_assert((public.civil_snapshot()->'state'->'claims'->>(to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop'))::numeric=12,'daily claim saved');
select public.test_reject(jsonb_build_array(jsonb_build_object('table','claims','id',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop','expected',null,'value',99)),'stale claim cannot overwrite');

select public.test_assert((select data->'measurement'->>'size' from public.civil_deliveries where id='delivery-1')='M','original measurement preserved');
select public.test_assert((select data->'confirmedMeasurement'->>'size' from public.civil_deliveries where id='delivery-1')='S','merchant corrected measurement saved');
select public.test_assert(not public.civil_valid_measurement('{"boardVersion":"street-v1","size":"XL","quantity":1}'),'reject unsupported size');
select public.test_assert(not public.civil_valid_measurement('{"boardVersion":"street-v1","size":"S","quantity":"1"}'),'reject string quantity');
select public.test_assert(not public.civil_valid_measurement('{"boardVersion":"street-v1","size":"S","quantity":0}'),'reject zero quantity');
select public.test_assert(not public.civil_valid_measurement('{"boardVersion":"street-v1","size":"S","quantity":1.5}'),'reject fractional quantity');
select public.test_assert(not public.civil_valid_measurement('{"boardVersion":"street-v1","size":"S","quantity":null}'),'reject null quantity');
select public.test_assert(not public.civil_valid_measurement(null),'reject missing measurement');
select public.civil_apply_changes(jsonb_build_array(jsonb_build_object('table','sizeClaims','id',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop','expected',null,'value',jsonb_build_object('S',2,'M',3,'L',0))));
select public.test_reject(jsonb_build_array(jsonb_build_object('table','sizeClaims','id',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop','expected',null,'value',jsonb_build_object('S',9,'M',3,'L',0))),'stale size claim cannot overwrite');
select public.test_reject(jsonb_build_array(jsonb_build_object('table','sizeClaims','id',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop','expected',jsonb_build_object('S',2,'M',3,'L',0),'value',jsonb_build_object('S',2,'M',-1,'L',0))),'reject negative count');
select public.test_reject(jsonb_build_array(jsonb_build_object('table','sizeClaims','id',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop','expected',jsonb_build_object('S',2,'M',3,'L',0),'value',jsonb_build_object('S',2,'M',3))),'reject missing size count');
select public.test_reject(jsonb_build_array(jsonb_build_object('table','sizeClaims','id',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop','expected',jsonb_build_object('S',2,'M',3,'L',0),'value',jsonb_build_object('S',1000,'M',3,'L',0))),'reject excessive size count');
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.test_reject(jsonb_build_array(jsonb_build_object('table','sizeClaims','id',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop','expected',jsonb_build_object('S',2,'M',3,'L',0),'value',jsonb_build_object('S',9,'M',3,'L',0))),'citizen cannot report size claims');
select public.test_assert((public.civil_snapshot()->'state'->>'version')::int=4,'snapshot upgraded to version 4');
select public.test_assert(public.civil_snapshot()->'state'->'sizeClaims'->(to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop') = '{"S":2,"M":3,"L":0}'::jsonb,'shared size counts available');
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',false);

select public.civil_apply_changes(jsonb_build_array(jsonb_build_object('table','stores','id','test-shop','expected',(select data from public.civil_stores where id='test-shop'),
 'value',(select data || jsonb_build_object('pausedOn',to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD'),'pauseReason','已滿') from public.civil_stores where id='test-shop'))));
select public.test_assert(not public.civil_store_open((select data from public.civil_stores where id='test-shop')),'paused shop closed');
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false);
select public.test_reject(jsonb_build_array(jsonb_build_object('table','deliveries','id','delivery-2','expected',null,
 'value',(select data || '{"id":"delivery-2","status":"pending"}'::jsonb from public.civil_deliveries where id='delivery-1'))),'new delivery to paused shop rejected');
select public.test_reject('[{"table":"reviews","id":"test-review","expected":null,"value":"無權查核"}]','citizen cannot review');

select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333',false);
select public.civil_apply_changes('[{"table":"reviews","id":"test-review","expected":null,"value":"市府待核驗"}]');
select public.test_assert(public.civil_snapshot()->'state'->'reviews'->>'test-review'='市府待核驗','city can review');
select public.test_assert((select count(*) from storage.objects)=1,'city may read evidence');
select public.test_assert((public.civil_snapshot()->'state'->'claims'->>(to_char(now() at time zone 'Asia/Taipei','YYYY-MM-DD')||':test-shop'))::numeric=12,'city sees merchant claim');
reset role;
select 'DB permission and journey assertions passed' as result;

-- Run after 003. All synthetic fixtures and writes roll back.
begin;
insert into auth.users(id,aud,role,email) values
 ('00000000-0000-4000-8000-000000000021','authenticated','authenticated','owner@example.invalid'),
 ('00000000-0000-4000-8000-000000000022','authenticated','authenticated','helper@example.invalid'),
 ('00000000-0000-4000-8000-000000000023','authenticated','authenticated','viewer@example.invalid'),
 ('00000000-0000-4000-8000-000000000024','authenticated','authenticated','backup@example.invalid');
create temp table ctx(k text primary key,v text);
grant all on ctx to authenticated;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$ begin if value is not true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text,expected text) returns void language plpgsql as $$ declare got text; begin begin execute statement; exception when others then get stacked diagnostics got=returned_sqlstate; end; if got is distinct from expected then raise exception 'Expected %, got %: %',expected,got,statement; end if; end $$;
create function pg_temp.mutate(action text,body jsonb,key uuid default gen_random_uuid()) returns jsonb language sql as $$ select public.care_mutate(key,action,body); $$;
create function pg_temp.body(extra jsonb default '{}') returns jsonb language sql as $$ select jsonb_build_object('circle',(select v from ctx where k='circle'))||extra; $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000021","email":"owner@example.invalid"}',true);
insert into ctx values('circle',pg_temp.mutate('create-circle','{"name":"Upgrade checks","displayName":"Owner","timezone":"America/New_York"}')#>>'{}');
insert into ctx values('helper',(pg_temp.mutate('invite',pg_temp.body('{"role":"caregiver","email":"helper@example.invalid"}'))->>'token'));
insert into ctx values('backup',(pg_temp.mutate('invite',pg_temp.body('{"role":"caregiver","email":"backup@example.invalid"}'))->>'token'));
insert into ctx values('viewer',(pg_temp.mutate('invite',pg_temp.body('{"role":"viewer","email":"viewer@example.invalid"}'))->>'token'));
select pg_temp.denied('select * from care_private.requests','42501');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000024","email":"backup@example.invalid"}',true);
select pg_temp.ok(pg_temp.mutate('join',jsonb_build_object('token',(select v from ctx where k='helper'),'displayName','Wrong recipient'))?'error','invitation is recipient-bound');
select pg_temp.ok(pg_temp.mutate('join',jsonb_build_object('token',(select v from ctx where k='backup'),'displayName','Backup'))?'circle_id','backup joins');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000022","email":"helper@example.invalid"}',true);
select pg_temp.ok(pg_temp.mutate('join',jsonb_build_object('token',(select v from ctx where k='helper'),'displayName','Helper'))?'circle_id','helper joins');
insert into ctx values('proposal',pg_temp.mutate('propose',pg_temp.body(jsonb_build_object('label','Existing prescription','instructions','Follow prescription label','scheduled',now()+interval '1 day','days',3,'assigned','00000000-0000-4000-8000-000000000022','backup','00000000-0000-4000-8000-000000000024')))#>>'{}');
select pg_temp.ok(jsonb_array_length(public.care_state_v2((select v::uuid from ctx where k='circle'))->'doses')=0,'pending proposal never activates doses');
select pg_temp.denied(format('select public.care_mutate(gen_random_uuid(),%L,%L)','decide-plan',pg_temp.body(jsonb_build_object('plan',(select v from ctx where k='proposal'),'approve',true))),'42501');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000021","email":"owner@example.invalid"}',true);
select pg_temp.mutate('decide-plan',pg_temp.body(jsonb_build_object('plan',(select v from ctx where k='proposal'),'approve',true)));
select pg_temp.ok(jsonb_array_length(public.care_state_v2((select v::uuid from ctx where k='circle'))->'doses')=3,'approval creates exactly three occurrences');
insert into ctx values('dose',pg_temp.mutate('add-dose',pg_temp.body(jsonb_build_object('label','Due check-in','scheduled',now()-interval '20 minutes','instructions','Follow prescription label')),'00000000-0000-4000-8000-000000000201')#>>'{}');
select pg_temp.ok(pg_temp.mutate('add-dose',pg_temp.body(jsonb_build_object('label','Due check-in','scheduled',now()-interval '20 minutes','instructions','Follow prescription label')),'00000000-0000-4000-8000-000000000201')#>>'{}'=(select v from ctx where k='dose'),'retried write returns same occurrence');
select pg_temp.denied(format('select public.care_mutate(%L,%L,%L)','00000000-0000-4000-8000-000000000201','add-dose',pg_temp.body(jsonb_build_object('label','Changed payload','scheduled',now()))),'23505');
select pg_temp.mutate('report',pg_temp.body(jsonb_build_object('dose',(select v from ctx where k='dose'),'outcome','taken','occurred',now()-interval '5 minutes')));
insert into ctx values('previous',(select e->>'id' from jsonb_array_elements(public.care_state_v2((select v::uuid from ctx where k='circle'))->'events') e where e->>'kind'='dose' limit 1));
select pg_temp.mutate('correct',pg_temp.body(jsonb_build_object('dose',(select v from ctx where k='dose'),'outcome','uncertain','reason','Pete cannot confirm the earlier report','previous',(select v::bigint from ctx where k='previous'),'occurred',now())));
select pg_temp.ok((select count(*) from jsonb_array_elements(public.care_state_v2((select v::uuid from ctx where k='circle'))->'events') e where e->>'kind' in ('dose','correction'))=2,'original report and correction are both retained');
select pg_temp.denied(format('select public.care_mutate(gen_random_uuid(),%L,%L)','correct',pg_temp.body(jsonb_build_object('dose',(select v from ctx where k='dose'),'outcome','taken','reason','Stale report change','previous',(select v::bigint from ctx where k='previous'),'occurred',now()))),'23505');
insert into ctx values('before-approval',(public.care_state_v2((select v::uuid from ctx where k='circle'))->'circle'->>'revision'));
select pg_temp.mutate('approve-brief',pg_temp.body(jsonb_build_object('revision',(public.care_state_v2((select v::uuid from ctx where k='circle'))->'circle'->>'revision')::bigint)));
select pg_temp.ok(not(public.care_state_v2((select v::uuid from ctx where k='circle'),(select v::bigint from ctx where k='before-approval')) ? 'unchanged'),'approval reaches devices using revision-only polling');
select pg_temp.ok(not(public.care_export((select v::uuid from ctx where k='circle'))->'snapshot' ? 'invitations'),'brief snapshot excludes private invitation metadata');
select pg_temp.ok(public.care_export((select v::uuid from ctx where k='circle'))->>'approved_by'='00000000-0000-4000-8000-000000000021','export records approving elder');
select pg_temp.mutate('question',pg_temp.body('{"body":"Review the latest uncertainty"}'));
select pg_temp.denied(format('select public.care_export(%L)',(select v from ctx where k='circle')),'23505');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000023","email":"viewer@example.invalid"}',true);
select pg_temp.mutate('join',jsonb_build_object('token',(select v from ctx where k='viewer'),'displayName','Viewer'));
select pg_temp.ok(jsonb_array_length(public.care_state((select v::uuid from ctx where k='circle'))->'doses')=0,'legacy and new viewer routes redact medication details');
select pg_temp.ok(jsonb_array_length(public.care_state_v2((select v::uuid from ctx where k='circle'))->'events')=0,'viewer cannot read source events');
select pg_temp.denied(format('select public.care_history(%L)',(select v from ctx where k='circle')),'42501');
select pg_temp.denied(format('select public.care_mutate(gen_random_uuid(),%L,%L)','question',pg_temp.body('{"body":"Not permitted"}')),'42501');
reset role;
-- Server scheduler: force an approved occurrence due and prove exactly one
-- durable reminder and one backup handoff despite a worker retry.
update care_private.doses set scheduled_at=now()-interval '20 minutes' where id=(select id from care_private.doses where plan_id=(select v::uuid from ctx where k='proposal') order by scheduled_at limit 1);
select care_private.tick((select v::uuid from ctx where k='circle'));
select care_private.tick((select v::uuid from ctx where k='circle'));
select pg_temp.ok((select count(*) from care_private.notifications where circle_id=(select v::uuid from ctx where k='circle') and stage='backup')=1,'scheduler retry creates one backup notification');
select pg_temp.ok((select count(*) from care_private.events where circle_id=(select v::uuid from ctx where k='circle') and kind='relay')=1,'scheduler escalates once');
select pg_temp.ok(not has_function_privilege('authenticated','care_private.tick_all()','EXECUTE'),'client cannot run or forge the worker clock');
select pg_temp.ok(not has_function_privilege('anon','public.care_mutate(uuid,text,jsonb)','EXECUTE'),'anonymous mutations denied');
select pg_temp.ok(not has_function_privilege('authenticated','public.care_add_dose(uuid,text,text,timestamptz,uuid)','EXECUTE'),'no legacy idempotency bypass');
rollback;
select 'PASS: recipient binding, proposals, approvals, idempotency, corrections, stale exports, viewer redaction, permissions and durable backup retry. Fixtures rolled back.' as upgrade_checks;

-- Transaction-scoped synthetic identities. No passwords, login tokens or real records.
-- Run as project owner after 001. Everything, including fixtures, rolls back.
begin;
insert into auth.users(id,aud,role,email) values
 ('00000000-0000-4000-8000-000000000011','authenticated','authenticated','elder-test@example.invalid'),
 ('00000000-0000-4000-8000-000000000012','authenticated','authenticated','helper-test@example.invalid'),
 ('00000000-0000-4000-8000-000000000013','authenticated','authenticated','viewer-test@example.invalid'),
 ('00000000-0000-4000-8000-000000000014','authenticated','authenticated','outsider-test@example.invalid');
create temp table context(key text primary key,value text);
grant all on context to authenticated;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'FAILED: %',label; end if; end $$;
create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
declare got text;
begin
  begin execute statement; exception when others then get stacked diagnostics got=returned_sqlstate; end;
  if got is distinct from expected then raise exception 'Expected %, got % for %',expected,got,statement; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
insert into context values('circle',public.care_create_circle('Security test circle','Test elder','Asia/Kolkata')::text);
insert into context values('helper-code',(public.care_invite((select value::uuid from context where key='circle'),'caregiver')->>'token'));
insert into context values('viewer-code',(public.care_invite((select value::uuid from context where key='circle'),'viewer')->>'token'));
insert into context values('dose',public.care_add_dose((select value::uuid from context where key='circle'),'Fictional dose','Existing prescription',now(),null)::text);
insert into context values('task',public.care_add_dose((select value::uuid from context where key='circle'),'Fictional check-in','Existing prescription',now(),null)::text);
select pg_temp.expect_error('select * from care_private.doses','42501');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
select pg_temp.check_true(public.care_join((select value from context where key='helper-code'),'Test helper') ? 'circle_id','helper joins');
select pg_temp.check_true(public.care_join((select value from context where key='helper-code'),'Test helper') ? 'error','invite cannot be replayed');
select public.care_report((select value::uuid from context where key='circle'),(select value::uuid from context where key='dose'),'uncertain','00000000-0000-4000-8000-000000000101');
select public.care_report((select value::uuid from context where key='circle'),(select value::uuid from context where key='dose'),'uncertain','00000000-0000-4000-8000-000000000101');
select public.care_report((select value::uuid from context where key='circle'),(select value::uuid from context where key='dose'),'taken','00000000-0000-4000-8000-000000000102');
select pg_temp.check_true((select count(*) from jsonb_array_elements(public.care_state((select value::uuid from context where key='circle'))->'events') e where e->>'kind'='dose')=2,'uncertainty retained, retry idempotent');
select pg_temp.expect_error(format('select public.care_report(%L,%L,%L,%L)',(select value from context where key='circle'),(select value from context where key='dose'),'skipped','00000000-0000-4000-8000-000000000103'),'23505');
select public.care_claim((select value::uuid from context where key='circle'),(select value::uuid from context where key='task'));
select pg_temp.expect_error(format('select public.care_claim(%L,%L)',(select value from context where key='circle'),(select value from context where key='task')),'23505');
select pg_temp.expect_error(format('select public.care_invite(%L,%L)',(select value from context where key='circle'),'viewer'),'42501');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000013","role":"authenticated"}',true);
select pg_temp.check_true(public.care_join((select value from context where key='viewer-code'),'Test viewer') ? 'circle_id','viewer joins');
select pg_temp.expect_error(format('select public.care_report(%L,%L,%L,%L)',(select value from context where key='circle'),(select value from context where key='task'),'taken','00000000-0000-4000-8000-000000000104'),'42501');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000014","role":"authenticated"}',true);
insert into context values('other-circle',public.care_create_circle('Other circle','Other elder','UTC')::text);
select pg_temp.expect_error(format('select public.care_state(%L)',(select value from context where key='circle')),'42501');
select pg_temp.expect_error(format('select public.care_report(%L,%L,%L,%L)',(select value from context where key='circle'),(select value from context where key='task'),'taken','00000000-0000-4000-8000-000000000105'),'42501');

select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000011","role":"authenticated"}',true);
select public.care_approve_brief((select value::uuid from context where key='circle'),(public.care_state((select value::uuid from context where key='circle'))->'circle'->>'revision')::bigint);
select public.care_question((select value::uuid from context where key='circle'),'Fictional review question');
select pg_temp.check_true(public.care_state((select value::uuid from context where key='circle'))->'circle'->>'approved_revision' is null,'new event invalidates brief');
select public.care_revoke_member((select value::uuid from context where key='circle'),'00000000-0000-4000-8000-000000000012');
select pg_temp.check_true((select e->>'owner_id' from jsonb_array_elements(public.care_state((select value::uuid from context where key='circle'))->'doses') e where e->>'id'=(select value from context where key='task')) is null,'revoked owner released');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000012","role":"authenticated"}',true);
select pg_temp.expect_error(format('select public.care_state(%L)',(select value from context where key='circle')),'42501');
select pg_temp.expect_error(format('select public.care_claim(%L,%L)',(select value from context where key='circle'),(select value from context where key='task')),'42501');
reset role;
select pg_temp.check_true(not has_function_privilege('anon','public.care_state(uuid)','EXECUTE'),'anonymous RPC execution denied');
rollback;
select 'PASS: access isolation, viewer restrictions, revocation, single-use invitations, idempotent reports, uncertainty history, single ownership, and brief approval invalidation. All synthetic fixtures rolled back.' as security_checks;

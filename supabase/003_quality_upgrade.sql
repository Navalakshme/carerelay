-- Additive migration. Existing circles, reports and questions are preserved.
begin;
alter table care_private.events add column occurred_at timestamptz;
alter table care_private.events add column corrects bigint references care_private.events(id);
alter table care_private.invitations add column recipient_email text;
alter table care_private.doses add column backup_to uuid references auth.users(id);
alter table care_private.doses add column escalated_at timestamptz;
alter table care_private.doses add column cancelled_at timestamptz;
alter table care_private.doses add column plan_id uuid;

create table care_private.requests (
  actor_id uuid not null references auth.users(id), id uuid not null,
  action text not null, payload jsonb not null, result jsonb,
  created_at timestamptz not null default now(), primary key(actor_id,id)
);
create table care_private.plans (
  id uuid primary key default gen_random_uuid(), circle_id uuid not null references care_private.circles(id),
  label text not null check(length(label) between 1 and 100),
  instructions text not null check(length(instructions)<=400),
  first_at timestamptz not null, days integer not null check(days between 1 and 30),
  assigned_to uuid references auth.users(id), backup_to uuid references auth.users(id),
  replaces uuid references care_private.plans(id), status text not null default 'pending' check(status in ('pending','approved','rejected','replaced')),
  proposed_by uuid not null references auth.users(id), proposed_at timestamptz not null default now(),
  decided_by uuid references auth.users(id), decided_at timestamptz
);
alter table care_private.doses add foreign key(plan_id) references care_private.plans(id);
create table care_private.notifications (
  id uuid primary key default gen_random_uuid(), circle_id uuid not null references care_private.circles(id),
  dose_id uuid not null references care_private.doses(id), recipient_id uuid not null references auth.users(id),
  stage text not null check(stage in ('due','backup')), reason text not null,
  created_at timestamptz not null default now(), read_at timestamptz,
  unique(dose_id,recipient_id,stage)
);
create table care_private.briefs (
  id uuid primary key default gen_random_uuid(), circle_id uuid not null references care_private.circles(id),
  revision bigint not null, approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(), snapshot jsonb not null,
  unique(circle_id,revision)
);
create index questions_by_circle on care_private.questions(circle_id,created_at desc);
create index report_by_dose on care_private.events(dose_id,id desc) where kind in ('dose','correction');
create index requests_by_actor on care_private.requests(actor_id,created_at desc);
create index requests_expiry on care_private.requests(created_at);
create index plans_by_circle on care_private.plans(circle_id,proposed_at desc);
create index inbox_by_recipient on care_private.notifications(circle_id,recipient_id,created_at desc);
create index due_open on care_private.doses(scheduled_at) where status in ('pending','uncertain') and cancelled_at is null;
alter table care_private.requests enable row level security;
alter table care_private.plans enable row level security;
alter table care_private.notifications enable row level security;
alter table care_private.briefs enable row level security;
revoke all on all tables in schema care_private from public,anon,authenticated;

-- Invites are bound to a confirmed sign-in email. Historic unused bearer codes
-- are invalidated; no account membership or care record is deleted.
update care_private.invitations set revoked_at=now() where redeemed_at is null and revoked_at is null;
create function public.care_invite_bound(p_circle uuid,p_role text,p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform care_private.require_role(p_circle,array['elder']);
  if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter the recipient email'; end if;
  result:=public.care_invite(p_circle,p_role);
  update care_private.invitations set recipient_email=lower(trim(p_email)) where id=(result->>'id')::uuid;
  return result;
end $$;
-- Preserve the original locking/rate-limit implementation behind a private name.
alter function public.care_join(text,text) rename to care_join_unbound;
alter function public.care_join_unbound(text,text) set schema care_private;
create function public.care_join(p_token text,p_display_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare recipient text; result jsonb; cid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select recipient_email,circle_id into recipient,cid from care_private.invitations
    where token_hash=encode(sha256(convert_to(trim(p_token),'UTF8')),'hex');
  -- The inner routine counts invalid attempts, including a token which is not
  -- valid for this account, without leaking the intended recipient.
  if recipient is null or recipient<>lower(coalesce(auth.jwt()->>'email','')) then
    return care_private.care_join_unbound(repeat('0',64),p_display_name);
  end if;
  perform 1 from care_private.circles where id=cid for update;
  if (select count(*) from care_private.members where circle_id=cid and active)>=50 then return jsonb_build_object('error','This circle has reached its 50-person limit.'); end if;
  result:=care_private.care_join_unbound(p_token,p_display_name);
  return result;
end $$;
revoke execute on function public.care_invite(uuid,text) from authenticated;

create or replace function public.care_revoke_member(p_circle uuid,p_member uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  update care_private.members set active=false where circle_id=p_circle and user_id=p_member and role<>'elder' and active;
  if not found then raise exception 'Member cannot be removed'; end if;
  update care_private.doses set owner_id=case when owner_id=p_member then null else owner_id end,
    assigned_to=case when assigned_to=p_member then null else assigned_to end,
    backup_to=case when backup_to=p_member then null else backup_to end
    where circle_id=p_circle and status in ('pending','uncertain') and cancelled_at is null;
  update care_private.invitations set revoked_at=now() where circle_id=p_circle and redeemed_at is null and revoked_at is null;
  perform care_private.log_event(p_circle,actor,'membership','Member '||p_member||' removed. Open assignments released; unused invitations revoked. Completed records preserved.');
end $$;

-- Immutable correction events refer to the previous report. No ledger row is overwritten.
create function public.care_correct(p_circle uuid,p_dose uuid,p_outcome text,p_reason text,p_previous bigint,p_occurred timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid; d care_private.doses; latest bigint;
begin
  actor:=care_private.require_role(p_circle,array['elder','caregiver']);
  if p_outcome is null or p_outcome not in ('taken','skipped','uncertain') or length(trim(p_reason)) not between 5 and 400 then raise exception 'Choose an outcome and explain the correction'; end if;
  if p_occurred is null or p_occurred>now()+interval '5 minutes' or p_occurred<now()-interval '366 days' then raise exception 'Choose a valid reported time'; end if;
  select * into d from care_private.doses where id=p_dose and circle_id=p_circle and cancelled_at is null for update;
  if not found then raise exception 'Dose not found' using errcode='42501'; end if;
  select max(id) into latest from care_private.events where circle_id=p_circle and dose_id=p_dose and kind in ('dose','correction');
  if latest is null or latest<>p_previous then raise exception 'The report changed; review the latest record' using errcode='23505'; end if;
  update care_private.doses set status=p_outcome where id=p_dose;
  perform care_private.log_event(p_circle,actor,'correction',d.label||': corrected to '||p_outcome||'. Reason: '||trim(p_reason),p_dose,null,p_outcome);
  update care_private.events set occurred_at=p_occurred,corrects=p_previous where id=(select max(id) from care_private.events where circle_id=p_circle);
end $$;

create function public.care_propose(p_circle uuid,p_label text,p_instructions text,p_first timestamptz,p_days integer,p_assigned uuid,p_backup uuid,p_replaces uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid; pid uuid;
begin
  actor:=care_private.require_role(p_circle,array['elder','caregiver']);
  if p_first is null or p_first<now() or p_first>now()+interval '336 days' then raise exception 'Choose a future start within the next eleven months'; end if;
  if p_assigned is not null and not exists(select 1 from care_private.members where circle_id=p_circle and user_id=p_assigned and active and role='caregiver') then raise exception 'Choose an active primary helper'; end if;
  if p_backup is not null and (p_backup=p_assigned or not exists(select 1 from care_private.members where circle_id=p_circle and user_id=p_backup and active and role='caregiver')) then raise exception 'Choose a different active backup'; end if;
  if p_replaces is not null and not exists(select 1 from care_private.plans where id=p_replaces and circle_id=p_circle and status='approved') then raise exception 'The previous plan changed' using errcode='23505'; end if;
  if (select count(*) from care_private.plans where circle_id=p_circle and status='pending')>=20 then raise exception 'Review pending proposals first'; end if;
  insert into care_private.plans(circle_id,label,instructions,first_at,days,assigned_to,backup_to,replaces,proposed_by)
    values(p_circle,trim(p_label),trim(p_instructions),p_first,p_days,p_assigned,p_backup,p_replaces,actor) returning id into pid;
  perform care_private.log_event(p_circle,actor,'proposal','Prescription plan proposed: '||trim(p_label)||'. Awaiting elder approval.');
  return pid;
end $$;
create function public.care_decide_plan(p_circle uuid,p_plan uuid,p_approve boolean) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid; plan care_private.plans; zone text; n integer; scheduled timestamptz;
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  select * into plan from care_private.plans where id=p_plan and circle_id=p_circle and status='pending' for update;
  if not found then raise exception 'Proposal already decided' using errcode='23505'; end if;
  if p_approve then
    if plan.first_at<now() then raise exception 'Start time passed; reject and propose a future start'; end if;
    if plan.assigned_to is not null and not exists(select 1 from care_private.members where circle_id=p_circle and user_id=plan.assigned_to and active and role='caregiver') then raise exception 'Primary helper no longer active'; end if;
    if plan.backup_to is not null and not exists(select 1 from care_private.members where circle_id=p_circle and user_id=plan.backup_to and active and role='caregiver') then raise exception 'Backup no longer active'; end if;
    if plan.replaces is not null then
      update care_private.plans set status='replaced' where id=plan.replaces and circle_id=p_circle and status='approved';
      if not found then raise exception 'Previous plan changed' using errcode='23505'; end if;
      update care_private.doses set cancelled_at=now() where plan_id=plan.replaces and scheduled_at>=plan.first_at and status='pending';
    end if;
    select timezone into zone from care_private.circles where id=p_circle;
    for n in 0..plan.days-1 loop
      -- Add calendar days in the circle timezone, preserving local wall time at DST.
      scheduled:=((plan.first_at at time zone zone)+n*interval '1 day') at time zone zone;
      insert into care_private.doses(circle_id,label,instructions,scheduled_at,assigned_to,backup_to,created_by,plan_id)
        values(p_circle,plan.label,plan.instructions,scheduled,plan.assigned_to,plan.backup_to,actor,plan.id);
    end loop;
  end if;
  update care_private.plans set status=case when p_approve then 'approved' else 'rejected' end,decided_by=actor,decided_at=now() where id=p_plan;
  perform care_private.log_event(p_circle,actor,'plan',plan.label||case when p_approve then ': elder approved plan and scheduled occurrences.' else ': elder rejected proposal.' end);
end $$;

-- Durable, duplicate-safe in-app inbox. A database cron invokes this even while
-- browsers are closed. No acknowledgement is inferred from delivery.
create function care_private.tick(p_circle uuid,p_now timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare d care_private.doses; actor uuid; target uuid; inserted integer;
begin
  perform 1 from care_private.circles where id=p_circle for update;
  select user_id into actor from care_private.members where circle_id=p_circle and role='elder' and active;
  for d in select * from care_private.doses where circle_id=p_circle and status in ('pending','uncertain') and cancelled_at is null and scheduled_at<=p_now and scheduled_at>=p_now-interval '7 days' for update loop
    target:=coalesce(d.assigned_to,actor);
    if d.escalated_at is null and exists(select 1 from care_private.members where circle_id=p_circle and user_id=target and active) then
      insert into care_private.notifications(circle_id,dose_id,recipient_id,stage,reason)
        values(p_circle,d.id,target,'due','Scheduled check-in is due. Confirm the outcome with the person; a reminder is not proof of ingestion.') on conflict do nothing;
      get diagnostics inserted=row_count;
      if inserted>0 then perform care_private.log_event(p_circle,actor,'reminder','Due check-in placed in the assigned person''s in-app inbox.',d.id); end if;
    end if;
    if d.owner_id is null and d.backup_to is not null and d.escalated_at is null and d.scheduled_at+interval '15 minutes'<=p_now
      and exists(select 1 from care_private.members where circle_id=p_circle and user_id=d.backup_to and active and role='caregiver') then
      update care_private.doses set assigned_to=d.backup_to,escalated_at=p_now where id=d.id;
      insert into care_private.notifications(circle_id,dose_id,recipient_id,stage,reason)
        values(p_circle,d.id,d.backup_to,'backup','No helper acknowledged within 15 minutes. You are the designated backup.') on conflict do nothing;
      perform care_private.log_event(p_circle,actor,'relay','Unacknowledged check-in handed to the designated backup after 15 minutes.',d.id);
    end if;
  end loop;
end $$;
create function care_private.tick_all() returns void
language plpgsql security definer set search_path='' as $$
declare cid uuid;
begin
  for cid in select distinct circle_id from care_private.doses where status in ('pending','uncertain') and cancelled_at is null and scheduled_at between now()-interval '7 days' and now() loop
    perform care_private.tick(cid);
  end loop;
  delete from care_private.requests where created_at<now()-interval '7 days';
end $$;

create function public.care_state_v2(p_circle uuid,p_revision bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; role_name text; rev bigint;
begin
  select role into role_name from care_private.members where circle_id=p_circle and user_id=auth.uid() and active;
  if role_name is null then raise exception 'Circle access denied' using errcode='42501'; end if;
  select revision into rev from care_private.circles where id=p_circle;
  if p_revision=rev then return jsonb_build_object('unchanged',true,'revision',rev); end if;
  result:=jsonb_build_object(
    'circle',(select to_jsonb(c) from care_private.circles c where id=p_circle),
    'members',(select coalesce(jsonb_agg(to_jsonb(m) order by role,display_name),'[]') from care_private.members m where circle_id=p_circle),
    'summary',(select jsonb_build_object('open',count(*) filter(where status in ('pending','uncertain')),'completed',count(*) filter(where status in ('taken','skipped'))) from care_private.doses where circle_id=p_circle and cancelled_at is null and (scheduled_at at time zone (select timezone from care_private.circles where id=p_circle))::date=(now() at time zone (select timezone from care_private.circles where id=p_circle))::date),
    'doses','[]'::jsonb,'events','[]'::jsonb,'questions','[]'::jsonb,'plans','[]'::jsonb,'invitations','[]'::jsonb,'notifications','[]'::jsonb,'approval',null);
  -- Viewers receive counts and participant names only, never medication details,
  -- private notes, source events or the clinician-facing brief.
  if role_name='viewer' then return result; end if;
  return result||jsonb_build_object(
    'doses',(select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('latest_report_id',(select max(e.id) from care_private.events e where e.dose_id=d.id and e.kind in ('dose','correction'))) order by scheduled_at,id),'[]') from (select * from care_private.doses where circle_id=p_circle and scheduled_at between now()-interval '7 days' and now()+interval '31 days' order by scheduled_at,id limit 300) d),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id desc),'[]') from (select * from care_private.events where circle_id=p_circle order by id desc limit 50) e),
    'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc),'[]') from (select * from care_private.questions where circle_id=p_circle order by created_at desc limit 100) q),
    'plans',(select coalesce(jsonb_agg(to_jsonb(p) order by proposed_at desc),'[]') from (select * from care_private.plans where circle_id=p_circle order by proposed_at desc limit 100) p),
    'notifications',(select coalesce(jsonb_agg(to_jsonb(n) order by created_at desc),'[]') from (select * from care_private.notifications where circle_id=p_circle and recipient_id=auth.uid() order by created_at desc limit 50) n),
    'approval',(select jsonb_build_object('id',id,'revision',revision,'approved_at',approved_at,'approved_by',approved_by) from care_private.briefs where circle_id=p_circle and revision=rev),
    'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'recipient_email',i.recipient_email,'expires_at',i.expires_at,'redeemed_at',i.redeemed_at,'revoked_at',i.revoked_at)),'[]') from care_private.invitations i where circle_id=p_circle and role_name='elder' and expires_at>now()-interval '1 day')
  );
end $$;
-- Close the legacy full-state viewer route too.
create or replace function public.care_state(p_circle uuid) returns jsonb language sql security definer set search_path='' as $$ select public.care_state_v2(p_circle,null); $$;

create function public.care_history(p_circle uuid,p_before bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from care_private.members where circle_id=p_circle and user_id=auth.uid() and active and role in ('elder','caregiver')) then raise exception 'History access denied' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by id desc),'[]') from (select * from care_private.events where circle_id=p_circle and (p_before is null or id<p_before) order by id desc limit 50) e);
end $$;
create function public.care_export(p_circle uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; result jsonb;
begin
  actor:=care_private.require_role(p_circle,array['elder','caregiver']);
  select to_jsonb(b) into result from care_private.briefs b join care_private.circles c on c.id=b.circle_id and c.revision=b.revision and c.approved_revision=b.revision where b.circle_id=p_circle;
  if result is null then raise exception 'The elder must approve the current brief' using errcode='23505'; end if;
  return result;
end $$;
create or replace function public.care_approve_brief(p_circle uuid,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  if not exists(select 1 from care_private.circles where id=p_circle and revision=p_revision) then raise exception 'Records changed; review the updated brief first' using errcode='23505'; end if;
  insert into care_private.briefs(circle_id,revision,approved_by,snapshot) values(p_circle,p_revision,actor,public.care_state_v2(p_circle,null)-'members'-'invitations'-'notifications'-'summary'-'plans'-'approval') on conflict(circle_id,revision) do nothing;
  update care_private.circles set approved_revision=revision where id=p_circle;
end $$;

-- All browser mutations use an account-scoped idempotency key. Payload changes
-- under the same key fail closed. Circle access is rechecked before replay.
create function public.care_mutate(p_request uuid,p_action text,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old care_private.requests; result jsonb:='null'; cid uuid; key_circle uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_request is null or p_action is null or p_body is null or pg_column_size(p_body)>8192 then raise exception 'Invalid request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if p_action not in ('create-circle','join') then
    cid:=(p_body->>'circle')::uuid;
    perform care_private.require_role(cid,array['elder','caregiver','viewer']);
  end if;
  select * into old from care_private.requests where actor_id=actor and id=p_request;
  if found then
    if old.action<>p_action or old.payload<>jsonb_build_object('hash',encode(sha256(convert_to(p_body::text,'UTF8')),'hex')) then raise exception 'Request identifier already used' using errcode='23505'; end if;
    if p_action in ('create-circle','join') then
      key_circle:=case when p_action='create-circle' then (old.result#>>'{}')::uuid else (old.result->>'circle_id')::uuid end;
      if key_circle is not null then perform care_private.require_role(key_circle,array['elder','caregiver','viewer']); end if;
    end if;
    if p_action='invite' then raise exception 'Invitation already created. Review unused invitations before creating another.' using errcode='23505'; end if;
    return old.result;
  end if;
  if (select count(*) from care_private.requests where actor_id=actor and created_at>now()-interval '1 minute')>=90 then raise exception 'Too many updates. Wait a minute and try again.'; end if;
  if p_action in ('report','claim','correct') and exists(select 1 from care_private.doses where id=(p_body->>'dose')::uuid and circle_id=cid and cancelled_at is not null) then raise exception 'This occurrence was cancelled'; end if;
  if p_action='report' and ((p_body->>'occurred')::timestamptz>now()+interval '5 minutes' or (p_body->>'occurred')::timestamptz<now()-interval '366 days') then raise exception 'Choose a valid reported time'; end if;
  case p_action
    when 'create-circle' then result:=to_jsonb(public.care_create_circle(p_body->>'name',p_body->>'displayName',p_body->>'timezone'));
    when 'join' then result:=public.care_join(p_body->>'token',p_body->>'displayName');
    when 'invite' then result:=public.care_invite_bound(cid,p_body->>'role',p_body->>'email');
    when 'revoke-member' then perform public.care_revoke_member(cid,(p_body->>'member')::uuid);
    when 'revoke-invitation' then perform public.care_revoke_invitation(cid,(p_body->>'invitation')::uuid);
    when 'add-dose' then result:=to_jsonb(public.care_add_dose(cid,p_body->>'label',coalesce(p_body->>'instructions',''),(p_body->>'scheduled')::timestamptz,nullif(p_body->>'assigned','')::uuid));
    when 'report' then
      perform public.care_report(cid,(p_body->>'dose')::uuid,p_body->>'outcome',p_request);
      update care_private.events set occurred_at=coalesce((p_body->>'occurred')::timestamptz,now()) where circle_id=cid and request_id=p_request;
    when 'correct' then perform public.care_correct(cid,(p_body->>'dose')::uuid,p_body->>'outcome',p_body->>'reason',(p_body->>'previous')::bigint,(p_body->>'occurred')::timestamptz);
    when 'claim' then perform public.care_claim(cid,(p_body->>'dose')::uuid);
    when 'question' then perform public.care_question(cid,p_body->>'body');
    when 'propose' then result:=to_jsonb(public.care_propose(cid,p_body->>'label',coalesce(p_body->>'instructions',''),(p_body->>'scheduled')::timestamptz,(p_body->>'days')::integer,nullif(p_body->>'assigned','')::uuid,nullif(p_body->>'backup','')::uuid,nullif(p_body->>'replaces','')::uuid));
    when 'decide-plan' then perform public.care_decide_plan(cid,(p_body->>'plan')::uuid,(p_body->>'approve')::boolean);
    when 'approve-brief' then perform public.care_approve_brief(cid,(p_body->>'revision')::bigint);
    when 'read-notification' then
      update care_private.notifications set read_at=coalesce(read_at,now()) where id=(p_body->>'notification')::uuid and circle_id=cid and recipient_id=actor;
      if not found then raise exception 'Notification access denied' using errcode='42501'; end if;
      update care_private.circles set revision=revision+1 where id=cid;
    else raise exception 'Unknown action';
  end case;
  if result ? 'error' then return result; end if;
  insert into care_private.requests(actor_id,id,action,payload,result) values(actor,p_request,p_action,jsonb_build_object('hash',encode(sha256(convert_to(p_body::text,'UTF8')),'hex')),case when p_action='invite' then result-'token' else result end);
  return result;
end $$;
revoke all on all functions in schema care_private from public,anon,authenticated;
revoke all on function public.care_invite_bound(uuid,text,text),public.care_join(text,text),public.care_correct(uuid,uuid,text,text,bigint,timestamptz),public.care_propose(uuid,text,text,timestamptz,integer,uuid,uuid,uuid),public.care_decide_plan(uuid,uuid,boolean),public.care_state_v2(uuid,bigint),public.care_history(uuid,bigint),public.care_export(uuid),public.care_mutate(uuid,text,jsonb) from public,anon;
grant execute on function public.care_join(text,text),public.care_state_v2(uuid,bigint),public.care_history(uuid,bigint),public.care_export(uuid),public.care_mutate(uuid,text,jsonb) to authenticated;
-- Mutating routines are only reachable through the validated idempotent gateway.
revoke execute on function public.care_create_circle(text,text,text),public.care_join(text,text),public.care_revoke_invitation(uuid,uuid),public.care_revoke_member(uuid,uuid),public.care_add_dose(uuid,text,text,timestamptz,uuid),public.care_report(uuid,uuid,text,uuid),public.care_claim(uuid,uuid),public.care_question(uuid,text),public.care_approve_brief(uuid,bigint) from authenticated;
commit;

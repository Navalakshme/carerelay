-- CareRelay milestone 1. Empty-project migration; execute once as project owner.
begin;
create schema if not exists care_private;
revoke all on schema care_private from public, anon, authenticated;

create table care_private.circles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  timezone text not null default 'Asia/Kolkata',
  revision bigint not null default 0,
  approved_revision bigint,
  created_at timestamptz not null default now()
);
create table care_private.members (
  circle_id uuid not null references care_private.circles(id),
  user_id uuid not null references auth.users(id),
  display_name text not null check (length(display_name) between 1 and 80),
  role text not null check (role in ('elder','caregiver','viewer')),
  active boolean not null default true,
  primary key (circle_id, user_id)
);
create unique index one_elder_per_circle on care_private.members(circle_id) where role='elder';
create index member_circles on care_private.members(user_id) where active;
create table care_private.invitations (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references care_private.circles(id),
  token_hash text not null unique,
  role text not null check (role in ('caregiver','viewer')),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id)
);
create table care_private.join_limits (
  user_id uuid primary key references auth.users(id),
  window_start timestamptz not null default now(),
  attempts integer not null default 0
);
create table care_private.doses (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references care_private.circles(id),
  label text not null check (length(label) between 1 and 100),
  instructions text not null default '' check (length(instructions)<=400),
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','uncertain','taken','skipped')),
  assigned_to uuid references auth.users(id),
  owner_id uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index doses_by_circle on care_private.doses(circle_id, scheduled_at);
create table care_private.events (
  id bigint generated always as identity primary key,
  circle_id uuid not null references care_private.circles(id),
  actor_id uuid not null references auth.users(id),
  kind text not null,
  detail text not null,
  dose_id uuid references care_private.doses(id),
  request_id uuid,
  outcome text,
  at timestamptz not null default now(),
  unique (circle_id, request_id)
);
create index events_by_circle on care_private.events(circle_id, id desc);
create table care_private.questions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references care_private.circles(id),
  body text not null check (length(body) between 1 and 400),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- Tables are not exposed through the Data API. Only explicitly granted RPCs
-- can reach them. RLS is a second boundary; there are no direct client policies.
alter table care_private.circles enable row level security;
alter table care_private.members enable row level security;
alter table care_private.invitations enable row level security;
alter table care_private.join_limits enable row level security;
alter table care_private.doses enable row level security;
alter table care_private.events enable row level security;
alter table care_private.questions enable row level security;
revoke all on all tables in schema care_private from public, anon, authenticated;
revoke all on all sequences in schema care_private from public, anon, authenticated;

create function care_private.require_role(p_circle uuid, p_roles text[])
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  -- A circle lock serializes reports, claims, and membership revocation.
  perform 1 from care_private.circles c where c.id=p_circle and exists (
    select 1 from care_private.members m where m.circle_id=c.id and m.user_id=actor and m.active
  ) for update;
  if not found then raise exception 'Circle access denied' using errcode='42501'; end if;
  if not exists(select 1 from care_private.members where circle_id=p_circle and user_id=actor and active and role=any(p_roles)) then
    raise exception 'This role cannot perform that action' using errcode='42501';
  end if;
  return actor;
end $$;
create function care_private.log_event(p_circle uuid,p_actor uuid,p_kind text,p_detail text,p_dose uuid default null,p_request uuid default null,p_outcome text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into care_private.events(circle_id,actor_id,kind,detail,dose_id,request_id,outcome)
    values(p_circle,p_actor,p_kind,p_detail,p_dose,p_request,p_outcome);
  update care_private.circles set revision=revision+1, approved_revision=null where id=p_circle;
end $$;

create function public.care_bootstrap() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'timezone',c.timezone,'role',m.role) order by c.created_at),'[]'::jsonb)
  from care_private.circles c join care_private.members m on m.circle_id=c.id
  where m.user_id=auth.uid() and m.active;
$$;
create function public.care_create_circle(p_name text,p_display_name text,p_timezone text default 'Asia/Kolkata') returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); cid uuid;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  -- Serialize creation by account to enforce the small-circle limit.
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  if (select count(*) from care_private.members where user_id=actor and role='elder')>=20 then raise exception 'Circle creation limit reached'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Unknown timezone'; end if;
  insert into care_private.circles(name,timezone) values(trim(p_name),p_timezone) returning id into cid;
  insert into care_private.members(circle_id,user_id,display_name,role) values(cid,actor,trim(p_display_name),'elder');
  perform care_private.log_event(cid,actor,'circle','Care circle created by its elder owner.');
  return cid;
end $$;
create function public.care_state(p_circle uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from care_private.members where circle_id=p_circle and user_id=auth.uid() and active) then
    raise exception 'Circle access denied' using errcode='42501';
  end if;
  return jsonb_build_object(
    'circle',(select to_jsonb(c) from care_private.circles c where id=p_circle),
    'members',(select coalesce(jsonb_agg(to_jsonb(m) order by role,display_name),'[]'::jsonb) from care_private.members m where circle_id=p_circle),
    'doses',(select coalesce(jsonb_agg(to_jsonb(d) order by scheduled_at,id),'[]'::jsonb) from care_private.doses d where circle_id=p_circle),
    'events',(select coalesce(jsonb_agg(to_jsonb(e) order by id desc),'[]'::jsonb) from (select * from care_private.events where circle_id=p_circle order by id desc limit 200) e),
    'questions',(select coalesce(jsonb_agg(to_jsonb(q) order by created_at),'[]'::jsonb) from care_private.questions q where circle_id=p_circle),
    'invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'expires_at',i.expires_at,'redeemed_at',i.redeemed_at,'revoked_at',i.revoked_at)),'[]'::jsonb)
      from care_private.invitations i where circle_id=p_circle and exists(select 1 from care_private.members where circle_id=p_circle and user_id=auth.uid() and active and role='elder'))
  );
end $$;
create function public.care_invite(p_circle uuid,p_role text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; token text; iid uuid; expires timestamptz:=now()+interval '24 hours';
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  if p_role not in ('caregiver','viewer') then raise exception 'Invalid invitation role'; end if;
  if (select count(*) from care_private.invitations where circle_id=p_circle and redeemed_at is null and revoked_at is null and expires_at>now())>=10 then raise exception 'Too many active invitations'; end if;
  token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  insert into care_private.invitations(circle_id,token_hash,role,expires_at,created_by)
    values(p_circle,encode(sha256(convert_to(token,'UTF8')),'hex'),p_role,expires,actor) returning id into iid;
  perform care_private.log_event(p_circle,actor,'invitation','An expiring '||p_role||' invitation was created.');
  return jsonb_build_object('id',iid,'token',token,'expires_at',expires);
end $$;
create function public.care_join(p_token text,p_display_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); inv care_private.invitations; lim care_private.join_limits;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if length(trim(p_display_name)) not between 1 and 80 then raise exception 'Enter your display name'; end if;
  insert into care_private.join_limits(user_id) values(actor) on conflict do nothing;
  select * into lim from care_private.join_limits where user_id=actor for update;
  if lim.window_start<now()-interval '1 hour' then update care_private.join_limits set window_start=now(),attempts=0 where user_id=actor; lim.attempts:=0; end if;
  if lim.attempts>=10 then return jsonb_build_object('error','Too many join attempts. Try again in an hour.'); end if;
  update care_private.join_limits set attempts=attempts+1 where user_id=actor;
  select * into inv from care_private.invitations where token_hash=encode(sha256(convert_to(trim(p_token),'UTF8')),'hex');
  if not found then return jsonb_build_object('error','Invitation invalid or expired.'); end if;
  perform 1 from care_private.circles where id=inv.circle_id for update;
  select * into inv from care_private.invitations where id=inv.id for update;
  if inv.redeemed_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then return jsonb_build_object('error','Invitation invalid or expired.'); end if;
  if exists(select 1 from care_private.members where circle_id=inv.circle_id and user_id=actor and active) then return jsonb_build_object('error','You already belong to this circle.'); end if;
  insert into care_private.members(circle_id,user_id,display_name,role) values(inv.circle_id,actor,trim(p_display_name),inv.role)
    on conflict(circle_id,user_id) do update set display_name=excluded.display_name,role=excluded.role,active=true;
  update care_private.invitations set redeemed_at=now() where id=inv.id;
  perform care_private.log_event(inv.circle_id,actor,'membership','Joined the care circle as '||inv.role||'.');
  return jsonb_build_object('circle_id',inv.circle_id);
end $$;
create function public.care_revoke_invitation(p_circle uuid,p_invitation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  update care_private.invitations set revoked_at=now() where id=p_invitation and circle_id=p_circle and redeemed_at is null and revoked_at is null;
  if not found then raise exception 'Invitation is no longer active'; end if;
  perform care_private.log_event(p_circle,actor,'invitation','An unused invitation was revoked.');
end $$;
create function public.care_revoke_member(p_circle uuid,p_member uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  update care_private.members set active=false where circle_id=p_circle and user_id=p_member and role<>'elder' and active;
  if not found then raise exception 'Member cannot be removed'; end if;
  update care_private.doses set owner_id=case when owner_id=p_member then null else owner_id end,assigned_to=case when assigned_to=p_member then null else assigned_to end
    where circle_id=p_circle and (owner_id=p_member or assigned_to=p_member);
  perform care_private.log_event(p_circle,actor,'membership','A member was removed; outstanding assignments were released.');
end $$;
create function public.care_add_dose(p_circle uuid,p_label text,p_instructions text,p_scheduled timestamptz,p_assigned uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid; did uuid;
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  if p_scheduled is null or p_scheduled<now()-interval '7 days' or p_scheduled>now()+interval '366 days' then raise exception 'Choose a date from the past week through the next year'; end if;
  if p_assigned is not null and not exists(select 1 from care_private.members where circle_id=p_circle and user_id=p_assigned and active and role='caregiver') then raise exception 'Assign an active caregiver'; end if;
  insert into care_private.doses(circle_id,label,instructions,scheduled_at,assigned_to,created_by)
    values(p_circle,trim(p_label),trim(p_instructions),p_scheduled,p_assigned,actor) returning id into did;
  perform care_private.log_event(p_circle,actor,'schedule','Scheduled occurrence added: '||trim(p_label),did);
  return did;
end $$;
create function public.care_report(p_circle uuid,p_dose uuid,p_outcome text,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid; d care_private.doses; previous care_private.events;
begin
  actor:=care_private.require_role(p_circle,array['elder','caregiver']);
  if p_outcome not in ('taken','skipped','uncertain') or p_outcome is null or p_request is null then raise exception 'Invalid dose report'; end if;
  select * into previous from care_private.events where circle_id=p_circle and request_id=p_request;
  if found then
    if previous.actor_id=actor and previous.dose_id=p_dose and previous.outcome=p_outcome then return; end if;
    raise exception 'Request identifier already used' using errcode='23505';
  end if;
  select * into d from care_private.doses where id=p_dose and circle_id=p_circle for update;
  if not found then raise exception 'Dose not found' using errcode='42501'; end if;
  if d.status in ('taken','skipped') or d.status=p_outcome then raise exception 'An outcome is already recorded; duplicate or conflicting report blocked' using errcode='23505'; end if;
  update care_private.doses set status=p_outcome where id=p_dose;
  perform care_private.log_event(p_circle,actor,'dose',d.label||': reported '||p_outcome,p_dose,p_request,p_outcome);
end $$;
create function public.care_claim(p_circle uuid,p_dose uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid; d care_private.doses;
begin
  actor:=care_private.require_role(p_circle,array['caregiver']);
  select * into d from care_private.doses where id=p_dose and circle_id=p_circle for update;
  if not found then raise exception 'Dose not found' using errcode='42501'; end if;
  if d.owner_id is not null or d.status in ('taken','skipped') then raise exception 'Task already owned or completed' using errcode='23505'; end if;
  if d.assigned_to is not null and d.assigned_to<>actor then raise exception 'Another helper is assigned' using errcode='42501'; end if;
  update care_private.doses set owner_id=actor where id=p_dose;
  perform care_private.log_event(p_circle,actor,'relay','Caregiver acknowledged ownership of '||d.label,p_dose);
end $$;
create function public.care_question(p_circle uuid,p_body text) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=care_private.require_role(p_circle,array['elder','caregiver']);
  insert into care_private.questions(circle_id,body,created_by) values(p_circle,trim(p_body),actor);
  perform care_private.log_event(p_circle,actor,'question','A question was added to the visit brief.');
end $$;
create function public.care_approve_brief(p_circle uuid,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  if not exists(select 1 from care_private.circles where id=p_circle and revision=p_revision) then raise exception 'Records changed; review the updated brief first' using errcode='23505'; end if;
  update care_private.circles set approved_revision=revision where id=p_circle;
end $$;
-- No anonymous execution, no direct table writes, no invitation hashes in reads.
revoke all on all functions in schema care_private from public, anon, authenticated;
revoke all on function public.care_bootstrap(), public.care_create_circle(text,text,text), public.care_state(uuid), public.care_invite(uuid,text), public.care_join(text,text), public.care_revoke_invitation(uuid,uuid), public.care_revoke_member(uuid,uuid), public.care_add_dose(uuid,text,text,timestamptz,uuid), public.care_report(uuid,uuid,text,uuid), public.care_claim(uuid,uuid), public.care_question(uuid,text), public.care_approve_brief(uuid,bigint) from public, anon;
grant execute on function public.care_bootstrap(), public.care_create_circle(text,text,text), public.care_state(uuid), public.care_invite(uuid,text), public.care_join(text,text), public.care_revoke_invitation(uuid,uuid), public.care_revoke_member(uuid,uuid), public.care_add_dose(uuid,text,text,timestamptz,uuid), public.care_report(uuid,uuid,text,uuid), public.care_claim(uuid,uuid), public.care_question(uuid,text), public.care_approve_brief(uuid,bigint) to authenticated;
commit;

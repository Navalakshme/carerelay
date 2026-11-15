-- Approval metadata must invalidate revision-based reads on other devices too.
begin;
update care_private.circles c set approved_revision=null,revision=revision+1
  where approved_revision is not null and not exists(
    select 1 from care_private.briefs b where b.circle_id=c.id and b.revision=c.approved_revision
  );
create or replace function public.care_approve_brief(p_circle uuid,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid; next_revision bigint;
begin
  actor:=care_private.require_role(p_circle,array['elder']);
  if not exists(select 1 from care_private.circles where id=p_circle and revision=p_revision) then
    raise exception 'Records changed; review the updated brief first' using errcode='23505';
  end if;
  update care_private.circles set revision=revision+1,approved_revision=revision+1 where id=p_circle returning revision into next_revision;
  insert into care_private.briefs(circle_id,revision,approved_by,snapshot)
    values(p_circle,next_revision,actor,public.care_state_v2(p_circle,null)-'members'-'invitations'-'notifications'-'summary'-'plans'-'approval');
end $$;
commit;

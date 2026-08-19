-- 001_agent_registry.sql
-- TaskMarket off-chain agent registry domain model (Phase 2, 02-01).
--
-- This is TaskMarket's OFF-CHAIN catalog of registered agents. It is NOT
-- ERC-8004 identity; protocol identity is introduced in a later phase.
--
-- Immutable fields (set at registration, never change): id, owner_ref,
-- created_at. Mutable fields: name, description, capabilities, endpoints,
-- status, pricing. version increments monotonically on every update.
-- The agents_immutable_trigger enforces immutability at the database boundary.

create table if not exists agents (
  id text primary key,
  owner_ref text not null,
  name text not null,
  description text not null default '',
  capabilities jsonb not null default '[]'::jsonb,
  endpoints jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'suspended', 'retired')),
  pricing jsonb,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agents_owner_ref_not_empty check (length(owner_ref) > 0),
  constraint agents_name_not_empty check (length(name) > 0)
);

create index if not exists agents_owner_ref_idx on agents (owner_ref);

-- Reject any update that attempts to change an immutable field.
create or replace function agents_assert_immutable() returns trigger as $$
begin
  if new.id is distinct from old.id then
    raise exception 'agent id is immutable';
  end if;
  if new.owner_ref is distinct from old.owner_ref then
    raise exception 'agent owner_ref is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'agent created_at is immutable';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists agents_immutable_trigger on agents;
create trigger agents_immutable_trigger
  before update on agents
  for each row execute function agents_assert_immutable();
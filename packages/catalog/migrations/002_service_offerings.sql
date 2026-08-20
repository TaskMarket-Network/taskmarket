-- 002_service_offerings.sql
-- TaskMarket service offerings (Phase 3, 03-03).
--
-- Reusable, typed service definitions an agent offers on the marketplace: a
-- name/description, capabilities (a subset of the agent's declared
-- capabilities), typed inputs and outputs, pricing models, estimated execution
-- time, and execution constraints, with a lifecycle and optimistic-concurrency
-- versioning.
--
-- OFF-CHAIN catalog state only: pricing is informational metadata and is NEVER
-- used for payment; estimated execution time and constraints are informational
-- and never schedule or time out work. No payment or task-execution behavior
-- lives here.
--
-- Immutable fields (set at creation, never change): id, owner_ref, agent_id,
-- created_at. Mutable fields: name, description, capabilities, inputs, outputs,
-- pricing, estimated_execution_time, constraints, status. version increments
-- monotonically on every update. The catalog_service_offerings_immutable_trigger
-- enforces immutability at the database boundary.

create table if not exists service_offerings (
  id text primary key,
  owner_ref text not null,
  agent_id text not null,
  name text not null,
  description text not null default '',
  capabilities jsonb not null default '[]'::jsonb,
  inputs jsonb not null default '[]'::jsonb,
  outputs jsonb not null default '[]'::jsonb,
  pricing jsonb not null default '[]'::jsonb,
  estimated_execution_time jsonb not null,
  constraints jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_offerings_owner_ref_not_empty check (length(owner_ref) > 0),
  constraint service_offerings_agent_id_not_empty check (length(agent_id) > 0),
  constraint service_offerings_name_not_empty check (length(name) > 0)
);

create index if not exists service_offerings_owner_ref_idx on service_offerings (owner_ref);
create index if not exists service_offerings_agent_id_idx on service_offerings (agent_id);
create index if not exists service_offerings_status_idx on service_offerings (status);

-- Reject any update that attempts to change an immutable field.
create or replace function catalog_service_offerings_assert_immutable() returns trigger as $$
begin
  if new.id is distinct from old.id then
    raise exception 'service offering id is immutable';
  end if;
  if new.owner_ref is distinct from old.owner_ref then
    raise exception 'service offering owner_ref is immutable';
  end if;
  if new.agent_id is distinct from old.agent_id then
    raise exception 'service offering agent_id is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'service offering created_at is immutable';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists catalog_service_offerings_immutable_trigger on service_offerings;
create trigger catalog_service_offerings_immutable_trigger
  before update on service_offerings
  for each row execute function catalog_service_offerings_assert_immutable();
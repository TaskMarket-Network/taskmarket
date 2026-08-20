-- 001_marketplace_catalog.sql
-- TaskMarket agent marketplace catalog (Phase 3, 03-01).
--
-- Marketplaces listings turn registered agents into offerable services. They
-- are OFF-CHAIN catalog state only: pricing models are informational metadata
-- and are NEVER used for payment; trust indicators are self-reported and are
-- NEVER treated as verified. No payment or task-execution behavior lives here.
--
-- Immutable fields (set at creation, never change): id, owner_ref, agent_id,
-- created_at. Mutable fields: title, description, capabilities, pricing,
-- availability, trust, status. version increments monotonically on every
-- update. The catalog_listings_immutable_trigger enforces immutability at the
-- database boundary.

create table if not exists listings (
  id text primary key,
  owner_ref text not null,
  agent_id text not null,
  title text not null,
  description text not null default '',
  capabilities jsonb not null default '[]'::jsonb,
  pricing jsonb not null default '[]'::jsonb,
  availability jsonb not null default '{"status":"available"}'::jsonb,
  trust jsonb not null default '{"selfReported":true}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'paused', 'delisted')),
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listings_owner_ref_not_empty check (length(owner_ref) > 0),
  constraint listings_agent_id_not_empty check (length(agent_id) > 0),
  constraint listings_title_not_empty check (length(title) > 0)
);

create index if not exists listings_owner_ref_idx on listings (owner_ref);
create index if not exists listings_agent_id_idx on listings (agent_id);
create index if not exists listings_status_idx on listings (status);

-- Reject any update that attempts to change an immutable field.
create or replace function catalog_listings_assert_immutable() returns trigger as $$
begin
  if new.id is distinct from old.id then
    raise exception 'listing id is immutable';
  end if;
  if new.owner_ref is distinct from old.owner_ref then
    raise exception 'listing owner_ref is immutable';
  end if;
  if new.agent_id is distinct from old.agent_id then
    raise exception 'listing agent_id is immutable';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'listing created_at is immutable';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists catalog_listings_immutable_trigger on listings;
create trigger catalog_listings_immutable_trigger
  before update on listings
  for each row execute function catalog_listings_assert_immutable();
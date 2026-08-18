create extension if not exists pgcrypto;

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_token_hash text not null,
  expires_at timestamptz not null,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.pairing_codes (
  code_hash text primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);
create table public.session_members (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  member_token_hash text not null unique,
  device_name text not null check (char_length(device_name) between 1 and 64),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create table public.receive_links (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  slug_hash text not null unique,
  expires_at timestamptz not null,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.transfer_metadata (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  sender_member_id uuid references public.session_members(id) on delete set null,
  filename text not null check (char_length(filename) between 1 and 255),
  byte_size bigint not null check (byte_size >= 0),
  mime_type text not null,
  status text not null check (status in ('offered','accepted','declined','complete','failed','cancelled')),
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.session_members enable row level security;
alter table public.receive_links enable row level security;
alter table public.transfer_metadata enable row level security;

-- No direct anonymous table access: privileged, rate-limited server functions should mediate tokens.
revoke all on public.sessions, public.pairing_codes, public.session_members, public.receive_links, public.transfer_metadata from anon, authenticated;
create index sessions_expires_at_idx on public.sessions(expires_at);
create index pairing_codes_session_idx on public.pairing_codes(session_id);
create index session_members_session_idx on public.session_members(session_id);
create index transfer_metadata_session_created_idx on public.transfer_metadata(session_id, created_at desc);

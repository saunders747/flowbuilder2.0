create table if not exists public.app_records (
  entity text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity, id)
);

create index if not exists app_records_entity_idx
  on public.app_records (entity);

create or replace function public.set_app_records_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_records_updated_at on public.app_records;

create trigger app_records_updated_at
before update on public.app_records
for each row execute procedure public.set_app_records_updated_at();


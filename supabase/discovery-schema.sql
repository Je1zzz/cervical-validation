begin;
create table if not exists public.cv_discovery_cases (
  id uuid primary key,
  payload jsonb not null check (jsonb_typeof(payload)='object')
);
create table if not exists public.cv_discovery_reviews (
  case_id uuid not null references public.cv_discovery_cases(id),
  reviewer_id uuid not null,
  reviewer_name text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(case_id,reviewer_id)
);
create index if not exists cv_discovery_reviews_reviewer_idx on public.cv_discovery_reviews(reviewer_id);
create table if not exists public.cv_discovery_review_history (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cv_discovery_cases(id),
  reviewer_id uuid not null,
  payload jsonb not null,
  saved_at timestamptz not null default now()
);
alter table public.cv_discovery_cases enable row level security;
alter table public.cv_discovery_reviews enable row level security;
alter table public.cv_discovery_review_history enable row level security;
revoke all on public.cv_discovery_cases, public.cv_discovery_reviews, public.cv_discovery_review_history from public, anon, authenticated;
grant select,insert,update,delete on public.cv_discovery_cases, public.cv_discovery_reviews, public.cv_discovery_review_history to service_role;
grant usage,select on sequence public.cv_discovery_review_history_id_seq to service_role;
-- Only the access-code-protected Edge Function may call this atomic save operation.
create or replace function public.cv_discovery_save_review(review jsonb)
returns timestamptz language plpgsql security invoker set search_path = '' as $$
declare saved timestamptz := now();
begin
  insert into public.cv_discovery_reviews(case_id,reviewer_id,reviewer_name,payload,updated_at)
  values((review->>'caseId')::uuid,(review->>'reviewerId')::uuid,review->>'reviewerName',review,saved)
  on conflict(case_id,reviewer_id) do update set
    reviewer_name=excluded.reviewer_name,payload=excluded.payload,updated_at=excluded.updated_at;
  insert into public.cv_discovery_review_history(case_id,reviewer_id,payload,saved_at)
  values((review->>'caseId')::uuid,(review->>'reviewerId')::uuid,review,saved);
  return saved;
end;
$$;
revoke all on function public.cv_discovery_save_review(jsonb) from public, anon, authenticated;
grant execute on function public.cv_discovery_save_review(jsonb) to service_role;

commit;

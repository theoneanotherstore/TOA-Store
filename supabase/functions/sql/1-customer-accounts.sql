-- Customer accounts for the shop. Run once in Supabase SQL Editor (safe to re-run).
-- Shop visitors sign up with Supabase Auth; each sign-up becomes a row in customer_accounts,
-- which the admin Customers screen reads. Customers never get a `profiles` row, so they cannot enter the admin.

create table if not exists public.customer_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.customer_accounts enable row level security;

-- a customer can read and edit only their own row; any staff member (anyone with a profiles row) can read all
drop policy if exists "Customers read own account" on public.customer_accounts;
create policy "Customers read own account" on public.customer_accounts
  for select to authenticated using (id = auth.uid());

drop policy if exists "Staff read all accounts" on public.customer_accounts;
create policy "Staff read all accounts" on public.customer_accounts
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

drop policy if exists "Customers update own account" on public.customer_accounts;
create policy "Customers update own account" on public.customer_accounts
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

revoke all on public.customer_accounts from anon, authenticated;
grant select on public.customer_accounts to authenticated;
grant update (name) on public.customer_accounts to authenticated;

-- every shop sign-up (flagged account_type = customer) creates the row automatically
create or replace function public.handle_customer_signup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.raw_user_meta_data->>'account_type', '') = 'customer' then
    insert into public.customer_accounts (id, name, email, phone)
    values (new.id,
            left(nullif(trim(new.raw_user_meta_data->>'name'), ''), 100),
            new.email,
            left(nullif(trim(new.raw_user_meta_data->>'phone'), ''), 30))
    on conflict (id) do nothing;
  end if;
  return new;
exception when others then
  return new;   -- never block a sign-up
end $$;

drop trigger if exists on_customer_signup on auth.users;
create trigger on_customer_signup after insert on auth.users
  for each row execute function public.handle_customer_signup();

-- ---------------------------------------------------------------------------------------------
-- SAFETY CHECK (run this and read the result): customers are "authenticated" users too.
-- Any policy below that lets `authenticated` read or change shop data WITHOUT checking the
-- profiles table would also let customers do it. Each row listed here needs a staff check added.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename <> 'customer_accounts'
  and 'authenticated' = any (roles)
  and cmd in ('ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE')
  and coalesce(qual, '') || coalesce(with_check, '') not ilike '%profiles%'
order by tablename, policyname;

-- Run once in Supabase SQL Editor. Safe to re-run.

-- 1. Pending Razorpay payments (the admin "Paid online, no order created" dialog reads this table)
create table if not exists public.razorpay_pending (
  rzp_order_id text primary key,
  amount       integer not null,                 -- paise
  customer     jsonb   not null,
  items        jsonb   not null,
  status       text    not null default 'created' check (status in ('created','processing','done','error','refunded')),
  payment_id   text,
  order_number text,
  error        text,
  created_at   timestamptz not null default now()
);
alter table public.razorpay_pending enable row level security;
-- No anon access. Edge Functions use the service role (bypasses RLS). Admin team can read/update.
drop policy if exists "Team reads razorpay_pending" on public.razorpay_pending;
create policy "Team reads razorpay_pending" on public.razorpay_pending for select to authenticated using (true);
drop policy if exists "Team updates razorpay_pending" on public.razorpay_pending;
create policy "Team updates razorpay_pending" on public.razorpay_pending for update to authenticated using (true) with check (true);
grant select, update on public.razorpay_pending to authenticated;

-- 2. Columns the admin already reads on orders
alter table public.orders add column if not exists razorpay_payment_id text;
alter table public.orders add column if not exists razorpay_order_id   text;
create unique index if not exists orders_razorpay_payment_uq on public.orders(razorpay_payment_id) where razorpay_payment_id is not null;

-- Needed by the new wa-otp (per-IP limit). Run once in Supabase SQL Editor, BEFORE deploying wa-otp. Safe to re-run.
alter table public.wa_otps add column if not exists ip text;
create index if not exists wa_otps_ip_idx on public.wa_otps (ip, created_at desc);

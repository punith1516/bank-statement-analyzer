-- PhonePe Statement Analyzer - DB Schema (Adobe Extract API version)
-- Run this in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time text,
  datetime timestamp not null,
  description text,
  counterparty text,
  narration text,
  transaction_type text not null check (transaction_type in ('Debit', 'Credit')),
  debit numeric not null default 0,
  credit numeric not null default 0,
  amount numeric not null,
  balance numeric,
  utr text,
  transaction_id text,
  account_mask text,
  source_file text,
  created_at timestamp not null default now(),
  unique(utr, date, amount)
);

create index if not exists idx_transactions_datetime on public.transactions(datetime);
create index if not exists idx_transactions_date on public.transactions(date);
create index if not exists idx_transactions_description on public.transactions(description);
create index if not exists idx_transactions_source_file on public.transactions(source_file);

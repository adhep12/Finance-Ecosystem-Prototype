-- Run this once in your Supabase SQL editor.
-- Creates the financial_documents table and storage bucket policy.

-- 1. Table
create table if not exists financial_documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       text not null,
  display_name text not null,
  file_type    text,
  doc_type     text,
  month        text,
  year         integer,
  file_size    text,
  uploaded_at  date default current_date,
  file_url     text,
  storage_path text,
  created_at   timestamp with time zone default now()
);

-- 2. RLS — open policies (no auth yet; tighten when auth is added)
alter table financial_documents enable row level security;

drop policy if exists "financial_documents_all" on financial_documents;
create policy "financial_documents_all"
  on financial_documents for all
  using (true) with check (true);

-- 3. Storage bucket (run via Supabase dashboard Storage tab OR via SQL below)
-- In the Dashboard: Storage → New bucket → name "financial-documents" → Public ✓
-- OR via SQL (requires pg_storage extension):
-- select storage.create_bucket('financial-documents', '{"public": true}');

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  name text not null,
  role text not null check (role in ('boss', 'editor', 'viewer')),
  sale_phu_trach text,
  active boolean not null default true,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "authenticated can read user profiles" on public.user_profiles;
create policy "authenticated can read user profiles"
on public.user_profiles for select
to authenticated
using (true);

drop policy if exists "users can read own profile" on public.user_profiles;
create policy "users can read own profile"
on public.user_profiles for select
to anon
using (false);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_profiles_set_updated_at on public.user_profiles;
create trigger user_profiles_set_updated_at
before update on public.user_profiles
for each row execute function public.set_updated_at();

-- Sau khi tạo Auth users trong Supabase, chạy các lệnh insert dạng này.
-- App quy đổi username "sep" thành email "sep@route-planner-dms.local".
-- Thay ID bên dưới bằng id thật trong Authentication > Users.
/*
insert into public.user_profiles (id, username, name, role, active, description)
values
  ('00000000-0000-0000-0000-000000000001', 'sep', 'Sếp', 'boss', true, 'Toàn quyền: xem báo cáo, import/export, chỉnh cấu hình, cụm, phân vùng và user.'),
  ('00000000-0000-0000-0000-000000000002', 'sua', 'Người sửa', 'editor', true, 'Được sửa vận hành: import, cập nhật thực hiện, chỉnh tuyến/cụm/phân vùng.'),
  ('00000000-0000-0000-0000-000000000003', 'xem', 'Người xem', 'viewer', true, 'Chỉ xem dashboard, planner, bản đồ và báo cáo; không được chỉnh dữ liệu.')
on conflict (id) do update set
  username = excluded.username,
  name = excluded.name,
  role = excluded.role,
  active = excluded.active,
  description = excluded.description;
*/

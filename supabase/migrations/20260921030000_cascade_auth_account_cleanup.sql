-- The legacy remote schema created these relations without delete actions.
-- Keep the canonical account-cleanup contract when an Auth user is removed.
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add constraint profiles_id_fkey
  foreign key (id) references auth.users(id) on delete cascade;

alter table public.workout_sessions drop constraint if exists workout_sessions_user_id_fkey;
alter table public.workout_sessions
  add constraint workout_sessions_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

alter table public.bodyweight_logs drop constraint if exists bodyweight_logs_user_id_fkey;
alter table public.bodyweight_logs
  add constraint bodyweight_logs_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete cascade;

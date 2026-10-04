-- Legacy seed. Sorts before the canonical migration, so the exercises table does not
-- exist on an empty database; there this is a no-op and the catalogue is seeded by
-- 20260922000000_catalog_slugs_and_metrics_integrity.sql instead.
do $guard$
begin
  if to_regclass('public.exercises') is null then
    return;
  end if;
  alter table public.exercises add column if not exists description text;
  alter table public.exercises alter column id set default gen_random_uuid()::text;
  create unique index if not exists exercises_name_key on public.exercises (name);

  INSERT INTO public.exercises (name, muscle_group, description)
  VALUES
    -- Chest
    ('Barbell Bench Press', 'Chest', 'A compound pushing movement using a barbell.'),
    ('Incline Dumbbell Press', 'Chest', 'Upper chest focused pressing movement.'),
    ('Chest Fly', 'Chest', 'Isolation movement for the pectorals.'),
    ('Push-up', 'Chest', 'Bodyweight compound movement.'),
    
    -- Back
    ('Barbell Deadlift', 'Back', 'A full body compound hinge movement.'),
    ('Pull-up', 'Back', 'Bodyweight vertical pulling movement.'),
    ('Lat Pulldown', 'Back', 'Cable based vertical pull.'),
    ('Seated Cable Row', 'Back', 'Horizontal pulling movement for mid-back.'),
    ('Barbell Row', 'Back', 'Heavy horizontal pulling movement.'),
    
    -- Shoulders
    ('Overhead Press', 'Shoulders', 'Compound vertical pushing movement.'),
    ('Lateral Raise', 'Shoulders', 'Isolation movement for lateral deltoids.'),
    ('Reverse Fly', 'Shoulders', 'Isolation movement for rear deltoids.'),
    
    -- Arms
    ('Bicep Curl', 'Arms', 'Isolation movement for biceps.'),
    ('Hammer Curl', 'Arms', 'Brachialis focused curl.'),
    ('Tricep Pushdown', 'Arms', 'Cable isolation for triceps.'),
    ('Overhead Tricep Extension', 'Arms', 'Long-head focused tricep isolation.'),
    
    -- Legs
    ('Barbell Squat', 'Legs', 'Primary compound movement for the lower body.'),
    ('Leg Press', 'Legs', 'Machine based compound leg movement.'),
    ('Romanian Deadlift', 'Legs', 'Hamstring and glute focused hinge.'),
    ('Leg Extension', 'Legs', 'Isolation movement for quads.'),
    ('Leg Curl', 'Legs', 'Isolation movement for hamstrings.'),
    ('Standing Calf Raise', 'Legs', 'Isolation for calves.'),
    ('Bulgarian Split Squat', 'Legs', 'Unilateral leg movement.'),
    
    -- Core
    ('Crunch', 'Core', 'Basic abdominal isolation.'),
    ('Plank', 'Core', 'Isometric core stability.'),
    ('Hanging Leg Raise', 'Core', 'Lower abdominal focused movement.')
  ON CONFLICT (name) DO NOTHING;
end
$guard$;

create table if not exists food_vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id text not null default 'john',
  name text not null,
  brand text null,
  serving_size text null,
  calories numeric null,
  protein_g numeric null,
  carbs_g numeric null,
  fat_g numeric null,
  package_quantity numeric default 1,
  current_quantity numeric default 0,
  low_stock_threshold numeric default 0,
  estimated_price numeric null,
  default_store text null,
  shopping_category text null,
  notes text null,
  is_favorite boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, brand, name, serving_size)
);

create table if not exists nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique default 'john',
  daily_calorie_target numeric null,
  daily_protein_target numeric null,
  daily_carb_target numeric null,
  daily_fat_target numeric null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

insert into food_vault_items (
  user_id, name, brand, serving_size, calories, protein_g, carbs_g, fat_g,
  package_quantity, current_quantity, low_stock_threshold, estimated_price,
  default_store, shopping_category, notes, is_favorite
)
values
  ('john', 'M&M YoCrunch Yogurt', 'YoCrunch', '1 yogurt cup', 180, 5, 31, 4, 4, 1, 1, 7.99, null, 'Dairy', 'Package of 4. Current quantity reflects 1 remaining after today.', true),
  ('john', 'Core Power 42g Protein Shake', 'Fairlife', '1 bottle', 230, 42, 8, 3.5, 1, 6, 3, 3.99, null, 'Protein Drinks', '42g protein bottle. Sold individually.', true),
  ('john', 'Red Bull 8.4 oz', 'Red Bull', '8.4 oz can', 110, 1, 28, 0, 1, 0, 2, null, null, 'Energy Drinks', null, false),
  ('john', 'Red Bull 12 oz', 'Red Bull', '12 oz can', 160, 1, 40, 0, 1, 0, 2, null, null, 'Energy Drinks', null, false),
  ('john', 'Red Bull 16 oz', 'Red Bull', '16 oz can', 210, 2, 54, 0, 1, 0, 2, null, null, 'Energy Drinks', null, false),
  ('john', 'Red Bull 20 oz', 'Red Bull', '20 oz can', 270, 2, 69, 0, 1, 0, 2, null, null, 'Energy Drinks', null, false),
  ('john', 'Iced Coffee 12 oz', null, '12 oz', 120, 2, 20, 3, 1, 0, 0, null, null, 'Coffee', 'Default estimate; edit as needed.', false),
  ('john', 'Iced Coffee 16 oz', null, '16 oz', 160, 3, 27, 4, 1, 0, 0, null, null, 'Coffee', 'Default estimate; edit as needed.', false),
  ('john', 'Iced Coffee 20 oz', null, '20 oz', 200, 4, 34, 5, 1, 0, 0, null, null, 'Coffee', 'Default estimate; edit as needed.', false),
  ('john', 'C4 Powder', 'Cellucor', '1 scoop', 0, 0, 0, 0, 60, 30, 5, null, null, 'Supplements', 'Powder supplement. 150mg caffeine per serving. Tub contains 60 servings; user estimate is about 30 servings remaining.', false)
on conflict (user_id, brand, name, serving_size) do update set
  calories = excluded.calories,
  protein_g = excluded.protein_g,
  carbs_g = excluded.carbs_g,
  fat_g = excluded.fat_g,
  package_quantity = excluded.package_quantity,
  current_quantity = excluded.current_quantity,
  low_stock_threshold = excluded.low_stock_threshold,
  estimated_price = excluded.estimated_price,
  default_store = excluded.default_store,
  shopping_category = excluded.shopping_category,
  notes = excluded.notes,
  is_favorite = excluded.is_favorite,
  updated_at = now();

insert into nutrition_targets (
  user_id, daily_calorie_target, daily_protein_target, daily_carb_target, daily_fat_target
)
values ('john', null, null, null, null)
on conflict (user_id) do nothing;

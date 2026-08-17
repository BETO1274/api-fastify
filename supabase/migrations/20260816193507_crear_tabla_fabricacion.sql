-- Órdenes de fabricación ejecutadas
create table if not exists fabricacion (
  id serial primary key,
  receta_id integer not null references receta (id) on delete restrict,
  cantidad_producir numeric not null check (cantidad_producir > 0),
  fecha timestamptz not null default now()
);

create index if not exists fabricacion_receta_id_idx on fabricacion (receta_id);

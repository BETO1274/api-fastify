-- Ingredientes de una receta: relación N:M entre receta y articulo con cantidad necesaria
create table if not exists receta_ingrediente (
  id serial primary key,
  receta_id integer not null references receta (id) on delete cascade,
  articulo_id integer not null references articulo (id) on delete restrict,
  cantidad_necesaria numeric not null check (cantidad_necesaria > 0)
);

create index if not exists receta_ingrediente_receta_id_idx on receta_ingrediente (receta_id);

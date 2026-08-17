-- Fórmula de producción: qué artículo final se produce
create table if not exists receta (
  id serial primary key,
  producto_final_id integer not null references articulo (id) on delete restrict,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists receta_producto_final_id_idx on receta (producto_final_id);

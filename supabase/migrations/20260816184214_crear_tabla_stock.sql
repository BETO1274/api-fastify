-- Tabla de control de inventario, relacionada a un artículo del catálogo
create table if not exists stock (
  id serial primary key,
  articulo_id integer not null references articulo (id) on delete restrict,
  cantidad numeric not null default 0,
  ubicacion text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists stock_articulo_id_idx on stock (articulo_id);

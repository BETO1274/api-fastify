-- Tabla base del catálogo de artículos (materia prima y producto final)
create table if not exists articulo (
  id serial primary key,
  nombre text not null,
  tipo text not null check (tipo in ('materia_prima', 'producto_final')),
  unidad_medida text not null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

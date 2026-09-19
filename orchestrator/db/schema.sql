-- Estado de cada tarea del orchestrator, compartido entre el servidor HTTP
-- (que la crea) y el worker (que la procesa). Migración aditiva: solo crea.
create table if not exists orquestador_tarea (
  id uuid primary key,
  servicio text not null,
  metodo text not null,
  ruta text not null,
  body jsonb,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'completado', 'fallido')),
  resultado jsonb,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

create index if not exists orquestador_tarea_estado_idx on orquestador_tarea (estado);

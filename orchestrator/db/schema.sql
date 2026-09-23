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

-- El X-Trace-Id que llega del gateway (o el del cliente, si lo mandó). Se
-- guarda para que el worker lo reenvíe tal cual a las 3 APIs, a la Cache y al
-- Storage — nunca debe generarse uno nuevo después del borde (el gateway).
alter table orquestador_tarea add column if not exists trace_id text;

create index if not exists orquestador_tarea_estado_idx on orquestador_tarea (estado);

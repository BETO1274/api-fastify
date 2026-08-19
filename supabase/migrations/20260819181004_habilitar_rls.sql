-- Habilita Row Level Security en las 5 tablas. El backend se conecta con un rol
-- que tiene BYPASSRLS (rolbypassrls = true), así que esto no afecta a la API —
-- solo cierra el acceso público vía la API REST/Realtime de Supabase, que este
-- proyecto no utiliza (toda la lógica pasa por el backend Fastify).
alter table articulo enable row level security;
alter table stock enable row level security;
alter table receta enable row level security;
alter table receta_ingrediente enable row level security;
alter table fabricacion enable row level security;

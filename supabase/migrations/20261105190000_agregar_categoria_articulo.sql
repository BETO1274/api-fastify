-- Expand (patron Expand/Contract): columna nueva y opcional. La version
-- anterior de la API la ignora, por lo que el rollback es seguro (no hay
-- cambios destructivos ni NOT NULL sin default).
alter table articulo add column if not exists categoria text null;

# Database migrations

`schema.sql` is the immutable `001_initial_schema` baseline. Do not edit it after it has been applied; add a new migration named `NNN_description.sql` or `NNN_description.js` here for each schema change. JavaScript migrations export a default `{ id, description, up(connection) }` object, and `id` must match the filename version.

The initializer records each file's SHA-256 checksum in `schema_migrations`, rejects missing or changed migration definitions, and serializes startup using a MySQL advisory lock. Keep each SQL migration safe to retry if MySQL commits some DDL before a process failure.

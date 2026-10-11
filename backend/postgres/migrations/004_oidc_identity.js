export default {
  id: '004_oidc_identity',
  description: 'link local accounts to shared OIDC identities',

  async up(connection) {
    const column = await connection.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'oidc_subject'`
    );
    if (!column.rows.length) await connection.query('ALTER TABLE users ADD COLUMN oidc_subject TEXT');
    else if (column.rows[0].data_type !== 'text') throw new Error('users.oidc_subject exists with an unexpected type');

    const index = await connection.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'uq_users_oidc_subject'`
    );
    if (index.rows.length) {
      const definition = index.rows[0].indexdef.replace(/\s+/g, ' ').toLowerCase();
      if (!definition.includes('create unique index uq_users_oidc_subject on public.users using btree (oidc_subject)')
        || !definition.includes('where (oidc_subject is not null)')) {
        throw new Error('uq_users_oidc_subject exists with an unexpected definition');
      }
    } else {
      await connection.query('CREATE UNIQUE INDEX uq_users_oidc_subject ON users (oidc_subject) WHERE oidc_subject IS NOT NULL');
    }
  }
};

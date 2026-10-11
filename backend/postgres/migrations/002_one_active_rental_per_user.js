export default {
  id: '002_one_active_rental_per_user',
  description: 'enforce at most one active rental per user',

  async up(connection) {
    const duplicates = await connection.query(
      `SELECT user_id, COUNT(*) AS count FROM rental_orders
       WHERE status = 'renting' GROUP BY user_id HAVING COUNT(*) > 1 LIMIT 10`
    );
    if (duplicates.rows.length) {
      const users = duplicates.rows.map((row) => row.user_id).join(', ');
      throw new Error(`Resolve duplicate active rentals before migration; affected user IDs: ${users}`);
    }

    const existing = await connection.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = 'uniq_rental_orders_active_user'`
    );
    if (existing.rows.length) {
      const definition = existing.rows[0].indexdef.replace(/\s+/g, ' ').toLowerCase();
      if (!definition.includes('unique index uniq_rental_orders_active_user on public.rental_orders using btree (user_id)')
        || !definition.includes("where (status = 'renting'::text)")) {
        throw new Error('uniq_rental_orders_active_user exists with an unexpected definition');
      }
      return;
    }
    await connection.query(
      "CREATE UNIQUE INDEX uniq_rental_orders_active_user ON rental_orders (user_id) WHERE status = 'renting'"
    );
  }
};

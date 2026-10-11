const normalizeExpression = (value) => String(value || '')
  .replace(/`|_utf8mb4/gi, '')
  .replace(/\\/g, '')
  .replace(/\s+/g, '')
  .toLowerCase();

export default {
  id: '002_one_active_rental_per_user',
  description: 'enforce at most one active rental per user',

  async up(conn) {
    const changed = [];
    const [duplicates] = await conn.query(
      `SELECT user_id, COUNT(*) AS count FROM rental_orders
       WHERE status = 'renting' GROUP BY user_id HAVING COUNT(*) > 1 LIMIT 10`
    );
    if (duplicates.length) {
      const users = duplicates.map((row) => row.user_id).join(', ');
      throw new Error(`Resolve duplicate active rentals before migration; affected user IDs: ${users}`);
    }

    const [columns] = await conn.query(
      `SELECT EXTRA AS extra, GENERATION_EXPRESSION AS expression
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rental_orders' AND COLUMN_NAME = 'active_user_id'`
    );
    const expectedExpression = "(casewhen(status='renting')thenuser_idelsenullend)";
    if (columns.length) {
      if (!String(columns[0].extra).includes('VIRTUAL GENERATED')
        || normalizeExpression(columns[0].expression) !== expectedExpression) {
        throw new Error('rental_orders.active_user_id exists with an unexpected generated definition');
      }
    } else {
      await conn.query(`ALTER TABLE rental_orders
        ADD COLUMN active_user_id BIGINT GENERATED ALWAYS AS (
          CASE WHEN status = 'renting' THEN user_id ELSE NULL END
        ) VIRTUAL`);
      changed.push('rental_orders.active_user_id');
    }

    const [indexes] = await conn.query(
      `SELECT NON_UNIQUE AS non_unique, COLUMN_NAME AS column_name, SEQ_IN_INDEX AS position
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'rental_orders'
         AND INDEX_NAME = 'uniq_rental_orders_active_user'
       ORDER BY SEQ_IN_INDEX`
    );
    if (indexes.length) {
      if (indexes.length !== 1 || Number(indexes[0].non_unique) !== 0
        || indexes[0].column_name !== 'active_user_id' || Number(indexes[0].position) !== 1) {
        throw new Error('uniq_rental_orders_active_user exists with an unexpected definition');
      }
    } else {
      await conn.query('ALTER TABLE rental_orders ADD UNIQUE INDEX uniq_rental_orders_active_user (active_user_id)');
      changed.push('uniq_rental_orders_active_user');
    }

    return changed;
  }
};

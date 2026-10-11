const references = [
  { column: 'start_station_id', constraint: 'fk_orders_start_station' },
  { column: 'end_station_id', constraint: 'fk_orders_end_station' }
];

export default {
  id: '003_station_history_foreign_keys',
  description: 'protect station references in rental history',

  async up(connection) {
    for (const reference of references) {
      const orphanRows = await connection.query(
        `SELECT COUNT(*) AS count
         FROM rental_orders o
         LEFT JOIN stations s ON s.id = o.${reference.column}
         WHERE o.${reference.column} IS NOT NULL AND s.id IS NULL`
      );
      if (Number(orphanRows.rows[0]?.count || 0) > 0) {
        throw new Error(`Cannot add ${reference.constraint} for ${reference.column}: rental orders contain station references with no matching station`);
      }

      const existing = await connection.query(
        `SELECT c.confdeltype, a.attname AS column_name
         FROM pg_constraint c
         JOIN pg_class t ON t.oid = c.conrelid
         JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = c.conkey[1]
         WHERE c.conname = $1 AND t.relname = 'rental_orders'`,
        [reference.constraint]
      );
      if (existing.rows.length) {
        if (existing.rows.length !== 1 || existing.rows[0].column_name !== reference.column
          || !['r', 'a'].includes(existing.rows[0].confdeltype)) {
          throw new Error(`${reference.constraint} exists with an unexpected definition`);
        }
        continue;
      }
      await connection.query(
        `ALTER TABLE rental_orders ADD CONSTRAINT ${reference.constraint}
         FOREIGN KEY (${reference.column}) REFERENCES stations(id) ON DELETE RESTRICT`
      );
    }
  }
};

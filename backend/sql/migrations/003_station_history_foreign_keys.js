const stationReferences = [
  { column: 'start_station_id', constraint: 'fk_orders_start_station' },
  { column: 'end_station_id', constraint: 'fk_orders_end_station' },
];

export default {
  id: '003_station_history_foreign_keys',
  description: 'protect station references in rental history',

  async up(connection) {
    const changed = [];

    for (const reference of stationReferences) {
      const [orphanRows] = await connection.query(
        `SELECT COUNT(*) AS count
         FROM rental_orders o
         LEFT JOIN stations s ON s.id = o.${reference.column}
         WHERE o.${reference.column} IS NOT NULL AND s.id IS NULL`
      );
      if (Number(orphanRows[0]?.count || 0) > 0) {
        throw new Error(
          `Cannot add ${reference.constraint} for ${reference.column}: rental orders contain station references with no matching station`
        );
      }
    }

    const [foreignKeys] = await connection.query(
      `SELECT kcu.COLUMN_NAME AS column_name,
              kcu.REFERENCED_TABLE_NAME AS referenced_table,
              kcu.REFERENCED_COLUMN_NAME AS referenced_column,
              rc.DELETE_RULE AS delete_rule
       FROM information_schema.KEY_COLUMN_USAGE kcu
       JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.TABLE_NAME = kcu.TABLE_NAME
       WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
         AND kcu.TABLE_NAME = 'rental_orders'
         AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
         AND kcu.COLUMN_NAME IN ('start_station_id', 'end_station_id')`
    );

    for (const reference of stationReferences) {
      const existing = foreignKeys.filter((row) => row.column_name === reference.column);
      if (existing.length) {
        if (existing.length !== 1
          || existing[0].referenced_table !== 'stations'
          || existing[0].referenced_column !== 'id'
          || !['RESTRICT', 'NO ACTION'].includes(String(existing[0].delete_rule).toUpperCase())) {
          throw new Error(`${reference.column} has an unexpected foreign key definition`);
        }
        continue;
      }

      await connection.query(
        `ALTER TABLE rental_orders
         ADD CONSTRAINT ${reference.constraint}
         FOREIGN KEY (${reference.column}) REFERENCES stations(id) ON DELETE RESTRICT`
      );
      changed.push(reference.constraint);
    }

    return changed;
  }
};

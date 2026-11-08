export default {
  id: '006_user_teacher_roles',
  description: 'Add ordinary user and teacher roles for account and permission testing',
  async up(connection) {
    await connection.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role IN ('user', 'student', 'teacher', 'admin', 'staff'));
    `);
  }
};

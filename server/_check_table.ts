import sequelize from './config/database.js';
(async () => {
  const [cols]: any = await sequelize.query("SHOW COLUMNS FROM role_menus");
  console.log('role_menus columns:', JSON.stringify(cols.map((c: any) => c.Field)));
  const [tables]: any = await sequelize.query("SHOW TABLES LIKE 'role_menus'");
  console.log('table exists:', tables.length);
  await sequelize.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
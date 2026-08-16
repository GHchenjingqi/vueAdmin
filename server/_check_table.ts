import sequelize from './config/database.js';
(async () => {
  const [tables]: any = await sequelize.query("SHOW TABLES");
  console.log('All tables:', JSON.stringify(tables.map((t: any) => Object.values(t)[0])));
  await sequelize.close();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
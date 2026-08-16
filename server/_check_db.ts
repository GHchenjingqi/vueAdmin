import sequelize from './config/database.js';
(async () => {
  try {
    await sequelize.authenticate();
    const [tables] = await sequelize.query("SHOW TABLES");
    console.log('Tables:', JSON.stringify(tables.map((t: any) => Object.values(t)[0])));
    try {
      const [meta] = await sequelize.query("SELECT * FROM SequelizeMeta");
      console.log('SequelizeMeta entries:', JSON.stringify(meta.map((m: any) => m.name)));
    } catch { console.log('SequelizeMeta table does not exist'); }
    await sequelize.close();
  } catch (e: any) { console.error('Error:', e.message); }
})();
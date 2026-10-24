import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("UPDATE menus SET hidden=1 WHERE path='/server-monitor'")
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("UPDATE menus SET hidden=0 WHERE path='/server-monitor'")
}

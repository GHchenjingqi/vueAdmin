/**
 * 数据库迁移 CLI
 *
 * 用法:
 *   tsx scripts/migrate.ts up        # 执行所有待迁移
 *   tsx scripts/migrate.ts down      # 回滚最近一次迁移
 *   tsx scripts/migrate.ts seed      # 写入种子数据
 *   tsx scripts/migrate.ts reset     # 完全重置数据库（回滚所有 → 重新执行所有迁移 → 写入种子）
 *   tsx scripts/migrate.ts status    # 查看迁移状态
 */
import { migrator, seeder } from '../utils/migrator.js'
import { ensureDatabaseExists } from '../utils/ensureDatabase.js'
import sequelize from '../config/database.js'

const command = process.argv[2]

async function main() {
  await ensureDatabaseExists()
  await sequelize.authenticate()
  switch (command) {
    case 'up':
      await migrator.up()
      console.log('✅ 所有迁移已执行完成')
      break
    case 'down':
      await migrator.down()
      console.log('✅ 回滚完成')
      break
    case 'seed':
      await seeder.up()
      console.log('✅ 种子数据写入完成')
      break
    case 'seed:down':
      await seeder.down()
      console.log('✅ 种子数据已回滚')
      break
    case 'reset':
      await migrator.down({ to: 0 })
      await migrator.up()
      await seeder.up()
      console.log('✅ 数据库已完全重置')
      break
    case 'status':
      const executed = await migrator.executed()
      const pending = await migrator.pending()
      console.log(`📊 迁移状态: 已执行 ${executed.length}, 待执行 ${pending.length}`)
      if (executed.length > 0) {
        console.log('  已执行:')
        executed.forEach(m => console.log(`    - ${m.name}`))
      }
      break
    default:
      console.log(`
数据库迁移 CLI

用法:
  tsx scripts/migrate.ts up        执行所有待迁移
  tsx scripts/migrate.ts down      回滚最近一次迁移
  tsx scripts/migrate.ts seed      写入种子数据（初始数据）
  tsx scripts/migrate.ts seed:down 回滚种子数据
  tsx scripts/migrate.ts reset     完全重置数据库
  tsx scripts/migrate.ts status    查看迁移状态
      `)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ 迁移执行失败:', err)
  process.exit(1)
})
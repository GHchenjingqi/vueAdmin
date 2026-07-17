import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert('settings', [
    {
      optionKey: 'site_title',
      optionValue: 'Vue Admin',
      autoload: 1,
      description: '站点标题',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      optionKey: 'site_description',
      optionValue: '基于 Vue 3 + Element Plus 的全栈后台管理系统',
      autoload: 1,
      description: '站点描述',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      optionKey: 'site_keywords',
      optionValue: 'Vue, Admin, Element Plus, 后台管理',
      autoload: 1,
      description: '站点关键词',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      optionKey: 'site_logo',
      optionValue: '',
      autoload: 1,
      description: '站点 Logo 地址',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      optionKey: 'site_favicon',
      optionValue: '',
      autoload: 1,
      description: '浏览器图标（favicon）地址',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      optionKey: 'image_compress',
      optionValue: '0',
      autoload: 1,
      description: '上传时是否开启图片压缩: 1=开启 0=关闭',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      optionKey: 'captcha_enabled',
      optionValue: '1',
      autoload: 1,
      description: '登录时是否开启验证码: 1=开启 0=关闭',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      optionKey: 'watermark_enabled',
      optionValue: '0',
      autoload: 1,
      description: '是否开启全局水印: 1=开启 0=关闭',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      optionKey: 'watermark_text',
      optionValue: 'Vue Admin',
      autoload: 1,
      description: '水印文字内容',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const keys = [
    'site_title', 'site_description', 'site_keywords', 'site_logo', 'site_favicon',
    'image_compress', 'captcha_enabled', 'watermark_enabled', 'watermark_text',
  ]
  const placeholders = keys.map(() => '?').join(', ')
  await queryInterface.sequelize.query(`DELETE FROM settings WHERE optionKey IN (${placeholders})`, {
    replacements: keys,
  })
}
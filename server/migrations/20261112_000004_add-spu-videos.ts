import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * A-视频（本地存储）：spus 增加 videos 列
 * - videos: string[] JSON 列，存放视频 URL 列表（/uploads/xxx.mp4 或 CDN 绝对 URL）
 * - 复用已有 uploadController（fileFilter 只挡可执行文件，100MB 限制），视频文件走同一上传通道
 * - C 端 catalogService 投影时透传 videos，详情页主图区可切换为视频播放
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('spus', 'videos', {
    type: DataTypes.JSON,
    allowNull: true,
    comment: '视频 URL 列表（本地 /uploads/ 或 CDN）',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('spus', 'videos')
}

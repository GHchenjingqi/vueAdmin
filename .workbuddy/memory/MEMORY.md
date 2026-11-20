# 项目长期规则（必须遵守）

## 数据安全（最高优先级）
- **用户上传/维护的数据绝不能清除或覆盖**。线上 `prompt-cloud` 沙箱的 `data/db.json` 是用户维护的真实数据。
- 发版（构建+发布）前必须先执行 `npm run sync:cloud-data` 把线上数据拉回本地，再构建发布；发布后验证线上数据条数与发布前一致。
- 本地 `prompt-cloud/data/db.json` 中含测试数据时，发布前必须先同步线上或清理测试数据，绝不能带着本地测试数据直接发布。
- 服务端已有滚动备份（data/backups 保留 10 份）+ 本地 archive 快照（保留 30 份）双保险；若出现数据丢失，优先用恢复接口 `POST /prompt/data/backups/:name/restore` 或本地 archive 恢复。

## 发布流程 SOP
1. `npm run sync:cloud-data`（先拉线上数据）
2. `npm run build` → 同步 `dist/` 到 `prompt-cloud/client/`
3. 发布前核对本地 db.json 与线上数据一致
4. 发布
5. 发布后验证：数据条数、统计接口、关键页面

## 其他约定
- 分支：`prompt`；核心改动完成后提交推送。
- 构建自动生成的 `components.d.ts` 改动需 `git checkout --` 还原，不提交。
- 已知基线问题：`workflowEngine.test.ts` 7 例失败与本项目改动无关。

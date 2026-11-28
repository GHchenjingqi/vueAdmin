#!/usr/bin/env node
/**
 * 把 output/ 下的中国历代服饰资料转换为前端静态数据模块 src/data/costumes.ts。
 * 只读源文件，不改写 output/；生成文件由本脚本独占维护。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SOURCE_DIR = path.join(ROOT, 'output')
const TARGET = path.join(ROOT, 'src', 'data', 'costumes.ts')

const csvFile = path.join(SOURCE_DIR, 'chinese-costume-history.csv')
const jsonFile = path.join(SOURCE_DIR, 'chinese-costume-prompts.json')

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const header = lines[0].split(',')
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(',')
    if (cells.length !== header.length) throw new Error(`CSV 列数不一致：期望 ${header.length}，实际 ${cells.length} —— ${line}`)
    return Object.fromEntries(header.map((key, i) => [key, cells[i].trim()]))
  })
  return { header, rows }
}

const { header: csvHeader, rows: csvRows } = parseCsv(fs.readFileSync(csvFile, 'utf8'))
const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf8'))

const expectedHeader = ['朝代', '年代', '性别', '场合', '代表形制', '形制细节', '配饰', '妆容发式']
if (csvHeader.join('|') !== expectedHeader.join('|')) throw new Error(`CSV 表头不符：${csvHeader.join(',')}`)
if (!Array.isArray(raw.entries) || raw.entries.length !== csvRows.length) {
  throw new Error(`CSV ${csvRows.length} 行与 JSON ${raw.entries?.length} 条数量不一致`)
}

const forms = csvRows.map((row) => ({
  era: row['朝代'],
  years: row['年代'],
  gender: row['性别'],
  scene: row['场合'],
  form: row['代表形制'],
  detail: row['形制细节'],
  accessories: row['配饰'],
  makeup: row['妆容发式'],
}))

const prompts = raw.entries.map((entry) => ({
  id: entry.id,
  slug: entry.slug,
  era: entry.era,
  years: entry.years,
  gender: entry.gender,
  group: entry.group,
  scene: entry.scene,
  style: entry.style,
  form: entry.form,
  promptZh: entry.promptZh,
  promptEn: entry.promptEn,
  negativeZh: [...entry.negativeZh],
  negativeEn: [...entry.negativeEn],
  anchors: [...entry.anchors],
  avoid: [...entry.avoid],
}))

const combos = (items) => items.map((item) => `${item.era}|${item.gender}|${item.scene}`).sort()
const formCombos = combos(forms)
const promptCombos = combos(prompts)
if (formCombos.join('\n') !== promptCombos.join('\n')) throw new Error('CSV 与 JSON 的 朝代|性别|场合 组合不一致，无法一一对应')

const eras = [...new Set(forms.map((item) => item.era))]
const genders = [...new Set(forms.map((item) => item.gender))]
const scenes = [...new Set(forms.map((item) => item.scene))]

const content = `// 本文件由 scripts/build-costume-data.mjs 从 output/ 自动生成，请勿手动修改。
export interface CostumeFormRow {
  era: string
  years: string
  gender: string
  scene: string
  form: string
  detail: string
  accessories: string
  makeup: string
}

export interface CostumePromptEntry {
  id: string
  slug: string
  era: string
  years: string
  gender: string
  group: string
  scene: string
  style: string
  form: string
  promptZh: string
  promptEn: string
  negativeZh: string[]
  negativeEn: string[]
  anchors: string[]
  avoid: string[]
}

export interface CostumeTermMap {
  [zh: string]: string
}

export interface CostumeData {
  meta: { title: string; version: string; total: number; dimensions: string[]; note: string }
  methodology: {
    principles: string[]
    formula: string
    termMap: CostumeTermMap
    references: { title: string; author: string; note: string }[]
  }
  global: { positiveZh: string; positiveEn: string; negativeZh: string; negativeEn: string }
  eras: string[]
  genders: string[]
  scenes: string[]
  forms: CostumeFormRow[]
  prompts: CostumePromptEntry[]
}

export const costumeData: CostumeData = ${JSON.stringify(
  {
    meta: raw.meta,
    methodology: raw.methodology,
    global: raw.global,
    eras,
    genders,
    scenes,
    forms,
    prompts,
  },
  null,
  2,
)}
`

fs.mkdirSync(path.dirname(TARGET), { recursive: true })
fs.writeFileSync(TARGET, content, 'utf8')
console.log(`[build-costume-data] 已生成 ${path.relative(ROOT, TARGET)}：${forms.length} 行形制 / ${prompts.length} 条提示词 / ${eras.length} 个朝代`)

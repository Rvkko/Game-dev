'use strict'
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '../docs')
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'games', 'registry.json'), 'utf8'))
const issues = []
const seen = new Set()

function issue(id, message) { issues.push(`${id}: ${message}`) }
function inside(file) { return !path.relative(ROOT, file).startsWith('..') }

for (const id of registry.games || []) {
  if (seen.has(id)) { issue(id, 'duplicate registry entry'); continue }
  seen.add(id)
  const dir = path.join(ROOT, 'games', id)
  const manifestFile = path.join(dir, 'manifest.json')
  if (!fs.existsSync(manifestFile)) { issue(id, 'missing manifest.json'); continue }
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) } catch (error) { issue(id, `invalid manifest: ${error.message}`); continue }
  for (const key of ['id', 'title', 'category', 'entry', 'description']) if (!manifest[key]) issue(id, `manifest missing ${key}`)
  if (manifest.id !== id) issue(id, `manifest id is ${manifest.id}`)
  if (!Array.isArray(manifest.tags) || !manifest.tags.length) issue(id, 'manifest needs tags')
  if (!Array.isArray(manifest.achievements) || !manifest.achievements.length) issue(id, 'manifest needs achievements')
  const entry = path.resolve(ROOT, manifest.entry || '')
  if (!inside(entry) || !fs.existsSync(entry)) { issue(id, `missing or unsafe entry ${manifest.entry}`); continue }
  const html = fs.readFileSync(entry, 'utf8')
  if (!/<title>[^<]+<\/title>/i.test(html)) issue(id, 'entry has no title')
  if (!/canvas|iframe|game/i.test(html)) issue(id, 'entry has no visible game surface')
  if (/\bTODO\b|placeholder game|coming soon/i.test(html)) issue(id, 'entry contains placeholder text')
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)) {
    const ref = match[1]
    if (/^(?:https?:|data:|javascript:)/i.test(ref)) continue
    const target = path.resolve(path.dirname(entry), ref)
    if (!inside(target) || !fs.existsSync(target)) issue(id, `missing asset ${ref}`)
  }
  const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi)].map((match) => path.resolve(path.dirname(entry), match[1]))
  for (const script of scripts) {
    if (!inside(script) || !fs.existsSync(script)) continue
    const source = fs.readFileSync(script, 'utf8')
    const check = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' })
    if (check.status !== 0) issue(id, `syntax error in ${path.basename(script)}: ${(check.stderr || '').trim().split('\n')[0]}`)
    if (/\b(?:ctx|context)\.(?:arc|beginPath|clearRect|drawImage|fill|fillRect|fillText|stroke|strokeRect|strokeText)\s*=/.test(source)) {
      issue(id, `canvas method overwritten in ${path.basename(script)}`)
    }
    if (/\.visible\s*=\s*[^;|]+\|\|\s*true\b/.test(source)) {
      issue(id, `forced-visible render object in ${path.basename(script)}`)
    }
    const achievementIds = new Set((manifest.achievements || []).map((achievement) => achievement.id))
    for (const match of source.matchAll(/unlockAchievement\(\s*['"]([^'"]+)['"]/g)) {
      if (!achievementIds.has(match[1])) issue(id, `unknown achievement ${match[1]} in ${path.basename(script)}`)
    }
  }
}

const folders = fs.readdirSync(path.join(ROOT, 'games'), { withFileTypes: true })
  .filter((item) => item.isDirectory() && fs.existsSync(path.join(ROOT, 'games', item.name, 'index.html')))
  .map((item) => item.name)
// games/.wip.json lists ids that are deliberately unfinished: they stay out of
// the registry (so the hub never advertises them) without failing this check.
let wip = []
try { wip = JSON.parse(fs.readFileSync(path.join(ROOT, 'games', '.wip.json'), 'utf8')).games || [] } catch { /* none */ }
const unregistered = []
for (const folder of folders) {
  if (seen.has(folder)) continue
  if (wip.includes(folder)) unregistered.push(folder)
  else issue(folder, 'game folder is not registered')
}

console.log(JSON.stringify({ registered: seen.size, folders: folders.length, workInProgress: unregistered, passed: !issues.length, issues }, null, 2))
process.exitCode = issues.length ? 1 : 0

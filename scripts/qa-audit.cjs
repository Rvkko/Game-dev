// Deeper static QA audit than verify-games.cjs.
// Checks every registered game for offline-safety, SDK wiring, achievement-id
// drift, menu/pause/restart affordances and inline-script syntax.
// Usage: node scripts/qa-audit.cjs [--json]
const fs = require('fs')
const path = require('path')
const vm = require('vm')

const ROOT = path.resolve(__dirname, '../docs')
const GAMES = path.join(ROOT, 'games')
const registry = JSON.parse(fs.readFileSync(path.join(GAMES, 'registry.json'), 'utf8'))

function walk(dir) {
  const out = []
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

// vm.Script cannot parse ES-module syntax; strip it so the rest still gets a
// real syntax check.
function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import[\s\S]*?from\s*['"][^'"]*['"];?/gm, '')
    .replace(/^\s*import\s*['"][^'"]*['"];?/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'void ')
    .replace(/^\s*export\s+(?=(const|let|var|function|class|async))/gm, '')
    .replace(/^\s*export\s*\{[^}]*\};?/gm, '')
}

function inlineScripts(html) {
  const blocks = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    const attrs = m[1] || ''
    if (/\bsrc=/i.test(attrs)) continue
    // Skip data blocks such as <script type="importmap"> / application/json.
    const type = (attrs.match(/type\s*=\s*["']([^"']+)["']/i) || [])[1]
    if (type && !/^(module|text\/javascript|application\/javascript)$/i.test(type.trim())) continue
    blocks.push({ module: /type\s*=\s*["']module["']/i.test(attrs), code: m[2] })
  }
  return blocks
}

function audit(id) {
  const dir = path.join(GAMES, id)
  const issues = []
  if (!fs.existsSync(dir)) return { id, issues: ['missing game folder'] }

  let manifest = null
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  } catch (error) {
    issues.push(`manifest unreadable: ${error.message}`)
  }
  if (manifest) {
    if (manifest.entry !== `games/${id}/index.html`) issues.push(`entry not repo-root-relative: ${manifest.entry}`)
    if (!manifest.title) issues.push('manifest missing title')
    if (!manifest.description) issues.push('manifest missing description')
    if (!Array.isArray(manifest.achievements) || !manifest.achievements.length) issues.push('manifest has no achievements')
    // The hub renders a.title / a.desc; anything else shows up as "undefined".
    for (const a of manifest.achievements || []) {
      if (!a || !a.id) issues.push('achievement entry without an id')
      else if (!a.title || !a.desc) issues.push(`achievement "${a.id}" missing title/desc (keys: ${Object.keys(a).join(',')})`)
    }
  }

  const entry = path.join(dir, 'index.html')
  if (!fs.existsSync(entry)) return { id, issues: [...issues, 'missing index.html'] }

  const files = walk(dir)
  const text = files
    .filter((f) => /\.(html|js|css|json)$/i.test(f))
    .map((f) => ({ f, src: fs.readFileSync(f, 'utf8') }))

  for (const { f, src } of text) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    const ext = src.match(/(?:src|href)\s*=\s*["']https?:\/\/[^"']+/gi) || []
    const imp = src.match(/from\s+["']https?:\/\/[^"']+/gi) || []
    for (const hit of [...ext, ...imp]) issues.push(`external URL in ${rel}: ${hit.slice(0, 80)}`)
    if (/\bTODO\b|\bFIXME\b|placeholder-|not implemented yet/i.test(src)) {
      const line = src.split(/\r?\n/).findIndex((l) => /\bTODO\b|\bFIXME\b|not implemented yet/i.test(l)) + 1
      issues.push(`unfinished marker in ${rel}:${line}`)
    }
  }

  for (const { f, src } of text.filter((t) => t.f.endsWith('.js'))) {
    try {
      new vm.Script(stripModuleSyntax(src), { filename: f })
    } catch (error) {
      issues.push(`syntax error in ${path.relative(ROOT, f).replace(/\\/g, '/')}: ${error.message}`)
    }
  }

  const html = fs.readFileSync(entry, 'utf8')
  for (const [i, block] of inlineScripts(html).entries()) {
    try {
      new vm.Script(block.module ? stripModuleSyntax(block.code) : block.code, {
        filename: `${id}/index.html#inline${i}`,
      })
    } catch (error) {
      issues.push(`syntax error in inline script #${i} of games/${id}/index.html: ${error.message}`)
    }
  }

  const all = text.map((t) => t.src).join('\n')
  if (!/empire-sdk|EmpireSDK|empire\.(save|load|unlock|report)/i.test(all)) issues.push('no Empire SDK usage found')
  if (!/unlockAchievement/i.test(all)) issues.push('never unlocks an achievement')
  if (!/reportPlaytime/i.test(all)) issues.push('never reports playtime')
  if (!/saveState/i.test(all)) issues.push('never saves state')
  if (!/(pause|Pause)/.test(all)) issues.push('no pause affordance')
  if (!/(restart|newGame|new game|new run|play again|try again|retry|rematch|next run)/i.test(all)) issues.push('no restart affordance')

  if (manifest && Array.isArray(manifest.achievements)) {
    const declared = new Set(manifest.achievements.map((a) => a.id))
    const used = new Set()
    const re = /unlockAchievement\s*\(\s*["'`]([^"'`]+)["'`]/g
    let m
    // Ids built at runtime (`max_${key}`) can't be compared statically.
    while ((m = re.exec(all))) if (!m[1].includes('${')) used.add(m[1])
    for (const u of used) if (!declared.has(u)) issues.push(`achievement id used but not declared: ${u}`)
  }

  return { id, issues }
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const results = (only.length ? only : registry.games).map(audit)
const failing = results.filter((r) => r.issues.length)
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ total: results.length, failing: failing.length, results: failing }, null, 2))
} else {
  for (const r of failing) {
    console.log(`\n${r.id}`)
    for (const i of r.issues) console.log(`  - ${i}`)
  }
  console.log(`\n${results.length - failing.length}/${results.length} games clean, ${failing.length} with findings`)
}
process.exit(0)

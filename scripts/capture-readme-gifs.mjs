#!/usr/bin/env node
/**
 * Capture README demo GIFs against a running Vite dev server (localhost:1420).
 * Uses Playwright + gifski. Clears localStorage so no personal notes appear.
 *
 * Usage: node scripts/capture-readme-gifs.mjs
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { mkdirSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = 'http://localhost:1420'
const ROOT = new URL('..', import.meta.url).pathname
const FRAMES = join(ROOT, 'docs/gifs/frames')
const OUT = join(ROOT, 'docs/gifs')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function shot(page, name) {
  await page.screenshot({ path: join(FRAMES, name), type: 'png' })
}

async function captureSequence(page, prefix, steps) {
  let i = 0
  for (const step of steps) {
    await step(page)
    await shot(page, `${prefix}-${String(i++).padStart(2, '0')}.png`)
    await sleep(180)
  }
}

function makeGif(name, pattern, fps = 8) {
  const out = join(OUT, `${name}.gif`)
  const frames = join(FRAMES, pattern)
  execSync(`gifski --fps ${fps} --quality 90 --width 960 ${frames} -o "${out}"`, {
    stdio: 'inherit',
  })
  console.log(`✓ ${out}`)
}

async function resetApp(page) {
  await page.goto(BASE)
  await page.evaluate(() => {
    localStorage.clear()
    const note = {
      id: 'note-blank',
      title: 'Untitled',
      body: '',
      linkedDateKey: null,
      sectionId: null,
      updatedAt: Date.now(),
    }
    localStorage.setItem('bilo-notes-store', JSON.stringify([note]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(600)
}

async function closeSidebar(page) {
  const open = await page.locator('.sidebar-drawer.open').count()
  if (open > 0) {
    await page.locator('.corner-toggle').click()
    await sleep(300)
  }
}

async function openSidebar(page) {
  const open = await page.locator('.sidebar-drawer.open').count()
  if (open === 0) {
    await page.locator('.corner-toggle').click()
    await sleep(400)
  }
}

async function goNotes(page) {
  await openSidebar(page)
  await page.locator('.sidebar-tab').filter({ hasText: 'Notes' }).click()
  await sleep(400)
}

async function main() {
  rmSync(FRAMES, { recursive: true, force: true })
  mkdirSync(FRAMES, { recursive: true })
  mkdirSync(OUT, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })

  await resetApp(page)

  // ── 1. Editor (blank canvas) ─────────────────────────────────────
  await goNotes(page)
  await closeSidebar(page)
  await captureSequence(page, 'editor', [
    async (p) => { await p.locator('.note-title-input').click() },
    async (p) => { await p.locator('.ProseMirror').click() },
    async (p) => { await p.keyboard.type('Quick notes for creative work.') },
  ])
  makeGif('editor', 'editor-*.png', 6)

  // ── 2. Slash menu ────────────────────────────────────────────────
  await resetApp(page)
  await goNotes(page)
  await closeSidebar(page)
  await page.locator('.ProseMirror').click()
  await captureSequence(page, 'slash', [
    async (p) => { await p.keyboard.type('/') },
    async (p) => { await p.keyboard.press('ArrowDown') },
    async (p) => { await p.keyboard.press('ArrowDown') },
    async (p) => { await p.keyboard.press('ArrowDown') },
    async (p) => { await p.keyboard.press('Enter') },
  ])
  makeGif('slash-menu', 'slash-*.png', 5)

  // ── 3. Sidebar + sections ────────────────────────────────────────
  await resetApp(page)
  await goNotes(page)
  await captureSequence(page, 'sidebar', [
    async (p) => { await openSidebar(p) },
    async (p) => { await p.locator('.new-note-btn').click() },
    async (p) => { await sleep(300) },
    async (p) => { await p.locator('.sidebar-footer-btn').filter({ hasText: '+ Section' }).click() },
    async (p) => { await sleep(300) },
  ])
  makeGif('sidebar', 'sidebar-*.png', 4)

  // ── 4. Calendar ──────────────────────────────────────────────────
  await resetApp(page)
  const todayKey = new Date().toISOString().slice(0, 10)
  // Seed a note in a calendar-enabled section
  await page.evaluate((dateKey) => {
    const sec = { id: 'sec-demo', name: 'Work Log', createdAt: Date.now(), showOnCalendar: true }
    const note = {
      id: 'note-demo',
      title: 'Daily standup',
      body: `<div data-log-block="true" data-log-date="${dateKey}" class="log-block"><h3>Shipped calendar view</h3><p>Fixed month/week/day resize.</p></div>`,
      linkedDateKey: null,
      sectionId: 'sec-demo',
      updatedAt: Date.now(),
    }
    localStorage.setItem('bilo-sections-store', JSON.stringify([sec]))
    localStorage.setItem('bilo-notes-store', JSON.stringify([note]))
  }, todayKey)
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(600)
  await captureSequence(page, 'calendar', [
    async (p) => { await openSidebar(p) },
    async (p) => { await p.locator('.sidebar-tab').filter({ hasText: 'Calendar' }).click() },
    async (p) => { await sleep(500) },
    async (p) => { await p.locator('.cal-day-cell.cal-today, .cal-day-cell').first().click() },
    async (p) => { await sleep(400) },
  ])
  makeGif('calendar', 'calendar-*.png', 4)

  // ── 5. Settings ──────────────────────────────────────────────────
  await resetApp(page)
  await captureSequence(page, 'settings', [
    async (p) => { await openSidebar(p) },
    async (p) => { await p.locator('.settings-gear').click() },
    async (p) => { await sleep(400) },
    async (p) => { await p.locator('.sp-search').fill('jira') },
    async (p) => { await sleep(300) },
    async (p) => { await p.locator('.sp-search').fill('') },
  ])
  makeGif('settings', 'settings-*.png', 4)

  // ── 6. In-note blocks (todo + table via slash) ───────────────────
  await resetApp(page)
  await goNotes(page)
  await closeSidebar(page)
  await page.locator('.ProseMirror').click()
  await captureSequence(page, 'blocks', [
    async (p) => { await p.keyboard.type('/todo') },
    async (p) => { await p.keyboard.press('Enter') },
    async (p) => { await p.keyboard.type('Ship README with GIFs') },
    async (p) => { await p.keyboard.press('Enter') },
    async (p) => { await p.keyboard.type('/table') },
    async (p) => { await p.keyboard.press('Enter') },
  ])
  makeGif('blocks', 'blocks-*.png', 5)

  // ── 7. Search palette ────────────────────────────────────────────
  await resetApp(page)
  await page.evaluate(() => {
    localStorage.setItem('bilo-notes-store', JSON.stringify([
      { id: 'n1', title: 'Project roadmap', body: '<p>Q3 milestones and launch plan</p>', linkedDateKey: null, sectionId: null, updatedAt: Date.now() },
      { id: 'n2', title: 'Meeting notes', body: '<p>Design review feedback</p>', linkedDateKey: null, sectionId: null, updatedAt: Date.now() },
    ]))
  })
  await page.reload({ waitUntil: 'networkidle' })
  await sleep(400)
  await captureSequence(page, 'search', [
    async (p) => { await p.keyboard.press('Meta+k') },
    async (p) => { await sleep(300) },
    async (p) => { await p.locator('.search-input').fill('road') },
    async (p) => { await sleep(300) },
  ])
  makeGif('search', 'search-*.png', 4)

  await browser.close()
  console.log('\nAll GIFs saved to docs/gifs/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

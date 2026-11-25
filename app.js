const KEY = 'sindi.v1'

const TYPES = {
  phone: { label: 'Phone', unit: 'mAh', capacity: 5000, volt: 3.85, useW: 2.5, chargerW: 18 },
  laptop: { label: 'Laptop', unit: 'Wh', capacity: 50, volt: 11.4, useW: 15, chargerW: 65 },
  tablet: { label: 'Tablet', unit: 'mAh', capacity: 7000, volt: 3.85, useW: 4, chargerW: 20 },
  router: { label: 'Wi-Fi router or modem', unit: 'Wh', capacity: 0, volt: 12, useW: 8, chargerW: 0, noBattery: true },
  fan: { label: 'Rechargeable fan', unit: 'mAh', capacity: 4400, volt: 3.7, useW: 5, chargerW: 5 },
  lamp: { label: 'Rechargeable lamp', unit: 'mAh', capacity: 2400, volt: 3.7, useW: 2, chargerW: 5 },
  powerbank: { label: 'Power bank', unit: 'mAh', capacity: 10000, volt: 3.7, eff: 65, chargerW: 18, source: true },
  ups: { label: 'Mini UPS', unit: 'mAh', capacity: 10400, volt: 3.7, eff: 80, chargerW: 12, source: true },
  other: { label: 'Other device', unit: 'Wh', capacity: 10, volt: 3.7, useW: 5, chargerW: 10 }
}

const CAUSES = {
  maintenance: 'Scheduled maintenance',
  rotational: 'Rotational brownout',
  unscheduled: 'Unscheduled outage',
  other: 'Other'
}

const CHARGE_RATE = 0.55
const VIEWS = ['plan', 'brownouts', 'devices', 'backup']

const $ = (sel, el = document) => el.querySelector(sel)
const uid = () => Math.random().toString(36).slice(2, 10)
const pad = n => String(n).padStart(2, '0')
const dateVal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const timeVal = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`
const sameDay = (a, b) => a.toDateString() === b.toDateString()
const fDay = d => d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
const fShort = d => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const fTime = d => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fHour = d => d.toLocaleTimeString('en-US', { hour: 'numeric' })

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style') el.style.cssText = v
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)))
  }
  return el
}

function blank() {
  return { settings: { target: 100, buffer: 15 }, devices: [], outages: [] }
}

function clean(data) {
  const num = (v, f = 0) => (v !== '' && v != null && Number.isFinite(+v) ? +v : f)
  const str = (v, max) => String(v ?? '').slice(0, max)
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
  const devices = (Array.isArray(data?.devices) ? data.devices : [])
    .filter(d => d && TYPES[d.type])
    .map(d => ({
      id: str(d.id, 20) || uid(),
      name: str(d.name, 40) || TYPES[d.type].label,
      type: d.type,
      unit: d.unit === 'Wh' ? 'Wh' : 'mAh',
      capacity: Math.max(0, num(d.capacity)),
      volt: clamp(num(d.volt, TYPES[d.type].volt), 1, 48),
      charge: clamp(num(d.charge), 0, 100),
      useW: Math.max(0, num(d.useW)),
      eff: clamp(num(d.eff, TYPES[d.type].eff || 65), 10, 100),
      chargerW: Math.max(0, num(d.chargerW))
    }))
  const outages = (Array.isArray(data?.outages) ? data.outages : [])
    .filter(o => o && !isNaN(new Date(o.start)) && !isNaN(new Date(o.end)) && new Date(o.end) > new Date(o.start))
    .map(o => ({
      id: str(o.id, 20) || uid(),
      start: new Date(o.start).toISOString(),
      end: new Date(o.end).toISOString(),
      area: str(o.area, 60),
      cause: CAUSES[o.cause] ? o.cause : 'other',
      notes: str(o.notes, 300),
      needs: (Array.isArray(o.needs) ? o.needs : []).filter(Boolean).map(n => ({
        id: str(n.id, 20) || uid(),
        deviceId: str(n.deviceId, 20),
        label: str(n.label, 40),
        hours: Math.max(0, num(n.hours)),
        whole: !!n.whole
      }))
    }))
  return {
    settings: {
      target: clamp(num(data?.settings?.target, 100), 20, 100),
      buffer: clamp(num(data?.settings?.buffer, 15), 0, 240)
    },
    devices,
    outages
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? clean(JSON.parse(raw)) : blank()
  } catch {
    return blank()
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    toast("Couldn't save. Your browser may be blocking storage for this site.")
  }
}

let state = load()
let view = 'plan'
let picked = null
let firstPlan = true

const fmtWh = x => {
  const v = Math.max(0, x)
  return (v < 10 ? (Math.round(v * 10) / 10).toString() : Math.round(v).toLocaleString('en-US')) + ' Wh'
}

function dur(hours) {
  const mins = Math.max(0, Math.round(hours * 60))
  const hh = Math.floor(mins / 60)
  const mm = mins % 60
  if (!hh) return `${mm}m`
  return mm ? `${hh}h ${mm}m` : `${hh}h`
}

function countdown(ms) {
  const mins = Math.max(1, Math.round(ms / 6e4))
  const d = Math.floor(mins / 1440)
  const hr = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  const part = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
  if (d) return hr ? `${part(d, 'day')}, ${part(hr, 'hour')}` : part(d, 'day')
  if (hr) return m ? `${part(hr, 'hour')}, ${part(m, 'minute')}` : part(hr, 'hour')
  return part(m, 'minute')
}

const isSource = d => !!TYPES[d.type]?.source
const noBattery = d => !!TYPES[d.type]?.noBattery
const capWh = d => (!d.capacity || noBattery(d) ? 0 : d.unit === 'Wh' ? d.capacity : (d.capacity * (d.volt || 3.7)) / 1000)
const startOf = o => new Date(o.start)
const endOf = o => new Date(o.end)
const hoursOf = o => (endOf(o) - startOf(o)) / 36e5
const deviceById = id => state.devices.find(d => d.id === id)

function statusOf(o, now = Date.now()) {
  if (now >= +endOf(o)) return 'past'
  if (now >= +startOf(o)) return 'now'
  return 'next'
}

const upcoming = () => state.outages.filter(o => statusOf(o) !== 'past').sort((a, b) => startOf(a) - startOf(b))
const pastList = () => state.outages.filter(o => statusOf(o) === 'past').sort((a, b) => startOf(b) - startOf(a))

function plan(o, useCurrent = false) {
  const live = statusOf(o) === 'now'
  const target = state.settings.target
  const level = d => (useCurrent || live ? d.charge : Math.max(d.charge, target))
  const total = hoursOf(o)
  const grouped = new Map()

  for (const n of o.needs) {
    const d = deviceById(n.deviceId)
    if (!d || isSource(d)) continue
    const hrs = n.whole ? total : Math.min(n.hours, total)
    if (hrs <= 0) continue
    const entry = grouped.get(d.id) || { device: d, hours: 0, labels: [] }
    entry.hours += hrs
    if (n.label) entry.labels.push(n.label)
    grouped.set(d.id, entry)
  }

  const rows = [...grouped.values()]
    .map(e => {
      const needWh = e.hours * e.device.useW
      const ownWh = (capWh(e.device) * level(e.device)) / 100
      const fromOwn = Math.min(ownWh, needWh)
      return { ...e, needWh, ownWh, fromOwn, fromBanks: [], gap: needWh - fromOwn }
    })
    .filter(r => r.needWh > 0)

  const banks = state.devices.filter(isSource).map(s => {
    const avail = (((capWh(s) * level(s)) / 100) * s.eff) / 100
    return { device: s, avail, left: avail, given: [] }
  })

  for (const r of rows.filter(r => r.gap > 0.001).sort((a, b) => a.gap - b.gap)) {
    for (const b of [...banks].sort((x, y) => y.left - x.left)) {
      if (r.gap <= 0.001) break
      const take = Math.min(b.left, r.gap)
      if (take <= 0.001) continue
      b.left -= take
      r.gap -= take
      b.given.push({ device: r.device, wh: take })
      r.fromBanks.push({ device: b.device, wh: take })
    }
  }

  for (const r of rows) {
    r.short = r.gap > 0.05 ? r.gap : 0
    r.shortHours = r.device.useW ? r.short / r.device.useW : 0
  }

  const totalNeed = rows.reduce((s, r) => s + r.needWh, 0)
  const totalShort = rows.reduce((s, r) => s + r.short, 0)
  const ratio = totalNeed ? 1 - totalShort / totalNeed : 1
  const pct = totalShort > 0 ? Math.min(99, Math.floor(ratio * 100)) : 100
  rows.sort((a, b) => b.needWh - a.needWh)
  return { rows, banks, totalNeed, totalShort, pct, hours: total, live }
}

function chargeList(o, p) {
  if (statusOf(o) !== 'next') return []
  const { target, buffer } = state.settings
  const used = new Set([...p.rows.map(r => r.device.id), ...p.banks.filter(b => b.given.length).map(b => b.device.id)])
  return state.devices
    .filter(d => used.has(d.id) && capWh(d) > 0 && d.charge < target && d.chargerW > 0)
    .map(d => {
      const missing = (capWh(d) * (target - d.charge)) / 100
      const hours = Math.max(missing / (d.chargerW * CHARGE_RATE), 1 / 6)
      const by = new Date(+startOf(o) - hours * 36e5 - buffer * 6e4)
      return { device: d, missing, hours, by }
    })
    .sort((a, b) => a.by - b.by)
}

function monthStats() {
  const now = new Date()
  const inMonth = state.outages.filter(o => {
    const s = startOf(o)
    return s.getMonth() === now.getMonth() && s.getFullYear() === now.getFullYear()
  })
  const hours = inMonth.reduce((s, o) => s + hoursOf(o), 0)
  return { count: inMonth.length, hours, month: now.toLocaleDateString('en-US', { month: 'long' }) }
}

function monthLine() {
  const m = monthStats()
  if (!m.count) return `No brownouts on your list for ${m.month}.`
  return `${m.month}: ${m.count} brownout${m.count === 1 ? '' : 's'}, ${dur(m.hours)} without power.`
}

function route() {
  const v = location.hash.slice(1)
  view = VIEWS.includes(v) ? v : 'plan'
  for (const name of VIEWS) $('#view-' + name).hidden = name !== view
  $('#hero').hidden = view !== 'plan'
  document.querySelectorAll('.tabs a').forEach(a => {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  })
}

function go(name) {
  if (location.hash === '#' + name) route()
  else location.hash = name
}

function render() {
  renderPlan()
  renderBrownouts()
  renderDevices()
  renderBackup()
}

function renderPlan() {
  const hero = $('#hero')
  const root = $('#view-plan')
  hero.replaceChildren()
  root.replaceChildren()

  if (!state.devices.length && !state.outages.length) {
    hero.append(welcomeHero())
    root.append(howItWorks())
    return
  }

  const list = upcoming()
  if (!list.length) {
    hero.append(quietHero())
    root.append(h('div', { class: 'stat-line' }, monthLine()))
    if (!state.devices.length) root.append(howItWorks())
    return
  }

  if (!list.some(o => o.id === picked)) picked = list[0].id
  const o = list.find(x => x.id === picked)
  const p = plan(o)
  const raw = plan(o, true)
  const charges = chargeList(o, p)

  hero.append(planHero(o, p, raw, charges, list))
  root.append(
    h('div', { class: 'plan-grid' },
      needsPanel(o, p),
      h('div', { class: 'stack' },
        statusOf(o) === 'next' ? chargePanel(p, charges) : livePanel(),
        banksPanel(p),
        p.totalShort > 0 ? fixPanel(p) : null
      )
    )
  )
  firstPlan = false
}

function welcomeHero() {
  return h('section', { class: 'hero' },
    h('div', { class: 'hero-inner' },
      h('h1', {}, 'Will your batteries last the next brownout?'),
      h('p', { class: 'lede-big' }, "Add your devices and the schedule from your power utility's advisory. Sindí works out what to charge, when to start charging, and what will run out first."),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => openDevice() }, 'Add your first device'),
        h('button', { class: 'btn on-night', type: 'button', onclick: loadSample }, 'Try it with sample data')
      )
    )
  )
}

function quietHero() {
  const last = pastList()[0]
  return h('section', { class: 'hero' },
    h('div', { class: 'hero-inner' },
      h('h1', {}, 'No brownouts coming up'),
      h('p', { class: 'lede-big' },
        last ? `Your last one was ${fShort(startOf(last))}, ${dur(hoursOf(last))} long. ` : '',
        'When your power utility posts an advisory, add it here and Sindí will plan your charging.'),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn primary', type: 'button', onclick: () => openOutage() }, 'Add brownout'),
        state.devices.length ? null : h('button', { class: 'btn on-night', type: 'button', onclick: () => openDevice() }, 'Add a device')
      )
    )
  )
}

function howItWorks() {
  const steps = [
    ['Add your devices', 'Phone, laptop, Wi-Fi router, power banks. Typical battery sizes are filled in for you, so you only change what is different.'],
    ['Add the brownout', "Copy the date and times from your power utility's advisory, then list what you need power for."],
    ['Follow the plan', 'Charge in the order shown, and see ahead of time which device would run out first.']
  ]
  return h('section', { class: 'panel' },
    h('h2', {}, 'How it works'),
    h('ol', { class: 'steps howto' }, steps.map(([t, d]) => h('li', {}, h('div', {}, h('b', {}, t), h('small', {}, d)))))
  )
}

function planHero(o, p, raw, charges, list) {
  const st = statusOf(o)
  const s = startOf(o)
  const e = endOf(o)
  const now = Date.now()
  const title = st === 'now' ? `Power's out. Back in ${countdown(e - now)}.` : `Brownout in ${countdown(s - now)}`
  const where = [o.area, CAUSES[o.cause]].filter(Boolean).join('. ')

  const picker = list.length > 1
    ? h('label', { class: 'picker' }, 'Planning for',
        h('select', { onchange: ev => { picked = ev.target.value; renderPlan() } },
          list.map(x => h('option', { value: x.id, selected: x.id === o.id }, `${fShort(startOf(x))}, ${fTime(startOf(x))}`))))
    : null

  return h('section', { class: 'hero' },
    h('div', { class: 'hero-inner' },
      h('div', { class: 'hero-top' },
        h('div', {},
          h('h1', {}, title),
          h('p', { class: 'when' }, `${fDay(s)}, ${fTime(s)} to ${fTime(e)}${sameDay(s, e) ? '' : ' the next day'}. ${dur(p.hours)} without power.`),
          where ? h('p', { class: 'where' }, where) : null
        ),
        picker
      ),
      ribbon(o, charges),
      verdict(o, p, raw, charges),
      h('div', { class: 'hero-actions' },
        h('button', { class: 'btn on-night small', type: 'button', onclick: () => openOutage(o.id) }, 'Edit this brownout'),
        h('button', { class: 'btn on-night small', type: 'button', onclick: () => go('devices') }, 'Update battery levels')
      )
    )
  )
}

function ribbon(o, charges) {
  const s = startOf(o)
  const e = endOf(o)
  let ws = new Date(s)
  ws.setHours(0, 0, 0, 0)
  const early = charges.length ? charges[0].by : null
  if (early && early < ws) {
    const alt = new Date(early)
    alt.setHours(Math.floor(alt.getHours() / 6) * 6, 0, 0, 0)
    ws = ws - alt <= 12 * 36e5 ? alt : new Date(+ws - 12 * 36e5)
  }
  let we = new Date(e)
  if (we.getHours() || we.getMinutes()) we.setHours(24, 0, 0, 0)
  if (we - ws < 864e5) we = new Date(+ws + 864e5)
  const span = we - ws
  const pos = t => Math.min(100, Math.max(0, ((t - ws) / span) * 100))
  const left = pos(+s)
  const width = pos(+e) - left
  const now = Date.now()
  const step = span > 36 * 36e5 ? 12 : 6

  const bar = h('div', { class: 'ribbon', role: 'img', 'aria-label': `Timeline: power is out from ${fTime(s)} to ${fTime(e)}.` },
    h('div', { class: 'out' + (firstPlan ? ' dim-in' : ''), style: `left:${left}%;width:${width}%` }, width > 16 ? `No power, ${dur(hoursOf(o))}` : ''),
    charges.filter(c => c.by >= ws && c.by < s).map(c => h('span', { class: 'tick', style: `left:${pos(+c.by)}%`, title: `Start charging ${c.device.name} by ${fTime(c.by)}` })),
    now >= +ws && now <= +we ? h('div', { class: 'now', style: `left:${pos(now)}%` }, h('span', {}, 'Now')) : null
  )

  const labels = []
  for (let t = +ws; t <= +we; t += step * 36e5) {
    const d = new Date(t)
    labels.push(h('span', { style: `left:${pos(t)}%` }, d.getHours() === 0 ? d.toLocaleDateString('en-US', { weekday: 'short' }) : fHour(d)))
  }

  return h('div', { class: 'ribbon-wrap' },
    bar,
    h('div', { class: 'scale', 'aria-hidden': 'true' }, labels),
    h('div', { class: 'key' },
      h('span', {}, h('i', { class: 'sw lit' }), 'Power on'),
      h('span', {}, h('i', { class: 'sw dark' }), 'Brownout'),
      charges.length ? h('span', {}, h('i', { class: 'sw pin' }), 'Start charging') : null
    )
  )
}

function verdict(o, p, raw, charges) {
  if (!p.totalNeed) {
    return h('div', { class: 'verdict' },
      h('span', { class: 'light' }),
      h('p', {}, 'Tell Sindí what you need power for during this brownout, and it will check if your batteries can handle it.'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => openOutage(o.id) }, 'Add what you need')
    )
  }
  const live = statusOf(o) === 'now'
  let text
  if (!p.totalShort) {
    text = charges.length
      ? `Your batteries can cover everything you planned, as long as you charge ${charges.length === 1 ? 'one device' : charges.length + ' devices'} first.`
      : 'Your batteries can cover everything you planned.'
  } else {
    const worst = [...p.rows].sort((a, b) => b.short - a.short)[0]
    text = `You can cover ${p.pct}% of what you planned. ${worst.device.name} runs out about ${dur(worst.shortHours)} early.`
  }
  const then = !live && raw.pct < p.pct ? `If you skip charging, that drops to ${raw.pct}%.` : null
  return h('div', { class: 'verdict' },
    h('span', { class: 'light ' + (p.totalShort ? 'bad' : 'ok') }),
    h('p', {}, text),
    then ? h('p', { class: 'then' }, then) : null
  )
}

function needsPanel(o, p) {
  const live = statusOf(o) === 'now'
  const panel = h('section', { class: 'panel' },
    h('h2', {}, 'During the brownout'),
    h('p', { class: 'sub' }, live ? 'Based on the battery levels you last entered.' : `Assumes you charge everything to ${state.settings.target}% before it starts.`)
  )
  if (!p.rows.length) {
    panel.append(
      h('p', { class: 'sub' }, 'Nothing listed yet. Add the things you need to keep running, like an online class on your laptop or the Wi-Fi for the whole afternoon.'),
      h('div', { class: 'empty' }, h('div', { class: 'btns' }, h('button', { class: 'btn dark', type: 'button', onclick: () => openOutage(o.id) }, 'Add what you need')))
    )
    return panel
  }
  panel.append(h('div', { class: 'legend' },
    h('span', {}, h('i', { class: 'sw own' }), 'Own battery'),
    h('span', {}, h('i', { class: 'sw bank' }), 'Power bank or UPS'),
    h('span', {}, h('i', { class: 'sw short' }), 'Not covered')
  ))
  for (const r of p.rows) {
    const pc = x => `${((x / r.needWh) * 100).toFixed(2)}%`
    const banked = r.fromBanks.reduce((s, b) => s + b.wh, 0)
    const bits = []
    if (r.fromOwn >= r.needWh - 0.05) bits.push('Its own battery covers all of it.')
    else if (noBattery(r.device)) bits.push('No battery of its own.')
    else if (r.fromOwn > 0.05) bits.push(`Its own battery gives ${fmtWh(r.fromOwn)}.`)
    else bits.push('Its battery is empty.')
    for (const b of r.fromBanks) bits.push(` ${b.device.name} adds ${fmtWh(b.wh)}.`)
    if (r.short) bits.push(' ', h('span', { class: 'bad' }, `Short ${fmtWh(r.short)}, about ${dur(r.shortHours)} of use.`))
    panel.append(h('div', { class: 'need' },
      h('div', { class: 'need-head' },
        h('div', {}, h('div', { class: 'need-name' }, r.device.name), r.labels.length ? h('div', { class: 'need-for' }, r.labels.join(', ')) : null),
        h('div', { class: 'need-amt' }, `${dur(r.hours)} of use`, h('br'), fmtWh(r.needWh))
      ),
      h('div', { class: 'bar', role: 'img', 'aria-label': `${Math.round(((r.needWh - r.short) / r.needWh) * 100)}% covered` },
        r.fromOwn > 0 ? h('span', { class: 'own', style: `width:${pc(r.fromOwn)}` }) : null,
        banked > 0 ? h('span', { class: 'bank', style: `width:${pc(banked)}` }) : null,
        r.short > 0 ? h('span', { class: 'short', style: `width:${pc(r.short)}` }) : null
      ),
      h('p', { class: 'need-note' }, bits)
    ))
  }
  return panel
}

function chargePanel(p, charges) {
  const { target, buffer } = state.settings
  const panel = h('section', { class: 'panel' }, h('h2', {}, 'Charge before it starts'))
  if (!p.totalNeed) {
    panel.append(h('p', { class: 'sub' }, 'Once you list what you need, Sindí shows what to charge and when to start.'))
    return panel
  }
  if (!charges.length) {
    panel.append(h('p', { class: 'sub' }, `Nothing to charge. Everything you need is already at ${target}%.`))
    return panel
  }
  panel.append(h('p', { class: 'sub' }, `In this order, so each one reaches ${target}% with ${buffer} minutes to spare.`))
  const now = new Date()
  panel.append(h('ol', { class: 'steps' }, charges.map(c => {
    const late = c.by <= now
    return h('li', {},
      h('div', {}, h('b', {}, c.device.name), h('small', {}, `${c.device.charge}% now, about ${dur(c.hours)} to charge`)),
      h('div', { class: 'by' + (late ? ' late' : '') },
        h('strong', {}, late ? 'Start now' : `Start by ${fTime(c.by)}`),
        late ? null : h('small', {}, sameDay(c.by, now) ? 'Today' : fShort(c.by))
      )
    )
  })))
  return panel
}

function livePanel() {
  return h('section', { class: 'panel' },
    h('h2', {}, 'While the power is out'),
    h('p', { class: 'sub' }, 'Sindí uses the battery levels you last entered. Update them now and then for a fresh estimate.'),
    h('div', { class: 'empty' }, h('div', { class: 'btns' }, h('button', { class: 'btn dark', type: 'button', onclick: () => go('devices') }, 'Update battery levels')))
  )
}

function banksPanel(p) {
  const panel = h('section', { class: 'panel' }, h('h2', {}, 'Power banks and UPS'))
  if (!p.banks.length) {
    panel.append(h('p', { class: 'sub' }, 'No power bank or mini UPS yet. Add one in Devices and Sindí will use it to fill the gaps.'))
    return panel
  }
  for (const b of p.banks) {
    const used = b.avail - b.left
    const gives = b.given.map(g => `${g.device.name} ${fmtWh(g.wh)}`)
    panel.append(h('div', { class: 'bank-item' },
      h('div', { class: 'need-head' },
        h('div', { class: 'need-name' }, b.device.name),
        h('div', { class: 'need-amt' }, `${fmtWh(b.avail)} usable`)
      ),
      h('div', { class: 'bar' }, b.avail > 0 ? h('span', { class: 'used', style: `width:${((used / b.avail) * 100).toFixed(2)}%` }) : null),
      h('p', {}, gives.length ? `Gives ${gives.join(' and ')}. ${fmtWh(b.left)} left over.` : 'Not needed for this brownout.')
    ))
  }
  return panel
}

function fixPanel(p) {
  const bankWh = 10000 * 3.7 / 1000 * 0.65
  const tips = p.rows.filter(r => r.short).map(r =>
    noBattery(r.device)
      ? `Turn on ${r.device.name} only when you need it, about ${dur(r.shortHours)} less in total.`
      : `Use ${r.device.name} about ${dur(r.shortHours)} less, or lower its brightness and close apps you don't need.`
  )
  const more = Math.ceil(p.totalShort / bankWh)
  tips.push(`A charged 10,000 mAh power bank adds about ${fmtWh(bankWh)}. You'd need ${more === 1 ? 'one more' : more + ' more'} to cover the gap.`)
  tips.push("Charge up at school, a café, or a relative's place outside the affected area.")
  return h('section', { class: 'panel' },
    h('h2', {}, 'Ways to close the gap'),
    h('ul', { class: 'tips' }, tips.map(t => h('li', {}, t)))
  )
}

function pageHead(title, sub, ...buttons) {
  return h('div', { class: 'page-head' },
    h('div', {}, h('h2', {}, title), sub ? h('p', { class: 'sub' }, sub) : null),
    buttons.length ? h('div', { class: 'row-actions' }, buttons) : null
  )
}

function renderBrownouts() {
  const root = $('#view-brownouts')
  root.replaceChildren(
    pageHead('Brownouts', "Add each scheduled or rotational brownout from your power utility's advisory.",
      h('button', { class: 'btn primary', type: 'button', onclick: () => openOutage() }, 'Add brownout'))
  )
  if (!state.outages.length) {
    root.append(h('div', { class: 'panel empty' },
      h('p', {}, 'No brownouts yet. When your utility posts a schedule, add the date, the times, and what you need power for.'),
      h('div', { class: 'btns' }, h('button', { class: 'btn dark', type: 'button', onclick: () => openOutage() }, 'Add brownout'))
    ))
    return
  }
  root.append(h('div', { class: 'stat-line' }, monthLine()))
  const up = upcoming()
  const past = pastList()
  if (up.length) root.append(h('h3', { class: 'group-title' }, 'Coming up'), h('div', { class: 'list' }, up.map(outageItem)))
  if (past.length) {
    root.append(h('details', { class: 'past-list', open: !up.length },
      h('summary', {}, `Past brownouts (${past.length})`),
      h('div', { class: 'list' }, past.map(outageItem))
    ))
  }
}

function outageItem(o) {
  const s = startOf(o)
  const e = endOf(o)
  const st = statusOf(o)
  const uses = o.needs
    .map(n => ({ n, d: deviceById(n.deviceId) }))
    .filter(x => x.d && !isSource(x.d))
    .map(x => `${x.d.name} ${x.n.whole ? 'the whole time' : dur(Math.min(x.n.hours, hoursOf(o)))}`)
  return h('article', { class: 'outage' + (st === 'past' ? ' past' : '') },
    h('div', { class: 'datebox' },
      h('span', {}, s.toLocaleDateString('en-US', { month: 'short' })),
      h('b', {}, s.getDate()),
      h('span', {}, s.toLocaleDateString('en-US', { weekday: 'short' }))
    ),
    h('div', {},
      h('h3', {}, `${fTime(s)} to ${fTime(e)}${sameDay(s, e) ? '' : ' next day'}`, st === 'now' ? h('span', { class: 'chip now' }, 'Happening now') : null),
      h('p', { class: 'meta' }, [dur(hoursOf(o)), o.area, CAUSES[o.cause]].filter(Boolean).join(', ')),
      h('p', { class: 'uses' }, uses.length ? 'Needs: ' + uses.join(', ') : 'No needs listed yet')
    ),
    h('div', { class: 'row-actions' },
      st !== 'past' ? h('button', { class: 'btn dark small', type: 'button', onclick: () => { picked = o.id; firstPlan = true; renderPlan(); go('plan') } }, 'Open plan') : null,
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => openOutage(o.id) }, 'Edit'),
      h('button', { class: 'btn danger small', type: 'button', onclick: () => removeOutage(o.id) }, 'Delete')
    )
  )
}

function renderDevices() {
  const root = $('#view-devices')
  root.replaceChildren(
    pageHead('Devices', 'Drag each slider to match the battery level your device shows, then check your plan.',
      h('button', { class: 'btn primary', type: 'button', onclick: () => openDevice() }, 'Add device'))
  )
  if (!state.devices.length) {
    root.append(h('div', { class: 'panel empty' },
      h('p', {}, 'No devices yet. Start with the ones you rely on during brownouts: your phone, laptop, Wi-Fi router and any power bank.'),
      h('div', { class: 'btns' },
        h('button', { class: 'btn dark', type: 'button', onclick: () => openDevice() }, 'Add device'),
        h('button', { class: 'btn ghost', type: 'button', onclick: loadSample }, 'Try it with sample data')
      )
    ))
    return
  }
  const users = state.devices.filter(d => !isSource(d))
  const banks = state.devices.filter(isSource)
  if (users.length) root.append(h('h3', { class: 'group-title' }, 'Things you use'), h('div', { class: 'list' }, users.map(deviceItem)))
  if (banks.length) root.append(h('h3', { class: 'group-title' }, 'Power banks and UPS'), h('div', { class: 'list' }, banks.map(deviceItem)))
}

const battClass = c => 'batt' + (c < 25 ? ' low' : c < 60 ? ' mid' : '')

function deviceItem(d) {
  const t = TYPES[d.type]
  const wh = capWh(d)
  let meta = t.label
  if (noBattery(d)) meta += `, uses about ${d.useW} W`
  else {
    meta += d.unit === 'mAh' ? `, ${d.capacity.toLocaleString('en-US')} mAh (${fmtWh(wh)})` : `, ${fmtWh(wh)}`
    meta += isSource(d) ? `, ${d.eff}% usable` : `, uses about ${d.useW} W`
  }

  let icon
  let control
  if (noBattery(d)) {
    icon = h('span', { class: 'plug', 'aria-hidden': 'true' }, 'DC')
    control = h('div', { class: 'charge-ctl' }, h('p', {}, 'No battery. Runs on a power bank or UPS during brownouts.'))
  } else {
    const fill = h('i', { style: `width:${d.charge}%` })
    icon = h('span', { class: battClass(d.charge), 'aria-hidden': 'true' }, fill)
    const out = h('span', { class: 'val' }, `${d.charge}%`)
    control = h('label', { class: 'charge-ctl' },
      h('span', { class: 'lbl' }, 'Charge now', out),
      h('input', {
        type: 'range', min: '0', max: '100', step: '1', value: d.charge,
        oninput: ev => {
          const v = +ev.target.value
          out.textContent = v + '%'
          fill.style.width = v + '%'
          icon.className = battClass(v)
        },
        onchange: ev => {
          d.charge = +ev.target.value
          save()
          renderPlan()
        }
      })
    )
  }

  return h('article', { class: 'device' },
    icon,
    h('div', {}, h('h3', {}, d.name), h('p', { class: 'meta' }, meta)),
    control,
    h('div', { class: 'row-actions' },
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => openDevice(d.id) }, 'Edit'),
      h('button', { class: 'btn danger small', type: 'button', onclick: () => removeDevice(d.id) }, 'Delete')
    )
  )
}

function armed(label, armedLabel, action) {
  let ready = false
  let timer
  const b = h('button', {
    class: 'btn danger', type: 'button',
    onclick: () => {
      if (ready) {
        clearTimeout(timer)
        action()
        return
      }
      ready = true
      b.textContent = armedLabel
      b.classList.add('armed')
      timer = setTimeout(() => {
        ready = false
        b.textContent = label
        b.classList.remove('armed')
      }, 4000)
    }
  }, label)
  return b
}

function renderBackup() {
  const root = $('#view-backup')
  const { target, buffer } = state.settings
  const hasData = state.devices.length || state.outages.length

  const targetInput = h('input', { type: 'number', min: '20', max: '100', step: '5', value: target, inputmode: 'numeric' })
  const bufferInput = h('input', { type: 'number', min: '0', max: '240', step: '5', value: buffer, inputmode: 'numeric' })
  const saveSettings = () => {
    const t = Math.min(100, Math.max(20, Math.round(+targetInput.value || 100)))
    const b = Math.min(240, Math.max(0, Math.round(+bufferInput.value || 0)))
    state.settings = { target: t, buffer: b }
    targetInput.value = t
    bufferInput.value = b
    save()
    renderPlan()
    toast('Settings saved')
  }
  targetInput.addEventListener('change', saveSettings)
  bufferInput.addEventListener('change', saveSettings)

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', 'aria-label': 'Choose a backup file', onchange: ev => { const f = ev.target.files[0]; if (f) restore(f); ev.target.value = '' } })

  root.replaceChildren(
    pageHead('Settings and backup', 'Your data lives only in this browser. Download a backup before you switch phones or clear your browsing data.'),
    h('div', { class: 'settings' },
      h('section', { class: 'panel' },
        h('h2', {}, 'Charging'),
        h('label', { class: 'field' }, h('span', {}, 'Charge devices up to (%)'), targetInput, h('small', {}, 'Some people stop at 80 to 90% to keep their batteries healthy.')),
        h('label', { class: 'field' }, h('span', {}, 'Finish charging this many minutes early'), bufferInput, h('small', {}, 'Power sometimes goes out ahead of schedule.'))
      ),
      h('section', { class: 'panel' },
        h('h2', {}, 'Backup'),
        h('p', { class: 'sub' }, 'Save your devices and brownouts as a file, or bring them back from one.'),
        h('button', { class: 'btn dark', type: 'button', onclick: download, disabled: !hasData }, 'Download backup'),
        h('span', { class: 'btn ghost file-btn' }, 'Restore from a file', fileInput)
      ),
      h('section', { class: 'panel' },
        h('h2', {}, 'Sample data'),
        h('p', { class: 'sub' }, 'Fill the app with a phone, laptop, Wi-Fi router, fan, power bank and mini UPS, plus a 12-hour brownout tomorrow.'),
        hasData ? armed('Replace with sample data', 'Tap again to replace your data', loadSample) : h('button', { class: 'btn dark', type: 'button', onclick: loadSample }, 'Load sample data')
      ),
      h('section', { class: 'panel' },
        h('h2', {}, 'Start over'),
        h('p', { class: 'sub' }, 'Deletes every device, brownout and setting from this browser.'),
        armed('Delete everything', 'Tap again to delete everything', () => {
          state = blank()
          save()
          picked = null
          render()
          toast('Everything deleted')
        })
      )
    )
  )
}

function download() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = h('a', { href: url, download: `sindi-backup-${dateVal(new Date())}.json` })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  toast('Backup downloaded')
}

async function restore(file) {
  try {
    const data = JSON.parse(await file.text())
    if (!Array.isArray(data.devices) || !Array.isArray(data.outages)) throw new Error('shape')
    state = clean(data)
    picked = null
    firstPlan = true
    save()
    render()
    toast('Backup restored')
  } catch {
    toast("That file isn't a Sindí backup. Choose the .json file you downloaded from this page.")
  }
}

function sample() {
  const at = (days, hr, min = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + days)
    d.setHours(hr, min, 0, 0)
    return d.toISOString()
  }
  const phone = uid()
  const laptop = uid()
  const router = uid()
  const fan = uid()
  const ups = uid()
  const bank = uid()
  return clean({
    settings: { target: 100, buffer: 15 },
    devices: [
      { id: phone, name: 'My phone', type: 'phone', unit: 'mAh', capacity: 5000, volt: 3.85, charge: 62, useW: 2.5, chargerW: 18 },
      { id: laptop, name: 'Laptop', type: 'laptop', unit: 'Wh', capacity: 50, volt: 11.4, charge: 45, useW: 15, chargerW: 65 },
      { id: router, name: 'Wi-Fi router', type: 'router', unit: 'Wh', capacity: 0, volt: 12, charge: 0, useW: 8, chargerW: 0 },
      { id: fan, name: 'Rechargeable fan', type: 'fan', unit: 'mAh', capacity: 4400, volt: 3.7, charge: 50, useW: 5, chargerW: 5 },
      { id: ups, name: 'Mini UPS', type: 'ups', unit: 'mAh', capacity: 10400, volt: 3.7, charge: 70, eff: 80, chargerW: 12 },
      { id: bank, name: 'Power bank', type: 'powerbank', unit: 'mAh', capacity: 10000, volt: 3.7, charge: 30, eff: 65, chargerW: 18 }
    ],
    outages: [
      {
        id: uid(), start: at(1, 6), end: at(1, 18), area: 'Jaro (sample)', cause: 'maintenance', notes: 'Sample brownout for grid maintenance',
        needs: [
          { deviceId: laptop, label: 'Online class', hours: 3 },
          { deviceId: router, label: 'Internet for class', hours: 5 },
          { deviceId: phone, label: 'Messages and GCash', hours: 5 },
          { deviceId: fan, label: 'Cooling at noon', hours: 4 }
        ]
      },
      {
        id: uid(), start: at(3, 18), end: at(3, 21), area: 'Jaro (sample)', cause: 'rotational', notes: '',
        needs: [
          { deviceId: phone, label: 'Calls', hours: 2 },
          { deviceId: fan, label: 'Sleep', hours: 3, whole: true }
        ]
      },
      { id: uid(), start: at(-6, 5, 30), end: at(-6, 17, 30), area: 'Jaro (sample)', cause: 'maintenance', notes: '', needs: [] }
    ]
  })
}

function loadSample() {
  state = sample()
  picked = null
  firstPlan = true
  save()
  render()
  go('plan')
  window.scrollTo(0, 0)
  toast('Sample data loaded')
}

function removeOutage(id) {
  const i = state.outages.findIndex(o => o.id === id)
  if (i < 0) return
  const [gone] = state.outages.splice(i, 1)
  save()
  render()
  toast('Brownout deleted', () => {
    state.outages.splice(i, 0, gone)
    save()
    render()
  })
}

function removeDevice(id) {
  const i = state.devices.findIndex(d => d.id === id)
  if (i < 0) return
  const [gone] = state.devices.splice(i, 1)
  save()
  render()
  toast(`${gone.name} deleted`, () => {
    state.devices.splice(i, 0, gone)
    save()
    render()
  })
}

let toastTimer
function toast(msg, undo) {
  const t = $('#toast')
  t.replaceChildren(h('span', {}, msg))
  if (undo) {
    t.append(h('button', {
      type: 'button',
      onclick: () => {
        undo()
        t.classList.remove('show')
        toast('Restored')
      }
    }, 'Undo'))
  }
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), undo ? 6000 : 2600)
}

const deviceDialog = $('#device-dialog')
const deviceForm = $('#device-form')
let editingDevice = null

for (const [k, t] of Object.entries(TYPES)) deviceForm.elements.type.append(new Option(t.label, k))

function fillDevice(d) {
  const f = deviceForm.elements
  f.type.value = d.type
  f.capacity.value = d.capacity ?? ''
  f.unit.value = d.unit || 'mAh'
  f.volt.value = d.volt ?? 3.7
  f.useW.value = d.useW ?? ''
  f.eff.value = d.eff ?? 65
  f.chargerW.value = d.chargerW ?? ''
}

function openDevice(id) {
  editingDevice = id ? deviceById(id) : null
  deviceForm.reset()
  const f = deviceForm.elements
  const d = editingDevice || { type: 'phone', charge: 50, ...TYPES.phone }
  fillDevice(d)
  f.name.value = editingDevice ? d.name : ''
  f.charge.value = d.charge ?? 50
  $('#device-title').textContent = editingDevice ? 'Edit device' : 'Add device'
  syncDevice()
  deviceDialog.showModal()
  if (!editingDevice) f.name.focus()
}

function syncDevice() {
  const f = deviceForm.elements
  const t = TYPES[f.type.value]
  const show = {
    battery: !t.noBattery,
    volt: !t.noBattery && f.unit.value === 'mAh',
    use: !t.source,
    eff: !!t.source,
    charger: !t.noBattery
  }
  deviceForm.querySelectorAll('[data-show]').forEach(el => {
    const on = show[el.dataset.show]
    el.hidden = !on
    el.querySelectorAll('input, select').forEach(i => { i.disabled = !on })
  })
  f.name.placeholder = t.noBattery ? 'Wi-Fi router' : `My ${t.label.toLowerCase()}`
  f.chargeOut.value = f.charge.value
  const note = $('[data-device-note]')
  if (t.noBattery) {
    note.textContent = 'No battery to track. Sindí powers it from your power banks or mini UPS during a brownout.'
    return
  }
  const cap = parseFloat(f.capacity.value) || 0
  const wh = f.unit.value === 'Wh' ? cap : (cap * (parseFloat(f.volt.value) || 3.7)) / 1000
  if (!wh) {
    note.textContent = ''
    return
  }
  if (t.source) {
    const eff = parseFloat(f.eff.value) || 65
    note.textContent = `That's about ${fmtWh(wh)} stored, and about ${fmtWh((wh * eff) / 100)} can reach your other devices.`
  } else {
    const use = parseFloat(f.useW.value) || 0
    note.textContent = `That's about ${fmtWh(wh)}${use ? `, enough for roughly ${dur(wh / use)} of use on a full charge` : ''}.`
  }
}

deviceForm.elements.type.addEventListener('change', () => {
  const f = deviceForm.elements
  const t = TYPES[f.type.value]
  fillDevice({ type: f.type.value, ...t })
  syncDevice()
})

deviceForm.addEventListener('input', ev => {
  if (ev.target.name !== 'type') syncDevice()
})

deviceForm.addEventListener('submit', ev => {
  ev.preventDefault()
  const f = deviceForm.elements
  const type = f.type.value
  const t = TYPES[type]
  const num = (el, fb = 0) => {
    const n = parseFloat(el.value)
    return Number.isFinite(n) ? n : fb
  }
  if (!t.noBattery && num(f.capacity) <= 0) {
    $('[data-device-note]').textContent = 'Enter the battery size. You can find it on the box, the battery, or the phone settings.'
    f.capacity.focus()
    return
  }
  if (!t.source && num(f.useW) <= 0) {
    $('[data-device-note]').textContent = 'Enter how much power it uses while on, so Sindí can work out how long it lasts.'
    f.useW.focus()
    return
  }
  const d = clean({
    devices: [{
      id: editingDevice?.id || uid(),
      name: f.name.value.trim() || (t.noBattery ? 'Wi-Fi router' : `My ${t.label.toLowerCase()}`),
      type,
      unit: t.noBattery ? 'Wh' : f.unit.value,
      capacity: t.noBattery ? 0 : num(f.capacity),
      volt: num(f.volt, t.volt),
      charge: t.noBattery ? 0 : Math.round(num(f.charge, 50)),
      useW: t.source ? 0 : num(f.useW),
      eff: t.source ? num(f.eff, t.eff) : t.eff,
      chargerW: t.noBattery ? 0 : num(f.chargerW)
    }]
  }).devices[0]
  if (editingDevice) state.devices[state.devices.indexOf(editingDevice)] = d
  else state.devices.push(d)
  save()
  deviceDialog.close()
  render()
  toast(editingDevice ? `${d.name} updated` : `${d.name} added`)
})

const outageDialog = $('#outage-dialog')
const outageForm = $('#outage-form')
const addNeedBtn = $('[data-add-need]')
let editingOutage = null
let needDraft = []

for (const [k, label] of Object.entries(CAUSES)) outageForm.elements.cause.append(new Option(label, k))

function openOutage(id) {
  editingOutage = id ? state.outages.find(o => o.id === id) : null
  outageForm.reset()
  const f = outageForm.elements
  let s
  let e
  if (editingOutage) {
    s = startOf(editingOutage)
    e = endOf(editingOutage)
  } else {
    s = new Date()
    s.setDate(s.getDate() + 1)
    s.setHours(6, 0, 0, 0)
    e = new Date(s)
    e.setHours(18)
  }
  f.date.value = dateVal(s)
  f.startTime.value = timeVal(s)
  f.endTime.value = timeVal(e)
  f.area.value = editingOutage?.area || ''
  f.cause.value = editingOutage?.cause || 'maintenance'
  f.notes.value = editingOutage?.notes || ''
  needDraft = (editingOutage?.needs || []).map(n => ({ ...n }))
  $('#outage-title').textContent = editingOutage ? 'Edit brownout' : 'Add brownout'
  renderNeedRows()
  syncSpan()
  outageDialog.showModal()
}

function spanFromForm() {
  const f = outageForm.elements
  if (!f.date.value || !f.startTime.value || !f.endTime.value) return null
  const s = new Date(`${f.date.value}T${f.startTime.value}`)
  let e = new Date(`${f.date.value}T${f.endTime.value}`)
  if (isNaN(s) || isNaN(e)) return null
  if (e <= s) e = new Date(+e + 864e5)
  return { s, e }
}

function syncSpan() {
  const note = $('[data-span]')
  const span = spanFromForm()
  note.classList.remove('warn')
  if (!span) {
    note.textContent = 'Fill in the date and both times.'
    note.classList.add('warn')
    return
  }
  const hrs = (span.e - span.s) / 36e5
  note.textContent = `${dur(hrs)} without power${sameDay(span.s, span.e) ? '' : ', ending the next day'}.`
  if (hrs >= 24) {
    note.textContent = 'Start and end are the same time, which makes this a 24-hour brownout. Check the times.'
    note.classList.add('warn')
  }
}

function renderNeedRows() {
  const box = $('[data-needs]')
  box.replaceChildren()
  const users = state.devices.filter(d => !isSource(d))
  if (!users.length) {
    addNeedBtn.hidden = true
    box.append(h('p', { class: 'form-note' }, 'Add your phone, laptop or router in Devices first. Then come back and list what you need them for.'))
    return
  }
  addNeedBtn.hidden = false
  if (!needDraft.length) box.append(h('p', { class: 'form-note' }, 'Nothing listed yet. Add what has to keep running, like an online class or the Wi-Fi.'))
  needDraft.forEach((n, i) => {
    if (!users.some(d => d.id === n.deviceId)) n.deviceId = users[0].id
    const hours = h('input', {
      type: 'number', min: '0.25', step: '0.25', value: n.hours || 1, inputmode: 'decimal', disabled: !!n.whole,
      oninput: ev => { n.hours = parseFloat(ev.target.value) || 0 }
    })
    if (!n.hours) n.hours = 1
    const select = h('select', { onchange: ev => { n.deviceId = ev.target.value } },
      users.map(d => h('option', { value: d.id, selected: d.id === n.deviceId }, d.name)))
    const whole = h('input', {
      type: 'checkbox', checked: !!n.whole,
      onchange: ev => { n.whole = ev.target.checked; hours.disabled = n.whole }
    })
    box.append(h('div', { class: 'need-row' },
      h('label', { class: 'field' }, h('span', {}, 'Device'), select),
      h('label', { class: 'field' }, h('span', {}, 'For'), h('input', { value: n.label || '', maxlength: '40', placeholder: 'Online class', oninput: ev => { n.label = ev.target.value } })),
      h('label', { class: 'field' }, h('span', {}, 'Hours'), hours),
      h('button', { type: 'button', class: 'btn ghost small', 'aria-label': `Remove need ${i + 1}`, onclick: () => { needDraft.splice(i, 1); renderNeedRows() } }, 'Remove'),
      h('label', { class: 'whole' }, whole, 'Needed for the whole brownout')
    ))
  })
}

addNeedBtn.addEventListener('click', () => {
  const users = state.devices.filter(d => !isSource(d))
  const taken = new Set(needDraft.map(n => n.deviceId))
  const next = users.find(d => !taken.has(d.id)) || users[0]
  needDraft.push({ id: uid(), deviceId: next.id, label: '', hours: 1, whole: false })
  renderNeedRows()
  const rows = document.querySelectorAll('.need-row')
  rows[rows.length - 1]?.querySelector('input')?.focus()
})

outageForm.addEventListener('input', ev => {
  if (['date', 'startTime', 'endTime'].includes(ev.target.name)) syncSpan()
})

outageForm.addEventListener('submit', ev => {
  ev.preventDefault()
  const span = spanFromForm()
  if (!span) {
    syncSpan()
    return
  }
  const f = outageForm.elements
  const o = clean({
    outages: [{
      id: editingOutage?.id || uid(),
      start: span.s.toISOString(),
      end: span.e.toISOString(),
      area: f.area.value.trim(),
      cause: f.cause.value,
      notes: f.notes.value.trim(),
      needs: needDraft.filter(n => n.deviceId && (n.whole || n.hours > 0)).map(n => ({ ...n, label: (n.label || '').trim() }))
    }]
  }).outages[0]
  if (editingOutage) state.outages[state.outages.indexOf(editingOutage)] = o
  else state.outages.push(o)
  if (statusOf(o) !== 'past') {
    picked = o.id
    firstPlan = true
  }
  save()
  outageDialog.close()
  render()
  toast(editingOutage ? 'Brownout updated' : 'Brownout added')
})

document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()))

window.addEventListener('hashchange', () => {
  route()
  window.scrollTo(0, 0)
})

window.addEventListener('storage', ev => {
  if (ev.key !== KEY) return
  state = load()
  render()
})

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && view === 'plan') renderPlan()
})

setInterval(() => {
  if (view !== 'plan' || document.querySelector('dialog[open]')) return
  if ($('#hero').contains(document.activeElement)) return
  renderPlan()
}, 30000)

route()
render()

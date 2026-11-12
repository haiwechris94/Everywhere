/**
 * PeopleGroupsList — « Peuples » (FR) / « People Groups » (EN)
 *
 * Global, filterable list of ALL people groups. Filters cascade:
 *   Country -> Admin 1 (region) -> Admin 2 -> Admin 3 (shown only when applicable).
 * Admin/supervisor users can add, edit and (reversibly) archive people groups.
 * Archived records are hidden by default and can be shown / restored via the toggle.
 */
import { useId, useMemo, useState } from 'react'
import { useDialog } from '../components/ui/useDialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Search, Plus, Pencil, Archive, ArchiveRestore, X, ChevronLeft, ChevronRight, LayoutGrid, List, Church, Users, Target, Flag, Share2, Download, Link2, HeartHandshake } from 'lucide-react'
import { peopleGroupsApi, fetchAllPages } from '../services/api'
import { reportingApi } from '../services/reportingApi'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import { PageHeader, StateLoading, StateError, StateEmpty } from './geography/geoComponents'
import { getCountryFlag, countryCodeToDisplayName, dbNameToCountryCode } from '../utils/countryUtils'
import { statusKeyFor } from '../utils/statusColors'
import {
  isDmmEngagement,
  dmmStageFromChurches,
  dmmStageLabel,
  dmmStageColors,
  dmmLevelFromGeneration,
  dmmLevelLabel,
  DMM_STAGE,
} from '../utils/dmmEngagement'

// Ordered DMM stages (pionnier -> mouvement). Used for the card progress bar:
// the filled fraction = (index of the people's stage + 1) / 4.
const DMM_STAGE_ORDER = [
  DMM_STAGE.PIONEER,
  DMM_STAGE.MIDWAY,
  DMM_STAGE.TIPPING_POINT,
  DMM_STAGE.MOVEMENT,
]

const countryOf = (pg) => pg.country || pg.countryCode || ''
// Stable identity for a country: ISO code. Falls back to resolving the (possibly
// localized) free-text country name — so a DMM record "Cameroun" and a Joshua
// Project record "Cameroon" both collapse onto the same code (CM) instead of
// appearing as two separate countries in the filter.
const countryCodeOf = (pg) =>
  (pg.countryCode || dbNameToCountryCode(pg.country) || '').toUpperCase()
const admin1Of = (pg) => pg.region || ''
const admin2Of = (pg) => pg.admin2 || pg.departement || ''
const admin3Of = (pg) => pg.admin3 || pg.arrondissement || ''

const STATUS_OPTIONS = ['unreached', 'pioneer', 'midway', 'tipping-point', 'dmm']
const statusClass = (s) =>
  ({
    unreached: 'bg-red-100 text-red-800',
    pioneer: 'bg-yellow-100 text-yellow-800',
    midway: 'bg-blue-100 text-blue-800',
    'tipping-point': 'bg-orange-100 text-orange-800',
    dmm: 'bg-green-100 text-green-800',
  }[s] || 'bg-neutral-100 text-neutral-600')

const distinct = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'))

const emptyForm = {
  name: '',
  villageName: '',
  country: '',
  countryCode: '',
  region: '',
  admin2: '',
  admin3: '',
  status: '',
  numberOfChurches: '',
  churchGeneration: '',
  donor: '',
  nationalCoordinator: '',
  churchPlanter: '',
  description: '',
}

// Short labels for each DMM stage, shown under the progress bar crans.
const DMM_STAGE_SHORT_FR = ['Pionnier', 'Mi-chemin', 'Basculement', 'DMM']
const DMM_STAGE_SHORT_EN = ['Pioneer', 'Midway', 'Tipping', 'DMM']

// Compact number formatter (1 500 -> "1,5 k", 2 300 000 -> "2,3 M").
const formatCompact = (n, isFrench) => {
  const v = Number(n) || 0
  try {
    return new Intl.NumberFormat(isFrench ? 'fr-FR' : 'en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(v)
  } catch {
    return v.toLocaleString(isFrench ? 'fr-FR' : 'en-US')
  }
}

// One small stat block (value + label) used in the card footer.
const CardStat = ({ icon: Icon, value, label }) => (
  <div className="flex flex-col items-center rounded-lg bg-neutral-50 px-2 py-2 text-center dark:bg-slate-900">
    <span className="flex items-center gap-1 text-sm font-semibold text-neutral-900 dark:text-slate-100">
      {Icon && <Icon size={13} className="text-neutral-500 dark:text-slate-400" />} {value}
    </span>
    <span className="mt-0.5 text-xs leading-tight text-neutral-500">{label}</span>
  </div>
)

// Is this people group currently sponsored by a funding partner?
const isSponsored = (pg) => !!(pg.donor && String(pg.donor).trim())

// Escape helper so people data can be safely injected into the printable HTML.
const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Build & open a self-contained, print-ready "partner sheet" for one people
 * group in a new window. The user can then Save as PDF / print from the browser
 * dialog. Kept self-contained (inline styles, no app CSS) so it renders the same
 * everywhere and the flag emoji shows correctly.
 */
const openPeopleSheet = (pg, { isFrench, shareUrl }) => {
  const stage = dmmStageFromChurches(pg.numberOfChurches)
  const colors = dmmStageColors(stage)
  const churches = Number(pg.numberOfChurches) || 0
  const population = Number(pg.population) || 0
  const generations = Number(pg.churchGeneration ?? pg.maxGeneration) || 0
  const level = dmmLevelFromGeneration(generations, stage)
  const stageIndex = stage ? DMM_STAGE_ORDER.indexOf(stage) : -1
  const shortLabels = isFrench ? DMM_STAGE_SHORT_FR : DMM_STAGE_SHORT_EN
  const location = [admin1Of(pg), admin2Of(pg), countryOf(pg)].filter(Boolean).join(' · ')
  const nf = (n) => Number(n || 0).toLocaleString(isFrench ? 'fr-FR' : 'en-US')

  const t = isFrench
    ? {
        title: 'Fiche peuple', sub: 'Partenaire financier',
        stageLbl: 'Étape DMM', pop: 'Population', churches: 'Églises', gen: 'Générations',
        sponsored: 'Parrainé par', toSponsor: 'À parrainer — aucun partenaire financier',
        progress: 'Progression du mouvement', seeMore: 'Voir en ligne', print: 'Imprimer / Enregistrer en PDF',
        notEngaged: 'Pas encore engagé',
      }
    : {
        title: 'People Sheet', sub: 'Financial partner',
        stageLbl: 'DMM stage', pop: 'Population', churches: 'Churches', gen: 'Generations',
        sponsored: 'Sponsored by', toSponsor: 'To sponsor — no funding partner yet',
        progress: 'Movement progress', seeMore: 'View online', print: 'Print / Save as PDF',
        notEngaged: 'Not yet engaged',
      }

  const bars = DMM_STAGE_ORDER.map((s, i) => {
    const on = i <= stageIndex
    return `<div style="flex:1;height:10px;border-radius:999px;background:${on ? colors.hex : '#e5e7eb'}"></div>`
  }).join('')
  const barLabels = shortLabels
    .map((lbl, i) => `<span style="flex:1;text-align:center;font-size:11px;color:${i === stageIndex ? '#111827' : '#9ca3af'};font-weight:${i === stageIndex ? 700 : 400}">${esc(lbl)}</span>`)
    .join('')

  const sponsorBlock = isSponsored(pg)
    ? `<div style="margin-top:18px;padding:12px 14px;border-radius:12px;background:#ecfdf5;color:#065f46;font-size:14px"><strong>${t.sponsored} :</strong> ${esc(pg.donor)}</div>`
    : `<div style="margin-top:18px;padding:12px 14px;border-radius:12px;background:#fffbeb;color:#92400e;font-size:14px">★ ${t.toSponsor}</div>`

  const html = `<!doctype html><html lang="${isFrench ? 'fr' : 'en'}"><head><meta charset="utf-8">
<title>${esc(pg.name || t.title)} — ${t.title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  *{box-sizing:border-box} body{margin:0;font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;background:#f3f4f6}
  .sheet{max-width:640px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden}
  .head{padding:24px;border-bottom:1px solid #f1f5f9;display:flex;gap:16px;align-items:flex-start}
  .flag{font-size:44px;line-height:1}
  .h-name{font-size:22px;font-weight:700;margin:0}
  .h-loc{margin:4px 0 0;color:#6b7280;font-size:14px}
  .badge{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background:${colors.hex};color:#fff}
  .body{padding:24px}
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:4px}
  .stat{background:#f9fafb;border-radius:12px;padding:14px;text-align:center}
  .stat .v{font-size:20px;font-weight:700}
  .stat .l{font-size:12px;color:#6b7280;margin-top:2px}
  .sec{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin:0 0 8px}
  .foot{padding:16px 24px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:13px;color:#6b7280}
  .btns{margin:18px auto 0;max-width:640px;display:flex;gap:10px;justify-content:center}
  .btn{appearance:none;border:1px solid #0C6A85;background:#0C6A85;color:#fff;padding:10px 16px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer}
  a{color:#0C6A85}
  @media print{ body{background:#fff} .btns{display:none} .sheet{border:none;margin:0} }
</style></head>
<body>
  <div class="sheet" id="sheet">
    <div class="head">
      <div class="flag">${getCountryFlag(pg.countryCode)}</div>
      <div style="flex:1;min-width:0">
        <p class="sec" style="margin:0 0 2px">${t.sub}</p>
        <h1 class="h-name">${esc(pg.name || '—')}</h1>
        ${location ? `<p class="h-loc">${esc(location)}</p>` : ''}
        <span class="badge">${t.stageLbl}: ${esc(dmmStageLabel(stage, isFrench) || t.notEngaged)}</span>
      </div>
    </div>
    <div class="body">
      <p class="sec">${t.progress}</p>
      <div style="display:flex;gap:6px">${bars}</div>
      <div style="display:flex;gap:6px;margin-top:6px">${barLabels}</div>
      <div class="stats">
        <div class="stat"><div class="v">${population > 0 ? nf(population) : '—'}</div><div class="l">${t.pop}</div></div>
        <div class="stat"><div class="v">${nf(churches)}</div><div class="l">${t.churches}</div></div>
        <div class="stat"><div class="v">${generations > 0 ? generations : '—'}</div><div class="l">${level ? esc(dmmLevelLabel(level, isFrench)) : t.gen}</div></div>
      </div>
      ${sponsorBlock}
    </div>
    <div class="foot">
      <span>${new Date().toLocaleDateString(isFrench ? 'fr-FR' : 'en-US')}</span>
      ${shareUrl ? `<a href="${esc(shareUrl)}">${t.seeMore}</a>` : ''}
    </div>
  </div>
  <div class="btns"><button class="btn" onclick="window.print()">${t.print}</button></div>
</body></html>`

  const w = window.open('', '_blank', 'noopener,noreferrer,width=760,height=900')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}

/**
 * Share modal for a people group — lets a user send a partner-facing sheet to a
 * donor: open/print the PDF sheet, or copy a read-only link to the people page.
 */
const ShareModal = ({ pg, shareUrl, isFrench, onClose }) => {
  const dialogRef = useDialog(true, onClose)
  const stop = (e) => e.stopPropagation()
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      toast.success(isFrench ? 'Lien copié' : 'Link copied')
    } catch {
      toast.error(isFrench ? 'Copie impossible' : 'Copy failed')
    }
  }
  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: pg.name, url: shareUrl })
      } catch { /* user cancelled */ }
    } else {
      copyLink()
    }
  }
  const openSheet = () => {
    const ok = openPeopleSheet(pg, { isFrench, shareUrl })
    if (!ok) toast.error(isFrench ? 'Autorisez les pop-ups pour générer la fiche.' : 'Allow pop-ups to generate the sheet.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div ref={dialogRef} className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800" onClick={stop}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-slate-100">
            <Share2 size={18} /> {isFrench ? 'Partager ce peuple' : 'Share this people group'}
          </h2>
          <button aria-label={isFrench ? "Fermer" : "Close"} type="button" onClick={onClose} className="rounded p-1 text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>
        <p className="mb-4 text-sm text-neutral-600 dark:text-slate-300">
          {isFrench
            ? 'Envoyez une fiche à un partenaire financier, ou copiez un lien vers ce peuple.'
            : 'Send a sheet to a financial partner, or copy a link to this people group.'}
        </p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={openSheet}
            className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <Download size={18} className="text-indigo-600 dark:text-indigo-300" />
            {isFrench ? 'Générer la fiche (PDF / impression)' : 'Generate sheet (PDF / print)'}
          </button>
          <button
            type="button"
            onClick={copyLink}
            className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <Link2 size={18} className="text-indigo-600 dark:text-indigo-300" />
            {isFrench ? 'Copier le lien de la fiche' : 'Copy link to the sheet'}
          </button>
          {typeof navigator !== 'undefined' && navigator.share && (
            <button
              type="button"
              onClick={nativeShare}
              className="flex w-full items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-700"
            >
              <Share2 size={18} className="text-indigo-600 dark:text-indigo-300" />
              {isFrench ? 'Partager…' : 'Share…'}
            </button>
          )}
        </div>
        <div className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500 break-all dark:bg-slate-900">
          {shareUrl}
        </div>
      </div>
    </div>
  )
}

/**
 * Visual, story-oriented card for one people group — designed to be engaging
 * for missionaries and financial partners. Shows the country flag, name &
 * location, a sponsorship badge, the DMM stage badge, a one-line narrative, a
 * labelled 4-step DMM progress bar (Pionnier -> Mi-chemin -> Point de bascule
 * -> DMM), a stat row (population, churches, generations/DMM level) and a
 * Share action to send a partner sheet to a donor.
 */
const PeopleCard = ({ pg, href, isFrench, onShare }) => {
  const stage = dmmStageFromChurches(pg.numberOfChurches)
  const colors = dmmStageColors(stage)
  const stageIndex = stage ? DMM_STAGE_ORDER.indexOf(stage) : -1
  const churches = Number(pg.numberOfChurches) || 0
  const population = Number(pg.population) || 0
  const generations = Number(pg.churchGeneration ?? pg.maxGeneration) || 0
  const level = dmmLevelFromGeneration(generations, stage)
  const location = [admin1Of(pg), countryOf(pg)].filter(Boolean).join(' · ')
  const shortLabels = isFrench ? DMM_STAGE_SHORT_FR : DMM_STAGE_SHORT_EN
  const sponsored = isSponsored(pg)

  // One-line narrative tailored to the engagement state.
  const story = stage
    ? isFrench
      ? `${churches} église${churches > 1 ? 's' : ''} implantée${churches > 1 ? 's' : ''} · étape « ${dmmStageLabel(stage, true)} »`
      : `${churches} church${churches > 1 ? 'es' : ''} planted · "${dmmStageLabel(stage, false)}" stage`
    : isFrench
      ? 'Peuple pas encore engagé — une opportunité à saisir.'
      : 'People group not yet engaged — an opportunity to seize.'

  return (
    <Link
      to={href}
      className="group relative flex flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:bg-slate-800 dark:border-slate-700"
    >
      {/* Share button (does not trigger navigation) */}
      <button
        type="button"
        title={isFrench ? 'Partager / fiche partenaire' : 'Share / partner sheet'}
        aria-label={isFrench ? 'Partager' : 'Share'}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShare?.(pg) }}
        className="absolute right-2 top-2 rounded-md p-1.5 text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 hover:text-indigo-600 dark:hover:bg-slate-700"
      >
        <Share2 size={16} />
      </button>

      {/* Header */}
      <div className="flex items-start gap-3 pr-7">
        <span className="text-3xl leading-none" aria-hidden="true">
          {getCountryFlag(pg.countryCode)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold text-neutral-900 group-hover:text-primary-700 dark:text-slate-100">
            {pg.name || (isFrench ? 'Sans nom' : 'Unnamed')}
          </h3>
          {location && <p className="truncate text-xs text-neutral-500">{location}</p>}
          {/* Sponsorship badge */}
          <span
            className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${sponsored ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
          >
            <HeartHandshake size={11} />
            {sponsored
              ? (isFrench ? `Parrainé · ${pg.donor}` : `Sponsored · ${pg.donor}`)
              : (isFrench ? 'À parrainer' : 'To sponsor')}
          </span>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${colors.badge}`}>
          {dmmStageLabel(stage, isFrench)}
        </span>
      </div>

      {/* Narrative line */}
      <p className="mt-3 text-xs leading-snug text-neutral-600 dark:text-slate-300">{story}</p>

      {/* Labelled 4-step DMM progress bar */}
      <div className="mt-3">
        <div className="flex gap-1">
          {DMM_STAGE_ORDER.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= stageIndex ? '' : 'bg-neutral-200'}`}
              style={i <= stageIndex ? { backgroundColor: colors.hex } : undefined}
            />
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {shortLabels.map((lbl, i) => (
            <span
              key={lbl}
              className={`flex-1 text-center text-xs leading-tight ${i === stageIndex ? 'font-semibold text-neutral-700' : 'text-neutral-500 dark:text-slate-400'}`}
            >
              {lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Stat row: population · churches · generations (DMM level) */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <CardStat
          icon={Users}
          value={population > 0 ? formatCompact(population, isFrench) : '—'}
          label={isFrench ? 'Population' : 'Population'}
        />
        <CardStat
          icon={Church}
          value={churches}
          label={isFrench ? 'Églises' : 'Churches'}
        />
        <CardStat
          icon={Target}
          value={generations > 0 ? generations : '—'}
          label={level ? dmmLevelLabel(level, isFrench) : (isFrench ? 'Générations' : 'Generations')}
        />
      </div>
    </Link>
  )
}

const PeopleGroupsList = () => {
  const { isFrench } = useLanguage()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = !!user && (user.role === 'admin' || user.role === 'supervisor')

  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [fCountry, setFCountry] = useState('')
  const [fAdmin1, setFAdmin1] = useState('')
  const [fAdmin2, setFAdmin2] = useState('')
  const [fAdmin3, setFAdmin3] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [fSource, setFSource] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const formDialogRef = useDialog(formOpen, () => setFormOpen(false))
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  // Client-side pagination. The full dataset is loaded once (needed so the
  // cascading filters span every country), but we only render ONE page of rows
  // at a time to keep the DOM light and the page fast on large datasets.
  const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Display mode: 'table' (dense, management) or 'cards' (visual, donor-friendly).
  const [view, setView] = useState('table')
  // People group currently open in the Share modal (null = closed).
  const [sharing, setSharing] = useState(null)

  // Fetch EVERY people group across all countries. The server caps `limit` at
  // 500 per request, so a single getAll() call only ever returned the first 500
  // records (and therefore only the first countries in sort order). fetchAllPages
  // walks every page (page/limit) using the server's totalPages/hasMore and
  // returns the full, _id-de-duplicated set — no 500 cap, all countries included.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['pg-list', showArchived],
    queryFn: () =>
      fetchAllPages(
        (params) => peopleGroupsApi.getAll(params),
        showArchived ? { onlyArchived: 'true' } : {},
        { limit: 500 }
      ),
  })

  // Dedoublonnage : un peuple = une ligne (cle masterPeopleId, repli nom+pays).
  const list = useMemo(() => {
    const raw = Array.isArray(data) ? data : []
    const seen = new Map()
    for (const p of raw) {
      const key = p.masterPeopleId
        ? `m:${p.masterPeopleId}`
        : `n:${(p.name || '').toLowerCase()}|${countryCodeOf(p)}`
      const prev = seen.get(key)
      if (!prev || (Number(p.numberOfChurches) || 0) > (Number(prev.numberOfChurches) || 0)) seen.set(key, p)
    }
    return Array.from(seen.values())
  }, [data])

  // Carte pays(alpha-2) -> region NG pour lier vers la fiche detail du peuple.
  const { data: regionsData } = useQuery({
    queryKey: ['ng-regions-min'],
    queryFn: async () => {
      const r = await reportingApi.getRegions()
      return Array.isArray(r?.data?.data) ? r.data.data : []
    },
    staleTime: 300000,
  })
  const countryToRegion = useMemo(() => {
    const m = {}
    for (const reg of regionsData || []) {
      for (const c of reg.countries || []) {
        if (c.code) m[String(c.code).toUpperCase()] = reg.id
      }
    }
    return m
  }, [regionsData])
  const peopleHref = (pg) => {
    const cc = (pg.countryCode || '').toUpperCase()
    const regionId = countryToRegion[cc]
    if (pg.masterPeopleId && regionId && cc) {
      return `/regions/${regionId}/countries/${cc}/peoples/${pg.masterPeopleId}`
    }
    return `/people-groups/${pg._id}`
  }


  // One option per country CODE (not per raw text), so "Cameroun" (DMM) and
  // "Cameroon" (JP) collapse to a single entry. Each option is {value: code,
  // label: localized name}. The label follows the UI language.
  const countryOptions = useMemo(() => {
    const byCode = new Map()
    for (const p of list) {
      const code = countryCodeOf(p)
      if (!code || byCode.has(code)) continue
      byCode.set(code, countryCodeToDisplayName(code, isFrench) || countryOf(p) || code)
    }
    return Array.from(byCode, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label, isFrench ? 'fr' : 'en')
    )
  }, [list, isFrench])
  const admin1Options = useMemo(
    () => distinct(list.filter((p) => !fCountry || countryCodeOf(p) === fCountry).map(admin1Of)),
    [list, fCountry]
  )
  const admin2Options = useMemo(
    () =>
      distinct(
        list
          .filter((p) => (!fCountry || countryCodeOf(p) === fCountry) && (!fAdmin1 || admin1Of(p) === fAdmin1))
          .map(admin2Of)
      ),
    [list, fCountry, fAdmin1]
  )
  const admin3Options = useMemo(
    () =>
      distinct(
        list
          .filter(
            (p) =>
              (!fCountry || countryCodeOf(p) === fCountry) &&
              (!fAdmin1 || admin1Of(p) === fAdmin1) &&
              (!fAdmin2 || admin2Of(p) === fAdmin2)
          )
          .map(admin3Of)
      ),
    [list, fCountry, fAdmin1, fAdmin2]
  )

  const statusOptions = useMemo(() => distinct(list.map((p) => p.status || '')), [list])
  const sourceOptions = useMemo(() => distinct(list.map((p) => p.source || '')), [list])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((p) => {
      if (fCountry && countryCodeOf(p) !== fCountry) return false
      if (fAdmin1 && admin1Of(p) !== fAdmin1) return false
      if (fAdmin2 && admin2Of(p) !== fAdmin2) return false
      if (fAdmin3 && admin3Of(p) !== fAdmin3) return false
      if (fStatus && (p.status || '') !== fStatus) return false
      if (fSource && (p.source || '') !== fSource) return false
      if (q) {
        // Match both the raw name and the localized label so searching
        // "Cameroun" or "Cameroon" both hit the same records.
        const cc = countryCodeOf(p)
        const localized = `${countryCodeToDisplayName(cc, true) || ''} ${countryCodeToDisplayName(cc, false) || ''}`
        const hay = `${p.name || ''} ${p.villageName || ''} ${countryOf(p)} ${localized} ${admin1Of(p)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [list, fCountry, fAdmin1, fAdmin2, fAdmin3, fStatus, fSource, search])

  // Derive the current page of rows. Clamp the page so it stays valid when the
  // filtered set shrinks (e.g. after typing a search or picking a country).
  const totalItems = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filtered.slice(start, start + pageSize)
  }, [filtered, safePage, pageSize])

  // Any change to filters/search/page-size sends the user back to page 1.
  const resetToFirstPage = () => setPage(1)
  const pageStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1
  const pageEnd = Math.min(safePage * pageSize, totalItems)

  // Aggregated KPIs over the CURRENTLY FILTERED set (not just the visible page),
  // so the impact banner reflects whatever the user has filtered down to.
  const kpis = useMemo(() => {
    let engaged = 0
    let churches = 0
    let reached = 0
    let unreached = 0
    for (const pg of filtered) {
      if (isDmmEngagement(pg)) engaged += 1
      churches += Number(pg.numberOfChurches) || 0
      const key = statusKeyFor(pg.status)
      if (key === 'unreached') unreached += 1
      else if (key === 'movement' || key === 'reached') reached += 1
    }
    const total = filtered.length
    const notEngaged = total - engaged
    const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0)
    return {
      total,
      engaged,
      notEngaged,
      churches,
      reached,
      unreached,
      reachedPct: pct(reached),
      unreachedPct: pct(unreached),
      engagedPct: pct(engaged),
    }
  }, [filtered])

  const saveMutation = useMutation({
    mutationFn: (payload) => {
      const body = { ...payload }
      ;['numberOfChurches', 'churchGeneration'].forEach((k) => {
        if (body[k] === '' || body[k] === null || body[k] === undefined) delete body[k]
        else body[k] = Number(body[k])
      })
      Object.keys(body).forEach((k) => {
        if (typeof body[k] === 'string' && body[k].trim() === '') delete body[k]
      })
      return editing ? peopleGroupsApi.update(editing._id, body) : peopleGroupsApi.create(body)
    },
    onSuccess: () => {
      toast.success(editing ? (isFrench ? 'Peuple mis à jour' : 'People group updated') : isFrench ? 'Peuple ajouté' : 'People group added')
      queryClient.invalidateQueries({ queryKey: ['pg-list'] })
      closeForm()
    },
    onError: (e) => toast.error(e?.response?.data?.message || (isFrench ? 'Échec de l’enregistrement' : 'Save failed')),
  })

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }) => (archived ? peopleGroupsApi.unarchive(id) : peopleGroupsApi.archive(id)),
    onSuccess: (_r, v) => {
      toast.success(v.archived ? (isFrench ? 'Peuple désarchivé' : 'Unarchived') : isFrench ? 'Peuple archivé' : 'Archived')
      queryClient.invalidateQueries({ queryKey: ['pg-list'] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || (isFrench ? 'Action impossible' : 'Action failed')),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }
  const openEdit = (pg) => {
    setEditing(pg)
    setForm({
      name: pg.name || '',
      villageName: pg.villageName || '',
      country: pg.country || '',
      countryCode: pg.countryCode || '',
      region: pg.region || '',
      admin2: pg.admin2 || pg.departement || '',
      admin3: pg.admin3 || pg.arrondissement || '',
      status: pg.status || '',
      numberOfChurches: pg.numberOfChurches ?? '',
      churchGeneration: pg.churchGeneration ?? '',
      donor: pg.donor || '',
      nationalCoordinator: pg.nationalCoordinator || '',
      churchPlanter: pg.churchPlanter || '',
      description: pg.description || '',
    })
    setFormOpen(true)
  }
  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }
  const onField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const Select = ({ value, onChange, options, placeholder }) =>
    options.length > 0 ? (
      <select
        value={value}
        onChange={onChange}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => {
          const value = typeof o === 'object' ? o.value : o
          const label = typeof o === 'object' ? o.label : o
          return (
            <option key={value} value={value}>
              {label}
            </option>
          )
        })}
      </select>
    ) : null

  return (
    <div className="p-6">
      <PageHeader
        breadcrumb={[{ label: isFrench ? 'Peuples' : 'People Groups' }]}
        title={isFrench ? 'Peuples' : 'People Groups'}
        subtitle={
          isFrench
            ? 'Liste de tous les peuples, filtrable par pays et niveaux administratifs 1, 2 et 3.'
            : 'All people groups, filterable by country and administrative levels 1, 2 and 3.'
        }
        stats={[{ label: isFrench ? 'Peuples' : 'People Groups', value: filtered.length }]}
      />

      {/* Impact banner — aggregated KPIs over the filtered set */}
      {!isLoading && !isError && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <Users size={14} /> {isFrench ? 'Peuples' : 'People groups'}
            </div>
            <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-slate-100">{kpis.total}</div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <Flag size={14} /> {isFrench ? 'Engagés' : 'Engaged'}
            </div>
            <div className="mt-1 text-2xl font-bold text-primary-600 dark:text-primary-300">{kpis.engaged}</div>
            <div className="text-xs text-neutral-500">{kpis.engagedPct}% {isFrench ? 'du total' : 'of total'}</div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <Church size={14} /> {isFrench ? 'Églises plantées' : 'Churches planted'}
            </div>
            <div className="mt-1 text-2xl font-bold text-green-600 dark:text-green-300">{kpis.churches.toLocaleString(isFrench ? 'fr-FR' : 'en-US')}</div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <Target size={14} /> {isFrench ? 'Atteints / Non-atteints' : 'Reached / Unreached'}
            </div>
            <div className="mt-1 text-2xl font-bold text-neutral-900 dark:text-slate-100">
              <span className="text-green-600 dark:text-green-300">{kpis.reachedPct}%</span>
              <span className="mx-1 text-neutral-500 dark:text-slate-400">/</span>
              <span className="text-red-500">{kpis.unreachedPct}%</span>
            </div>
            <div className="text-xs text-neutral-500">{kpis.reached} / {kpis.unreached}</div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:bg-slate-800 dark:border-slate-700">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              <Users size={14} /> {isFrench ? 'Sans engagement' : 'No engagement'}
            </div>
            <div className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-300">{kpis.notEngaged}</div>
            <div className="text-xs text-neutral-500">{isFrench ? 'à mobiliser' : 'to mobilize'}</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="btn-primary btn-sm gap-1.5"
          >
            <Plus size={16} /> {isFrench ? 'Ajouter un peuple' : 'Add people group'}
          </button>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-slate-300">
          <input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); resetToFirstPage() }} />
          {isFrench ? 'Afficher les archivés' : 'Show archived'}
        </label>
        {/* View switch: table (dense) vs cards (visual) */}
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-neutral-200 dark:border-slate-700">
          <button
            type="button"
            onClick={() => setView('table')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${view === 'table' ? 'bg-indigo-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
            aria-pressed={view === 'table'}
          >
            <List size={16} /> {isFrench ? 'Tableau' : 'Table'}
          </button>
          <button
            type="button"
            onClick={() => setView('cards')}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium ${view === 'cards' ? 'bg-indigo-600 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'}`}
            aria-pressed={view === 'cards'}
          >
            <LayoutGrid size={16} /> {isFrench ? 'Cartes' : 'Cards'}
          </button>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetToFirstPage() }}
            placeholder={isFrench ? 'Rechercher…' : 'Search…'}
            className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700"
          />
        </div>
      </div>

      {/* Cascading filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          value={fCountry}
          onChange={(e) => {
            setFCountry(e.target.value)
            setFAdmin1('')
            setFAdmin2('')
            setFAdmin3('')
            resetToFirstPage()
          }}
          options={countryOptions}
          placeholder={isFrench ? 'Tous les pays' : 'All countries'}
        />
        <Select
          value={fAdmin1}
          onChange={(e) => {
            setFAdmin1(e.target.value)
            setFAdmin2('')
            setFAdmin3('')
            resetToFirstPage()
          }}
          options={admin1Options}
          placeholder={isFrench ? 'Admin 1 (région)' : 'Admin 1 (region)'}
        />
        <Select
          value={fAdmin2}
          onChange={(e) => {
            setFAdmin2(e.target.value)
            setFAdmin3('')
            resetToFirstPage()
          }}
          options={admin2Options}
          placeholder={isFrench ? 'Admin 2' : 'Admin 2'}
        />
        <Select
          value={fAdmin3}
          onChange={(e) => { setFAdmin3(e.target.value); resetToFirstPage() }}
          options={admin3Options}
          placeholder={isFrench ? 'Admin 3' : 'Admin 3'}
        />
        <Select
          value={fStatus}
          onChange={(e) => { setFStatus(e.target.value); resetToFirstPage() }}
          options={statusOptions}
          placeholder={isFrench ? 'Tous les statuts' : 'All statuses'}
        />
        <Select
          value={fSource}
          onChange={(e) => { setFSource(e.target.value); resetToFirstPage() }}
          options={sourceOptions}
          placeholder={isFrench ? 'Toutes les sources' : 'All sources'}
        />
      </div>

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des peuples…' : 'Loading people groups…'} />
      ) : isError ? (
        <StateError label={isFrench ? 'Erreur de chargement.' : 'Loading error.'} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucun peuple.' : 'No people groups.'} />
      ) : view === 'cards' ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paged.map((pg) => (
              <PeopleCard key={pg._id} pg={pg} href={peopleHref(pg)} isFrench={isFrench} onShare={setSharing} />
            ))}
          </div>

          {/* Pagination bar (cards view) */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300">
            <div>
              {isFrench
                ? `${pageStart}–${pageEnd} sur ${totalItems} peuples`
                : `${pageStart}–${pageEnd} of ${totalItems} people groups`}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <span>{isFrench ? 'Par page' : 'Per page'}</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); resetToFirstPage() }}
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="btn-secondary btn-sm gap-1"
                >
                  <ChevronLeft size={16} /> {isFrench ? 'Précédent' : 'Prev'}
                </button>
                <span className="px-2">{isFrench ? `Page ${safePage} / ${totalPages}` : `Page ${safePage} / ${totalPages}`}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="btn-secondary btn-sm gap-1"
                >
                  {isFrench ? 'Suivant' : 'Next'} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:bg-slate-800 dark:border-slate-700">
          <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-slate-700">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">{isFrench ? 'Nom' : 'Name'}</th>
                <th className="px-4 py-3">{isFrench ? 'Pays' : 'Country'}</th>
                <th className="px-4 py-3">Admin 1</th>
                <th className="px-4 py-3">Admin 2</th>
                <th className="px-4 py-3">Admin 3</th>
                <th className="px-4 py-3">{isFrench ? 'Statut' : 'Status'}</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-slate-700">
              {paged.map((pg) => (
                <tr key={pg._id} className="hover:bg-neutral-50 dark:hover:bg-slate-700">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <Link to={peopleHref(pg)} className="text-blue-600 hover:underline dark:text-blue-300">{pg.name}</Link>
                      {isSponsored(pg) && (
                        <span title={isFrench ? `Parrainé · ${pg.donor}` : `Sponsored · ${pg.donor}`} className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                          <HeartHandshake size={10} />
                        </span>
                      )}
                      <button aria-label={isFrench ? 'Partager / fiche partenaire' : 'Share / partner sheet'}
                        type="button"
                        title={isFrench ? 'Partager / fiche partenaire' : 'Share / partner sheet'}
                        onClick={() => setSharing(pg)}
                        className="text-neutral-500 dark:text-slate-400 hover:text-indigo-600"
                      >
                        <Share2 size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{countryCodeToDisplayName(countryCodeOf(pg), isFrench) || countryOf(pg) || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{admin1Of(pg) || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{admin2Of(pg) || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{admin3Of(pg) || '—'}</td>
                  <td className="px-4 py-3">
                    {pg.status ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(pg.status)}`}>
                        {pg.status}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(pg)}
                          className="btn-secondary btn-sm gap-1"
                        >
                          <Pencil size={14} /> {isFrench ? 'Modifier' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          disabled={archiveMutation.isPending}
                          onClick={() => {
                            const isArch = !!pg.isArchived
                            if (window.confirm(isArch ? (isFrench ? 'Désarchiver ce peuple ?' : 'Unarchive this people group?') : isFrench ? 'Archiver ce peuple ?' : 'Archive this people group?')) {
                              archiveMutation.mutate({ id: pg._id, archived: isArch })
                            }
                          }}
                          className="btn-secondary btn-sm gap-1"
                        >
                          {pg.isArchived ? (
                            <>
                              <ArchiveRestore size={14} /> {isFrench ? 'Désarchiver' : 'Unarchive'}
                            </>
                          ) : (
                            <>
                              <Archive size={14} /> {isFrench ? 'Archiver' : 'Archive'}
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-slate-700 dark:text-slate-300">
            <div>
              {isFrench
                ? `${pageStart}–${pageEnd} sur ${totalItems} peuples`
                : `${pageStart}–${pageEnd} of ${totalItems} people groups`}
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <span>{isFrench ? 'Par page' : 'Per page'}</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); resetToFirstPage() }}
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700"
                >
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="btn-secondary btn-sm gap-1"
                >
                  <ChevronLeft size={16} /> {isFrench ? 'Précédent' : 'Prev'}
                </button>
                <span className="px-2">
                  {isFrench ? `Page ${safePage} / ${totalPages}` : `Page ${safePage} / ${totalPages}`}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="btn-secondary btn-sm gap-1"
                >
                  {isFrench ? 'Suivant' : 'Next'} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share modal (partner sheet / link) */}
      {sharing && (
        <ShareModal
          pg={sharing}
          isFrench={isFrench}
          shareUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}${peopleHref(sharing)}`}
          onClose={() => setSharing(null)}
        />
      )}

      {/* Create / Edit modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div ref={formDialogRef} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-slate-100">
                {editing ? (isFrench ? 'Modifier le peuple' : 'Edit people group') : isFrench ? 'Ajouter un peuple' : 'Add people group'}
              </h2>
              <button aria-label={isFrench ? "Fermer" : "Close"} type="button" onClick={closeForm} className="rounded p-1 text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!form.name.trim()) {
                  toast.error(isFrench ? 'Le nom est requis' : 'Name is required')
                  return
                }
                saveMutation.mutate(form)
              }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <Field label={isFrench ? 'Nom *' : 'Name *'} value={form.name} onChange={onField('name')} />
              <Field label={isFrench ? 'Village' : 'Village'} value={form.villageName} onChange={onField('villageName')} />
              <Field label={isFrench ? 'Pays' : 'Country'} value={form.country} onChange={onField('country')} />
              <Field label={isFrench ? 'Code pays' : 'Country code'} value={form.countryCode} onChange={onField('countryCode')} />
              <Field label="Admin 1 (région)" value={form.region} onChange={onField('region')} />
              <Field label="Admin 2" value={form.admin2} onChange={onField('admin2')} />
              <Field label="Admin 3" value={form.admin3} onChange={onField('admin3')} />
              <div>
                <label htmlFor="people-groups-list-status" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-slate-300">{isFrench ? 'Statut' : 'Status'}</label>
                <select id="people-groups-list-status" value={form.status} onChange={onField('status')} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-slate-700">
                  <option value="">—</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Field label={isFrench ? 'Nombre d’églises' : 'Number of churches'} type="number" value={form.numberOfChurches} onChange={onField('numberOfChurches')} />
              <Field label={isFrench ? 'Génération d’église' : 'Church generation'} type="number" value={form.churchGeneration} onChange={onField('churchGeneration')} />
              <Field label={isFrench ? 'Directeur / Donateur' : 'Director / Donor'} value={form.donor} onChange={onField('donor')} />
              <Field label={isFrench ? 'Coordinateur national' : 'National coordinator'} value={form.nationalCoordinator} onChange={onField('nationalCoordinator')} />
              <Field label={isFrench ? 'Implanteur' : 'Church planter'} value={form.churchPlanter} onChange={onField('churchPlanter')} />
              <div className="sm:col-span-2">
                <label htmlFor="people-groups-list-description" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-slate-300">Description</label>
                <textarea id="people-groups-list-description" value={form.description} onChange={onField('description')} rows={3} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-slate-700" />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary btn-sm">
                  {isFrench ? 'Annuler' : 'Cancel'}
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary btn-sm">
                  {saveMutation.isPending ? (isFrench ? 'Enregistrement…' : 'Saving…') : isFrench ? 'Enregistrer' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const Field = ({ label, value, onChange, type = 'text' }) => {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-neutral-600 dark:text-slate-300">{label}</label>
      <input id={id} type={type} value={value} onChange={onChange} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700" />
    </div>
  )
}

export default PeopleGroupsList

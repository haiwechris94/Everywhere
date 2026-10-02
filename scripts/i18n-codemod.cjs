/* eslint-disable */
// One-off i18n codemod: convert hardcoded single-language UI strings to bilingual
// `isFrench ? 'FR' : 'EN'`. Idempotent-ish: each replacement only fires if the FR
// source string is still present. Run: node scripts/i18n-codemod.cjs
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'frontend', 'src')
let totalFiles = 0
let totalReplacements = 0
const report = []

function apply(relPath, edits) {
  const file = path.join(ROOT, relPath)
  if (!fs.existsSync(file)) {
    report.push(`SKIP (missing): ${relPath}`)
    return
  }
  let src = fs.readFileSync(file, 'utf8')
  let count = 0
  for (const [from, to] of edits) {
    if (from === to) continue
    const parts = src.split(from)
    if (parts.length > 1) {
      count += parts.length - 1
      src = parts.join(to)
    }
  }
  if (count > 0) {
    fs.writeFileSync(file, src, 'utf8')
    totalFiles++
    totalReplacements += count
    report.push(`OK   ${relPath}  (+${count})`)
  } else {
    report.push(`----  ${relPath}  (no change)`)
  }
}

// Helpers to build the bilingual ternary
const T = (fr, en) => `{isFrench ? '${fr}' : '${en}'}`           // JSX text / attr value expr
const A = (fr, en) => `{isFrench ? "${fr}" : "${en}"}`           // when string has apostrophes

// ───────────────────────── AdminUsers.jsx ─────────────────────────
apply('pages/AdminUsers.jsx', [
  // CreateUserModal: add isFrench right after its useState(error) line
  [`  const [isLoading, setIsLoading] = useState(false)\n  const [error, setError] = useState('')\n  \n  const handleSubmit`,
   `  const [isLoading, setIsLoading] = useState(false)\n  const [error, setError] = useState('')\n  const { isFrench } = useLanguage()\n  \n  const handleSubmit`],
  // main component destructure
  [`const AdminUsers = () => {\n  const { t } = useLanguage()`,
   `const AdminUsers = () => {\n  const { t, isFrench } = useLanguage()`],
  // toasts & errors
  [`toast.success('Utilisateur créé avec succès')`,
   `toast.success(isFrench ? 'Utilisateur créé avec succès' : 'User created successfully')`],
  [`err.response?.data?.message || 'Erreur lors de la création'`,
   `err.response?.data?.message || (isFrench ? 'Erreur lors de la création' : 'Error while creating')`],
  [`setError(err.response?.data?.message || 'Erreur lors du chargement des utilisateurs')`,
   `setError(err.response?.data?.message || (isFrench ? 'Erreur lors du chargement des utilisateurs' : 'Error while loading users'))`],
  [`toast.error(err.response?.data?.message || 'Erreur lors de la modification du statut')`,
   `toast.error(err.response?.data?.message || (isFrench ? 'Erreur lors de la modification du statut' : 'Error while updating status'))`],
  // CreateUserModal JSX
  [`<h3 className="text-lg font-semibold text-gray-900">Créer un utilisateur</h3>`,
   `<h3 className="text-lg font-semibold text-gray-900">${T('Créer un utilisateur', 'Create a user')}</h3>`],
  [`<label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>`,
   `<label className="block text-sm font-medium text-gray-700 mb-1">${T('Nom *', 'Name *')}</label>`],
  [`<label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe *</label>`,
   `<label className="block text-sm font-medium text-gray-700 mb-1">${T('Mot de passe *', 'Password *')}</label>`],
  [`<label className="block text-sm font-medium text-gray-700 mb-1">Rôle *</label>`,
   `<label className="block text-sm font-medium text-gray-700 mb-1">${T('Rôle *', 'Role *')}</label>`],
  [`<label className="block text-sm font-medium text-gray-700 mb-1">Organisation</label>`,
   `<label className="block text-sm font-medium text-gray-700 mb-1">${T('Organisation', 'Organization')}</label>`],
  [`<option value="supervisor">Superviseur</option>`,
   `<option value="supervisor">{isFrench ? 'Superviseur' : 'Supervisor'}</option>`],
  [`<option value="admin">Administrateur</option>`,
   `<option value="admin">{isFrench ? 'Administrateur' : 'Administrator'}</option>`],
  [`placeholder="Nom de l'organisation (optionnel)"`,
   `placeholder={isFrench ? "Nom de l'organisation (optionnel)" : 'Organization name (optional)'}`],
  // Create / Annuler buttons inside modal (also used elsewhere; scope by surrounding)
  [`              >\n                Annuler\n              </button>`,
   `              >\n                {isFrench ? 'Annuler' : 'Cancel'}\n              </button>`],
  [`              >\n                Créer\n              </button>`,
   `              >\n                {isFrench ? 'Créer' : 'Create'}\n              </button>`],
  // list / actions
  [`title="Actualiser"`, `title={isFrench ? 'Actualiser' : 'Refresh'}`],
  [`title={user.isActive !== false ? 'Bloquer' : 'Débloquer'}`,
   `title={user.isActive !== false ? (isFrench ? 'Bloquer' : 'Block') : (isFrench ? 'Débloquer' : 'Unblock')}`],
  [`title="Supprimer"`, `title={isFrench ? 'Supprimer' : 'Delete'}`],
  [`                      Aucun utilisateur trouvé`,
   `                      {isFrench ? 'Aucun utilisateur trouvé' : 'No user found'}`],
  // ConfirmModal props at call sites
  [`title={confirmModal.user?.isActive !== false ? 'Bloquer cet utilisateur ?' : 'Débloquer cet utilisateur ?'}`,
   `title={confirmModal.user?.isActive !== false ? (isFrench ? 'Bloquer cet utilisateur ?' : 'Block this user?') : (isFrench ? 'Débloquer cet utilisateur ?' : 'Unblock this user?')}`],
  [`confirmText={confirmModal.user?.isActive !== false ? 'Bloquer' : 'Débloquer'}`,
   `confirmText={confirmModal.user?.isActive !== false ? (isFrench ? 'Bloquer' : 'Block') : (isFrench ? 'Débloquer' : 'Unblock')}`],
  [`title="Supprimer cet utilisateur ?"`,
   `title={isFrench ? 'Supprimer cet utilisateur ?' : 'Delete this user?'}`],
  [`confirmText="Supprimer"`, `confirmText={isFrench ? 'Supprimer' : 'Delete'}`],
])

// ───────────────────────── DataManagement.jsx ─────────────────────────
apply('pages/DataManagement.jsx', [
  [`  const { t } = useLanguage()`, `  const { t, isFrench } = useLanguage()`],
  [`toast('⏳ Sync déjà en cours...', { icon: '🔄' })`,
   `toast(isFrench ? '⏳ Sync déjà en cours...' : '⏳ Sync already running...', { icon: '🔄' })`],
  [`toast.success('🚀 Synchronisation JP démarrée !')`,
   `toast.success(isFrench ? '🚀 Synchronisation JP démarrée !' : '🚀 JP sync started!')`],
])

// ───────────────────────── geoComponents.jsx ─────────────────────────
apply('pages/geography/geoComponents.jsx', [
  [`    {label || 'Erreur de chargement.'}`,
   `    {label || (isFrench ? 'Erreur de chargement.' : 'Loading error.')}`],
])

console.log(report.join('\n'))
console.log(`\nFILES CHANGED: ${totalFiles}   TOTAL REPLACEMENTS: ${totalReplacements}`)

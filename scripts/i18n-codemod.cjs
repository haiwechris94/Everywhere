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

// ───────────────────────── VillageDetail.jsx (hardcoded FR → bilingual) ─────────────────────────
apply('pages/VillageDetail.jsx', [
  [`  const { t } = useLanguage()`, `  const { t, isFrench } = useLanguage()`],
  [`<h3 className="text-lg font-medium text-gray-900">Village non trouvé</h3>`,
   `<h3 className="text-lg font-medium text-gray-900">{isFrench ? 'Village non trouvé' : 'Village not found'}</h3>`],
  [`<p className="text-gray-500 mt-2">Ce village n'existe pas ou a été supprimé</p>`,
   `<p className="text-gray-500 mt-2">{isFrench ? "Ce village n'existe pas ou a été supprimé" : 'This village does not exist or has been deleted'}</p>`],
  [`<h3 className="text-lg font-semibold text-gray-800 mb-4">Informations générales</h3>`,
   `<h3 className="text-lg font-semibold text-gray-800 mb-4">{isFrench ? 'Informations générales' : 'General information'}</h3>`],
  [`<label className="form-label">Population</label>`,
   `<label className="form-label">Population</label>`],
  [`<label className="form-label">Statut</label>`,
   `<label className="form-label">{isFrench ? 'Statut' : 'Status'}</label>`],
  [`<label className="form-label">Région</label>`,
   `<label className="form-label">{isFrench ? 'Région' : 'Region'}</label>`],
  [`<label className="form-label">Pays</label>`,
   `<label className="form-label">{isFrench ? 'Pays' : 'Country'}</label>`],
  [`<label className="form-label">Description</label>`,
   `<label className="form-label">Description</label>`],
  [`<p className="text-sm text-gray-500">Statut</p>`,
   `<p className="text-sm text-gray-500">{isFrench ? 'Statut' : 'Status'}</p>`],
  [`<p className="text-sm text-gray-500">Coordonnées</p>`,
   `<p className="text-sm text-gray-500">{isFrench ? 'Coordonnées' : 'Coordinates'}</p>`],
  [`<p className="text-sm text-gray-500 mb-2">Description</p>`,
   `<p className="text-sm text-gray-500 mb-2">Description</p>`],
  [`<h3 className="text-lg font-semibold text-gray-800">Activités récentes</h3>`,
   `<h3 className="text-lg font-semibold text-gray-800">{isFrench ? 'Activités récentes' : 'Recent activities'}</h3>`],
  [`<p>Aucune activité enregistrée</p>`,
   `<p>{isFrench ? 'Aucune activité enregistrée' : 'No activity recorded'}</p>`],
  [`<h3 className="text-lg font-semibold text-gray-800">Églises</h3>`,
   `<h3 className="text-lg font-semibold text-gray-800">{isFrench ? 'Églises' : 'Churches'}</h3>`],
  [`<p className="text-sm">Aucune église</p>`,
   `<p className="text-sm">{isFrench ? 'Aucune église' : 'No church'}</p>`],
  [`<h3 className="text-lg font-semibold text-gray-800 mb-4">Statistiques</h3>`,
   `<h3 className="text-lg font-semibold text-gray-800 mb-4">{isFrench ? 'Statistiques' : 'Statistics'}</h3>`],
  [`<span className="text-gray-500">Églises</span>`,
   `<span className="text-gray-500">{isFrench ? 'Églises' : 'Churches'}</span>`],
  [`<span className="text-gray-500">Activités</span>`,
   `<span className="text-gray-500">{isFrench ? 'Activités' : 'Activities'}</span>`],
  [`<span className="text-gray-500">Créé le</span>`,
   `<span className="text-gray-500">{isFrench ? 'Créé le' : 'Created on'}</span>`],
  [`<h3 className="text-xl font-bold text-gray-800 mb-4">Supprimer le village</h3>`,
   `<h3 className="text-xl font-bold text-gray-800 mb-4">{isFrench ? 'Supprimer le village' : 'Delete village'}</h3>`],
  [`              Êtes-vous sûr de vouloir supprimer <strong>{village.name}</strong> ? Cette action est irréversible.`,
   `              {isFrench ? 'Êtes-vous sûr de vouloir supprimer' : 'Are you sure you want to delete'} <strong>{village.name}</strong>{isFrench ? ' ? Cette action est irréversible.' : '? This action cannot be undone.'}`],
  [`                {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}`,
   `                {updateMutation.isPending ? (isFrench ? 'Enregistrement...' : 'Saving...') : (isFrench ? 'Enregistrer' : 'Save')}`],
  [`                {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}`,
   `                {deleteMutation.isPending ? (isFrench ? 'Suppression...' : 'Deleting...') : (isFrench ? 'Supprimer' : 'Delete')}`],
  // standalone "Modifier" / "Annuler" buttons (text node on its own line)
  [`                Modifier\n`, `                {isFrench ? 'Modifier' : 'Edit'}\n`],
  [`                Annuler\n`, `                {isFrench ? 'Annuler' : 'Cancel'}\n`],
])

// ───────────────────────── PeopleGroupDetail.jsx (hardcoded EN → bilingual) ─────────────────────────
apply('pages/PeopleGroupDetail.jsx', [
  [`  const { t } = useLanguage()`, `  const { t, isFrench } = useLanguage()`],
  [`<option value="">Select level</option>`,
   `<option value="">{isFrench ? 'Sélectionner un niveau' : 'Select level'}</option>`],
  [`<label className="form-label">Affinity Group</label>`,
   `<label className="form-label">{isFrench ? "Groupe d'affinité" : 'Affinity Group'}</label>`],
  [`<label className="form-label">Start Year</label>`,
   `<label className="form-label">{isFrench ? 'Année de début' : 'Start Year'}</label>`],
  [`<label className="form-label">Donor</label>`,
   `<label className="form-label">{isFrench ? 'Donateur' : 'Donor'}</label>`],
  [`<label className="form-label">National Coordinator</label>`,
   `<label className="form-label">{isFrench ? 'Coordinateur national' : 'National Coordinator'}</label>`],
  [`<label className="form-label">Church Planter</label>`,
   `<label className="form-label">{isFrench ? "Implanteur d'église" : 'Church Planter'}</label>`],
  [`<h3 className="text-lg font-bold text-gray-800">Activities</h3>`,
   `<h3 className="text-lg font-bold text-gray-800">{isFrench ? 'Activités' : 'Activities'}</h3>`],
  [`<p>No activities recorded</p>`,
   `<p>{isFrench ? 'Aucune activité enregistrée' : 'No activities recorded'}</p>`],
  [`<h3 className="text-lg font-bold text-gray-800 mb-4">Details</h3>`,
   `<h3 className="text-lg font-bold text-gray-800 mb-4">{isFrench ? 'Détails' : 'Details'}</h3>`],
  [`<span className="text-gray-500">Village</span>`,
   `<span className="text-gray-500">Village</span>`],
  [`<span className="text-gray-500">Region</span>`,
   `<span className="text-gray-500">{isFrench ? 'Région' : 'Region'}</span>`],
  [`<span className="text-gray-500">Country</span>`,
   `<span className="text-gray-500">{isFrench ? 'Pays' : 'Country'}</span>`],
  [`<span className="text-gray-500">Language</span>`,
   `<span className="text-gray-500">{isFrench ? 'Langue' : 'Language'}</span>`],
  [`<span className="text-gray-500">Religion</span>`,
   `<span className="text-gray-500">{isFrench ? 'Religion' : 'Religion'}</span>`],
  [`<span className="text-gray-500">Affinity Group</span>`,
   `<span className="text-gray-500">{isFrench ? "Groupe d'affinité" : 'Affinity Group'}</span>`],
  [`<span className="text-gray-500">Start Year</span>`,
   `<span className="text-gray-500">{isFrench ? 'Année de début' : 'Start Year'}</span>`],
  [`<span className="text-gray-500">Donor</span>`,
   `<span className="text-gray-500">{isFrench ? 'Donateur' : 'Donor'}</span>`],
  [`<span className="text-gray-500">National Coordinator</span>`,
   `<span className="text-gray-500">{isFrench ? 'Coordinateur national' : 'National Coordinator'}</span>`],
  [`<span className="text-gray-500">Church Planter</span>`,
   `<span className="text-gray-500">{isFrench ? "Implanteur d'église" : 'Church Planter'}</span>`],
  [`<span className="text-gray-500">Created</span>`,
   `<span className="text-gray-500">{isFrench ? 'Créé le' : 'Created'}</span>`],
  [`<span className="text-gray-500">Created by</span>`,
   `<span className="text-gray-500">{isFrench ? 'Créé par' : 'Created by'}</span>`],
  [`<h3 className="text-lg font-bold text-gray-800 mb-4">Status</h3>`,
   `<h3 className="text-lg font-bold text-gray-800 mb-4">{isFrench ? 'Statut' : 'Status'}</h3>`],
  [`<span className="text-gray-500">Approved</span>`,
   `<span className="text-gray-500">{isFrench ? 'Approuvé' : 'Approved'}</span>`],
  [`<span className="text-gray-500">Approved by</span>`,
   `<span className="text-gray-500">{isFrench ? 'Approuvé par' : 'Approved by'}</span>`],
  [`<span className="text-gray-500">Approved on</span>`,
   `<span className="text-gray-500">{isFrench ? 'Approuvé le' : 'Approved on'}</span>`],
  [`{peopleGroup.approved ? 'Yes' : 'Pending'}`,
   `{peopleGroup.approved ? (isFrench ? 'Oui' : 'Yes') : (isFrench ? 'En attente' : 'Pending')}`],
  [`{approveMutation.isPending ? 'Approving...' : 'Approve People Group'}`,
   `{approveMutation.isPending ? (isFrench ? 'Approbation...' : 'Approving...') : (isFrench ? 'Approuver le groupe de peuple' : 'Approve People Group')}`],
  [`<h3 className="text-xl font-bold text-gray-800 mb-4">Delete People Group</h3>`,
   `<h3 className="text-xl font-bold text-gray-800 mb-4">{isFrench ? 'Supprimer le groupe de peuple' : 'Delete People Group'}</h3>`],
  [`              Are you sure you want to delete <strong>{peopleGroup.name}</strong>? This action cannot be undone.`,
   `              {isFrench ? 'Êtes-vous sûr de vouloir supprimer' : 'Are you sure you want to delete'} <strong>{peopleGroup.name}</strong>{isFrench ? ' ? Cette action est irréversible.' : '? This action cannot be undone.'}`],
  [`                Cancel\n`, `                {isFrench ? 'Annuler' : 'Cancel'}\n`],
  [`                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}`,
   `                {deleteMutation.isPending ? (isFrench ? 'Suppression...' : 'Deleting...') : (isFrench ? 'Supprimer' : 'Delete')}`],
])

// ───────────────────────── PeopleDetailLite.jsx (small stray tokens) ─────────────────────────
apply('pages/PeopleDetailLite.jsx', [
  [`<p className="text-[10.5px] font-bold leading-tight text-neutral-400">Status</p>`,
   `<p className="text-[10.5px] font-bold leading-tight text-neutral-400">{isFrench ? 'Statut' : 'Status'}</p>`],
])

console.log(report.join('\n'))
console.log(`\nFILES CHANGED: ${totalFiles}   TOTAL REPLACEMENTS: ${totalReplacements}`)

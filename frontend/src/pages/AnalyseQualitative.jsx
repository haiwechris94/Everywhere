import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { peopleGroupsApi, qualitativeAnalysisApi } from '../services/api'
import { reportingApi } from '../services/reportingApi'
import { useLanguage } from '../i18n'
import toast from 'react-hot-toast'
import {
  Search,
  ChevronDown,
  ChevronRight,
  FileText,
  Users,
  MapPin,
  BarChart3,
  CheckCircle,
  AlertCircle,
  Info,
  Globe,
  Filter,
  Download,
  Save,
  Sparkles,
  Loader2,
  Brain,
  Eye,
  X,
  TrendingUp,
  Award,
  Target,
  Zap,
  Star,
} from 'lucide-react'

// Central African countries for the analysis
const CENTRAL_AFRICAN_COUNTRIES = [
  { code: 'CM', name: 'Cameroun', nameFr: 'Cameroun', flag: '🇨🇲' },
  { code: 'CF', name: 'Central African Republic', nameFr: 'République Centrafricaine', flag: '🇨🇫' },
  { code: 'TD', name: 'Chad', nameFr: 'Tchad', flag: '🇹🇩' },
  { code: 'CG', name: 'Congo', nameFr: 'Congo', flag: '🇨🇬' },
  { code: 'CD', name: 'Democratic Republic of Congo', nameFr: 'République Démocratique du Congo', flag: '🇨🇩' },
  { code: 'GQ', name: 'Equatorial Guinea', nameFr: 'Guinée Équatoriale', flag: '🇬🇶' },
  { code: 'GA', name: 'Gabon', nameFr: 'Gabon', flag: '🇬🇦' },
  { code: 'ST', name: 'São Tomé and Príncipe', nameFr: 'São Tomé-et-Príncipe', flag: '🇸🇹' },
]

// DMM DNA Criteria - 10 criteria for evaluating DMM progress
const ANALYSIS_CRITERIA = {
  foundation: {
    title: 'Fondation DMM',
    titleEn: 'DMM FOUNDATION',
    icon: Target,
    color: 'from-blue-500 to-indigo-600',
    criteria: [
      { id: 'prayer', label: 'Prière', labelEn: 'Prayer', weight: 2, description: 'Prière régulière pour le groupe de peuples et le travail' },
      { id: 'compassion', label: 'Compassion', labelEn: 'Compassion', weight: 2, description: 'Démonstration de l\'amour du Christ par des actes de service' },
      { id: 'person_of_peace', label: 'Personne de paix', labelEn: 'Person of Peace', weight: 3, description: 'Identification et travail avec des personnes de paix' },
    ]
  },
  discipleship: {
    title: 'Formation de Disciples',
    titleEn: 'DISCIPLESHIP',
    icon: Users,
    color: 'from-emerald-500 to-teal-600',
    criteria: [
      { id: 'dbs', label: 'EBD (Étude Biblique de Découverte)', labelEn: 'DBS (Discovery Bible Study)', weight: 3, description: 'Études bibliques de découverte régulières' },
      { id: 'obedience', label: 'Obéissance', labelEn: 'Obedience', weight: 2, description: 'Les croyants pratiquent l\'obéissance immédiate aux Écritures' },
      { id: 'disciple_replication', label: 'Réplication de disciples', labelEn: 'Disciple Replication', weight: 3, description: 'Les disciples font de nouveaux disciples' },
    ]
  },
  multiplication: {
    title: 'Multiplication',
    titleEn: 'MULTIPLICATION',
    icon: Zap,
    color: 'from-purple-500 to-pink-600',
    criteria: [
      { id: 'church_gathering', label: 'Rassemblement d\'église', labelEn: 'Church Gathering', weight: 2, description: 'Rassemblements réguliers de croyants' },
      { id: 'leader_development', label: 'Développement de leaders', labelEn: 'Leader Development', weight: 3, description: 'Formation et autonomisation des leaders locaux' },
      { id: 'church_multiplication', label: 'Multiplication d\'églises', labelEn: 'Church Multiplication', weight: 3, description: 'Les églises plantent de nouvelles églises' },
      { id: 'evaluation', label: 'Évaluation', labelEn: 'Evaluation', weight: 1, description: 'Évaluation régulière et ajustement des stratégies' },
    ]
  }
}

// Analysis Detail Modal Component - REDESIGNED with prominent AI section
const AnalysisDetailModal = ({ analysis, onClose, language }) => {
  if (!analysis) return null

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-blue-600'
    if (score >= 40) return 'text-yellow-600'
    if (score >= 20) return 'text-orange-600'
    return 'text-red-600'
  }

  const getScoreBgColor = (score) => {
    if (score >= 80) return 'from-green-500 to-emerald-600'
    if (score >= 60) return 'from-blue-500 to-indigo-600'
    if (score >= 40) return 'from-yellow-500 to-orange-600'
    if (score >= 20) return 'from-orange-500 to-red-600'
    return 'from-red-500 to-rose-600'
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Modal Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-white">
                {language === 'fr' ? 'Détails de l\'analyse' : 'Analysis Details'}
              </h3>
              <p className="text-indigo-100 text-sm mt-1">{analysis.peopleGroupName}</p>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X size={20} className="text-white" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Score Ring Display */}
          <div className="flex flex-col md:flex-row items-center gap-6 p-6 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl">
            {/* Circular Score */}
            <div className="relative w-40 h-40">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="#e5e7eb"
                  strokeWidth="12"
                  fill="none"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="70"
                  stroke="url(#scoreGradient)"
                  strokeWidth="12"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(analysis.overallScore / 100) * 440} 440`}
                />
                <defs>
                  <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-4xl font-bold ${getScoreColor(analysis.overallScore)}`}>
                  {analysis.overallScore}%
                </span>
                <span className="text-sm text-gray-500">Score global</span>
              </div>
            </div>
            
            {/* Info Grid */}
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <p className="text-sm text-gray-500">Village</p>
                <p className="font-semibold text-gray-800">{safeText(analysis.villageName)}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <p className="text-sm text-gray-500">Pays</p>
                <p className="font-semibold text-gray-800">{safeText(analysis.country)}</p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <p className="text-sm text-gray-500">Priorité</p>
                <p className="font-semibold capitalize text-gray-700">
                  {normalizePriorityLevel(analysis?.priorityLevel, language)}
                </p>
              </div>
              <div className="bg-white p-4 rounded-xl shadow-sm">
                <p className="text-sm text-gray-500">Date d'analyse</p>
                <p className="font-semibold text-gray-800">
                  {new Date(analysis.analyzedAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Criteria Scores */}
          <div className="bg-gray-50 rounded-2xl p-6">
            <h4 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
              <BarChart3 size={20} className="text-indigo-600" />
              {language === 'fr' ? 'Scores par critère' : 'Criteria Scores'}
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {analysis.criteriaScores?.map((cs, idx) => (
                <div key={idx} className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm">
                  <span className="text-sm text-gray-700 font-medium">{cs.criterionName}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map(n => (
                        <div
                          key={n}
                          className={`w-3 h-3 rounded-full transition-all ${
                            n <= cs.score
                              ? cs.score >= 4 ? 'bg-green-500' :
                                cs.score >= 3 ? 'bg-yellow-500' :
                                'bg-red-500'
                              : 'bg-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-bold text-gray-800 w-10 text-right">{cs.score}/5</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* User Remarks & Recommendations */}
          {(analysis.remarks || analysis.recommendations) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {analysis.remarks && (
                <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                  <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                    <FileText size={18} />
                    {language === 'fr' ? 'Remarques' : 'Remarks'}
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{analysis.remarks}</p>
                </div>
              )}
              {analysis.recommendations && (
                <div className="bg-green-50 rounded-xl p-5 border border-green-200">
                  <h4 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                    <CheckCircle size={18} />
                    {language === 'fr' ? 'Recommandations' : 'Recommendations'}
                  </h4>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{analysis.recommendations}</p>
                </div>
              )}
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-gray-400 text-right pt-4 border-t">
            {language === 'fr' ? 'Analysé le' : 'Analyzed on'}: {new Date(analysis.analyzedAt).toLocaleDateString()}
            {analysis.analyzedBy?.name && ` ${language === 'fr' ? 'par' : 'by'} ${analysis.analyzedBy.name}`}
          </div>
        </div>
      </div>
    </div>
  )
}

// Rating options with visual feedback
const RATING_OPTIONS = [
  { value: 1, label: 'Très faible', labelEn: 'Very Low', color: 'bg-red-500', hoverColor: 'hover:bg-red-400' },
  { value: 2, label: 'Faible', labelEn: 'Low', color: 'bg-orange-500', hoverColor: 'hover:bg-orange-400' },
  { value: 3, label: 'Moyen', labelEn: 'Medium', color: 'bg-yellow-500', hoverColor: 'hover:bg-yellow-400' },
  { value: 4, label: 'Bon', labelEn: 'Good', color: 'bg-blue-500', hoverColor: 'hover:bg-blue-400' },
  { value: 5, label: 'Excellent', labelEn: 'Excellent', color: 'bg-green-500', hoverColor: 'hover:bg-green-400' },
]

const safeText = (value, fallback = '-') => {
  if (value == null || value === '') return fallback
  if (typeof value === 'string' || typeof value === 'number') return value
  return fallback
}

const normalizePriorityLevel = (priorityLevel, language) => {
  if (!priorityLevel) return '-'
  if (typeof priorityLevel === 'string' || typeof priorityLevel === 'number') return priorityLevel
  if (typeof priorityLevel !== 'object') return '-'

  return (
    (language === 'fr' ? priorityLevel.levelFr : priorityLevel.levelEn) ||
    priorityLevel.levelFr ||
    priorityLevel.levelEn ||
    priorityLevel.labelFr ||
    priorityLevel.labelEn ||
    priorityLevel.label ||
    priorityLevel.level ||
    priorityLevel.global ||
    priorityLevel.jpScale ||
    priorityLevel.leastReached ||
    '-'
  )
}

const AnalyseQualitative = () => {
  const { t, language } = useLanguage()
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState('analyser')
  const [selectedPeople, setSelectedPeople] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCountry, setSelectedCountry] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [selectedAdmin2, setSelectedAdmin2] = useState('')
  const [selectedAdmin3, setSelectedAdmin3] = useState('')
  const [expandedCountries, setExpandedCountries] = useState({})
  const [analysisData, setAnalysisData] = useState({})
  const [remarks, setRemarks] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const [aiInterpretation, setAiInterpretation] = useState('')
  const [aiRecommendations, setAiRecommendations] = useState('')
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)
  const [paginationProgress, setPaginationProgress] = useState(null)

  // Fetch ONLY DMM engagements for qualitative analysis.
  // Source de vérité : /api/reporting/peoples (modèle "master people"), filtré
  // sur les peuples DMM-engagés (isNGEngaged). Chaque engagement DMM devient une
  // entrée sélectionnable pour l'analyse. Quand un pays est sélectionné dans le
  // filtre, on ne récupère que les engagements DMM de ce pays.
  const { data: peopleGroupsData, isLoading } = useQuery({
    queryKey: ['dmm-engagements', 'qualitativeAnalysis', selectedCountry],
    queryFn: async () => {
      // /api/reporting/peoples EXIGE un périmètre géographique (areas ou
      // countries) : sans paramètre il répond 400. Quand aucun pays n'est
      // sélectionné, on envoie donc par défaut TOUS les pays d'Afrique centrale
      // (codes alpha-2) pour récupérer l'ensemble des engagements DMM.
      const params = { limit: 200 }
      params.countries = selectedCountry
        ? selectedCountry
        : CENTRAL_AFRICAN_COUNTRIES.map((c) => c.code).join(',')
      const res = await reportingApi.getPeoples(params)
      const peoples = Array.isArray(res?.data?.data) ? res.data.data : []
      // Garder uniquement les peuples DMM-engagés, puis aplatir leurs engagements
      // DMM en entrées analysables (une ligne par engagement/village).
      const dmmPeoples = peoples.filter((p) => p.isNGEngaged)
      // Normalise un statut qui peut arriver sous forme de chaîne OU d'objet
      // ({ global, jpScale, ... }). On ne garde qu'une CHAÎNE pour l'affichage —
      // rendre l'objet directement dans un <span> fait planter React
      // (« Objects are not valid as a React child »).
      const statusString = (s) => {
        if (s == null) return null
        if (typeof s === 'string') return s
        if (typeof s === 'object') return s.global || s.status || s.level || null
        return String(s)
      }
      const engagements = dmmPeoples.flatMap((p) =>
        (p.dmm?.engagements || []).map((e) => ({
          ...e,
          _id: e.peopleGroupId || `${p.masterPeopleId}-${e.villageName || ''}`,
          masterPeopleId: p.masterPeopleId,
          // Nom affiché = « nom du peuple + nom du village » (comme la fiche pays).
          name: [p.canonicalName, e.villageName].filter(Boolean).join(', ') || e.name || p.canonicalName,
          peopleName: p.canonicalName,
          country: p.primaryCountryCode || e.country || null,
          engagementStatus:
            statusString(e.dmmStatus) ||
            statusString(e.status) ||
            statusString(p.status) ||
            null,
        }))
      )
      return engagements
    },
  })

  // Fetch saved analyses grouped by country
  const { data: analysesData, isLoading: isLoadingAnalyses, refetch: refetchAnalyses } = useQuery({
    queryKey: ['qualitativeAnalyses', 'byCountry'],
    queryFn: async () => {
      const response = await qualitativeAnalysisApi.getByCountry()
      return response.data.data || []
    },
  })

  const peopleGroups = peopleGroupsData || []
  const savedAnalyses = analysesData || []

  // Filter people groups by search only.
  // Le filtre pays est appliqué CÔTÉ SERVEUR via le paramètre `countries`
  // (alpha-2) de reportingApi.getPeoples — voir la query ci-dessus. On NE refait
  // PAS de filtre pays côté client ici : `pg.country` est un code ISO alpha-3
  // (ex. « CMR ») renvoyé par /api/reporting/peoples, alors que `selectedCountry`
  // est alpha-2 (ex. « CM »). La comparaison directe échouait toujours et vidait
  // la liste quand un pays était sélectionné. Le serveur ayant déjà restreint les
  // données au pays demandé, un second filtre client est inutile.
  const filteredPeopleGroups = peopleGroups.filter(pg => {
    const matchesSearch = !searchTerm ||
      pg.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pg.villageName?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  // Save analysis mutation
  const saveAnalysisMutation = useMutation({
    mutationFn: (data) => qualitativeAnalysisApi.save(data),
    onSuccess: () => {
      toast.success(language === 'fr' ? 'Analyse enregistrée avec succès!' : 'Analysis saved successfully!')
      queryClient.invalidateQueries(['qualitativeAnalyses'])
      refetchAnalyses()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || (language === 'fr' ? 'Erreur lors de l\'enregistrement' : 'Error saving analysis'))
    },
  })

  // Handle rating change
  const handleRatingChange = (criterionId, value) => {
    setAnalysisData(prev => ({
      ...prev,
      [criterionId]: parseInt(value)
    }))
  }

  // Calculate total score
  const calculateTotalScore = () => {
    let totalScore = 0
    let maxScore = 0

    Object.values(ANALYSIS_CRITERIA).forEach(category => {
      category.criteria.forEach(criterion => {
        const rating = analysisData[criterion.id] || 0
        totalScore += rating * criterion.weight
        maxScore += 5 * criterion.weight
      })
    })

    return maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0
  }

  // Get score color
  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-600 bg-green-100'
    if (score >= 60) return 'text-blue-600 bg-blue-100'
    if (score >= 40) return 'text-yellow-600 bg-yellow-100'
    if (score >= 20) return 'text-orange-600 bg-orange-100'
    return 'text-red-600 bg-red-100'
  }

  // Get priority level
  const getPriorityLevel = (score) => {
    if (score >= 80) return { level: 'low', levelFr: 'Faible', levelEn: 'Low', color: 'text-green-600' }
    if (score >= 60) return { level: 'moderate', levelFr: 'Modérée', levelEn: 'Moderate', color: 'text-blue-600' }
    if (score >= 40) return { level: 'high', levelFr: 'Élevée', levelEn: 'High', color: 'text-yellow-600' }
    if (score >= 20) return { level: 'very-high', levelFr: 'Très élevée', levelEn: 'Very High', color: 'text-orange-600' }
    return { level: 'critical', levelFr: 'Critique', levelEn: 'Critical', color: 'text-red-600' }
  }

  // Toggle country expansion
  const toggleCountry = (countryCode) => {
    setExpandedCountries(prev => ({
      ...prev,
      [countryCode]: !prev[countryCode]
    }))
  }

  // Reset analysis
  const resetAnalysis = () => {
    setAnalysisData({})
    setRemarks('')
    setRecommendations('')
    setAiInterpretation('')
    setAiRecommendations('')
    setSelectedPeople(null)
  }

  // Save analysis
  const handleSaveAnalysis = () => {
    if (!selectedPeople) {
      toast.error(language === 'fr' ? 'Veuillez sélectionner un peuple' : 'Please select a people group')
      return
    }

    if (Object.keys(analysisData).length === 0) {
      toast.error(language === 'fr' ? 'Veuillez évaluer au moins un critère' : 'Please evaluate at least one criterion')
      return
    }

    // Build criteria scores array
    const criteriaScores = []
    Object.values(ANALYSIS_CRITERIA).forEach(category => {
      category.criteria.forEach(criterion => {
        if (analysisData[criterion.id]) {
          criteriaScores.push({
            criterionId: criterion.id,
            criterionName: language === 'fr' ? criterion.label : criterion.labelEn,
            score: analysisData[criterion.id],
            weight: criterion.weight,
          })
        }
      })
    })

    const totalScore = calculateTotalScore()
    const priority = getPriorityLevel(totalScore)

    saveAnalysisMutation.mutate({
      peopleGroupId: selectedPeople._id,
      peopleGroupName: selectedPeople.name,
      villageName: selectedPeople.villageName,
      country: selectedPeople.country,
      criteriaScores,
      overallScore: totalScore,
      priorityLevel: priority.level,
      remarks,
      recommendations,
      aiInterpretation,
      aiRecommendations,
    })
  }

  const totalScore = calculateTotalScore()
  const priority = getPriorityLevel(totalScore)
  const priorityLabel = normalizePriorityLevel(priority, language)
  const totalCriteria = Object.values(ANALYSIS_CRITERIA).reduce((acc, cat) => acc + cat.criteria.length, 0)
  const evaluatedCriteria = Object.keys(analysisData).length

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header — titre noir en haut, infos clés en ligne légère dessous */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
          {language === 'fr' ? 'Analyse Qualitative' : 'Qualitative Analysis'}
        </h1>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-[80%] mx-auto">
          <div className="rounded-[20px] border border-gray-200 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.06)] border-t-[6px] border-t-yellow-500 min-h-[80px] flex flex-col items-center justify-center text-center gap-2 w-full">
            <p className="text-base leading-tight font-medium text-yellow-700 break-words">
              {language === 'fr' ? '# Groupes de peuples disponibles' : '# People groups available'}
            </p>
            <div>
              <span className="text-2xl font-semibold leading-none text-gray-900">{peopleGroups.length}</span>
            </div>
          </div>
          <div className="rounded-[20px] border border-gray-200 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.06)] border-t-[6px] border-t-green-500 min-h-[80px] flex flex-col items-center justify-center text-center gap-2 w-full">
            <p className="text-base leading-tight font-medium text-green-700 break-words">
              {language === 'fr' ? '# Analyses sauvegardées' : '# Saved analysis'}
            </p>
            <div>
              <span className="text-2xl font-semibold leading-none text-gray-900">{savedAnalyses.reduce((acc, c) => acc + c.count, 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs — accent neutre, sans grand cadre */}
      <div>
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab('analyser')}
              className={`-mb-px px-1 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'analyser'
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {language === 'fr' ? 'Analyser un peuple' : 'Analyze a People Group'}
            </button>
            <button
              onClick={() => setActiveTab('resultats')}
              className={`-mb-px px-1 py-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
                activeTab === 'resultats'
                  ? 'text-gray-900 border-gray-900'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              {language === 'fr' ? 'Résultats d\'Analyse' : 'Analysis Results'}
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="pt-6">
          {activeTab === 'analyser' ? (
            /* Analysis Tab - Two Column Layout */
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - People Selector */}
              <div className="lg:col-span-1 space-y-4">
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Users size={20} className="text-gray-500" />
                    {language === 'fr' ? 'Sélectionner un peuple' : 'Select a People Group'}
                  </h3>
                  
                  {/* Search */}
                  <div className="relative mb-4">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder={language === 'fr' ? 'Rechercher...' : 'Search...'}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-transparent"
                    />
                  </div>

                  {/* Country Filter */}
                  <select
                    value={selectedCountry}
                    onChange={(e) => setSelectedCountry(e.target.value)}
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-transparent mb-4"
                  >
                    <option value="">{language === 'fr' ? 'Tous les pays' : 'All Countries'}</option>
                    {CENTRAL_AFRICAN_COUNTRIES.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {language === 'fr' ? country.nameFr : country.name}
                      </option>
                    ))}
                  </select>

                  {/* People List */}
                  <div className="max-h-[400px] overflow-y-auto border border-gray-200 rounded-xl bg-white">
                    {isLoading ? (
                      <div className="p-6 text-center">
                        <Loader2 className="animate-spin mx-auto mb-2 text-gray-500" size={24} />
                        {paginationProgress && (
                          <p className="text-sm text-gray-500">
                            Page {paginationProgress.page}/{paginationProgress.totalPages}
                          </p>
                        )}
                      </div>
                    ) : filteredPeopleGroups.length === 0 ? (
                      <div className="p-6 text-center text-gray-500">
                        <Users size={32} className="mx-auto mb-2 opacity-30" />
                        {language === 'fr' ? 'Aucun peuple trouvé' : 'No people groups found'}
                      </div>
                    ) : (
                      filteredPeopleGroups.slice(0, 50).map(pg => (
                        <button
                          key={pg._id}
                          onClick={() => {
                            setSelectedPeople(pg)
                            setAnalysisData({})
                            setRemarks('')
                            setRecommendations('')
                            setAiInterpretation('')
                            setAiRecommendations('')
                          }}
                          className={`w-full text-left px-4 py-3 border-b last:border-b-0 transition-all ${
                            selectedPeople?._id === pg._id 
                              ? 'bg-gray-100 border-l-4 border-l-gray-900' 
                              : 'hover:bg-gray-50'
                          }`}
                        >
                          <div className="font-medium text-gray-800">{pg.name}</div>
                          {null}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Criteria */}
              <div className="lg:col-span-2 space-y-6">
                {selectedPeople ? (
                  <>
                    {/* Selected People Info */}
                    <div className="rounded-lg p-5 border border-gray-200 bg-gray-50">
                      <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                        <Info size={18} className="text-gray-500" />
                        {selectedPeople.name}
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="bg-white/70 p-3 rounded-lg">
                          <span className="text-gray-500 block">Village</span>
                          <span className="font-semibold">{selectedPeople.villageName || '-'}</span>
                        </div>
                        <div className="bg-white/70 p-3 rounded-lg">
                          <span className="text-gray-500 block">Pays</span>
                          <span className="font-semibold">{selectedPeople.country || '-'}</span>
                        </div>
                        <div className="bg-white/70 p-3 rounded-lg">
                          <span className="text-gray-500 block">Églises</span>
                          <span className="font-semibold">{selectedPeople.numberOfChurches || 0}</span>
                        </div>
                        <div className="bg-white/70 p-3 rounded-lg">
                          <span className="text-gray-500 block">Statut</span>
                          <span className="font-semibold capitalize">{selectedPeople.engagementStatus || '-'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Criteria Sections */}
                    {Object.entries(ANALYSIS_CRITERIA).map(([key, category]) => {
                      const CategoryIcon = category.icon
                      return (
                        <div key={key}>
                          <div className="px-1 pb-2 mb-3 border-b border-gray-200">
                            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                              <CategoryIcon size={18} className="text-gray-500" />
                              <span className="text-orange-600">
                                {language === 'fr' ? category.title : category.titleEn}
                              </span>
                            </h4>
                          </div>
                          <div className="px-1 space-y-4">
                            {category.criteria.map(criterion => (
                              <div key={criterion.id} className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="flex-1">
                                  <label className="text-sm font-medium text-gray-700">
                                    {language === 'fr' ? criterion.label : criterion.labelEn}
                                  </label>
                                </div>
                                <div className="flex gap-2">
                                  {RATING_OPTIONS.map(option => (
                                    <button
                                      key={option.value}
                                      onClick={() => handleRatingChange(criterion.id, option.value)}
                                      className={`w-11 h-11 rounded-xl text-sm font-bold transition-all border border-blue-300 bg-blue-50 text-blue-700 ${
                                        analysisData[criterion.id] === option.value
                                          ? `${option.color} text-white shadow-lg scale-110 ring-2 ring-offset-2`
                                          : `${option.hoverColor}`
                                      }`}
                                      title={language === 'fr' ? option.label : option.labelEn}
                                    >
                                      {option.value}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                    {/* Remarks and Recommendations */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          {language === 'fr' ? 'Remarques' : 'Remarks'}
                        </label>
                        <textarea
                          value={remarks}
                          onChange={(e) => setRemarks(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-transparent resize-none h-32"
                          placeholder={language === 'fr' ? 'Ajoutez vos remarques...' : 'Add your remarks...'}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                          {language === 'fr' ? 'Recommandations' : 'Recommendations'}
                        </label>
                        <textarea
                          value={recommendations}
                          onChange={(e) => setRecommendations(e.target.value)}
                          className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-400 focus:border-transparent resize-none h-32"
                          placeholder={language === 'fr' ? 'Ajoutez vos recommandations...' : 'Add your recommendations...'}
                        />
                      </div>
                    </div>

                    {/* Score Summary with Ring Progress */}
                    <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 border border-gray-200">
                      <h4 className="font-bold text-gray-800 mb-6 text-center">
                        {language === 'fr' ? 'Résumé de l\'analyse' : 'Analysis Summary'}
                      </h4>
                      <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                        {/* Circular Progress */}
                        <div className="relative w-36 h-36">
                          <svg className="w-full h-full transform -rotate-90">
                            <circle
                              cx="72"
                              cy="72"
                              r="60"
                              stroke="#e5e7eb"
                              strokeWidth="10"
                              fill="none"
                            />
                            <circle
                              cx="72"
                              cy="72"
                              r="60"
                              stroke="url(#progressGradient)"
                              strokeWidth="10"
                              fill="none"
                              strokeLinecap="round"
                              strokeDasharray={`${(totalScore / 100) * 377} 377`}
                              className="transition-all duration-500"
                            />
                            <defs>
                              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#8b5cf6" />
                                <stop offset="100%" stopColor="#6366f1" />
                              </linearGradient>
                            </defs>
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-3xl font-bold ${getScoreColor(totalScore).split(' ')[0]}`}>
                              {totalScore}%
                            </span>
                            <span className="text-xs text-gray-500">Score</span>
                          </div>
                        </div>
                        
                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                            <p className={`text-xl font-bold ${priority.color}`}>
                              {priorityLabel}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">Priorité</p>
                          </div>
                          <div className="bg-white p-4 rounded-xl shadow-sm text-center">
                            <p className="text-xl font-bold text-gray-700">
                              {evaluatedCriteria}/{totalCriteria}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">Critères</p>
                          </div>
                        </div>
                      </div>
                    </div>


                    {/* Actions */}
                    <div className="flex justify-end gap-4">
                      <button
                        onClick={resetAnalysis}
                        className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                      >
                        {language === 'fr' ? 'Réinitialiser' : 'Reset'}
                      </button>
                      <button
                        className="px-8 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-semibold shadow-lg flex items-center gap-2 disabled:opacity-50"
                        onClick={handleSaveAnalysis}
                        disabled={saveAnalysisMutation.isLoading}
                      >
                        {saveAnalysisMutation.isLoading ? (
                          <Loader2 className="animate-spin" size={18} />
                        ) : (
                          <Save size={18} />
                        )}
                        {language === 'fr' ? 'Sauvegarder' : 'Save'}
                      </button>
                    </div>
                  </>
                ) : (
                  /* Empty State */
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                      <Users size={48} className="text-gray-400" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-2">
                      {language === 'fr' ? 'Sélectionnez un peuple' : 'Select a People Group'}
                    </h3>
                    <p className="text-gray-500 max-w-md">
                      {language === 'fr' 
                        ? 'Choisissez un groupe de peuples dans la liste à gauche pour commencer l\'analyse qualitative.'
                        : 'Choose a people group from the list on the left to start the qualitative analysis.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Results Tab - Expandable Country Groups */
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-5 border border-purple-200 mb-6">
                <h3 className="font-bold text-purple-800 mb-2 flex items-center gap-2">
                  <Award size={20} />
                  {language === 'fr' ? 'Résultats d\'Analyse par Pays' : 'Analysis Results by Country'}
                </h3>
                <p className="text-sm text-gray-600">
                  {language === 'fr' 
                    ? 'Consultez les analyses qualitatives enregistrées, organisées par pays.'
                    : 'View saved qualitative analyses organized by country.'}
                </p>
              </div>

              {isLoadingAnalyses ? (
                <div className="text-center py-12">
                  <Loader2 className="animate-spin mx-auto mb-3 text-gray-500" size={40} />
                  <p className="text-gray-500">{language === 'fr' ? 'Chargement des analyses...' : 'Loading analyses...'}</p>
                </div>
              ) : savedAnalyses.length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-xl">
                  <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FileText size={40} className="text-gray-400" />
                  </div>
                  <h4 className="text-xl font-bold text-gray-700 mb-2">
                    {language === 'fr' ? 'Aucune analyse enregistrée' : 'No analyses saved'}
                  </h4>
                  <p className="text-gray-500 mb-6">
                    {language === 'fr' 
                      ? 'Commencez par analyser un groupe de peuples.'
                      : 'Start by analyzing a people group.'}
                  </p>
                  <button
                    onClick={() => setActiveTab('analyser')}
                    className="px-6 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors font-semibold"
                  >
                    {language === 'fr' ? 'Analyser un peuple' : 'Analyze a People Group'}
                  </button>
                </div>
              ) : (
                savedAnalyses.map(countryGroup => {
                  const countryInfo = CENTRAL_AFRICAN_COUNTRIES.find(c => c.code === countryGroup.country)
                  const isExpanded = expandedCountries[countryGroup.country]

                  return (
                    <div key={countryGroup.country} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <button
                        onClick={() => toggleCountry(countryGroup.country)}
                        className="w-full flex items-center justify-between p-5 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <span className="text-2xl">{countryInfo?.flag || '🌍'}</span>
                          <div className="text-left">
                            <span className="font-bold text-gray-800 block">
                              {countryInfo ? (language === 'fr' ? countryInfo.nameFr : countryInfo.name) : countryGroup.country}
                            </span>
                            <span className="text-sm text-gray-500">
                              {countryGroup.count} {language === 'fr' ? 'analyses' : 'analyses'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-sm text-gray-500 block">Score moyen</span>
                            <span className="font-bold text-gray-900">{countryGroup.avgScore}%</span>
                          </div>
                          {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t bg-gray-50 divide-y divide-gray-200">
                          {countryGroup.analyses.map(analysis => (
                            <div 
                              key={analysis._id} 
                              className="p-4 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                              onClick={() => setSelectedAnalysis(analysis)}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-semibold text-gray-800">{analysis.peopleGroupName}</h4>
                                  <div className="text-sm text-gray-500 mt-1 flex items-center gap-4">
                                    <span className="flex items-center gap-1">
                                      <MapPin size={12} />
                                      {safeText(analysis.villageName)}
                                    </span>
                                    <span>{new Date(analysis.analyzedAt).toLocaleDateString()}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${getScoreColor(analysis.overallScore)}`}>
                                    {analysis.overallScore}%
                                  </div>
                                  <Eye size={18} className="text-gray-400" />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Analysis Detail Modal */}
      {selectedAnalysis && (
        <AnalysisDetailModal
          analysis={selectedAnalysis}
          onClose={() => setSelectedAnalysis(null)}
          language={language}
        />
      )}
    </div>
  )
}

export default AnalyseQualitative

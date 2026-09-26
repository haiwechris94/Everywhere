/**
 * RegionDetail — Admin Level 1 detail.
 * Header + stats, drill-down list of departments, and the constant
 * [Peuples | Reporting | Couverture] tabs scoped to this region.
 */
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { administrativeApi } from '../../services/administrativeApi'
import { useLanguage } from '../../i18n'
import {
  PageHeader,
  ChildrenGrid,
  GeoTabs,
  StateLoading,
  StateError,
} from './geoComponents'

const RegionDetail = () => {
  const { regionName: raw } = useParams()
  const regionName = decodeURIComponent(raw || '')
  const { t } = useLanguage()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['geo-departments', regionName],
    queryFn: async () => {
      const res = await administrativeApi.getDepartments(regionName)
      return res?.data
    },
    enabled: !!regionName,
  })

  const departments = Array.isArray(data?.departments) ? data.departments : []

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: t('nav.geography') || 'Géographie', to: '/geography' },
          { label: regionName },
        ]}
        title={regionName}
        subtitle={t('geo.regionSubtitle') || 'Région (niveau administratif 1)'}
        stats={[
          { label: t('geo.departments') || 'Départements', value: departments.length },
        ]}
      />

      {isLoading ? (
        <StateLoading label="Chargement des départements…" />
      ) : isError ? (
        <StateError />
      ) : (
        <ChildrenGrid
          title={t('geo.departments') || 'Départements'}
          items={departments}
          toPath={(name) => `/geography/departments/${encodeURIComponent(name)}`}
          emptyLabel="Aucun département pour cette région."
        />
      )}

      <GeoTabs filter={{ region: regionName }} />
    </div>
  )
}

export default RegionDetail

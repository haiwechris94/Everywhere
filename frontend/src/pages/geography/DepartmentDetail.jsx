/**
 * DepartmentDetail — Admin Level 2 detail.
 * Drill-down list of subdivisions + tabs scoped to this department (admin2).
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

const DepartmentDetail = () => {
  const { departmentName: raw } = useParams()
  const departmentName = decodeURIComponent(raw || '')
  const { t } = useLanguage()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['geo-subdivisions', departmentName],
    queryFn: async () => {
      const res = await administrativeApi.getSubdivisions(departmentName)
      return res?.data
    },
    enabled: !!departmentName,
  })

  const subdivisions = Array.isArray(data?.subdivisions) ? data.subdivisions : []

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: t('nav.geography') || 'Géographie', to: '/geography' },
          { label: departmentName },
        ]}
        title={departmentName}
        subtitle={t('geo.departmentSubtitle') || 'Département (niveau administratif 2)'}
        stats={[
          { label: t('geo.subdivisions') || 'Arrondissements', value: subdivisions.length },
        ]}
      />

      {isLoading ? (
        <StateLoading label="Chargement des arrondissements…" />
      ) : isError ? (
        <StateError />
      ) : (
        <ChildrenGrid
          title={t('geo.subdivisions') || 'Arrondissements'}
          items={subdivisions}
          toPath={(name) => `/geography/subdivisions/${encodeURIComponent(name)}`}
          emptyLabel="Aucun arrondissement pour ce département."
        />
      )}

      <GeoTabs filter={{ admin2: departmentName }} />
    </div>
  )
}

export default DepartmentDetail

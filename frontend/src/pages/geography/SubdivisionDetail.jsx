/**
 * SubdivisionDetail — Admin Level 3 detail.
 * Lists villages (Admin Level 4, leaf) + tabs scoped to this subdivision (admin3).
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

const SubdivisionDetail = () => {
  const { subdivisionName: raw } = useParams()
  const subdivisionName = decodeURIComponent(raw || '')
  const { t } = useLanguage()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['geo-villages', subdivisionName],
    queryFn: async () => {
      const res = await administrativeApi.getVillages(subdivisionName)
      return res?.data
    },
    enabled: !!subdivisionName,
  })

  const villages = Array.isArray(data?.villages) ? data.villages : []

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: t('nav.geography') || 'Géographie', to: '/geography' },
          { label: subdivisionName },
        ]}
        title={subdivisionName}
        subtitle={t('geo.subdivisionSubtitle') || 'Arrondissement (niveau administratif 3)'}
        stats={[{ label: t('geo.villages') || 'Villages', value: villages.length }]}
      />

      {isLoading ? (
        <StateLoading label="Chargement des villages…" />
      ) : isError ? (
        <StateError />
      ) : (
        <ChildrenGrid
          title={t('geo.villages') || 'Villages'}
          items={villages}
          toPath={() => null}
          emptyLabel="Aucun village recensé pour cet arrondissement."
        />
      )}

      <GeoTabs filter={{ admin3: subdivisionName }} />
    </div>
  )
}

export default SubdivisionDetail

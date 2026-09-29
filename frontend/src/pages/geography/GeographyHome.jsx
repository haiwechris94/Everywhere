/**
 * GeographyHome — entry of the Geography section.
 * Lists the regions (Admin Level 1) of the current country as drill-down cards.
 */
import { useQuery } from '@tanstack/react-query'
import { administrativeApi } from '../../services/administrativeApi'
import { useLanguage } from '../../i18n'
import {
  PageHeader,
  ChildrenGrid,
  StateLoading,
  StateError,
} from './geoComponents'

const GeographyHome = () => {
  const { t, isFrench } = useLanguage()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['geo-regions'],
    queryFn: async () => {
      const res = await administrativeApi.getRegions()
      return res?.data
    },
  })

  const regions = Array.isArray(data?.regions) ? data.regions : []

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t('nav.geography') || 'Géographie' }]}
        title={t('nav.geography') || 'Géographie'}
        subtitle={
          t('geo.homeSubtitle') ||
          'Navigation hiérarchique : Pays → Régions → Départements → Villages'
        }
        stats={[{ label: t('nav.countries') || 'Régions', value: regions.length }]}
      />

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des régions…' : 'Loading regions…'} />
      ) : isError ? (
        <StateError />
      ) : (
        <ChildrenGrid
          title={t('geo.regions') || 'Régions'}
          items={regions}
          toPath={(name) => `/geography/regions/${encodeURIComponent(name)}`}
          emptyLabel={isFrench ? 'Aucune région disponible.' : 'No region available.'}
        />
      )}
    </div>
  )
}

export default GeographyHome

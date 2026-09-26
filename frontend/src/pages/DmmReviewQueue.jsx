import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCheck, GitMerge, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../i18n';
import dmmReviewApi from '../services/dmmReviewService';
import SUPPORTED_COUNTRIES from '../config/supportedCountries';
import Button from '../components/ui/Button';
import { Badge } from '../components/ui';

const DmmReviewQueue = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [country, setCountry] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  const authorized = user?.role === 'admin' || user?.role === 'supervisor';

  const queueQuery = useQuery({
    queryKey: ['dmm-review-queue', page, limit, country],
    queryFn: () => dmmReviewApi.getQueue({ page, limit, country: country || undefined }),
    enabled: authorized,
  });
  const countQuery = useQuery({
    queryKey: ['dmm-review-count'],
    queryFn: () => dmmReviewApi.getCount(),
    enabled: authorized,
  });

  const payload = queueQuery.data?.data;
  const rows = payload?.data || [];
  const meta = payload?.meta;
  const totalPending = countQuery.data?.data?.totalPending ?? 0;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['dmm-review-queue'] });
    queryClient.invalidateQueries({ queryKey: ['dmm-review-count'] });
  };
  const approveMutation = useMutation({
    mutationFn: (matchId) => dmmReviewApi.approve(matchId),
    onSuccess: () => { toast.success(t('dmmReview.approveSuccess')); invalidate(); },
    onError: () => toast.error(t('dmmReview.error')),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ matchId, reason }) => dmmReviewApi.reject(matchId, reason),
    onSuccess: () => { toast.success(t('dmmReview.rejectSuccess')); setRejectingId(null); setRejectReason(''); invalidate(); },
    onError: () => toast.error(t('dmmReview.error')),
  });

  const countryList = Array.isArray(SUPPORTED_COUNTRIES) ? SUPPORTED_COUNTRIES : Object.values(SUPPORTED_COUNTRIES || {});

  if (!authorized) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-3 text-gray-700">
          <AlertTriangle className="text-amber-500" />
          <span>{t('dmmReview.accessDenied')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-gray-900">{t('dmmReview.title')}</h1>
        <Badge variant="warning">{`${totalPending} ${t('dmmReview.pending')}`}</Badge>
      </div>

      <div className="flex items-center gap-3">
        <select
          className="form-input max-w-xs"
          value={country}
          onChange={(e) => { setCountry(e.target.value); setPage(1); }}
        >
          <option value="">{t('dmmReview.allCountries')}</option>
          {countryList.map((c) => (
            <option key={c.code} value={c.code}>{c.nameFr || c.name}</option>
          ))}
        </select>
      </div>

      {queueQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        </div>
      ) : queueQuery.isError ? (
        <div className="bg-white rounded-xl shadow-sm p-6 flex items-center gap-3 text-red-600">
          <AlertTriangle /> <span>{t('dmmReview.error')}</span>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-6 text-gray-600">{t('dmmReview.empty')}</div>
      ) : (
        <div className="space-y-4">
          {rows.map((m) => {
            const eng = m.engagement || {};
            const cand = m.candidateMaster || {};
            const loc = [eng.region, eng.admin2, eng.admin3].filter(Boolean).join(' · ');
            return (
              <div key={m.matchId} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center gap-3 mb-3 text-sm">
                  <Badge variant="primary">{m.matchType}</Badge>
                  <span className="text-gray-500">{t('dmmReview.tier')} {m.matchTier}</span>
                  <span className="text-gray-500">{t('dmmReview.confidence')} {m.confidence}%</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-3">
                    <div className="text-xs uppercase text-gray-400 mb-1">{t('dmmReview.engagementPanel')}</div>
                    <div className="font-semibold text-gray-900">{eng.name || '—'}</div>
                    {eng.villageName && <div className="text-sm text-gray-600">{eng.villageName}</div>}
                    {loc && <div className="text-sm text-gray-500">{loc}</div>}
                    {eng.country && <div className="text-sm text-gray-500">{eng.country}</div>}
                    <div className="text-sm text-gray-600 mt-1">
                      {t('dmmReview.churches')}: {eng.numberOfChurches ?? 0} · {t('dmmReview.generation')}: {eng.churchGeneration ?? 0} · {t('dmmReview.status')}: {eng.engagementStatus || '—'}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs uppercase text-gray-400 mb-1">{t('dmmReview.candidatePanel')}</div>
                    <div className="font-semibold text-gray-900">{cand.canonicalName || '—'}</div>
                    {cand.primaryCountryCode && <div className="text-sm text-gray-500">{cand.primaryCountryCode}</div>}
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(cand.sourceTypes || []).map((s) => <Badge key={s} variant="neutral">{s}</Badge>)}
                    </div>
                    {cand.status?.status && <div className="text-sm text-gray-500 mt-1">{cand.status.status}</div>}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <Button variant="primary" leftIcon={<CheckCheck size={16} />} loading={approveMutation.isPending} onClick={() => approveMutation.mutate(m.matchId)}>
                    {t('dmmReview.approve')}
                  </Button>
                  <Button variant="danger" leftIcon={<GitMerge size={16} />} onClick={() => setRejectingId(m.matchId)}>
                    {t('dmmReview.reject')}
                  </Button>
                </div>
                {rejectingId === m.matchId && (
                  <div className="mt-3 space-y-2">
                    <textarea className="form-input w-full" rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder={t('dmmReview.rejectReasonPlaceholder')} />
                    <div className="flex gap-2">
                      <Button variant="danger" loading={rejectMutation.isPending} onClick={() => rejectMutation.mutate({ matchId: m.matchId, reason: rejectReason })}>
                        {t('dmmReview.confirm')}
                      </Button>
                      <Button variant="secondary" onClick={() => { setRejectingId(null); setRejectReason(''); }}>
                        {t('dmmReview.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {meta?.pagination && meta.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)} leftIcon={<ChevronLeft size={16} />}>{t('common.previous') || 'Précédent'}</Button>
          <span className="text-sm text-gray-600">Page {meta.pagination.page} / {meta.pagination.totalPages}</span>
          <Button variant="secondary" disabled={page >= meta.pagination.totalPages} onClick={() => setPage(page + 1)} rightIcon={<ChevronRight size={16} />}>{t('common.next') || 'Suivant'}</Button>
        </div>
      )}
    </div>
  );
};

export default DmmReviewQueue;

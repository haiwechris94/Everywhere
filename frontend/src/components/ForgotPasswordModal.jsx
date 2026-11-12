import { useState } from 'react'
import { useDialog } from './ui/useDialog'
import { useForm } from 'react-hook-form'
import { X, Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'
import { useLanguage } from '../i18n'
import api from '../services/api'

const ForgotPasswordModal = ({ isOpen, onClose }) => {
  const { t } = useLanguage()
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm()

  const onSubmit = async (data) => {
    setIsLoading(true)
    setError(null)

    try {
      // Call the password reset API endpoint
      await api.post('/api/auth/forgot-password', { email: data.email })
      setIsSuccess(true)
    } catch (err) {
      // Even if the email doesn't exist, we show success for security reasons
      // This prevents email enumeration attacks
      setIsSuccess(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    setIsSuccess(false)
    setError(null)
    reset()
    onClose()
  }

  const handleTryAgain = () => {
    setIsSuccess(false)
    setError(null)
    reset()
  }

  const dialogRef = useDialog(isOpen, handleClose)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60"
        onClick={handleClose}
      />

      {/* Modal */}
      <div ref={dialogRef} className="relative bg-white rounded-2xl border border-neutral-200 shadow-soft-lg w-full max-w-md mx-4 p-8 animate-fade-in dark:bg-slate-800 dark:border-slate-700">
        {/* Close button */}
        <button aria-label={t('common.close')}
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-100 transition-colors dark:hover:bg-slate-700"
        >
          <X size={20} className="text-gray-500" />
        </button>

        {isSuccess ? (
          // Success State
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6 dark:bg-green-900/40">
              <CheckCircle size={32} className="text-green-600 dark:text-green-300" />
            </div>
            <h2 className="font-display text-2xl font-semibold text-neutral-900 mb-3 dark:text-slate-100">
              {t('passwordRecovery.successTitle')}
            </h2>
            <p className="text-gray-600 mb-4 dark:text-slate-300">
              {t('passwordRecovery.successMessage')}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {t('passwordRecovery.checkSpam')}
            </p>
            <div className="space-y-3">
              <button
                onClick={handleClose}
                className="w-full btn-primary py-3"
              >
                {t('passwordRecovery.backToLogin')}
              </button>
              <button
                onClick={handleTryAgain}
                className="w-full py-3 text-gray-600 hover:text-gray-800 transition-colors dark:text-slate-300"
              >
                {t('passwordRecovery.tryAgain')}
              </button>
            </div>
          </div>
        ) : (
          // Form State
          <>
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4 dark:bg-primary-900/40">
                <Mail size={32} className="text-primary-600 dark:text-primary-300" />
              </div>
              <h2 className="font-display text-2xl font-semibold text-neutral-900 dark:text-slate-100">
                {t('passwordRecovery.title')}
              </h2>
              <p className="text-gray-500 mt-2">
                {t('passwordRecovery.subtitle')}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 dark:bg-red-900/30 dark:border-red-800">
                <AlertCircle size={20} className="text-red-500 flex-shrink-0" />
                <p className="text-red-700 text-sm dark:text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div>
                <label htmlFor="forgot-password-modal-email" className="form-label">{t('auth.email')}</label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
                  />
                  <input
                    id="forgot-password-modal-email"
                    type="email"
                    {...register('email', {
                      required: t('validation.emailRequired'),
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: t('validation.emailInvalid'),
                      },
                    })}
                    className="form-input pl-10"
                    placeholder={t('passwordRecovery.emailPlaceholder')}
                    autoFocus
                  />
                </div>
                {errors.email && (
                  <p role="alert" className="form-error">{errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full btn-primary py-3 text-base"
              >
                {isLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    {t('passwordRecovery.sending')}
                  </>
                ) : (
                  t('passwordRecovery.sendLink')
                )}
              </button>
            </form>

            <button
              onClick={handleClose}
              className="w-full mt-4 py-3 flex items-center justify-center gap-2 text-gray-600 hover:text-gray-800 transition-colors dark:text-slate-300"
            >
              <ArrowLeft size={18} />
              {t('passwordRecovery.backToLogin')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default ForgotPasswordModal

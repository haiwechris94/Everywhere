import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import { Lock, Eye, EyeOff, MapPin, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher'
import api from '../services/api'

const ResetPassword = () => {
  const { token } = useParams()
  const navigate = useNavigate()
  const { login } = useAuth()
  const { t } = useLanguage()

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isVerifying, setIsVerifying] = useState(true)
  const [isTokenValid, setIsTokenValid] = useState(false)
  const [maskedEmail, setMaskedEmail] = useState('')
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState(null)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm()

  const password = watch('password')

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      try {
        const response = await api.get(`/api/auth/verify-reset-token/${token}`)
        if (response.data.valid) {
          setIsTokenValid(true)
          setMaskedEmail(response.data.email || '')
        } else {
          setIsTokenValid(false)
          setError(t('resetPassword.invalidToken') || 'Invalid or expired reset link')
        }
      } catch (err) {
        setIsTokenValid(false)
        setError(
          err.response?.data?.message ||
          t('resetPassword.invalidToken') ||
          'Invalid or expired reset link'
        )
      } finally {
        setIsVerifying(false)
      }
    }

    if (token) {
      verifyToken()
    } else {
      setIsVerifying(false)
      setError(t('resetPassword.noToken') || 'No reset token provided')
    }
  }, [token, t])

  const onSubmit = async (data) => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await api.post('/api/auth/reset-password', {
        token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      })

      if (response.data.success) {
        setIsSuccess(true)

        // Auto-login with the returned token
        if (response.data.token) {
          localStorage.setItem('token', response.data.token)
          // Redirect to dashboard after a short delay
          setTimeout(() => {
            navigate('/dashboard')
          }, 2000)
        }
      }
    } catch (err) {
      setError(
        err.response?.data?.message ||
        t('resetPassword.resetError') ||
        'Failed to reset password. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  // Loading state while verifying token
  if (isVerifying) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 dark:bg-slate-900">
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-soft-lg w-full max-w-md p-8 text-center dark:bg-slate-800 dark:border-slate-700">
          <Loader2 size={48} className="animate-spin text-primary-600 mx-auto mb-4 dark:text-primary-300" />
          <p className="text-gray-600 dark:text-slate-300">{t('resetPassword.verifying') || 'Verifying reset link...'}</p>
        </div>
      </div>
    )
  }

  // Invalid token state
  if (!isTokenValid && !isVerifying) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 relative dark:bg-slate-900">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher variant="dropdown" className="bg-white rounded-lg border border-neutral-200 dark:bg-slate-800 dark:border-slate-700" />
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 shadow-soft-lg w-full max-w-md p-8 text-center animate-fade-in dark:bg-slate-800 dark:border-slate-700">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-6 dark:bg-red-900/40">
            <AlertCircle size={32} className="text-red-600 dark:text-red-300" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-neutral-900 mb-3 dark:text-slate-100">
            {t('resetPassword.invalidLinkTitle') || 'Invalid Reset Link'}
          </h2>
          <p className="text-gray-600 mb-6 dark:text-slate-300">
            {error || t('resetPassword.invalidLinkMessage') || 'This password reset link is invalid or has expired. Please request a new one.'}
          </p>
          <Link
            to="/login"
            className="w-full btn-primary py-3 inline-block text-center"
          >
            {t('resetPassword.backToLogin') || 'Back to Login'}
          </Link>
        </div>
      </div>
    )
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 relative dark:bg-slate-900">
        <div className="absolute top-4 right-4">
          <LanguageSwitcher variant="dropdown" className="bg-white rounded-lg border border-neutral-200 dark:bg-slate-800 dark:border-slate-700" />
        </div>

        <div className="bg-white rounded-2xl border border-neutral-200 shadow-soft-lg w-full max-w-md p-8 text-center animate-fade-in dark:bg-slate-800 dark:border-slate-700">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6 dark:bg-green-900/40">
            <CheckCircle size={32} className="text-green-600 dark:text-green-300" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-neutral-900 mb-3 dark:text-slate-100">
            {t('resetPassword.successTitle') || 'Password Reset Successfully!'}
          </h2>
          <p className="text-gray-600 mb-6 dark:text-slate-300">
            {t('resetPassword.successMessage') || 'Your password has been updated. You will be redirected to the dashboard shortly.'}
          </p>
          <div className="flex items-center justify-center gap-2 text-primary-600 dark:text-primary-300">
            <Loader2 size={20} className="animate-spin" />
            <span>{t('resetPassword.redirecting') || 'Redirecting...'}</span>
          </div>
        </div>
      </div>
    )
  }

  // Reset password form
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 relative dark:bg-slate-900">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher variant="dropdown" className="bg-white rounded-lg border border-neutral-200 dark:bg-slate-800 dark:border-slate-700" />
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-soft-lg w-full max-w-md p-8 animate-fade-in dark:bg-slate-800 dark:border-slate-700">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4 dark:bg-primary-900/40">
            <MapPin size={32} className="text-primary-600 dark:text-primary-300" />
          </div>
          <h1 className="page-title">
            {t('resetPassword.title') || 'Reset Your Password'}
          </h1>
          <p className="text-gray-500 mt-2">
            {t('resetPassword.subtitle') || 'Enter your new password below'}
          </p>
          {maskedEmail && (
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {t('resetPassword.forAccount') || 'For account'}: {maskedEmail}
            </p>
          )}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 dark:bg-red-900/30 dark:border-red-800">
            <AlertCircle size={20} className="text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* New Password */}
          <div>
            <label htmlFor="reset-password-newpassword" className="form-label">
              {t('resetPassword.newPassword') || 'New Password'}
            </label>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="reset-password-newpassword"
                type={showPassword ? 'text' : 'password'}
                {...register('password', {
                  required: t('validation.passwordRequired') || 'Password is required',
                  minLength: {
                    value: 6,
                    message: t('validation.passwordMinLength') || 'Minimum 6 characters',
                  },
                })}
                className="form-input pl-10 pr-10"
                placeholder="••••••••"
              />
              <button aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p role="alert" className="form-error">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="reset-password-confirmpassword" className="form-label">
              {t('resetPassword.confirmPassword') || 'Confirm Password'}
            </label>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="reset-password-confirmpassword"
                type={showConfirmPassword ? 'text' : 'password'}
                {...register('confirmPassword', {
                  required: t('validation.confirmRequired') || 'Please confirm your password',
                  validate: (value) =>
                    value === password ||
                    t('validation.passwordMismatch') ||
                    'Passwords do not match',
                })}
                className="form-input pl-10 pr-10"
                placeholder="••••••••"
              />
              <button aria-label={showConfirmPassword ? t('common.hidePassword') : t('common.showPassword')}
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p role="alert" className="form-error">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Password Requirements */}
          <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg dark:bg-slate-900">
            <p className="font-medium mb-1">
              {t('resetPassword.requirements') || 'Password requirements:'}
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>{t('resetPassword.reqMinLength') || 'At least 6 characters'}</li>
            </ul>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-3 text-base"
          >
            {isLoading ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                {t('resetPassword.resetting') || 'Resetting...'}
              </>
            ) : (
              t('resetPassword.resetButton') || 'Reset Password'
            )}
          </button>
        </form>

        {/* Back to Login */}
        <p className="text-center mt-6 text-gray-600 dark:text-slate-300">
          <Link to="/login" className="text-primary-600 hover:underline font-medium dark:text-primary-300">
            {t('resetPassword.backToLogin') || 'Back to Login'}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default ResetPassword

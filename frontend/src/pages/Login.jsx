import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher'
import ForgotPasswordModal from '../components/ForgotPasswordModal'

const Login = () => {
  const { login } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm()

  const onSubmit = async (data) => {
    setIsLoading(true)
    const result = await login(data.email, data.password)
    setIsLoading(false)
    if (result.success) {
      navigate('/regions')
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 relative overflow-hidden dark:bg-slate-900">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher variant="dropdown" className="bg-white rounded-lg border border-neutral-200 dark:bg-slate-800 dark:border-slate-700" />
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl border border-neutral-200 shadow-soft-lg p-6 sm:p-8 animate-fade-in relative z-10 dark:bg-slate-800 dark:border-slate-700">
        {/* EVERYWHERE Logo */}
        <div className="text-center mb-8">
          <img
            src="/data/Everywhere_Logo_Mark_Black.png"
            alt=""
            className="h-16 w-auto mx-auto mb-4"
          />
          <h1 className="font-display text-3xl font-semibold text-neutral-900 dark:text-slate-100">Everywhere</h1>
          <p className="mt-2 text-base text-neutral-600 dark:text-slate-300">{t('auth.loginSubtitle')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Email */}
          <div>
            <label htmlFor="login-email" className="form-label">{t('auth.email')}</label>
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="login-email"
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
              />
            </div>
            {errors.email && (
              <p role="alert" className="form-error">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="login-password" className="form-label mb-0">{t('auth.password')}</label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-primary-700 hover:text-primary-800 underline underline-offset-2 font-semibold dark:text-primary-300"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                {...register('password', {
                  required: t('validation.passwordRequired'),
                  minLength: {
                    value: 6,
                    message: t('validation.passwordMinLength'),
                  },
                })}
                className="form-input pl-10 pr-12"
                placeholder="••••••••"
              />
              <button aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p role="alert" className="form-error">{errors.password.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-3 text-base"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              t('auth.signIn')
            )}
          </button>
        </form>

      </div>

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
      />
    </div>
  )
}

export default Login

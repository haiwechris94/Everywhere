import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import { Mail, Lock, Eye, EyeOff, User, Building, MapPin } from 'lucide-react'
import LanguageSwitcher from '../components/LanguageSwitcher'

const Register = () => {
  const { register: registerUser } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm()

  const password = watch('password')

  const onSubmit = async (data) => {
    setIsLoading(true)
    const result = await registerUser({
      name: data.name,
      email: data.email,
      password: data.password,
      organization: data.organization,
      role: data.role,
    })
    setIsLoading(false)
    if (result.success) {
      navigate('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 relative dark:bg-slate-900">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher variant="dropdown" className="bg-white rounded-lg border border-neutral-200 dark:bg-slate-800 dark:border-slate-700" />
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-soft-lg w-full max-w-md p-8 animate-fade-in dark:bg-slate-800 dark:border-slate-700">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4 dark:bg-primary-900/40">
            <MapPin size={32} className="text-primary-600 dark:text-primary-300" />
          </div>
          <h1 className="font-display text-2xl font-semibold text-neutral-900 dark:text-slate-100">Everywhere</h1>
          <p className="text-gray-500 mt-2">{t('auth.registerSubtitle')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Name */}
          <div>
            <label htmlFor="register-fullname" className="form-label">{t('auth.fullName')}</label>
            <div className="relative">
              <User
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="register-fullname"
                type="text"
                {...register('name', {
                  required: t('validation.nameRequired'),
                  minLength: {
                    value: 2,
                    message: t('validation.nameMinLength'),
                  },
                })}
                className="form-input pl-10"
                placeholder="Jean Dupont"
              />
            </div>
            {errors.name && (
              <p role="alert" className="form-error">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="register-email" className="form-label">{t('auth.email')}</label>
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="register-email"
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

          {/* Organization */}
          <div>
            <label htmlFor="register-organizationoptional" className="form-label">{t('auth.organizationOptional')}</label>
            <div className="relative">
              <Building
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="register-organizationoptional"
                type="text"
                {...register('organization')}
                className="form-input pl-10"
                placeholder={t('auth.organization')}
              />
            </div>
          </div>

          {/* Role Selection */}
          <div role="radiogroup" aria-labelledby="register-role-label">
            <span id="register-role-label" className="form-label">Statut du compte *</span>
            <div className="mt-2 space-y-2">
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors dark:border-slate-700 dark:hover:bg-slate-700">
                <input
                  type="radio"
                  value="missionary"
                  {...register('role', { required: true })}
                  defaultChecked
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 dark:border-slate-700 dark:text-primary-300"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-slate-100">Missionnaire</span>
                  <p className="text-sm text-gray-500">Accès complet en lecture/écriture</p>
                </div>
              </label>
              <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors dark:border-slate-700 dark:hover:bg-slate-700">
                <input
                  type="radio"
                  value="guest"
                  {...register('role', { required: true })}
                  className="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 dark:border-slate-700 dark:text-primary-300"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-slate-100">Guest / Invité</span>
                  <p className="text-sm text-gray-500">Accès en lecture seule</p>
                </div>
              </label>
            </div>
          </div>

          {/* Password */}
          <div>
            <label htmlFor="register-password" className="form-label">{t('auth.password')}</label>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                {...register('password', {
                  required: t('validation.passwordRequired'),
                  minLength: {
                    value: 6,
                    message: t('validation.passwordMinLength'),
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
            <label htmlFor="register-confirmpassword" className="form-label">{t('auth.confirmPassword')}</label>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400"
              />
              <input
                id="register-confirmpassword"
                type={showPassword ? 'text' : 'password'}
                {...register('confirmPassword', {
                  required: t('validation.confirmRequired'),
                  validate: (value) =>
                    value === password || t('validation.passwordMismatch'),
                })}
                className="form-input pl-10"
                placeholder="••••••••"
              />
            </div>
            {errors.confirmPassword && (
              <p role="alert" className="form-error">
                {errors.confirmPassword.message}
              </p>
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
              t('auth.signUp')
            )}
          </button>
        </form>

        {/* Login Link */}
        <p className="text-center mt-6 text-gray-600 dark:text-slate-300">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="text-primary-600 hover:underline font-medium dark:text-primary-300">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Register

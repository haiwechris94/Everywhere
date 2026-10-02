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
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Logo Watermark */}
      <div 
        className="absolute inset-0 z-0 opacity-5"
        style={{
          backgroundImage: 'url(/data/newgenerationslogoblack.svg)',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '60%',
          filter: 'blur(3px)',
        }}
      />
      
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher variant="dropdown" className="bg-white/90 backdrop-blur-sm rounded-lg" />
      </div>

      <div className="w-full max-w-md p-8 animate-fade-in relative z-10">
        {/* EVERYWHERE Logo */}
        <div className="text-center mb-8">
          <div className="mb-4">
            <h1 className="text-4xl font-black text-black tracking-widest drop-shadow-[0_2px_4px_rgba(255,255,255,0.8)]">
              EVERYWHERE
            </h1>
            <div className="w-24 h-1 bg-black mx-auto mt-2 drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]"></div>
          </div>
          {/* Logo Image */}
          <div className="mb-4">
            <img 
              src="/data/Everywhere_Logo_Mark_Black.png" 
              alt="Everywhere Logo" 
              className="h-20 w-auto mx-auto drop-shadow-[0_2px_4px_rgba(255,255,255,0.8)]"
            />
          </div>
          <p className="text-gray-700 font-medium drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">{t('auth.loginSubtitle')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Email */}
          <div>
            <label className="form-label text-gray-900 font-semibold drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">{t('auth.email')}</label>
            <div className="relative">
              <Mail
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="email"
                {...register('email', {
                  required: t('validation.emailRequired'),
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: t('validation.emailInvalid'),
                  },
                })}
                className="form-input pl-10 bg-white/80 backdrop-blur-sm shadow-lg"
                placeholder={t('passwordRecovery.emailPlaceholder')}
              />
            </div>
            {errors.email && (
              <p className="text-red-500 text-sm mt-1">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="form-label mb-0 text-gray-900 font-semibold drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]">{t('auth.password')}</label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-primary-600 hover:text-primary-700 hover:underline font-semibold drop-shadow-[0_1px_2px_rgba(255,255,255,0.8)]"
              >
                {t('auth.forgotPassword')}
              </button>
            </div>
            <div className="relative">
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type={showPassword ? 'text' : 'password'}
                {...register('password', {
                  required: t('validation.passwordRequired'),
                  minLength: {
                    value: 6,
                    message: t('validation.passwordMinLength'),
                  },
                })}
                className="form-input pl-10 pr-10 bg-white/80 backdrop-blur-sm shadow-lg"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {errors.password && (
              <p className="text-red-500 text-sm mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2 shadow-xl"
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

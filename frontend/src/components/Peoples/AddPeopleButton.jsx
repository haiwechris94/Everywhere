/**
 * AddPeopleButton Component
 * Conditional button that only shows for Admin/Supervisor users
 */
import { useAuth } from '../../context/AuthContext'

/**
 * AddPeopleButton - Shows add button only for authorized users
 * @param {function} onClick - Callback when button is clicked
 * @param {string} className - Additional CSS classes
 * @param {string} variant - Button variant: 'primary', 'secondary', 'icon'
 * @param {string} size - Button size: 'sm', 'md', 'lg'
 * @param {boolean} disabled - Whether button is disabled
 * @param {string} label - Button label text
 */
const AddPeopleButton = ({
  onClick,
  className = '',
  variant = 'primary',
  size = 'md',
  disabled = false,
  label = 'Add Population',
}) => {
  const { user } = useAuth()

  // Check if user can add peoples (Admin or Supervisor)
  const canAddPeople = user && ['admin', 'supervisor'].includes(user.role)

  // Don't render if user doesn't have permission
  if (!canAddPeople) {
    return null
  }

  // Size classes
  const sizeClasses = {
    sm: 'py-1 px-2 text-xs',
    md: 'py-2 px-4 text-sm',
    lg: 'py-3 px-6 text-base',
  }

  // Variant classes
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500 border border-gray-300',
    icon: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 rounded-full p-2',
  }

  // Icon-only variant
  if (variant === 'icon') {
    return (
      <button aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className={`
          ${variantClasses.icon}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          focus:outline-none focus:ring-2 focus:ring-offset-2
          transition-colors duration-200
          shadow-lg hover:shadow-xl
          ${className}
        `}
        title={label}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        rounded-md font-medium
        focus:outline-none focus:ring-2 focus:ring-offset-2
        transition-colors duration-200
        flex items-center gap-2
        ${className}
      `}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      {label}
    </button>
  )
}

/**
 * RoleGate Component - Renders children only if user has required role
 * @param {Array} roles - Array of allowed roles
 * @param {React.ReactNode} children - Children to render if authorized
 * @param {React.ReactNode} fallback - Fallback to render if not authorized
 */
export const RoleGate = ({ roles = [], children, fallback = null }) => {
  const { user } = useAuth()

  const hasRole = user && roles.includes(user.role)

  if (!hasRole) {
    return fallback
  }

  return children
}

/**
 * AdminSupervisorOnly - Shorthand for RoleGate with admin/supervisor roles
 */
export const AdminSupervisorOnly = ({ children, fallback = null }) => (
  <RoleGate roles={['admin', 'supervisor']} fallback={fallback}>
    {children}
  </RoleGate>
)

/**
 * AdminOnly - Shorthand for RoleGate with admin role only
 */
export const AdminOnly = ({ children, fallback = null }) => (
  <RoleGate roles={['admin']} fallback={fallback}>
    {children}
  </RoleGate>
)

export default AddPeopleButton

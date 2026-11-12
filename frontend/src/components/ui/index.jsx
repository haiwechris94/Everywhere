import React from 'react';

/**
 * Modern Badge Component
 * 
 * @param {Object} props
 * @param {'primary'|'secondary'|'success'|'warning'|'danger'|'accent'|'neutral'} props.variant - Badge color variant
 * @param {React.ReactNode} props.icon - Optional icon
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Badge content
 */
export const Badge = ({
  variant = 'neutral',
  icon,
  className = '',
  children,
  ...props
}) => {
  const variantClasses = {
    primary: 'badge-primary',
    secondary: 'badge-secondary',
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    accent: 'badge-accent',
    neutral: 'badge-neutral',
  };

  const classes = [
    'badge',
    variantClasses[variant],
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} {...props}>
      {icon && icon}
      {children}
    </span>
  );
};

/**
 * Modern Card Component
 * 
 * @param {Object} props
 * @param {boolean} props.hover - Enable hover effect
 * @param {boolean} props.interactive - Enable interactive (clickable) effect
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Card content
 */
export const Card = ({
  hover = false,
  interactive = false,
  className = '',
  children,
  ...props
}) => {
  const baseClass = interactive ? 'card-interactive' : hover ? 'card-hover' : 'card';
  const classes = [baseClass, className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

/**
 * Card Header Component
 */
export const CardHeader = ({ className = '', children, ...props }) => (
  <div className={`card-header ${className}`} {...props}>
    {children}
  </div>
);

/**
 * Card Title Component
 */
export const CardTitle = ({ className = '', children, ...props }) => (
  <h3 className={`card-title ${className}`} {...props}>
    {children}
  </h3>
);

/**
 * Card Body Component
 */
export const CardBody = ({ className = '', children, ...props }) => (
  <div className={`card-body ${className}`} {...props}>
    {children}
  </div>
);

/**
 * Card Footer Component
 */
export const CardFooter = ({ className = '', children, ...props }) => (
  <div className={`card-footer ${className}`} {...props}>
    {children}
  </div>
);

/**
 * Modern Tab Container Component
 * 
 * @param {Object} props
 * @param {'pill'|'underline'} props.variant - Tab style variant
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Tab buttons
 */
export const TabContainer = ({
  variant = 'pill',
  className = '',
  children,
  ...props
}) => {
  const variantClasses = {
    pill: 'tabs-container',
    underline: 'tabs-underline',
  };

  const classes = [variantClasses[variant], className].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
};

/**
 * Modern Tab Button Component
 * 
 * @param {Object} props
 * @param {'pill'|'underline'} props.variant - Tab style variant
 * @param {boolean} props.active - Is tab active
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Tab content
 */
export const Tab = ({
  variant = 'pill',
  active = false,
  className = '',
  children,
  ...props
}) => {
  const variantClasses = {
    pill: active ? 'tab tab-active' : 'tab',
    underline: active ? 'tab-underline tab-underline-active' : 'tab-underline',
  };

  const classes = [variantClasses[variant], className].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
};

/**
 * Modern Filter Chip Component
 * 
 * @param {Object} props
 * @param {boolean} props.active - Is chip active/selected
 * @param {boolean} props.removable - Show remove button
 * @param {Function} props.onRemove - Remove handler
 * @param {React.ReactNode} props.icon - Optional icon
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Chip content
 */
export const FilterChip = ({
  active = false,
  removable = false,
  onRemove,
  icon,
  className = '',
  children,
  ...props
}) => {
  const baseClass = removable ? 'filter-chip-removable' : 'filter-chip';
  const activeClass = active ? 'filter-chip-active' : '';
  const classes = [baseClass, activeClass, className].filter(Boolean).join(' ');

  return (
    <button className={classes} {...props}>
      {icon && icon}
      {children}
      {removable && onRemove && (
        <button aria-label="Supprimer"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:bg-black/10 rounded-full p-0.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </button>
  );
};

/**
 * Modern Toggle Switch Component
 * 
 * @param {Object} props
 * @param {boolean} props.checked - Is toggle on
 * @param {Function} props.onChange - Change handler
 * @param {string} props.label - Optional label
 * @param {string} props.className - Additional CSS classes
 */
export const ToggleSwitch = ({
  checked = false,
  onChange,
  label,
  className = '',
  ...props
}) => {
  return (
    <label className={`inline-flex items-center gap-3 cursor-pointer ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggle-switch ${checked ? 'toggle-switch-on' : 'toggle-switch-off'}`}
        onClick={() => onChange(!checked)}
        {...props}
      >
        <span className={`toggle-switch-handle ${checked ? 'toggle-switch-handle-on' : 'toggle-switch-handle-off'}`} />
      </button>
      {label && <span className="text-sm font-medium text-neutral-700">{label}</span>}
    </label>
  );
};

/**
 * Modern Input Component
 * 
 * @param {Object} props
 * @param {string} props.label - Input label
 * @param {string} props.error - Error message
 * @param {string} props.helper - Helper text
 * @param {React.ReactNode} props.leftIcon - Icon on the left
 * @param {React.ReactNode} props.rightIcon - Icon on the right
 * @param {string} props.className - Additional CSS classes
 */
export const Input = React.forwardRef(({
  label,
  error,
  helper,
  leftIcon,
  rightIcon,
  className = '',
  id: idProp,
  ...props
}, ref) => {
  const autoId = React.useId();
  const id = idProp || autoId;
  const messageId = error || helper ? `${id}-message` : undefined;
  return (
    <div className="w-full">
      {label && <label htmlFor={id} className="form-label">{label}</label>}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className={`form-input ${leftIcon ? 'pl-10' : ''} ${rightIcon ? 'pr-10' : ''} ${error ? 'border-danger-500 focus:ring-danger-400' : ''} ${className}`}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
            {rightIcon}
          </div>
        )}
      </div>
      {error && (
        <p id={messageId} className="form-error" role="alert">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </p>
      )}
      {helper && !error && <p id={messageId} className="form-helper">{helper}</p>}
    </div>
  );
});

Input.displayName = 'Input';

/**
 * Modern Layer Panel Component
 * 
 * @param {Object} props
 * @param {string} props.title - Panel title
 * @param {React.ReactNode} props.icon - Title icon
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Panel content
 */
export const LayerPanel = ({
  title,
  icon,
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`layer-panel ${className}`} {...props}>
      {title && (
        <div className="layer-header">
          <h4 className="layer-title">
            {icon && icon}
            {title}
          </h4>
        </div>
      )}
      {children}
    </div>
  );
};

/**
 * Modern Layer Item Component
 * 
 * @param {Object} props
 * @param {boolean} props.active - Is item active
 * @param {React.ReactNode} props.icon - Item icon
 * @param {string} props.className - Additional CSS classes
 * @param {React.ReactNode} props.children - Item content
 */
export const LayerItem = ({
  active = false,
  icon,
  className = '',
  children,
  ...props
}) => {
  const classes = [
    'layer-item',
    active ? 'layer-item-active' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {icon && icon}
      {children}
    </div>
  );
};

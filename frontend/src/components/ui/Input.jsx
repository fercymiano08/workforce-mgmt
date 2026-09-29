import clsx from 'clsx';
import { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

// py-2.5 with text-sm gives a 40px field, which is a little under the 44px a fingertip reliably
// lands on. A touch device gets 2px more vertical padding, and a mouse keeps the tighter box - the
// difference is invisible on a desktop and the difference between a miss and a hit on a phone.
const FIELD = 'w-full px-3.5 py-2.5 pointer-coarse:py-3 text-sm rounded-xl border border-gray-200 bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 placeholder:text-gray-400 hover:border-gray-300';

const Input = forwardRef(({ label, error, icon: Icon, rightElement, className, containerClass, ...props }, ref) => {
  // A label wired to its field is a second, much larger tap target for the same focus, which is
  // what a phone actually needs. Anything passing its own id keeps it.
  const generated = useId();
  const fieldId = props.id || generated;
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClass)}>
      {label && (
        <label htmlFor={fieldId} className="text-[13px] font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          ref={ref}
          id={fieldId}
          className={clsx(
            FIELD,
            Icon && 'pl-10',
            rightElement && 'pr-10',
            error && 'border-red-300 focus:ring-red-500/15 focus:border-red-500',
            className
          )}
          {...props}
        />
        {rightElement && (
          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
            {rightElement}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';
export default Input;

export function Select({ label, error, children, className, containerClass, ...props }) {
  const generated = useId();
  const fieldId = props.id || generated;
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClass)}>
      {label && (
        <label htmlFor={fieldId} className="text-[13px] font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          id={fieldId}
          className={clsx(
            FIELD,
            'pr-10 appearance-none',
            error && 'border-red-300 focus:ring-red-500/15 focus:border-red-500',
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

export function Textarea({ label, error, className, containerClass, ...props }) {
  const generated = useId();
  const fieldId = props.id || generated;
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClass)}>
      {label && (
        <label htmlFor={fieldId} className="text-[13px] font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={fieldId}
        className={clsx(
          FIELD,
          'resize-none',
          error && 'border-red-300 focus:ring-red-500/15 focus:border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

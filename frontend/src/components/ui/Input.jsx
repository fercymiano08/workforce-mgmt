import clsx from 'clsx';
import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';

const Input = forwardRef(({ label, error, icon: Icon, rightElement, className, containerClass, ...props }, ref) => {
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClass)}>
      {label && (
        <label className="text-[13px] font-medium text-gray-700">
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
          className={clsx(
            'w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 placeholder:text-gray-400 hover:border-gray-300',
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
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClass)}>
      {label && (
        <label className="text-[13px] font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <select
          className={clsx(
            'w-full px-3.5 py-2.5 pr-10 text-sm rounded-xl border border-gray-200 bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 appearance-none hover:border-gray-300',
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
  return (
    <div className={clsx('flex flex-col gap-1.5', containerClass)}>
      {label && (
        <label className="text-[13px] font-medium text-gray-700">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        className={clsx(
          'w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 placeholder:text-gray-400 resize-none hover:border-gray-300',
          error && 'border-red-300 focus:ring-red-500/15 focus:border-red-500',
          className
        )}
        {...props}
      />
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}

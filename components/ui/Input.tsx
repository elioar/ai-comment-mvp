import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-all text-gray-900 placeholder:text-gray-400 ${
            error
              ? 'border-red-500 focus:ring-red-200'
              : 'border-gray-300 focus:ring-gray-900 focus:border-gray-900'
          } ${props.disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'} ${className}`}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-600 mt-1.5">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-sm text-gray-500 mt-1.5">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

'use client'

import { InputHTMLAttributes, forwardRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  success?: boolean
  helperText?: string
  showCharCount?: boolean
  maxLength?: number
}

const FormInput = forwardRef<HTMLInputElement, FormInputProps>(
  (
    {
      label,
      error,
      success,
      helperText,
      showCharCount,
      maxLength,
      type = 'text',
      className = '',
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false)
    const [charCount, setCharCount] = useState(0)

    const isPassword = type === 'password'
    const inputType = isPassword && showPassword ? 'text' : type

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (showCharCount && maxLength) {
        setCharCount(e.target.value.length)
      }
      props.onChange?.(e)
    }

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {label}
            {props.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            type={inputType}
            maxLength={maxLength}
            onChange={handleChange}
            className={`
              w-full px-4 py-2.5 rounded-lg border
              bg-white dark:bg-gray-900
              text-gray-900 dark:text-gray-100
              placeholder-gray-400 dark:placeholder-gray-500
              transition-all duration-200
              ${error
                ? 'border-red-300 dark:border-red-700 focus:border-red-500 dark:focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                : success
                ? 'border-green-300 dark:border-green-700 focus:border-green-500 dark:focus:border-green-500 focus:ring-2 focus:ring-green-500/20'
                : 'border-gray-300 dark:border-gray-700 focus:border-blue-500 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
              }
              ${isPassword || success || error ? 'pr-11' : ''}
              disabled:opacity-50 disabled:cursor-not-allowed
              ${className}
            `}
            {...props}
          />

          {/* Success/Error Icons */}
          <AnimatePresence>
            {success && !error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <CheckCircle2 className="w-5 h-5 text-green-500" />
              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
              >
                <AlertCircle className="w-5 h-5 text-red-500" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Password Toggle */}
          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        {/* Helper Text / Error / Char Count */}
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <AnimatePresence mode="wait">
            {error && (
              <motion.p
                key="error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"
              >
                {error}
              </motion.p>
            )}

            {!error && helperText && (
              <motion.p
                key="helper"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sm text-gray-500 dark:text-gray-400"
              >
                {helperText}
              </motion.p>
            )}
          </AnimatePresence>

          {showCharCount && maxLength && (
            <span className={`text-xs ${charCount > maxLength * 0.9 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-500'}`}>
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      </div>
    )
  }
)

FormInput.displayName = 'FormInput'

export default FormInput

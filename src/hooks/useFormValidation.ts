import { useState, useCallback } from 'react'

interface ValidationError {
  field: string
  message: string
}

export function useFormValidation() {
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [shakingFields, setShakingFields] = useState<Set<string>>(new Set())

  const validate = useCallback((fields: { [key: string]: any }, rules: { [key: string]: (value: any) => string | null }): boolean => {
    const newErrors: ValidationError[] = []
    const newShakingFields = new Set<string>()

    Object.keys(rules).forEach(field => {
      const rule = rules[field]
      const value = fields[field]
      const error = rule(value)
      
      if (error) {
        newErrors.push({ field, message: error })
        newShakingFields.add(field)
      }
    })

    setErrors(newErrors)
    setShakingFields(newShakingFields)

    // Clear shaking animation after 0.5s
    setTimeout(() => {
      setShakingFields(new Set())
    }, 500)

    return newErrors.length === 0
  }, [])

  const getFieldError = useCallback((field: string): string | undefined => {
    return errors.find(e => e.field === field)?.message
  }, [errors])

  const isShaking = useCallback((field: string): boolean => {
    return shakingFields.has(field)
  }, [shakingFields])

  const clearErrors = useCallback(() => {
    setErrors([])
    setShakingFields(new Set())
  }, [])

  return {
    validate,
    getFieldError,
    isShaking,
    clearErrors
  }
}
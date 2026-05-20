'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Loader2, Delete, Sparkles, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  organization: {
    id: string
    name: string
    logoUrl: string | null
    brandColor: string | null
    loginMessage: string | null
    description: string | null
  }
  employees: Array<{ id: string; firstName: string; lastName: string; color: string }>
  slug: string
}

export function EmployeePinLoginClient({ organization, employees, slug }: Props) {
  const router = useRouter()
  const [selectedEmployee, setSelectedEmployee] = useState<typeof employees[0] | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const brandColor = organization.brandColor || '#4f46e5'

  function handleNumpad(digit: string) {
    if (pin.length >= 6) return
    setPin(prev => prev + digit)
    setError('')
  }

  function handleDelete() {
    setPin(prev => prev.slice(0, -1))
    setError('')
  }

  async function handleSubmit() {
    if (!selectedEmployee || pin.length < 4) return
    setLoading(true)
    setError('')

    const result = await signIn('employee-pin', {
      employeeId: selectedEmployee.id,
      pin,
      organizationSlug: slug,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('PIN incorrecto. Inténtalo de nuevo.')
      setPin('')
      return
    }

    router.push('/portal')
    router.refresh()
  }

  const initials = selectedEmployee
    ? `${selectedEmployee.firstName[0]}${selectedEmployee.lastName[0]}`.toUpperCase()
    : ''

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: `linear-gradient(135deg, ${brandColor}15, ${brandColor}05)` }}>

      <div className="w-full max-w-sm space-y-4">

        {/* Header restaurante */}
        <div className="text-center mb-6">
          {organization.logoUrl ? (
            <img src={organization.logoUrl} alt={organization.name}
              className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 shadow-md" />
          ) : (
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md text-white text-[24px] font-bold"
              style={{ backgroundColor: brandColor }}>
              {organization.name[0]}
            </div>
          )}
          <h1 className="text-xl font-bold text-gray-900">{organization.name}</h1>
          {organization.loginMessage && (
            <p className="text-sm text-gray-500 mt-1">{organization.loginMessage}</p>
          )}
        </div>

        {/* Step 1: Seleccionar empleado */}
        {!selectedEmployee ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-[12px] font-semibold text-gray-500 text-center uppercase tracking-wider">
                ¿Quién eres?
              </p>
            </div>
            <div className="p-2 max-h-[400px] overflow-y-auto">
              {employees.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  Sin empleados configurados en este restaurante
                </div>
              ) : (
                <div className="space-y-1">
                  {employees.map(emp => {
                    const ini = `${emp.firstName[0]}${emp.lastName[0]}`.toUpperCase()
                    return (
                      <button
                        key={emp.id}
                        onClick={() => { setSelectedEmployee(emp); setPin('') }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[12px] font-bold flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: emp.color }}>
                          {ini}
                        </div>
                        <span className="font-semibold text-gray-800 text-[14px]">
                          {emp.firstName} {emp.lastName}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Step 2: Introducir PIN */
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Empleado seleccionado */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <button
                onClick={() => { setSelectedEmployee(null); setPin(''); setError('') }}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0 shadow-sm"
                style={{ backgroundColor: selectedEmployee.color }}>
                {initials}
              </div>
              <div>
                <div className="text-[13px] font-bold text-gray-800">
                  {selectedEmployee.firstName} {selectedEmployee.lastName}
                </div>
                <div className="text-[11px] text-gray-400">Introduce tu PIN</div>
              </div>
            </div>

            <div className="p-5">
              {/* Indicador PIN */}
              <div className="flex items-center justify-center gap-3 mb-6">
                {Array.from({ length: 4 }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      'w-4 h-4 rounded-full transition-all',
                      i < pin.length
                        ? 'scale-110'
                        : 'bg-gray-200'
                    )}
                    style={i < pin.length ? { backgroundColor: brandColor } : {}}
                  />
                ))}
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 text-center text-[12px] text-red-600 font-medium">
                  {error}
                </div>
              )}

              {/* Teclado numérico */}
              <div className="grid grid-cols-3 gap-2">
                {['1','2','3','4','5','6','7','8','9'].map(n => (
                  <button
                    key={n}
                    onClick={() => handleNumpad(n)}
                    className="h-14 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all text-[20px] font-semibold text-gray-800 border border-gray-200"
                  >
                    {n}
                  </button>
                ))}
                <div /> {/* Espacio vacío */}
                <button
                  onClick={() => handleNumpad('0')}
                  className="h-14 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all text-[20px] font-semibold text-gray-800 border border-gray-200"
                >
                  0
                </button>
                <button
                  onClick={handleDelete}
                  className="h-14 rounded-xl bg-gray-50 hover:bg-gray-100 active:scale-95 transition-all flex items-center justify-center border border-gray-200"
                >
                  <Delete size={20} className="text-gray-500" />
                </button>
              </div>

              {/* Confirmar */}
              <button
                onClick={handleSubmit}
                disabled={pin.length < 4 || loading}
                className="w-full mt-4 py-3 rounded-xl text-white font-semibold text-[14px] disabled:opacity-40 transition-all flex items-center justify-center gap-2 shadow-sm"
                style={{ backgroundColor: brandColor }}
              >
                {loading ? <><Loader2 size={16} className="animate-spin" /> Entrando...</> : 'Entrar →'}
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-gray-400">
          Powered by <span className="font-semibold">Shift Solver AI</span>
        </p>
      </div>
    </div>
  )
}

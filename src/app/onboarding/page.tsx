'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { toast } from 'sonner'
import {
  Sparkles, Building2, MapPin, User, Loader2,
  CheckCircle, Eye, EyeOff, ChevronRight, AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createOrganizationWithOwner } from '@/server/actions/onboarding'

const SECTORS = [
  { value: 'restaurante', label: '🍽️ Restaurante' },
  { value: 'bar', label: '🍺 Bar / Pub' },
  { value: 'cafeteria', label: '☕ Cafetería' },
  { value: 'hotel', label: '🏨 Hotel' },
  { value: 'catering', label: '🎪 Catering' },
  { value: 'otro', label: '🏢 Otro' },
]

const TIMEZONES = [
  { value: 'Europe/Madrid', label: 'Madrid / Barcelona (CET)' },
  { value: 'Europe/London', label: 'Londres (GMT)' },
  { value: 'America/New_York', label: 'Nueva York (EST)' },
  { value: 'America/Mexico_City', label: 'Ciudad de México (CST)' },
]

const STEPS = [
  { id: 1, label: 'Tu negocio', icon: <Building2 size={16} /> },
  { id: 2, label: 'Tu local',   icon: <MapPin size={16} /> },
  { id: 3, label: 'Tu cuenta',  icon: <User size={16} /> },
]

function inputCls(err = false) {
  return cn(
    'w-full border rounded-xl px-4 py-3 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent transition-all',
    err ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300'
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(1)
  const [showPwd, setShowPwd] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    // Paso 1 — negocio
    orgName: '',
    sector: 'restaurante',
    timezone: 'Europe/Madrid',
    // Paso 2 — local
    locationName: '',
    city: '',
    // Paso 3 — owner
    ownerName: '',
    ownerEmail: '',
    ownerPassword: '',
  })

  function set(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => ({ ...e, [key]: '' }))
  }

  function validateStep(s: number): boolean {
    const e: Record<string, string> = {}
    if (s === 1) {
      if (!form.orgName.trim()) e.orgName = 'El nombre del negocio es obligatorio'
    }
    if (s === 2) {
      if (!form.locationName.trim()) e.locationName = 'El nombre del local es obligatorio'
      if (!form.city.trim()) e.city = 'La ciudad es obligatoria'
    }
    if (s === 3) {
      if (!form.ownerName.trim()) e.ownerName = 'Tu nombre es obligatorio'
      if (!form.ownerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.ownerEmail)) {
        e.ownerEmail = 'Email no válido'
      }
      if (form.ownerPassword.length < 8) e.ownerPassword = 'Mínimo 8 caracteres'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleNext() {
    if (!validateStep(step)) return
    setStep(s => s + 1)
  }

  function handleSubmit() {
    if (!validateStep(3)) return
    startTransition(async () => {
      try {
        const result = await createOrganizationWithOwner(form)

        // Auto-login tras crear la cuenta
        const login = await signIn('credentials', {
          email: form.ownerEmail,
          password: form.ownerPassword,
          redirect: false,
        })

        if (login?.error) {
          toast.error('Cuenta creada pero error al entrar. Inicia sesión manualmente.')
          router.push('/login')
          return
        }

        toast.success(`¡Bienvenido a Shift Solver AI! 🎉`)
        router.push('/dashboard')
        router.refresh()
      } catch (e: any) {
        toast.error(e.message)
      }
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-4">

      {/* Fondo decorativo */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-[440px] space-y-5">

        {/* Header */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 mb-4 shadow-xl shadow-indigo-900/50">
            <Sparkles size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Crear tu cuenta</h1>
          <p className="text-slate-400 text-sm mt-1">Configura tu restaurante en 3 pasos</p>
        </div>

        {/* Steps indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'w-8 h-8 rounded-xl flex items-center justify-center text-[12px] font-bold transition-all flex-shrink-0',
                step === s.id ? 'bg-indigo-600 text-white shadow-lg' :
                step > s.id  ? 'bg-emerald-500 text-white' : 'bg-white/10 text-slate-400'
              )}>
                {step > s.id ? <CheckCircle size={14} /> : s.icon}
              </div>
              <span className={cn('text-[12px] font-medium transition-colors flex-1', step === s.id ? 'text-white' : step > s.id ? 'text-emerald-400' : 'text-slate-500')}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={cn('h-px flex-1 max-w-[32px]', step > s.id ? 'bg-emerald-500' : 'bg-white/10')} />
              )}
            </div>
          ))}
        </div>

        {/* Card del paso */}
        <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">

          {/* ── Paso 1: Negocio ── */}
          {step === 1 && (
            <>
              <h2 className="text-[16px] font-bold text-white mb-1">Tu negocio</h2>
              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nombre del restaurante *
                </label>
                <input
                  className={cn(inputCls(!!errors.orgName), 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:ring-indigo-500/50')}
                  placeholder="Ej: Restaurante Casa Juan"
                  value={form.orgName}
                  onChange={e => set('orgName', e.target.value)}
                />
                {errors.orgName && <p className="text-[11px] text-red-400 mt-1">{errors.orgName}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Sector</label>
                <div className="grid grid-cols-2 gap-2">
                  {SECTORS.map(s => (
                    <button key={s.value} onClick={() => set('sector', s.value)}
                      className={cn(
                        'px-3 py-2 rounded-xl text-[12px] font-medium border transition-all text-left',
                        form.sector === s.value
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      )}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Zona horaria</label>
                <select
                  className={cn(inputCls(), 'bg-white/5 border-white/10 text-white focus:ring-indigo-500/50')}
                  value={form.timezone}
                  onChange={e => set('timezone', e.target.value)}
                >
                  {TIMEZONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </>
          )}

          {/* ── Paso 2: Local ── */}
          {step === 2 && (
            <>
              <h2 className="text-[16px] font-bold text-white mb-1">Tu local principal</h2>
              <p className="text-[12px] text-slate-400">Podrás añadir más locales después desde los ajustes.</p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nombre del local *
                </label>
                <input
                  className={cn(inputCls(!!errors.locationName), 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:ring-indigo-500/50')}
                  placeholder="Ej: Local principal, Sede central..."
                  value={form.locationName}
                  onChange={e => set('locationName', e.target.value)}
                />
                {errors.locationName && <p className="text-[11px] text-red-400 mt-1">{errors.locationName}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Ciudad *</label>
                <input
                  className={cn(inputCls(!!errors.city), 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:ring-indigo-500/50')}
                  placeholder="Ej: Tarragona"
                  value={form.city}
                  onChange={e => set('city', e.target.value)}
                />
                {errors.city && <p className="text-[11px] text-red-400 mt-1">{errors.city}</p>}
              </div>
            </>
          )}

          {/* ── Paso 3: Cuenta ── */}
          {step === 3 && (
            <>
              <h2 className="text-[16px] font-bold text-white mb-1">Tu cuenta de acceso</h2>
              <p className="text-[12px] text-slate-400">Serás el propietario y administrador principal.</p>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Tu nombre *</label>
                <input
                  className={cn(inputCls(!!errors.ownerName), 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:ring-indigo-500/50')}
                  placeholder="Ej: Juan García"
                  value={form.ownerName}
                  onChange={e => set('ownerName', e.target.value)}
                />
                {errors.ownerName && <p className="text-[11px] text-red-400 mt-1">{errors.ownerName}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Email *</label>
                <input
                  type="email"
                  className={cn(inputCls(!!errors.ownerEmail), 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:ring-indigo-500/50')}
                  placeholder="juan@restaurante.com"
                  value={form.ownerEmail}
                  onChange={e => set('ownerEmail', e.target.value)}
                />
                {errors.ownerEmail && <p className="text-[11px] text-red-400 mt-1">{errors.ownerEmail}</p>}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Contraseña *</label>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    className={cn(inputCls(!!errors.ownerPassword), 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:ring-indigo-500/50 pr-10')}
                    placeholder="Mínimo 8 caracteres"
                    value={form.ownerPassword}
                    onChange={e => set('ownerPassword', e.target.value)}
                  />
                  <button type="button" onClick={() => setShowPwd(!showPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {errors.ownerPassword && <p className="text-[11px] text-red-400 mt-1">{errors.ownerPassword}</p>}
              </div>
            </>
          )}

          {/* Botones */}
          <div className="flex items-center justify-between pt-2">
            {step > 1 ? (
              <button onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 text-[13px] text-slate-400 hover:text-slate-200 transition-colors">
                ← Atrás
              </button>
            ) : (
              <a href="/login" className="text-[13px] text-slate-400 hover:text-slate-200 transition-colors">
                Ya tengo cuenta
              </a>
            )}

            {step < 3 ? (
              <button onClick={handleNext}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-[13px] rounded-xl transition-all shadow-lg shadow-indigo-900/50">
                Siguiente <ChevronRight size={15} />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-[13px] rounded-xl transition-all shadow-lg">
                {isPending ? <><Loader2 size={14} className="animate-spin" /> Creando...</> : <><CheckCircle size={14} /> Crear cuenta</>}
              </button>
            )}
          </div>
        </div>

        {/* Resumen del plan */}
        <div className="text-center text-[11px] text-slate-500">
          Al crear tu cuenta aceptas los términos de uso de Shift Solver AI.
          Tu cuenta incluye acceso completo durante el período de prueba.
        </div>
      </div>
    </div>
  )
}

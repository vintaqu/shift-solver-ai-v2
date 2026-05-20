'use client'

import { useState } from 'react'
import { Settings, Globe, Zap, Shield, Bell, Database } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AdminConfigClient() {
  const [config, setConfig] = useState({
    platformName: 'Shift Solver AI',
    baseUrl: typeof window !== 'undefined' ? window.location.origin : 'https://shiftsolver.app',
    solverUrl: 'https://shift-solver-ai-production.up.railway.app',
    maxOrgsPerPlan: 999,
    maintenanceMode: false,
    allowNewRegistrations: true,
    defaultSolverTimeout: 90,
  })

  return (
    <div className="p-6 space-y-5 max-w-[900px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración global</h1>
        <p className="text-sm text-gray-500 mt-0.5">Variables del sistema · Solo Super Admin</p>
      </div>

      {[
        {
          icon: <Globe size={16} className="text-indigo-600" />,
          title: 'Plataforma',
          bg: 'bg-indigo-50',
          fields: [
            { key: 'platformName', label: 'Nombre de la plataforma', type: 'text' },
            { key: 'baseUrl', label: 'URL base', type: 'text' },
          ],
        },
        {
          icon: <Zap size={16} className="text-amber-600" />,
          title: 'Solver OR-Tools',
          bg: 'bg-amber-50',
          fields: [
            { key: 'solverUrl', label: 'URL del solver', type: 'text' },
            { key: 'defaultSolverTimeout', label: 'Timeout por defecto (segundos)', type: 'number' },
          ],
        },
        {
          icon: <Shield size={16} className="text-emerald-600" />,
          title: 'Acceso y seguridad',
          bg: 'bg-emerald-50',
          toggles: [
            { key: 'allowNewRegistrations', label: 'Permitir nuevos registros', desc: 'Permite que nuevas organizaciones se registren desde /onboarding' },
            { key: 'maintenanceMode', label: 'Modo mantenimiento', desc: 'Muestra una página de mantenimiento a todos los usuarios excepto Super Admin' },
          ],
        },
      ].map(section => (
        <div key={section.title} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-100">
            <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', section.bg)}>
              {section.icon}
            </div>
            <h3 className="text-[14px] font-bold text-gray-800">{section.title}</h3>
          </div>
          <div className="p-5 space-y-4">
            {section.fields?.map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
                <input type={f.type}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={(config as any)[f.key]}
                  onChange={e => setConfig(c => ({ ...c, [f.key]: f.type === 'number' ? +e.target.value : e.target.value }))} />
              </div>
            ))}
            {section.toggles?.map(t => (
              <div key={t.key}
                className={cn('flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all',
                  (config as any)[t.key] ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200')}
                onClick={() => setConfig(c => ({ ...c, [t.key]: !(c as any)[t.key] }))}>
                <div className={cn('w-10 h-5 rounded-full transition-all relative flex-shrink-0 mt-0.5',
                  (config as any)[t.key] ? 'bg-indigo-600' : 'bg-gray-200')}>
                  <div className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                    (config as any)[t.key] ? 'left-5' : 'left-0.5')} />
                </div>
                <div>
                  <div className="text-[13px] font-medium text-gray-700">{t.label}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{t.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <button
          onClick={() => alert('Configuración guardada (pendiente conectar a BD)')}
          className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors">
          Guardar configuración
        </button>
      </div>
    </div>
  )
}

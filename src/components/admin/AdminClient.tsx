'use client'

import Link from 'next/link'
import { Scale } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Building2, Users, MapPin, Calendar, ExternalLink, Shield } from 'lucide-react'

export function AdminClient({ organizations }: { organizations: any[] }) {
  return (
    <div className="min-h-full" style={{ background: '#f5f6fa' }}>
      <div className="max-w-[1200px] mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Panel Super Admin</h1>
            <p className="text-sm text-gray-500">{organizations.length} organizaciones registradas</p>
          </div>
        </div>

        {/* Stats globales */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Organizaciones', value: organizations.length, icon: <Building2 size={16} className="text-indigo-600" />, bg: 'bg-indigo-50' },
            { label: 'Usuarios totales', value: organizations.reduce((a, o) => a + o._count.members, 0), icon: <Users size={16} className="text-emerald-600" />, bg: 'bg-emerald-50' },
            { label: 'Empleados totales', value: organizations.reduce((a, o) => a + o._count.employees, 0), icon: <Users size={16} className="text-blue-600" />, bg: 'bg-blue-50' },
            { label: 'Locales totales', value: organizations.reduce((a, o) => a + o._count.locations, 0), icon: <MapPin size={16} className="text-amber-600" />, bg: 'bg-amber-50' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${s.bg}`}>
                {s.icon}
              </div>
              <div>
                <div className="text-[20px] font-bold text-gray-900">{s.value}</div>
                <div className="text-[10px] text-gray-500">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Lista de organizaciones */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100">
            <h2 className="text-[14px] font-bold text-gray-800">Todas las organizaciones</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {organizations.map((org: any) => (
              <div key={org.id} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                {/* Logo/inicial */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0 shadow-sm"
                  style={{ backgroundColor: org.brandColor || '#4f46e5' }}>
                  {org.name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-bold text-gray-800">{org.name}</span>
                    <span className="text-[10px] font-mono text-gray-400">/{org.slug}</span>
                    {org.sector && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        {org.sector}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><Users size={10} /> {org._count.members} usuarios</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {org._count.employees} empleados</span>
                    <span className="flex items-center gap-1"><MapPin size={10} /> {org._count.locations} locales</span>
                    <span className="flex items-center gap-1">
                      <Calendar size={10} />
                      {format(new Date(org.createdAt), "d MMM yyyy", { locale: es })}
                    </span>
                  </div>
                </div>

                {/* Links */}
                <div className="flex items-center gap-2">
                  <a
                    href={`/r/${org.slug}/login`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <ExternalLink size={11} /> Portal empleados
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Accesos rápidos admin */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/admin/legal"
            className="flex items-center gap-3 p-4 bg-white rounded-2xl border border-indigo-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
              <Scale size={18} className="text-indigo-600" />
            </div>
            <div>
              <div className="text-[13px] font-bold text-gray-800">Marcos legales</div>
              <div className="text-[11px] text-gray-500">Gestiona convenios y el ET</div>
            </div>
          </Link>
        </div>

        {/* Crear nueva organización */}
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold text-indigo-800">¿Nuevo cliente?</div>
            <div className="text-[12px] text-indigo-600">Envíale el link de registro para que cree su propia cuenta</div>
          </div>
          <a
            href="/onboarding"
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 transition-colors"
          >
            <ExternalLink size={13} /> Abrir registro
          </a>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Building2, Search, Users, MapPin, Scale, ExternalLink,
  ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Copy,
  CalendarDays, Pencil, X, Loader2, CheckCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateOrganizationBranding } from '@/server/actions/auth'

export function AdminOrgsClient({ organizations }: { organizations: any[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editModal, setEditModal] = useState<any | null>(null)

  const filtered = organizations.filter(o =>
    `${o.name} ${o.slug} ${o.locations[0]?.city ?? ''}`.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-5 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizaciones</h1>
          <p className="text-sm text-gray-500 mt-0.5">{organizations.length} registradas en la plataforma</p>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, slug o ciudad..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtered.map(org => {
          const isExpanded = expandedId === org.id
          const defaultFramework = org.legalFrameworks?.[0]?.legalFramework

          return (
            <div key={org.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : org.id)}>

                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0"
                  style={{ backgroundColor: org.brandColor || '#4f46e5' }}>
                  {org.name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-bold text-gray-800">{org.name}</span>
                    <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">/{org.slug}</span>
                    {org.sector && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">{org.sector}</span>}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-400 flex-wrap">
                    <span className="flex items-center gap-1"><Users size={10} /> {org._count.employees} empleados</span>
                    <span className="flex items-center gap-1"><Users size={10} /> {org._count.members} usuarios</span>
                    <span className="flex items-center gap-1"><MapPin size={10} /> {org._count.locations} locales</span>
                    {defaultFramework && <span className="flex items-center gap-1"><Scale size={10} /> {defaultFramework.name}</span>}
                    <span className="flex items-center gap-1"><CalendarDays size={10} /> {format(parseISO(org.createdAt), "d MMM yyyy", { locale: es })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={e => { e.stopPropagation(); setEditModal(org) }}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <a href={`/r/${org.slug}/login`} target="_blank"
                    onClick={e => e.stopPropagation()}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                    title="Portal empleados">
                    <ExternalLink size={13} />
                  </a>
                  {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </div>
              </div>

              {/* Detalle expandido */}
              {isExpanded && (
                <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 space-y-3">
                  {/* Usuarios de la organización */}
                  <div>
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Usuarios</div>
                    <div className="space-y-1.5">
                      {org.members.map((m: any) => (
                        <div key={m.id} className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-gray-200">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 text-[10px] font-bold flex-shrink-0">
                            {(m.user.name ?? m.user.email)[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[12px] font-semibold text-gray-700 truncate">{m.user.name ?? '—'}</div>
                            <div className="text-[10px] text-gray-400">{m.user.email}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">{m.role}</span>
                            {!m.user.isActive && <span className="text-[10px] text-red-500">Inactivo</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Info extra */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 p-3">
                      <div className="text-[10px] text-gray-400 mb-0.5">Link empleados</div>
                      <div className="flex items-center gap-1">
                        <code className="text-[10px] text-indigo-600 truncate">/r/{org.slug}/login</code>
                        <button onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/r/${org.slug}/login`)
                          toast.success('Link copiado')
                        }} className="text-gray-400 hover:text-indigo-600 flex-shrink-0">
                          <Copy size={11} />
                        </button>
                      </div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-3">
                      <div className="text-[10px] text-gray-400 mb-0.5">Marco legal</div>
                      <div className="text-[12px] font-semibold text-gray-700">{defaultFramework?.name ?? 'No asignado'}</div>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-3">
                      <div className="text-[10px] text-gray-400 mb-0.5">Zona horaria</div>
                      <div className="text-[12px] font-semibold text-gray-700">{org.timezone}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 py-12 text-center">
            <Building2 size={32} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">Sin organizaciones que coincidan</p>
          </div>
        )}
      </div>

      {/* Modal editar org */}
      {editModal && (
        <EditOrgModal org={editModal} onClose={() => setEditModal(null)} onSaved={() => { setEditModal(null); router.refresh() }} />
      )}
    </div>
  )
}

function EditOrgModal({ org, onClose, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: org.name ?? '',
    description: org.description ?? '',
    brandColor: org.brandColor ?? '#4f46e5',
    loginMessage: org.loginMessage ?? '',
    slug: org.slug ?? '',
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[480px]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100"
          style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h2 className="text-[15px] font-bold text-gray-900">Editar: {org.name}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white">
            <X size={16} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {[
            { key: 'name', label: 'Nombre' },
            { key: 'slug', label: 'Slug URL' },
            { key: 'description', label: 'Descripción' },
            { key: 'loginMessage', label: 'Mensaje login empleados' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{f.label}</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={(form as any)[f.key]} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Color corporativo</label>
            <div className="flex items-center gap-3">
              <input type="color" value={form.brandColor} onChange={e => setForm(f => ({ ...f, brandColor: e.target.value }))}
                className="w-12 h-10 rounded-xl border border-gray-200 cursor-pointer p-1 bg-gray-50" />
              <span className="text-[12px] font-mono text-gray-600">{form.brandColor}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100">Cancelar</button>
          <button disabled={isPending} onClick={() => startTransition(async () => {
            try {
              await updateOrganizationBranding(org.id, form)
              toast.success('Organización actualizada ✓')
              onSaved()
            } catch (e: any) { toast.error(e.message) }
          })} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

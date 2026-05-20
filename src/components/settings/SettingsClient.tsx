'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Users, Building2, Shield, Plus, Pencil, Loader2,
  CheckCircle, X, Eye, EyeOff, Copy, AlertCircle,
  ToggleLeft, ToggleRight, Link, Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  createUser, resetUserPassword, toggleUserActive,
  updateOrganizationBranding
} from '@/server/actions/auth'
import { createSkill, updateSkill, deleteSkill, updateLaborRole } from '@/server/actions/skills'

const ROLE_LABELS: Record<string, { label: string; cls: string }> = {
  SUPER_ADMIN: { label: 'Super Admin', cls: 'bg-red-100 text-red-700 border-red-200' },
  ORG_OWNER:   { label: 'Propietario', cls: 'bg-violet-100 text-violet-700 border-violet-200' },
  MANAGER:     { label: 'Manager',     cls: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  EMPLOYEE:    { label: 'Empleado',    cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

function inputCls(err = false) {
  return cn('w-full border rounded-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:border-transparent',
    err ? 'border-red-300 focus:ring-red-300' : 'border-gray-200 focus:ring-indigo-300')
}

function Field({ label, hint, children }: any) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mb-1">{hint}</p>}
      {children}
    </div>
  )
}

export function SettingsClient({ organization, members, skills, roles, currentUserId, currentUserRole }: any) {
  const router = useRouter()
  const [tab, setTab] = useState<'org' | 'users' | 'skills'>('org')

  const isOwner = ['ORG_OWNER', 'SUPER_ADMIN'].includes(currentUserRole)

  return (
    <div className="min-h-full" style={{ background: '#f5f6fa' }}>
      <div className="max-w-[900px] mx-auto p-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ajustes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{organization.name}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {([
            { id: 'org',    label: '🏠 Organización' },
            { id: 'users',  label: '👥 Usuarios' },
            { id: 'skills', label: '🏷️ Etiquetas y roles' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('px-4 py-2 rounded-lg text-[12px] font-semibold transition-all',
                tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: Organización ── */}
        {tab === 'org' && (
          <OrgSettingsTab organization={organization} isOwner={isOwner} onSaved={() => router.refresh()} />
        )}

        {/* ── TAB: Etiquetas y roles ── */}
        {tab === 'skills' && (
          <SkillsTab
            skills={skills}
            roles={roles}
            organizationId={organization.id}
            isOwner={isOwner}
            onChanged={() => router.refresh()}
          />
        )}

        {/* ── TAB: Usuarios ── */}
        {tab === 'users' && (
          <UsersTab
            members={members}
            organizationId={organization.id}
            currentUserId={currentUserId}
            isOwner={isOwner}
            onChanged={() => router.refresh()}
          />
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Organización
// ═══════════════════════════════════════════════════════════════════════════
function OrgSettingsTab({ organization, isOwner, onSaved }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    name: organization.name ?? '',
    slug: organization.slug ?? '',
    description: organization.description ?? '',
    brandColor: organization.brandColor ?? '#4f46e5',
    loginMessage: organization.loginMessage ?? '',
    logoUrl: organization.logoUrl ?? '',
  })
  const [saved, setSaved] = useState(false)

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const employeeLoginUrl = `${baseUrl}/r/${form.slug}/login`

  function handleSave() {
    startTransition(async () => {
      try {
        await updateOrganizationBranding(organization.id, form)
        toast.success('Ajustes guardados ✓')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onSaved()
      } catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <div className="space-y-4">
      {/* Link del restaurante */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Link size={14} className="text-indigo-600" />
          <span className="text-[12px] font-bold text-indigo-700">Link de acceso para empleados</span>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-[12px] bg-white border border-indigo-200 rounded-xl px-3 py-2 text-indigo-700 truncate">
            {employeeLoginUrl}
          </code>
          <button
            onClick={() => { navigator.clipboard.writeText(employeeLoginUrl); toast.success('Link copiado ✓') }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors flex-shrink-0"
          >
            <Copy size={12} /> Copiar
          </button>
        </div>
        <p className="text-[11px] text-indigo-500 mt-2">
          Comparte este link con tus empleados. Cada uno entra con su PIN personal.
        </p>
      </div>

      {/* Datos del restaurante */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h3 className="text-[14px] font-bold text-gray-800">Datos del restaurante</h3>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre del restaurante">
            <input className={inputCls()} value={form.name} disabled={!isOwner}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Identificador URL" hint="Solo letras, números y guiones">
            <div className="flex items-center">
              <span className="text-[12px] text-gray-400 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl px-2.5 py-2.5 whitespace-nowrap">
                /r/
              </span>
              <input className="flex-1 border border-gray-200 rounded-r-xl px-3 py-2.5 text-[13px] bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                value={form.slug} disabled={!isOwner}
                onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))} />
            </div>
          </Field>
        </div>

        <Field label="Descripción (visible en el login de empleado)">
          <textarea className={inputCls() + ' resize-none h-20'} value={form.description} disabled={!isOwner}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Ej: Restaurante familiar en el centro de Tarragona..." />
        </Field>

        <Field label="Mensaje de bienvenida en el login" hint="Aparece bajo el nombre en la pantalla de PIN">
          <input className={inputCls()} value={form.loginMessage} disabled={!isOwner}
            onChange={e => setForm(f => ({ ...f, loginMessage: e.target.value }))}
            placeholder="Ej: ¡Bienvenido! Introduce tu PIN para acceder" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="URL del logo" hint="Imagen pública (HTTPS)">
            <input className={inputCls()} value={form.logoUrl} disabled={!isOwner}
              onChange={e => setForm(f => ({ ...f, logoUrl: e.target.value }))}
              placeholder="https://..." />
          </Field>
          <Field label="Color corporativo">
            <div className="flex items-center gap-3">
              <input type="color" value={form.brandColor} disabled={!isOwner}
                onChange={e => setForm(f => ({ ...f, brandColor: e.target.value }))}
                className="w-12 h-10 rounded-xl border border-gray-200 cursor-pointer p-1 bg-gray-50" />
              <div className="flex-1 h-10 rounded-xl border border-gray-200 flex items-center px-3 text-[13px] text-gray-600 font-mono"
                style={{ backgroundColor: form.brandColor + '20' }}>
                {form.brandColor}
              </div>
            </div>
          </Field>
        </div>

        {/* Preview */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">Preview pantalla de login empleado</p>
          <div className="flex items-center gap-3 bg-white rounded-xl p-3 border border-gray-200">
            {form.logoUrl ? (
              <img src={form.logoUrl} alt="" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0"
                style={{ backgroundColor: form.brandColor }}>
                {form.name[0]}
              </div>
            )}
            <div>
              <div className="text-[13px] font-bold text-gray-800">{form.name || 'Nombre del restaurante'}</div>
              <div className="text-[11px] text-gray-400">{form.loginMessage || 'Introduce tu PIN para acceder'}</div>
            </div>
          </div>
        </div>

        {isOwner && (
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              {isPending ? <Loader2 size={14} className="animate-spin" /> : saved ? <CheckCircle size={14} /> : null}
              {saved ? 'Guardado ✓' : 'Guardar cambios'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Usuarios
// ═══════════════════════════════════════════════════════════════════════════
function UsersTab({ members, organizationId, currentUserId, isOwner, onChanged }: any) {
  const [isPending, startTransition] = useTransition()
  const [showCreate, setShowCreate] = useState(false)
  const [resetModal, setResetModal] = useState<any | null>(null)

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-[14px] font-bold text-gray-800">Usuarios del panel</h3>
          {isOwner && (
            <button onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors">
              <Plus size={13} /> Nuevo usuario
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {members.map((m: any) => {
            const user = m.user
            const isSelf = user.id === currentUserId
            const roleConfig = ROLE_LABELS[m.role] ?? ROLE_LABELS.MANAGER

            return (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 text-[12px] font-bold flex-shrink-0">
                  {(user.name ?? user.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-bold text-gray-800">{user.name ?? '—'}</span>
                    {isSelf && <span className="text-[10px] text-gray-400">(tú)</span>}
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', roleConfig.cls)}>
                      {roleConfig.label}
                    </span>
                    {!user.isActive && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">Inactivo</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 mt-0.5">{user.email}</div>
                </div>
                {isOwner && !isSelf && (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setResetModal(user)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                      Reset contraseña
                    </button>
                    <button
                      onClick={() => startTransition(async () => {
                        try {
                          await toggleUserActive(user.id)
                          toast.success(user.isActive ? 'Usuario desactivado' : 'Usuario activado')
                          onChanged()
                        } catch (e: any) { toast.error(e.message) }
                      })}
                      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400">
                      {user.isActive ? <ToggleRight size={16} className="text-emerald-500" /> : <ToggleLeft size={16} />}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-[12px] text-amber-800">
        <div className="font-bold mb-1">ℹ️ Usuarios vs Empleados</div>
        Los <strong>usuarios</strong> (esta lista) son las personas con acceso al panel de gestión. Los <strong>empleados</strong> acceden con su PIN por el link del restaurante. Un empleado puede tener un usuario de panel si también es manager.
      </div>

      {showCreate && (
        <CreateUserModal
          organizationId={organizationId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); onChanged() }}
        />
      )}

      {resetModal && (
        <ResetPasswordModal
          user={resetModal}
          onClose={() => setResetModal(null)}
          onReset={() => { setResetModal(null); toast.success('Contraseña actualizada ✓') }}
        />
      )}
    </div>
  )
}

// ── Modal crear usuario ────────────────────────────────────────────────────
function CreateUserModal({ organizationId, onClose, onCreated }: any) {
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'MANAGER' as const })
  const [showPwd, setShowPwd] = useState(false)
  const [error, setError] = useState('')

  return (
    <Modal title="Nuevo usuario del panel" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nombre completo">
          <input className={inputCls()} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Ana García" />
        </Field>
        <Field label="Email">
          <input type="email" className={inputCls()} value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="ana@restaurante.com" />
        </Field>
        <Field label="Contraseña inicial" hint="El usuario podrá cambiarla después">
          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} className={inputCls() + ' pr-10'}
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 8 caracteres" />
            <button type="button" onClick={() => setShowPwd(!showPwd)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </Field>
        <Field label="Rol">
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: 'MANAGER', label: 'Manager', desc: 'Gestiona cuadrantes y empleados' },
              { val: 'ORG_OWNER', label: 'Propietario', desc: 'Acceso total incluyendo facturación' },
            ].map(r => (
              <button key={r.val} onClick={() => setForm(f => ({ ...f, role: r.val as any }))}
                className={cn('p-3 rounded-xl border-2 text-left transition-all',
                  form.role === r.val ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300')}>
                <div className="text-[12px] font-bold text-gray-800">{r.label}</div>
                <div className="text-[10px] text-gray-500">{r.desc}</div>
              </button>
            ))}
          </div>
        </Field>
        {error && (
          <div className="flex items-center gap-2 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            <AlertCircle size={12} /> {error}
          </div>
        )}
      </div>
      <ModalFooter onClose={onClose} isPending={isPending} saveLabel="Crear usuario"
        onSave={() => startTransition(async () => {
          setError('')
          if (!form.name || !form.email || form.password.length < 8) {
            setError('Completa todos los campos. Contraseña mínimo 8 caracteres.')
            return
          }
          try {
            await createUser({ ...form, organizationId })
            toast.success('Usuario creado ✓')
            onCreated()
          } catch (e: any) { setError(e.message) }
        })} />
    </Modal>
  )
}

// ── Modal reset contraseña ─────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose, onReset }: any) {
  const [isPending, startTransition] = useTransition()
  const [pwd, setPwd] = useState('')
  const [showPwd, setShowPwd] = useState(false)

  return (
    <Modal title={`Reset contraseña — ${user.name ?? user.email}`} onClose={onClose}>
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
        <div className="relative">
          <input type={showPwd ? 'text' : 'password'} className={inputCls() + ' pr-10'}
            value={pwd} onChange={e => setPwd(e.target.value)} placeholder="Nueva contraseña..." />
          <button type="button" onClick={() => setShowPwd(!showPwd)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </Field>
      <ModalFooter onClose={onClose} isPending={isPending} saveLabel="Actualizar contraseña"
        onSave={() => startTransition(async () => {
          try {
            await resetUserPassword(user.id, pwd)
            onReset()
          } catch (e: any) { toast.error(e.message) }
        })} />
    </Modal>
  )
}

function Modal({ title, onClose, children }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[3px]" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[480px] flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg,#eef2ff,#f5f3ff)' }}>
          <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:bg-white transition-colors"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({ onClose, onSave, isPending, saveLabel = 'Guardar' }: any) {
  return (
    <div className="flex justify-between items-center pt-4 mt-4 border-t border-gray-100">
      <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
      <button onClick={onSave} disabled={isPending}
        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 text-white text-[13px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
        {saveLabel}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: Etiquetas y roles
// ═══════════════════════════════════════════════════════════════════════════

const PRESET_COLORS = [
  '#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#0891b2','#ec4899','#14b8a6','#84cc16','#f97316',
  '#64748b','#a855f7','#06b6d4','#d946ef','#22c55e',
]

const ROLE_LEVEL_LABELS: Record<string, { label: string; desc: string }> = {
  BASIC:        { label: 'Camarero básico',  desc: 'Nivel base — puede asignarse a cualquier turno' },
  SEMI_MANAGER: { label: 'Semi-encargado',   desc: 'Nivel medio — puede supervisar en ausencia del encargado' },
  MANAGER:      { label: 'Encargado',        desc: 'Nivel alto — responsable de turno, obligatorio en franjas críticas' },
  OWNER:        { label: 'Dueño / Socio',    desc: 'Nivel máximo — sin restricciones legales por defecto' },
}

function SkillsTab({ skills, roles, organizationId, isOwner, onChanged }: any) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [newSkill, setNewSkill] = useState({ name: '', color: '#6366f1' })
  const [editingSkill, setEditingSkill] = useState<any | null>(null)
  const [editingRole, setEditingRole] = useState<any | null>(null)
  const [error, setError] = useState('')

  function handleCreateSkill() {
    if (!newSkill.name.trim()) { setError('El nombre es obligatorio'); return }
    setError('')
    startTransition(async () => {
      try {
        await createSkill({ organizationId, ...newSkill })
        setNewSkill({ name: '', color: '#6366f1' })
        toast.success('Etiqueta creada ✓')
        onChanged()
      } catch (e: any) { setError(e.message) }
    })
  }

  function handleUpdateSkill(id: string, data: { name: string; color: string }) {
    startTransition(async () => {
      try {
        await updateSkill(id, data)
        setEditingSkill(null)
        toast.success('Etiqueta actualizada ✓')
        onChanged()
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function handleDeleteSkill(id: string, name: string) {
    if (!confirm(`¿Eliminar la etiqueta "${name}"?`)) return
    startTransition(async () => {
      try {
        await deleteSkill(id)
        toast.success('Etiqueta eliminada')
        onChanged()
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function handleUpdateRole(id: string, data: { name: string; color: string }) {
    startTransition(async () => {
      try {
        await updateLaborRole(id, data)
        setEditingRole(null)
        toast.success('Rol actualizado ✓')
        onChanged()
      } catch (e: any) { toast.error(e.message) }
    })
  }

  return (
    <div className="space-y-5">

      {/* ── ROLES ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h3 className="text-[14px] font-bold text-gray-800">Roles del personal</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Los niveles de rol los usa el solver — solo puedes cambiar el nombre y el color.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {roles.map((role: any) => {
            const levelInfo = ROLE_LEVEL_LABELS[role.level] ?? { label: role.level, desc: '' }
            const isEditing = editingRole?.id === role.id

            return (
              <div key={role.id} className="px-5 py-3.5">
                {isEditing ? (
                  <RoleEditRow
                    role={editingRole}
                    onSave={(data: any) => handleUpdateRole(role.id, data)}
                    onCancel={() => setEditingRole(null)}
                    isPending={isPending}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                      style={{ backgroundColor: role.color }}>
                      {role.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-gray-800">{role.name}</span>
                        <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {role.level}
                        </span>
                        <span className="text-[10px] text-gray-400">
                          · {role._count?.employeeSkills ?? 0} empleados
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">{levelInfo.desc}</div>
                    </div>
                    {isOwner && (
                      <button
                        onClick={() => setEditingRole({ ...role })}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── SKILLS / ETIQUETAS ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div>
            <h3 className="text-[14px] font-bold text-gray-800">Etiquetas de especialización</h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Habilidades específicas que puedes asignar a empleados y requerir en cobertura.
              {skills.length > 0 && ` · ${skills.length} etiquetas`}
            </p>
          </div>
        </div>

        {/* Lista de skills */}
        <div className="divide-y divide-gray-100">
          {skills.length === 0 && (
            <div className="py-8 text-center text-[12px] text-gray-400">
              Sin etiquetas definidas. Crea la primera abajo.
            </div>
          )}
          {skills.map((skill: any) => {
            const isEditing = editingSkill?.id === skill.id
            const inUse = skill._count?.employeeSkills ?? 0

            return (
              <div key={skill.id} className="px-5 py-3">
                {isEditing ? (
                  <SkillEditRow
                    skill={editingSkill}
                    onChange={setEditingSkill}
                    onSave={() => handleUpdateSkill(skill.id, { name: editingSkill.name, color: editingSkill.color })}
                    onCancel={() => setEditingSkill(null)}
                    isPending={isPending}
                  />
                ) : (
                  <div className="flex items-center gap-3">
                    {/* Color pill */}
                    <div className="w-8 h-8 rounded-lg flex-shrink-0"
                      style={{ backgroundColor: skill.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold text-gray-800">{skill.name}</span>
                        {inUse > 0 && (
                          <span className="text-[10px] text-gray-400">
                            · {inUse} empleado{inUse !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    {isOwner && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingSkill({ ...skill })}
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDeleteSkill(skill.id, skill.name)}
                          disabled={inUse > 0}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title={inUse > 0 ? `Asignada a ${inUse} empleados` : 'Eliminar'}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Crear nueva skill */}
        {isOwner && (
          <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-3">
              Nueva etiqueta
            </div>
            <div className="flex items-end gap-3">
              {/* Color picker */}
              <div className="flex-shrink-0">
                <label className="block text-[10px] text-gray-400 mb-1.5">Color</label>
                <div className="flex items-center gap-1.5 flex-wrap max-w-[160px]">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewSkill(s => ({ ...s, color: c }))}
                      className={cn(
                        'w-5 h-5 rounded-md transition-all',
                        newSkill.color === c ? 'ring-2 ring-offset-1 ring-gray-600 scale-110' : 'hover:scale-110'
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Nombre */}
              <div className="flex-1">
                <label className="block text-[10px] text-gray-400 mb-1.5">Nombre</label>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: newSkill.color }} />
                  <input
                    value={newSkill.name}
                    onChange={e => setNewSkill(s => ({ ...s, name: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && handleCreateSkill()}
                    placeholder="Ej: TERRAZA, PARRILLA, BARRA..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 uppercase placeholder:normal-case placeholder:text-gray-300"
                  />
                  <button
                    onClick={handleCreateSkill}
                    disabled={isPending || !newSkill.name.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {isPending ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    Añadir
                  </button>
                </div>
                {error && <p className="text-[11px] text-red-500 mt-1">{error}</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-[12px] text-blue-800">
        <div className="font-bold mb-1">💡 Cómo funcionan las etiquetas</div>
        <p>Las etiquetas que definas aquí aparecen en la ficha de cada empleado para indicar sus especialidades,
        y en la configuración de cobertura para requerir ciertos perfiles en franjas horarias concretas.
        El solver las usa automáticamente al generar el cuadrante.</p>
      </div>
    </div>
  )
}

// ── Fila de edición de skill ─────────────────────────────────────────────
function SkillEditRow({ skill, onChange, onSave, onCancel, isPending }: any) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: skill.color }} />
      <div className="flex items-center gap-2 flex-1 flex-wrap">
        {/* Color */}
        <div className="flex gap-1 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => onChange((s: any) => ({ ...s, color: c }))}
              className={cn('w-5 h-5 rounded-md transition-all', skill.color === c ? 'ring-2 ring-offset-1 ring-gray-600 scale-110' : 'hover:scale-110')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        {/* Nombre */}
        <input
          value={skill.name}
          onChange={e => onChange((s: any) => ({ ...s, name: e.target.value.toUpperCase() }))}
          className="flex-1 min-w-[120px] border border-indigo-300 rounded-xl px-3 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 uppercase"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={onSave} disabled={isPending}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
          Guardar
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-[12px] text-gray-500 hover:bg-gray-100 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Fila de edición de role ─────────────────────────────────────────────
function RoleEditRow({ role, onSave, onCancel, isPending }: any) {
  const [name, setName] = useState(role.name)
  const [color, setColor] = useState(role.color)

  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
        style={{ backgroundColor: color }}>
        {name[0]}
      </div>
      <div className="flex items-center gap-2 flex-1 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)}
              className={cn('w-5 h-5 rounded-md transition-all', color === c ? 'ring-2 ring-offset-1 ring-gray-600 scale-110' : 'hover:scale-110')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          className="flex-1 min-w-[160px] border border-indigo-300 rounded-xl px-3 py-1.5 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="Nombre del rol"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onSave({ name, color })} disabled={isPending || !name.trim()}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
          {isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
          Guardar
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-[12px] text-gray-500 hover:bg-gray-100 transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}

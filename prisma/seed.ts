import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { LEGAL_FRAMEWORK_SEEDS } from '../src/lib/legalFrameworks'

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash('Demo1234!', 12)
  const superAdminPassword = await bcrypt.hash('SuperAdmin123!', 12)

  console.log('🌱 Seeding Shift Solver AI...')

  // ---- Super Admin ----
  await prisma.user.upsert({
    where: { email: 'superadmin@shiftsolver.com' },
    update: { hashedPassword: superAdminPassword, role: 'SUPER_ADMIN', isActive: true },
    create: { email: 'superadmin@shiftsolver.com', name: 'Super Admin', hashedPassword: superAdminPassword, role: 'SUPER_ADMIN', isActive: true },
  })
  console.log('✅ Super Admin: superadmin@shiftsolver.com / SuperAdmin123!')

  // ---- Organization ----
  const org = await prisma.organization.upsert({
    where: { slug: 'restaurante-demo' },
    update: {},
    create: {
      name: 'Restaurante Demo',
      slug: 'restaurante-demo',
      sector: 'hosteleria',
      timezone: 'Europe/Madrid',
      brandColor: '#4f46e5',
      loginMessage: 'Bienvenido al portal de turnos',
      description: 'Restaurante de demostración de Shift Solver AI',
    },
  })
  console.log('✅ Organización:', org.name)

  // ---- Admin user (Owner) ----
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@shiftsolver.com' },
    update: { hashedPassword, role: 'ORG_OWNER', isActive: true },
    create: { email: 'admin@shiftsolver.com', name: 'Admin Demo', hashedPassword, role: 'ORG_OWNER', isActive: true },
  })
  await prisma.organizationMember.upsert({
    where: { userId_organizationId: { userId: adminUser.id, organizationId: org.id } },
    update: { role: 'ORG_OWNER' },
    create: { userId: adminUser.id, organizationId: org.id, role: 'ORG_OWNER' },
  })
  console.log('✅ Usuario admin:', adminUser.email)

  // ---- Marcos Legales ----
  for (const fw of LEGAL_FRAMEWORK_SEEDS) {
    await prisma.legalFramework.upsert({
      where: { code: fw.code },
      update: { name: fw.name, description: fw.description, rules: fw.rules as object },
      create: {
        code: fw.code, name: fw.name, description: fw.description,
        scope: fw.scope, sector: fw.sector, province: fw.province,
        isEditable: fw.isEditable, isActive: true, rules: fw.rules as object,
      },
    })
  }
  const defaultFramework = await prisma.legalFramework.findUnique({ where: { code: 'HOSTELERIA_TARRAGONA' } })
  console.log('✅ Marcos legales:', LEGAL_FRAMEWORK_SEEDS.length)

  // ---- Location ----
  const location = await prisma.location.upsert({
    where: { id: 'loc-demo-001' },
    update: {},
    create: {
      id: 'loc-demo-001',
      organizationId: org.id,
      name: 'Local Principal',
      address: 'Carrer Major 1',
      city: 'Tarragona',
      isActive: true,
    },
  })
  console.log('✅ Local:', location.name)

  // Asignar marco legal a la org
  if (defaultFramework) {
    await prisma.organizationLegalFramework.upsert({
      where: { organizationId_legalFrameworkId: { organizationId: org.id, legalFrameworkId: defaultFramework.id } },
      update: { isDefault: true },
      create: { organizationId: org.id, legalFrameworkId: defaultFramework.id, isDefault: true },
    })
  }

  // ---- Labor Roles ----
  const rolesData = [
    { id: 'role-basic',   name: 'Camarero básico',  level: 'BASIC',        color: '#6366f1', priority: 1, isCritical: false },
    { id: 'role-semi',    name: 'Semi-encargado',   level: 'SEMI_MANAGER', color: '#0891b2', priority: 2, isCritical: true  },
    { id: 'role-manager', name: 'Encargado',         level: 'MANAGER',      color: '#7c3aed', priority: 3, isCritical: true  },
    { id: 'role-owner',   name: 'Dueño',             level: 'OWNER',        color: '#64748b', priority: 4, isCritical: false },
  ]
  for (const r of rolesData) {
    await prisma.laborRole.upsert({
      where: { id: r.id },
      update: {},
      create: { ...r, organizationId: org.id },
    })
  }
  const roleMap: Record<string, string> = {
    BASIC: 'role-basic', SEMI_MANAGER: 'role-semi',
    MANAGER: 'role-manager', OWNER: 'role-owner',
  }
  console.log('✅ Roles:', rolesData.length)

  // ---- Skills ----
  const skillsData = [
    { id: 'sk-apertura',  name: 'APERTURA',   color: '#10b981' },
    { id: 'sk-cierre',    name: 'CIERRE',     color: '#78716c' },
    { id: 'sk-cajera',    name: 'CAJERA',     color: '#6366f1' },
    { id: 'sk-barista',   name: 'BARISTA',    color: '#8b5cf6' },
    { id: 'sk-barra',     name: 'BARRA',      color: '#0ea5e9' },
    { id: 'sk-bandejera', name: 'BANDEJERA',  color: '#ec4899' },
    { id: 'sk-pastas',    name: 'PASTAS',     color: '#f59e0b' },
    { id: 'sk-plancha',   name: 'PLANCHISTA', color: '#ef4444' },
    { id: 'sk-comandera', name: 'COMANDERA',  color: '#f97316' },
    { id: 'sk-delivery',  name: 'DELIVERY',   color: '#84cc16' },
    { id: 'sk-contable',  name: 'CONTABLE',   color: '#14b8a6' },
  ]
  for (const s of skillsData) {
    await prisma.skill.upsert({
      where: { id: s.id },
      update: {},
      create: { ...s, organizationId: org.id },
    })
  }
  console.log('✅ Skills:', skillsData.length)

  // ---- Employees ----
  const pin1234 = await bcrypt.hash('1234', 10)
  const employeeData = [
    { id: 'emp-edgar',    firstName: 'Edgar',    lastName: 'García',    color: '#6366f1', roleId: 'role-owner',   pin: pin1234, skipLegal: true  },
    { id: 'emp-sara',     firstName: 'Sara',     lastName: 'Martínez',  color: '#10b981', roleId: 'role-manager', pin: pin1234, skipLegal: false },
    { id: 'emp-milagros', firstName: 'Milagros', lastName: 'López',     color: '#f59e0b', roleId: 'role-semi',    pin: pin1234, skipLegal: false },
    { id: 'emp-dana',     firstName: 'Dana',     lastName: 'Ruiz',      color: '#8b5cf6', roleId: 'role-basic',   pin: pin1234, skipLegal: false },
    { id: 'emp-yuli',     firstName: 'Yuli',     lastName: 'Chen',      color: '#0891b2', roleId: 'role-basic',   pin: pin1234, skipLegal: false },
    { id: 'emp-anastasia',firstName: 'Anastasia',lastName: 'Kovak',     color: '#ec4899', roleId: 'role-basic',   pin: pin1234, skipLegal: false },
    { id: 'emp-rafael',   firstName: 'Rafael',   lastName: 'Torres',    color: '#f97316', roleId: 'role-basic',   pin: pin1234, skipLegal: false },
    { id: 'emp-jose',     firstName: 'Jose',     lastName: 'Sánchez',   color: '#84cc16', roleId: 'role-semi',    pin: pin1234, skipLegal: false },
    { id: 'emp-anna',     firstName: 'Anna',     lastName: 'Puig',      color: '#14b8a6', roleId: 'role-basic',   pin: pin1234, skipLegal: false },
  ]
  for (const emp of employeeData) {
    const employee = await prisma.employee.upsert({
      where: { id: emp.id },
      update: { pin: emp.pin, skipLegalValidation: emp.skipLegal },
      create: {
        id: emp.id,
        organizationId: org.id,
        locationId: location.id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        color: emp.color,
        isActive: true,
        pin: emp.pin,
        skipLegalValidation: emp.skipLegal,
        hireDate: new Date('2023-01-01'),
        vacationDaysType: 'NATURALES',
        vacationDaysPerYear: 23,
      },
    })
    // Contrato
    await prisma.employeeContract.upsert({
      where: { id: `contract-${emp.id}` },
      update: {},
      create: {
        id: `contract-${emp.id}`,
        employeeId: employee.id,
        contractType: ['emp-edgar','emp-jose','emp-anna'].includes(emp.id) ? 'PART_TIME' : 'FULL_TIME',
        weeklyHours: ['emp-edgar','emp-jose','emp-anna'].includes(emp.id) ? 20 : 40,
        startDate: new Date('2023-01-01'),
        isActive: true,
      },
    })
    // Skill principal
    await prisma.employeeSkill.upsert({
      where: { id: `skill-${emp.id}` },
      update: {},
      create: {
        id: `skill-${emp.id}`,
        employeeId: employee.id,
        laborRoleId: emp.roleId,
        level: 1,
      },
    })
  }
  console.log('✅ Empleados:', employeeData.length, '(PIN demo: 1234)')

  // ---- Coverage Template ----
  const coverageTemplate = await prisma.coverageTemplate.upsert({
    where: { id: 'tmpl-demo-base' },
    update: {},
    create: {
      id: 'tmpl-demo-base',
      organizationId: org.id,
      locationId: location.id,
      name: 'Configuración base',
      description: 'Plantilla principal del restaurante (datos reales del Excel)',
      color: '#6366f1',
      isDefault: true,
      isActive: false,
    },
  })
  console.log('✅ Plantilla de cobertura creada')

  // ---- Cobertura demo: 250 slots del Excel real ----
  const demoSlots = [
    { day: 0, start: '06:00', end: '06:30', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 1, start: '06:00', end: '06:30', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 2, start: '06:00', end: '06:30', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 3, start: '06:00', end: '06:30', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 4, start: '06:00', end: '06:30', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 0, start: '06:30', end: '07:00', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 1, start: '06:30', end: '07:00', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 2, start: '06:30', end: '07:00', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 3, start: '06:30', end: '07:00', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 4, start: '06:30', end: '07:00', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 5, start: '06:30', end: '07:00', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 6, start: '06:30', end: '07:00', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 0, start: '07:00', end: '07:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '07:00', end: '07:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '07:00', end: '07:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '07:00', end: '07:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '07:00', end: '07:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 5, start: '07:00', end: '07:30', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 6, start: '07:00', end: '07:30', min: 1, ideal: 1, rol: 'BASIC' },
    { day: 0, start: '07:30', end: '08:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '07:30', end: '08:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '07:30', end: '08:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '07:30', end: '08:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '07:30', end: '08:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 5, start: '07:30', end: '08:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 6, start: '07:30', end: '08:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '08:00', end: '08:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '08:00', end: '08:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '08:00', end: '08:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '08:00', end: '08:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '08:00', end: '08:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '08:00', end: '08:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 6, start: '08:00', end: '08:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 0, start: '08:30', end: '09:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '08:30', end: '09:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '08:30', end: '09:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '08:30', end: '09:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '08:30', end: '09:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '08:30', end: '09:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 6, start: '08:30', end: '09:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 0, start: '09:00', end: '09:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '09:00', end: '09:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '09:00', end: '09:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '09:00', end: '09:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '09:00', end: '09:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '09:00', end: '09:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 6, start: '09:00', end: '09:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 0, start: '09:30', end: '10:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '09:30', end: '10:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '09:30', end: '10:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '09:30', end: '10:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '09:30', end: '10:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '09:30', end: '10:00', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 6, start: '09:30', end: '10:00', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 0, start: '10:00', end: '10:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '10:00', end: '10:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '10:00', end: '10:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '10:00', end: '10:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '10:00', end: '10:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '10:00', end: '10:30', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 6, start: '10:00', end: '10:30', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 0, start: '10:30', end: '11:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '10:30', end: '11:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '10:30', end: '11:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '10:30', end: '11:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '10:30', end: '11:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '10:30', end: '11:00', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 6, start: '10:30', end: '11:00', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 0, start: '11:00', end: '11:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '11:00', end: '11:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '11:00', end: '11:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '11:00', end: '11:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '11:00', end: '11:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '11:00', end: '11:30', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 6, start: '11:00', end: '11:30', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 0, start: '11:30', end: '12:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '11:30', end: '12:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '11:30', end: '12:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '11:30', end: '12:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '11:30', end: '12:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '11:30', end: '12:00', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 6, start: '11:30', end: '12:00', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 0, start: '12:00', end: '12:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 1, start: '12:00', end: '12:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 2, start: '12:00', end: '12:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 3, start: '12:00', end: '12:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 4, start: '12:00', end: '12:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '12:00', end: '12:30', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 6, start: '12:00', end: '12:30', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 0, start: '12:30', end: '13:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '12:30', end: '13:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '12:30', end: '13:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '12:30', end: '13:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '12:30', end: '13:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 5, start: '12:30', end: '13:00', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 6, start: '12:30', end: '13:00', min: 4, ideal: 4, rol: 'SEMI_MANAGER' },
    { day: 0, start: '13:00', end: '13:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '13:00', end: '13:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '13:00', end: '13:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '13:00', end: '13:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '13:00', end: '13:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 5, start: '13:00', end: '13:30', min: 3, ideal: 3, rol: 'SEMI_MANAGER' },
    { day: 6, start: '13:00', end: '13:30', min: 3, ideal: 3, rol: 'SEMI_MANAGER' },
    { day: 0, start: '13:30', end: '14:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '13:30', end: '14:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '13:30', end: '14:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '13:30', end: '14:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '13:30', end: '14:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 5, start: '13:30', end: '14:00', min: 3, ideal: 3, rol: 'SEMI_MANAGER' },
    { day: 6, start: '13:30', end: '14:00', min: 3, ideal: 3, rol: 'SEMI_MANAGER' },
    { day: 0, start: '14:00', end: '14:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '14:00', end: '14:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '14:00', end: '14:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '14:00', end: '14:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '14:00', end: '14:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 5, start: '14:00', end: '14:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 6, start: '14:00', end: '14:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '14:30', end: '15:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '14:30', end: '15:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '14:30', end: '15:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '14:30', end: '15:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '14:30', end: '15:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 5, start: '14:30', end: '15:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 6, start: '14:30', end: '15:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '15:00', end: '15:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '15:00', end: '15:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '15:00', end: '15:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '15:00', end: '15:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '15:00', end: '15:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 5, start: '15:00', end: '15:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 6, start: '15:00', end: '15:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '15:30', end: '16:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '15:30', end: '16:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '15:30', end: '16:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '15:30', end: '16:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '15:30', end: '16:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 5, start: '15:30', end: '16:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 6, start: '15:30', end: '16:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '16:00', end: '16:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '16:00', end: '16:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '16:00', end: '16:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '16:00', end: '16:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '16:00', end: '16:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 5, start: '16:00', end: '16:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 6, start: '16:00', end: '16:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '16:30', end: '17:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '16:30', end: '17:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '16:30', end: '17:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '16:30', end: '17:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '16:30', end: '17:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 5, start: '16:30', end: '17:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 6, start: '16:30', end: '17:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '17:00', end: '17:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '17:00', end: '17:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '17:00', end: '17:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '17:00', end: '17:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '17:00', end: '17:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 5, start: '17:00', end: '17:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 6, start: '17:00', end: '17:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '17:30', end: '18:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '17:30', end: '18:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '17:30', end: '18:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '17:30', end: '18:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '17:30', end: '18:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 5, start: '17:30', end: '18:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 6, start: '17:30', end: '18:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '18:00', end: '18:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '18:00', end: '18:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '18:00', end: '18:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '18:00', end: '18:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '18:00', end: '18:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '18:00', end: '18:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 6, start: '18:00', end: '18:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '18:30', end: '19:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '18:30', end: '19:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '18:30', end: '19:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '18:30', end: '19:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '18:30', end: '19:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '18:30', end: '19:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 6, start: '18:30', end: '19:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '19:00', end: '19:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '19:00', end: '19:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '19:00', end: '19:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '19:00', end: '19:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '19:00', end: '19:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '19:00', end: '19:30', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 6, start: '19:00', end: '19:30', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '19:30', end: '20:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 1, start: '19:30', end: '20:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 2, start: '19:30', end: '20:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 3, start: '19:30', end: '20:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 4, start: '19:30', end: '20:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 5, start: '19:30', end: '20:00', min: 3, ideal: 3, rol: 'BASIC' },
    { day: 6, start: '19:30', end: '20:00', min: 2, ideal: 2, rol: 'BASIC' },
    { day: 0, start: '20:00', end: '20:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '20:00', end: '20:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '20:00', end: '20:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '20:00', end: '20:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '20:00', end: '20:30', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 5, start: '20:00', end: '20:30', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 6, start: '20:00', end: '20:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '20:30', end: '21:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '20:30', end: '21:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '20:30', end: '21:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '20:30', end: '21:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '20:30', end: '21:00', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 5, start: '20:30', end: '21:00', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 6, start: '20:30', end: '21:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '21:00', end: '21:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '21:00', end: '21:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '21:00', end: '21:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '21:00', end: '21:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '21:00', end: '21:30', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 5, start: '21:00', end: '21:30', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 6, start: '21:00', end: '21:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '21:30', end: '22:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '21:30', end: '22:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '21:30', end: '22:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '21:30', end: '22:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '21:30', end: '22:00', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 5, start: '21:30', end: '22:00', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 6, start: '21:30', end: '22:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '22:00', end: '22:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '22:00', end: '22:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '22:00', end: '22:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '22:00', end: '22:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '22:00', end: '22:30', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 5, start: '22:00', end: '22:30', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 6, start: '22:00', end: '22:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '22:30', end: '23:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '22:30', end: '23:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '22:30', end: '23:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '22:30', end: '23:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '22:30', end: '23:00', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 5, start: '22:30', end: '23:00', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 6, start: '22:30', end: '23:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '23:00', end: '23:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '23:00', end: '23:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '23:00', end: '23:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '23:00', end: '23:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '23:00', end: '23:30', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 5, start: '23:00', end: '23:30', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 6, start: '23:00', end: '23:30', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 0, start: '23:30', end: '00:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 1, start: '23:30', end: '00:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 2, start: '23:30', end: '00:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 3, start: '23:30', end: '00:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
    { day: 4, start: '23:30', end: '00:00', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 5, start: '23:30', end: '00:00', min: 4, ideal: 4, rol: 'MANAGER' },
    { day: 6, start: '23:30', end: '00:00', min: 2, ideal: 2, rol: 'SEMI_MANAGER' },
  ]

  await prisma.coverageRequirement.deleteMany({ where: { templateId: coverageTemplate.id } })
  await prisma.coverageRequirement.createMany({
    data: demoSlots.map(s => ({
      organizationId: org.id,
      locationId: location.id,
      templateId: coverageTemplate.id,
      dayOfWeek: s.day,
      startTime: s.start,
      endTime: s.end,
      minWorkers: s.min,
      idealWorkers: s.ideal,
      laborRoleId: s.rol !== 'BASIC' ? (roleMap[s.rol] ?? null) : null,
      isRequired: true,
      priority: 1,
    })),
  })
  console.log(`✅ Cobertura demo: ${demoSlots.length} slots`)

  // ---- Business Rule ----
  await prisma.businessRule.upsert({
    where: { id: 'rule-demo-001' },
    update: {},
    create: {
      id: 'rule-demo-001',
      organizationId: org.id,
      type: 'MAX_HOURS',
      description: 'Convenio Hostelería Tarragona',
      value: { maxDailyHours: 9, maxWeeklyHours: 40, maxAnnualHours: 1791, minRestBetweenShifts: 12, minWeeklyRestDays: 2, maxOvertimeAnnual: 80 },
      severity: 'WARNING',
      isActive: true,
    },
  })

  console.log('\n🎉 Seed completado')
  console.log('   Admin:      admin@shiftsolver.com / Demo1234!')
  console.log('   SuperAdmin: superadmin@shiftsolver.com / SuperAdmin123!')
  console.log('   Empleados:  /r/restaurante-demo/login · PIN: 1234')
}

main()
  .catch(e => { console.error('❌ Error en seed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })

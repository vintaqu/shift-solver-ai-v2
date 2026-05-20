import Link from 'next/link'
import './landing.css'

// Datos estáticos del mockup — generados una sola vez, no aleatorios
const MOCK_DATA = [
  [true,false,true,false,true,true,false,true],
  [false,true,true,true,false,true,true,false],
  [true,true,false,true,true,false,true,true],
  [false,false,true,false,true,true,false,true],
  [true,true,true,false,false,true,true,false],
  [false,true,false,true,true,false,true,true],
  [true,false,true,true,false,true,false,true],
]

const COLORS = ['#6366f1','#10b981','#f59e0b','#8b5cf6','#3b82f6','#ec4899','#14b8a6','#f97316']
const STARTS = ['06:00','08:30','10:00','12:00','14:00','16:00','18:00','20:00']
const ENDS   = ['14:00','16:30','18:00','20:00','22:00','00:00','02:00','04:00']

export default function LandingPage() {
  return (
    <div className="landing-root">

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-inner">
          <div className="logo">
            <div className="logo-icon">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M9 1L11.5 6.5H17L12.5 10L14.5 16L9 12.5L3.5 16L5.5 10L1 6.5H6.5L9 1Z" fill="white" fillOpacity="0.9"/>
              </svg>
            </div>
            <span>Shift Solver AI</span>
          </div>
          <div className="nav-links">
            <a href="#features">Funcionalidades</a>
            <a href="#how">Cómo funciona</a>
          </div>
          <div className="nav-cta">
            <Link href="/login" className="btn-ghost">Entrar</Link>
            <Link href="/onboarding" className="btn-primary">Empezar gratis →</Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <div className="hero-bg">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          <div className="orb orb-3" />
          <div className="grid-overlay" />
        </div>

        <div className="hero-inner">
          <div className="badge">
            <span className="badge-dot" />
            Powered by OR-Tools · CP-SAT
          </div>

          <h1 className="hero-title">
            El cuadrante semanal<br />
            <span className="gradient-text">en 60 segundos.</span>
          </h1>

          <p className="hero-desc">
            Shift Solver AI genera automáticamente los horarios de tu restaurante
            respetando contratos, restricciones individuales y el convenio colectivo.
            Sin errores. Sin horas perdidas.
          </p>

          <div className="hero-actions">
            <Link href="/onboarding" className="cta-main">
              Crear cuenta gratis
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/login" className="cta-secondary">Ya tengo cuenta</Link>
          </div>

          <div className="hero-stats">
            <div className="stat">
              <span className="stat-num">60s</span>
              <span className="stat-label">tiempo de generación</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-num">2.900+</span>
              <span className="stat-label">variables optimizadas</span>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <span className="stat-num">15+</span>
              <span className="stat-label">restricciones legales</span>
            </div>
          </div>
        </div>

        {/* Dashboard mockup — datos estáticos */}
        <div className="hero-mockup">
          <div className="mockup-window">
            <div className="mockup-bar">
              <span className="dot red" />
              <span className="dot yellow" />
              <span className="dot green" />
              <span className="mockup-url">shiftsolver.app/planning/week</span>
            </div>
            <div className="mockup-content">
              <div className="mock-header">
                <div className="mock-week">Semana 23 · 2–8 Jun 2025</div>
                <div className="mock-badges">
                  <span className="mock-badge green">✓ Publicado</span>
                  <span className="mock-badge purple">IA Generado</span>
                </div>
              </div>
              <div className="mock-grid">
                {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map((day, di) => (
                  <div key={day} className="mock-col">
                    <div className="mock-day">{day}</div>
                    {MOCK_DATA[di].map((hasShift, row) =>
                      hasShift ? (
                        <div
                          key={row}
                          className="mock-shift"
                          style={{
                            backgroundColor: COLORS[(di + row) % COLORS.length] + '30',
                            borderLeft: `3px solid ${COLORS[(di + row) % COLORS.length]}`,
                          }}
                        >
                          <span style={{ color: COLORS[(di + row) % COLORS.length], fontSize: '8px', fontWeight: 700 }}>
                            {STARTS[row]}–{ENDS[row]}
                          </span>
                        </div>
                      ) : (
                        <div key={row} className="mock-empty" />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── EL PROBLEMA ── */}
      <section className="section-dark" id="problem">
        <div className="container">
          <div className="problem-grid">
            <div className="problem-text">
              <span className="section-tag">El problema</span>
              <h2>Hacer el cuadrante a mano es una pesadilla</h2>
              <p>
                Cada semana, horas mirando una hoja de Excel. Calcular quién puede trabajar cuándo,
                quién tiene restricciones, quién está de vacaciones, quién lleva demasiadas horas...
              </p>
              <p>
                Y aun así, el lunes aparece alguien diciendo que tenía el día libre.
              </p>
            </div>
            <div className="pain-list">
              {[
                { icon: '⏰', title: '3-4 horas cada semana', desc: 'Tiempo que el manager dedica a hacer el cuadrante manualmente' },
                { icon: '❌', title: 'Errores constantes', desc: 'Solapamientos, descansos insuficientes, horas extra no contabilizadas' },
                { icon: '😤', title: 'Conflictos con empleados', desc: 'Turnos que no respetan las preferencias ni las restricciones acordadas' },
                { icon: '⚖️', title: 'Riesgo legal', desc: 'Incumplimiento del convenio colectivo sin saberlo' },
              ].map(p => (
                <div key={p.title} className="pain-item">
                  <span className="pain-icon">{p.icon}</span>
                  <div>
                    <strong>{p.title}</strong>
                    <span>{p.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FUNCIONALIDADES ── */}
      <section className="section-light" id="features">
        <div className="container">
          <div className="section-header">
            <span className="section-tag dark">La solución</span>
            <h2 style={{ color: '#1a1a2e' }}>Todo lo que necesita tu restaurante,<br /><em>automatizado</em></h2>
            <p style={{ color: 'rgba(0,0,0,0.5)' }}>Un motor de inteligencia artificial que entiende tu negocio y genera el cuadrante óptimo en segundos.</p>
          </div>

          <div className="features-grid">
            {[
              { icon: '⚡', title: 'Generación automática con IA', desc: 'Pulsa un botón. En 60 segundos tienes el cuadrante completo para toda la semana, optimizado para cubrir cada franja horaria.' },
              { icon: '⚖️', title: 'Convenio colectivo integrado', desc: 'Descanso mínimo de 12h, 2 días seguidos libres, máximo 9h/día, jornadas partidas legales. Todo se verifica automáticamente.' },
              { icon: '👤', title: 'Restricciones individuales', desc: 'Edgar solo trabaja mañanas. Mayte nunca antes de las 7h. José libra de lunes a jueves. El solver respeta cada caso.' },
              { icon: '🎯', title: 'Cobertura exacta por franja', desc: 'Define cuántas personas necesitas cada 30 minutos. El sistema garantiza que siempre estés cubierto con el personal correcto.' },
              { icon: '📊', title: 'Control de horas y costes', desc: 'Dashboard con horas planificadas, nocturnas, extras y coste laboral. Panel anual de cumplimiento legal por empleado.' },
              { icon: '📱', title: 'Portal para empleados', desc: 'Cada trabajador ve sus turnos en su móvil con un PIN. Puede solicitar vacaciones y ausencias directamente.' },
            ].map(f => (
              <div key={f.title} className="feature-card">
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ── */}
      <section className="section-dark" id="how">
        <div className="container">
          <div className="section-header light">
            <span className="section-tag">Proceso</span>
            <h2>Del problema al cuadrante en 3 pasos</h2>
          </div>

          <div className="steps-grid">
            {[
              {
                num: '01',
                title: 'Configura una vez',
                desc: 'Añade tus empleados con sus contratos, horarios y restricciones. Define cuánto personal necesitas en cada franja horaria.',
                detail: 'Solo necesitas hacerlo una vez. El sistema lo recuerda todo.',
              },
              {
                num: '02',
                title: 'Genera con IA',
                desc: 'Pulsa "Generar cuadrante". OR-Tools CP-SAT resuelve el problema de optimización en 15–90 segundos.',
                detail: '~2.900 variables, 15+ tipos de restricciones, resultado óptimo garantizado.',
              },
              {
                num: '03',
                title: 'Revisa y publica',
                desc: 'Ajusta manualmente lo que necesites. El sistema detecta conflictos en tiempo real. Publica y notifica al equipo.',
                detail: 'Los empleados ven su horario al instante en su portal personal.',
              },
            ].map(step => (
              <div key={step.num} className="step-card">
                <div className="step-num">{step.num}</div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                <div className="step-detail">{step.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GARANTÍAS ── */}
      <section className="section-garantias">
        <div className="container">
          <div className="garantias-grid">
            {[
              { icon: '🔒', text: 'Datos aislados por restaurante. Multi-tenant seguro.' },
              { icon: '📋', text: 'Convenio hostelería Tarragona integrado por defecto.' },
              { icon: '🌍', text: 'Adaptable a cualquier sector y zona horaria.' },
              { icon: '🔄', text: 'Plantillas de temporada: verano, invierno, eventos.' },
            ].map(g => (
              <div key={g.text} className="garantia-item">
                <span>{g.icon}</span>
                <span>{g.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="section-cta">
        <div className="orb orb-cta-1" />
        <div className="orb orb-cta-2" />
        <div className="container">
          <div className="cta-inner">
            <div className="cta-tag">Empieza hoy</div>
            <h2>Recupera 3 horas<br />cada semana</h2>
            <p>
              El tiempo que pasas haciendo el cuadrante a mano es tiempo que podrías dedicar
              a tu negocio, tu familia, o simplemente a descansar.
            </p>
            <Link href="/onboarding" className="cta-main large">
              Crear mi cuenta gratis
              <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <p className="cta-note">Sin tarjeta de crédito · Configuración en 5 minutos</p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <div className="container">
          <div className="footer-inner">
            <div className="logo">
              <div className="logo-icon">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 1L11.5 6.5H17L12.5 10L14.5 16L9 12.5L3.5 16L5.5 10L1 6.5H6.5L9 1Z" fill="white" fillOpacity="0.9"/>
                </svg>
              </div>
              <span>Shift Solver AI</span>
            </div>
            <div className="footer-links">
              <Link href="/login">Acceder</Link>
              <Link href="/onboarding">Registrarse</Link>
              <a href="mailto:hola@shiftsolver.app">Contacto</a>
            </div>
          </div>
          <div className="footer-bottom">
            © 2025 Shift Solver AI · Planificación inteligente para hostelería
          </div>
        </div>
      </footer>
    </div>
  )
}

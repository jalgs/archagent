# Flujos Completos de Extremo a Extremo
### Desde la intención del Director hasta el código verificado

---

## Cómo leer este documento

Los flujos no son independientes. Hay uno que es la raíz (Bootstrap) y uno que es el ritmo normal del sistema
(Feature en zona sana). Los demás son variaciones: puntos donde el sistema detecta que el terreno es
distinto y ajusta su comportamiento. En cada variación se señala exactamente dónde diverge del happy path
y por qué.

Para cada flujo se documenta dos perspectivas simultáneas: lo que ve el Director (su experiencia real) y lo
que ocurre en el sistema (qué agentes, skills y extensions se activan). Esa dualidad es intencional: permite
verificar que la complejidad interna produce simplicidad externa.

## ---

## Flujo 0: Bootstrap
*La primera vez que el sistema entra en un repositorio*

Este flujo no es opcional ni puede saltarse. Sin él, el sistema no tiene el contexto mínimo para operar
responsablemente. Es corto, pero sus artefactos de salida son los cimientos de todo lo que viene después.

### Lo que ve el Director

El Director abre la sesión del Orchestrator por primera vez en el repo y dice algo tan simple como: *"Arranca.
Este es el proyecto."*

El Orchestrator responde con una pregunta de clarificación breve: *"¿Hay documentación de arquitectura
existente que deba leer primero, o parto del código directamente?"* — esta pregunta no es protocolo, es
información que puede ahorrar horas de análisis si existe un ADR histórico, un diagrama, o un README con
valor real.

Tras la respuesta del Director, el sistema trabaja de forma autónoma. El Director no recibe actualizaciones
intermedias — el Orchestrator le había dicho cuándo volvería con algo que revisar.

El Director recibe el primer checkpoint: un paquete de dos artefactos. El primero es un borrador de
`ARCH.md` con el mapa arquitectónico inferido del código, con secciones marcadas con nivel de confianza.


El segundo es una lista de preguntas del sistema sobre las zonas donde la inferencia fue incierta. El
encuadre del checkpoint es explícito: *"Esto es lo que el código parece ser. Corrígeme donde me equivoque."*

El Director revisa, corrige, responde las preguntas. Este acto de corrección es el momento más valioso del
Bootstrap: fuerza al Director a articular su modelo mental del sistema, que inevitablemente contiene
conocimiento que no está en el código.

El Director recibe un segundo checkpoint, más breve: *"Con tus correcciones, aquí están las restricciones y
convenciones iniciales que propongo documentar. Añade, elimina o ajusta lo que necesites."* El Director
produce la primera versión real de `CONSTRAINTS.md` y `CONVENTIONS.md`.

El sistema confirma que está listo para operar.

### Lo que ocurre en el sistema

```
Director: "Arranca."
│
▼
Orchestrator
├─ Pregunta sobre documentación existente
└─ Lanza Understand Agent (modo rápido, repo completo)
│
Skills activos:
· understand-role
· clean-architecture (para identificar capas)
· design-patterns (para identificar patrones en uso)
· project-constraints (vacío en bootstrap)
│
Extensions activas:
· plan-guard (no puede tocar código)
· session-observer
│
Produce:
· Borrador ARCH.md
· Borrador HEALTH_MAP.md (análisis rápido de todas las zonas)
· Lista de incertidumbres para el Director
│
[CHECKPOINT 1] ──► Director revisa y corrige ARCH.md
Director responde preguntas de incertidumbre
│


archbase-integrity valida ARCH.md y actualiza _index
│
Orchestrator lanza Understand Agent (segunda pasada, focalizada en zonas
con incertidumbre resuelta por el Director)
│
Produce: versión refinada de ARCH.md + propuesta CONSTRAINTS/CONVENTIONS
│
[CHECKPOINT 2] ──► Director produce CONSTRAINTS.md y CONVENTIONS.md
│
health-tracker registra estado inicial del HEALTH_MAP.md
Orchestrator confirma bootstrap completado
WORKFLOW_STATE.md: "ready"
```

**Artefactos de salida del Bootstrap:**

- `knowledge/ARCH.md` — validado por el Director
- `knowledge/CONSTRAINTS.md` — escrito por el Director
- `knowledge/CONVENTIONS.md` — escrito por el Director
- `health/HEALTH_MAP.md` — análisis rápido, nivel de confianza bajo, pendiente de profundizar

**Duración típica:** una sesión de trabajo. El Director dedica principalmente tiempo a los dos checkpoints —
el resto es trabajo autónomo del sistema.

## ---

## Flujo 1: Feature en Zona Sana
*El happy path. El ritmo normal del sistema.*

Este es el flujo de referencia. Cuando el terreno está limpio, el sistema es rápido, los checkpoints son ligeros,
y el Director opera al máximo nivel de abstracción.

### Condición de entrada
El Health Map de la zona afectada muestra las cuatro dimensiones en estado sano o atención (ninguna
comprometida). El Bootstrap está completado.

### Lo que ve el Director

*"Necesito implementar la autenticación con Google OAuth. Afecta al módulo de usuarios."*

El Orchestrator responde: *"El módulo de usuarios está en buen estado. Veo que ya tenéis un patrón de
autenticación para login con email [referencia a PATTERNS.md]. ¿Quieres que el OAuth de Google use ese


mismo patrón como base, o prefier es explorar si tiene sentido un diseño distinto?"*

Esta pregunta no es relleno — es el Orchestrator usando su conocimiento de `PATTERNS.md` para ahorrarte
la mitad del DDR. Si el Director dice "usa el mismo patrón", el Decide Agent tiene una restricción de diseño
clara antes de empezar.

*"Usa el mismo patrón como base, pero considera si necesita adaptaciones para el callback de OAuth."*

El sistema trabaja. El Director no recibe nada hasta que hay algo que revisar.

**Checkpoint 1 — DDR:** *"Propuesta de diseño para OAuth con Google. He mantenido el patrón
AuthProvider existente y añadido GoogleAuthProvider como implementación. El callback de OAuth requiere
un paso adicional de intercambio de token que he modelado dentro del mismo contrato del proveedor, sin
exponerlo a la capa de aplicación. Alternativa evaluada y descartada: un flujo separado para OAuth. Razón:
rompería OCP y duplicaría lógica de sesión. ¿Apruebas?"*

El Director lee el DDR. Es concreto, justificado, y respeta `PATTERNS.md`. Lo aprueba.

El sistema trabaja. El Act Agent implementa dentro del scope del DDR.

**Checkpoint 2 — Audit Report:** *"Implementación completada. Sin blocking issues. Un advisory: el nombre
GoogleAuthProvider no sigue exactamente la convención de naming para providers en CONVENTIONS.md
(debería ser GoogleOAuthProvider según el patrón de naming). He registrado el advisory en DEBT.md.
¿Apruebas el merge?"*

El Director decide: corregir ahora o dejar en DEBT.md. En cualquier caso, el sistema continúa.

### Lo que ocurre en el sistema

```
Director: "Implementa OAuth con Google en el módulo de usuarios."
│
Orchestrator
├─ Consulta HEALTH_MAP.md zona "usuarios" → sano
├─ Consulta PATTERNS.md → identifica AuthProvider existente
├─ Hace pregunta de clarificación al Director
└─ Con respuesta: configura pipeline estándar
│
▼
UNDERSTAND (modo rápido, foco en módulo usuarios + auth existente)
Skills: understand-role + clean-architecture + project-arch


+ project-constraints + zone-context(usuarios)
Ext:    plan-guard + session-observer
│
Produce: análisis del contrato AuthProvider actual
seams disponibles para extensión
│
▼
DECIDE
Skills: decide-role + design-patterns + clean-architecture
+ project-arch + project-constraints + project-vocabulary
+ zone-context(usuarios)
Ext:    plan-guard + archbase-integrity + session-observer
│
Produce: DDR borrador
│
[CHECKPOINT 1] ──► Director aprueba DDR
active-ddr.skill ensamblado para Act Agent
│
▼
ACT
Skills: act-role + project-conventions + project-constraints
+ zone-context(usuarios) + active-ddr
Ext:    scope-enforcer(modo normal) + context-budget
+ session-observer
│
Implementa dentro del scope del DDR
scope-enforcer verifica cada write contra lista de ficheros del DDR
│
▼
VERIFY
Skills: verify-role + solid-principles + clean-code
+ design-patterns + project-arch + project-constraints
+ zone-context(usuarios)
Ext:    health-tracker + archbase-integrity + session-observer
│
Produce: Audit Report
health-tracker actualiza HEALTH_MAP.md zona usuarios
│
[CHECKPOINT 2] ──► Director aprueba o pide corrección
│
Orchestrator actualiza WORKFLOW_STATE.md


DDR pasa a estado "implementado" en _index.md
```

**Duración típica:** el Director invierte tiempo solo en los dos checkpoints. El resto es autónomo.

---

## Flujo 2: Feature en Zona Legacy
*Primera variación del happy path: el terreno cambia, el sistema se adapta*

### Dónde diverge del Flujo 1

El Health Map muestra una o más dimensiones comprometidas. El Pipeline Configurator detecta la
divergencia y reconfigura. Desde la perspectiva del Director, el sistema se "explica" antes de proceder.

### Lo que ve el Director

*"Necesito añadir filtros de búsqueda avanzada al módulo de reporting."*

El Orchestrator: *"El módulo de reporting tiene dos situaciones que quiero que conozcas antes de proceder.
Primero: la cobertura de tests es insuficiente para que pueda tocar el código con garantías — necesito añadir
characterization tests antes de diseñar nada. Segundo: la alineación arquitectónica del módulo está
comprometida (hay lógica de negocio en los controladores). El diseño que proponga será un Baby Step:
añadirá la feature sin empeorar la situación, pero sin pretender arreglarlo todo. ¿Procedo con ese plan?"*

El Director tiene una decisión real aquí, no un trámite: puede decir que sí, puede decir que antes de añadir la
feature quiere un refactor mínimo del módulo, o puede decir que la feature es urgente y acepta la deuda
conscientemente. El sistema no decide esto — lo plantea.

Si el Director acepta el plan: el sistema hace la caracterización primero, de forma autónoma, y presenta el
resultado en un checkpoint ligero: *"He capturado el comportamiento actual de los 4 flujos de exportación
del módulo. Aquí está el resumen de qué queda cubierto. Ahora puedo diseñar la feature con seguridad.
¿Continúo?"*

El resto del flujo es igual que el Flujo 1, con una diferencia visible: el DDR tiene una sección adicional — *"Qué
no cambia"* — que el Director puede leer y confirmar. El Audit Report tiene una dimensión adicional —
direction check — que confirma que el cambio se acerca a `ARCH_TARGET.md` en lugar de alejarse.

### Lo que ocurre en el sistema

```


Director: "Filtros de búsqueda en módulo de reporting."
│
Orchestrator
├─ Consulta HEALTH_MAP.md zona "reporting"
│ → tests: comprometido
│ → alineación: comprometido
├─ Pipeline Configurator: inserta CharacterizationAct antes de Decide
│   y activa modo incremental en Decide
└─ Informa al Director y pide confirmación
│
[CONFIRMACIÓN DIRECTOR]
│
▼
UNDERSTAND (modo rápido, foco en módulo reporting)
+ legacy-patterns.skill activo
│
▼
ACT (modo caracterización — precede al Decide)
Skills: act-role + project-conventions + project-constraints
+ zone-context(reporting)
Ext:    scope-enforcer(modo normal, solo ficheros de test)
│
Produce: characterization tests sobre comportamiento actual
│
[CHECKPOINT LIGERO] ──► Director confirma cobertura suficiente
│
▼
DECIDE (modo incremental)
Skills: decide-incremental-role + [knowledge skills]
+ project-arch + project-constraints
+ zone-context(reporting)
│ ↑
Lee DELTA.md ──────────┘ (verifica dirección del cambio)
│
Produce: DDR con sección "qué no cambia" + Baby Step constraint
│
[CHECKPOINT DDR] ──► Director aprueba
│
▼
ACT (scope-enforcer modo normal)
│


## ▼

VERIFY (+ direction check + regression check)
│
Verify comprueba:
· tests de caracterización siguen pasando (regression)
· cambio acerca a ARCH_TARGET.md (direction)
· SOLID + Clean Code + conformidad DDR (estándar)
│
health-tracker actualiza HEALTH_MAP.md
→ si tests de caracterización añadidos: dimensión tests mejora
→ si no se introdujeron nuevas violaciones de alineación: estable
```

**La diferencia clave con el Flujo 1:** el Director toma una decisión más (aprobar el plan antes de empezar) y
recibe un checkpoint adicional (la cobertura de caracterización). Todo lo demás es igual desde su
perspectiva.

## ---

## Flujo 3: Refactor Estratégico (Strangler Fig)
*Segunda variación: el objetivo es transformar, no añadir*

### Dónde diverge

El Director no quiere añadir una feature — quiere mejorar la estructura de un módulo. El Decide Agent no
diseña una solución puntual sino un plan de transformación en fases. Cada fase es un mini-flujo completo.

### Lo que ve el Director

*"El módulo de autenticación tiene demasiada responsabilidad. Quiero modernizarlo."*

El Orchestrator: *"Antes de diseñar el refactor, voy a hacer un análisis profundo del módulo para entender
exactamente qué hace, qué depende de él, y qué margen tenemos para moverlo. ¿Tienes alguna restricción
temporal o de alcance que deba tener en cuenta?"*

Esta pregunta importa: la respuesta determina si el plan de transformación puede ser agresivo o debe ser
incremental en el tiempo.

Tras el análisis, el Director recibe el checkpoint más denso del sistema: el plan de transformación completo.
No es un DDR — es un documento de arquitectura que describe el estado objetivo del módulo, el plan de


fases para llegar ahí, la estimación de esfuerzo de cada fase, y los criterios que definen cuándo una fase está
completa y el legacy de esa fase puede eliminarse.

El Director revisa el plan. Este es el checkpoint que más requiere su juicio senior: si el plan tiene fases mal
dimensionadas, si el estado objetivo no es el correcto, si el orden de las fases crea dependencias
problemáticas — todo eso debe resolverse aquí, antes de que empiece el trabajo.

Una vez aprobado el plan, cada fase es un Flujo 2 completo: characterization, diseño Baby Step,
implementación, verificación. El Director opera fase a fase. El Orchestrator mantiene la visión del plan
completo y reporta el progreso en términos del plan, no en términos de ficheros modificados.

### Lo que ocurre en el sistema

```
Director: "Refactoriza el módulo de autenticación."
│
Orchestrator
├─ Consulta HEALTH_MAP.md → múltiples dimensiones comprometidas
├─ Pipeline Configurator: activa modo Strangler Fig
└─ Lanza Understand en modo profundo (arqueológico)
│
▼
UNDERSTAND (modo profundo)
Skills: understand-deep-role + legacy-patterns + [knowledge skills]
+ project-arch + project-constraints + zone-context(auth)
Ext:    plan-guard + session-observer
│
Produce:
· ARCHAEOLOGY.md (zona auth)
· Actualización HEALTH_MAP.md con análisis profundo
· health/zones/auth.md con detalle: load-bearing walls, seams disponibles
│
▼
DECIDE (modo Strangler Fig)
Lee: ARCHAEOLOGY.md + INTENT.md (si existe y está validado)
DELTA.md (si existe) + HEALTH_MAP.md
│
Produce: Plan de transformación completo
· ARCH_TARGET.md para el módulo (si no existe)
· DELTA.md actualizado para la zona auth
· Plan de fases: cada fase con scope, criterio de completitud,


y estimación de esfuerzo
│
[CHECKPOINT PLAN] ──► Director revisa y aprueba el plan completo
Este es el checkpoint más crítico del flujo
│
Por cada fase aprobada:
│
├─► [Flujo 2 completo para esa fase]
│       Characterization → Decide (Baby Step) → Act → Verify
│
├─► [CHECKPOINT DE FASE] ──► Director aprueba antes de la siguiente
│
└─► Cuando todas las fases están completas:
VERIFY hace auditoría final del módulo completo
health-tracker actualiza todas las dimensiones de la zona
Si todas están sanas: ARCH_TARGET.md de la zona se archiva
DELTA.md de la zona se cierra
```

---

## Flujo 4: Code Review de un PR
*Tercera variación: solo Verify, sin Act*

### Dónde diverge

No hay implementación. El código ya existe. El sistema actúa como revisor senior que conoce la arquitectura
del proyecto mejor que nadie porque la tiene documentada.

### Lo que ve el Director

*"Revisa el PR #247 antes de que lo mergee."*

El Orchestrator: *"¿Quieres solo la revisión arquitectónica (conformidad con ARCH.md, SOLID, patrones) o
también quieres que verifique si hay regresiones contra los tests de caracterización existentes?"*

Esta pregunta distingue entre una revisión de diseño y una revisión de seguridad. Son complementarias pero
tienen distinto peso según el contexto.

El Director recibe el Audit Report directamente, sin DDR previo (porque el código ya existe): blocking issues si
los hay, advisory issues clasificados, y — la dimensión más valiosa — si el PR acerca o aleja el código de la


arquitectura objetivo.

### Lo que ocurre en el sistema

```
Director: "Revisa el PR #247."
│
Orchestrator
├─ Identifica zona(s) afectadas por el PR
├─ Consulta HEALTH_MAP.md de las zonas
└─ Configura pipeline: solo Verify, con contexto del diff
│
▼
UNDERSTAND (micro, foco en diff del PR)
Lee: ficheros modificados + sus dependencias inmediatas
Produce: contexto del cambio para el Verify Agent
│
▼
VERIFY (modo PR review)
Skills: verify-role + [knowledge skills] + project-arch
+ project-constraints + zone-context(zonas afectadas)
│
Audita:
· Conformidad con DDRs existentes que afectan las zonas tocadas
· SOLID en el código nuevo/modificado
· Alineación arquitectónica (direction check)
· Si existen tests de caracterización: regression check
· Convenciones (project-conventions)
│
Produce: Audit Report con localización exacta de cada finding
│
[CHECKPOINT] ──► Director decide si bloquear o mergear
```

**Diferencia clave:** no hay DDR porque no hay diseño previo que revisar. El Verify trabaja contra `ARCH.md`,
`CONSTRAINTS.md`, y los DDRs existentes de las zonas afectadas como referencia.

## ---

## Flujo 5: Onboarding a Repo Legacy Desconocido
*La variación más profunda del Bootstrap*


### Dónde diverge

El Bootstrap asume que hay arquitectura que documentar. Este flujo asume lo contrario: que la arquitectura
hay que inferirla, que la documentación existente puede ser incorrecta, y que el Director necesita un análisis
honesto antes de poder tomar cualquier decisión.

### Lo que ve el Director

*"Este es el repo del proyecto de facturación. Lleva 8 años en producción y nadie lo toca con gusto."*

El Orchestrator no minimiza: *"Entendido. Voy a hacer un análisis profundo antes de que podamos operar en
él. Este análisis producirá una imagen honesta de lo que hay. Cuando termine, necesitaré que valides mi
interpretación de la intención original del sistema — esa es la parte que solo tú puedes hacer correctamente.
Puede llevar un tiempo. ¿Procedo?"*

El Director recibe tres artefactos en el primer checkpoint, presentados en orden:

Primero, `ARCHAEOLOGY.md` — *"Esto es lo que el código hace realmente."* El Director lo lee como un
diagnóstico clínico: sin juicio, sin propuestas, solo hechos.

Segundo, `INTENT.md` — *"Esto es lo que creo que el código quiso ser. Necesito que me corrijas."* El Director
lee esto con especial atención y corrije lo que está mal. Esta conversación puede durar — es donde el
conocimiento institucional se transfiere al sistema.

Tercero, `TRIAGE.md` — *"Esta es mi lectura de la deuda por tipo y riesgo. ¿La priorización tiene sentido para
vosotros?"*

Tras la validación del Director, el sistema está listo para operar en modo legacy. El Director recibe un segundo
checkpoint con la propuesta de arquitectura objetivo y el plan de delta: *"Basándome en la intención validada
y en las capacidades del sistema, propongo esta arquitectura objetivo. ¿Es la dirección correcta?"*

Una vez aprobada la arquitectura objetivo, el sistema puede ejecutar Flujos 2 y 3 sobre el repo con pleno
contexto.

### Lo que ocurre en el sistema

## ```

Director: "Este es el repo legacy de facturación."
│
Orchestrator


├─ Detecta ausencia de archbase/ o archbase/ vacío
├─ Pipeline Configurator: modo Bootstrap Legacy
└─ Lanza Understand en modo profundo (completo)
│
▼
UNDERSTAND (modo profundo / arqueológico, repo completo)
Skills: understand-deep-role + legacy-patterns + [knowledge skills]
+ project-constraints(vacío)
Ext:    plan-guard + session-observer
│
Produce:
· ARCHAEOLOGY.md
· INTENT.md (borrador — nivel de confianza por sección)
· HEALTH_MAP.md (análisis profundo de todas las zonas)
· health/zones/* para zonas complejas
· TRIAGE.md (propuesta inicial)
│
[CHECKPOINT 1] ──► Director valida y corrige INTENT.md
Director revisa TRIAGE.md
INTENT.md firmado → disponible para Decide Agent
│
▼
DECIDE (modo estratégico — arquitectura objetivo)
Lee: ARCHAEOLOGY.md + INTENT.md(validado) + TRIAGE.md
│
Produce:
· ARCH_TARGET.md
· DELTA.md (gap completo entre arqueología y objetivo)
· Propuesta CONSTRAINTS.md + CONVENTIONS.md iniciales
│
[CHECKPOINT 2] ──► Director aprueba ARCH_TARGET.md
Director produce CONSTRAINTS.md + CONVENTIONS.md
│
Sistema listo para operar en modo legacy
WORKFLOW_STATE.md: "legacy-ready"
```

## ---

## Flujo 6: Emergency Fix en Código Legacy
*La variación más delicada: urgencia vs. seguridad*


### El conflicto de diseño central

Este flujo pone en tensión dos invariantes del sistema: la urgencia de producción y el principio de que el Act
Agent nunca toca código sin cobertura suficiente. El sistema no puede resolver esta tensión por sí solo —
necesita que el Director tome una decisión consciente y quede registrada.

### Lo que ve el Director

*"Hay un bug en producción en el módulo de facturación. Los cargos recurrentes no se están procesando."*

El Orchestrator no dramatiza pero es directo: *"El módulo de facturación tiene cobertura de tests
comprometida en el área de cargos recurrentes. Para un fix seguro necesito primero caracterizar el
comportamiento actual, lo que añade tiempo. Tienes dos opciones: [A] Fix con caracterización previa — más
lento pero seguro. [B] Fix directo — más rápido pero acepta el riesgo de regresión. Si eliges B, registro la
deuda contraída y marcamos el área para caracterización prioritaria después. ¿Cuál?"*

Esta es la decisión más importante del flujo y el Director la toma con información completa, no bajo presión
invisible. El sistema no decide por él ni en silencio elige la opción más rápida.

Si el Director elige B, el scope-enforcer pasa a modo estricto — precisamente porque sin la red de
characterization tests, cualquier fichero no autorizado explícitamente es un riesgo mayor. La compensación
es: menos cobertura de tests, más restricción de scope.

Tras el fix, la deuda contraída se registra automáticamente en `DEBT.md` con prioridad alta, y el Orchestrator
añade una tarea de caracterización al `TRIAGE.md` para el siguiente ciclo.

### Lo que ocurre en el sistema

```
Director: "Bug en producción — cargos recurrentes."
│
Orchestrator
├─ Consulta HEALTH_MAP.md zona "facturación/recurrentes"
│ → tests: comprometido
├─ Presenta opciones A y B al Director
└─ Espera decisión
│
┌──────────────────┬──────────────────┐
│   Opción A       │   Opción B       │
│ (con cobertura)  │ (sin cobertura)  │


## │ │ │

## ▼ ▼ │

ACT(caracterización) scope-enforcer       │
│                 modo ESTRICTO       │
▼ │ │
DECIDE(micro DDR)      ▼ │
│              DECIDE(micro DDR)      │
▼ │ │
ACT(normal)            ▼ │
│              ACT(estricto)          │
└──────────┬───────┘ │
│ │
▼ │
VERIFY                        │
(regression si opción A)      │
│ │
[CHECKPOINT] ──► Director aprueba fix
│
▼
Si opción B:
· DEBT.md: nueva entrada, prioridad alta, deuda consciente
· TRIAGE.md: tarea de caracterización añadida automáticamente
· HEALTH_MAP.md: zona marcada con flag "fix-sin-cobertura"
que el Orchestrator incluirá en el próximo contexto
de trabajo sobre esa zona
```

## ---

## Los Patrones Transversales

Mirando los seis flujos juntos, emergen tres patrones que el sistema aplica consistentemente:

**El Orchestrator siempre informa antes de actuar.** Cuando el sistema detecta algo que cambia el plan
implícito del Director (zona comprometida, cobertura insuficiente, riesgo de regresión), lo dice antes de
empezar, no después de fallar. El Director puede tomar una decisión informada, no descubrir una sorpresa en
el Audit Report.

**Cada checkpoint tiene exactamente un artefacto principal.** El Director nunca revisa dos cosas a la vez en
un checkpoint. Si hay dos artefactos que revisar, son dos checkpoints separados. Esto hace que cada
decisión del Director sea atómica y rastreable: sabe exactamente qué aprobó y cuándo.


**Los desvíos del happy path se registran, no se ocultan.** Una decisión de ir con opción B en el Flujo 6, una
deuda advisory que se deja en DEBT.md, un override manual del Director sobre el Health Map — todo queda
registrado con fecha, razón, y consecuencias esperadas. El sistema no pretende que todo fue según el plan.
Esa honestidad es la que hace que `archbase/` sea útil como memoria institucional a largo plazo.



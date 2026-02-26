# ArchAgent — User Guide
## Guía de Usuario, Operación y Flujos de Trabajo

> Documento de producto para uso diario de ArchAgent sobre Pi.

---

## 1. ¿Qué es ArchAgent?

ArchAgent es un sistema multi-agente orientado a arquitectura que corre como **Pi Package**.

Su objetivo es que el desarrollo asistido por IA:
- respete arquitectura y restricciones del proyecto,
- tome decisiones de diseño explícitas (DDR),
- implemente dentro de alcance controlado,
- y audite resultados antes de cerrar el ciclo.

Arquitectura operativa (siempre):
1. **Understand** (entender)
2. **Decide** (diseñar / DDR)
3. **Act** (implementar)
4. **Verify** (auditar)

---

## 2. Conceptos clave

### Director
Eres tú: quien define objetivos, aprueba/rechaza checkpoints y mantiene restricciones del proyecto.

### `archbase/`
Es la base de conocimiento viva del proyecto (arquitectura, decisiones, salud, workflow).

### DDR
Design Decision Record. Especificación de diseño que el Act Agent debe implementar.

### Health Map
Mapa de salud por zona, en formato **JSON canónico**:
- `archbase/health/HEALTH_MAP.json`

### Checkpoint
Pausa controlada del pipeline donde ArchAgent te pide una decisión:
- aprobar,
- rechazar con feedback,
- o pedir más análisis.

---

## 3. Comandos del sistema

### Inicialización y ejecución

#### `/arch:init`
Inicializa `archbase/` en el repo actual **en modo no destructivo** (solo crea faltantes, no sobreescribe archivos existentes) y lanza un **bootstrap de análisis profundo** con el agente Understand.

Al finalizar, abre un checkpoint para que revises el análisis inicial (`ARCH.md` y artefactos forenses si aplica).

#### `/arch:task <zone> | <objective>`
Lanza pipeline completo para una tarea.

Ejemplo:
```text
/arch:task src/auth | Add Google OAuth login
```

#### `/arch:review <zone>`
Ejecuta auditoría Verify standalone sobre una zona.

Ejemplo:
```text
/arch:review src/payments
```

---

### Estado, checkpoints y control

#### `/arch:status`
Muestra estado del workflow y resumen de salud por zonas (renderizado en widget, sin lanzar agente).

#### `/arch:logs`
Muestra el panel de logs runtime en el widget.

#### `/arch:logs-mode full|summary`
Controla el panel de logs:
- `full`: expande log completo,
- `summary`: compacta/oculta panel.

**Atajo:** `Ctrl+Shift+O` alterna entre FULL y SUMMARY.

#### `/arch:approve`
Aprueba checkpoint pendiente.

#### `/arch:reject <comentario>`
Rechaza checkpoint con feedback. Opcionalmente permite guardar feedback en `CONSTRAINTS.md`.

#### `/arch:more-analysis <request>`
Pide análisis adicional al agente actual en el checkpoint.

---

### Recuperación (Recovery MVP)

#### `/arch:resume`
Reanuda un workflow interrumpido desde el step actual (re-ejecuta ese step de forma segura).

#### `/arch:abort`
Aborta workflow activo y lo deja en `idle`.

---

## 4. Flujo de trabajo completo (end-to-end)

## 4.0 Bootstrap inicial del repositorio

1. Ejecuta:
```text
/arch:init
```
2. ArchAgent crea `archbase/` sin sobrescribir archivos existentes.
3. Lanza **Understand (deep)** sobre el repositorio completo.
4. Abre checkpoint de bootstrap para revisión de análisis inicial.
5. Tú decides:
   - `/arch:approve` para continuar y dejar el sistema listo,
   - `/arch:reject <feedback>` para pedir correcciones del análisis,
   - `/arch:more-analysis <request>` para profundizar antes de aprobar.

> Recomendación: después del bootstrap, revisa/ajusta `CONSTRAINTS.md` y `CONVENTIONS.md`.

## 4.1 Flujo normal (zona sana)

1. Director lanza tarea:
```text
/arch:task <zone> | <objective>
```
2. Understand analiza contexto de zona.
3. Decide genera DDR.
4. **Checkpoint DDR** (Director aprueba/rechaza/pide más análisis).
5. Act implementa según DDR aprobado.
6. Verify audita conformidad y calidad.
7. **Checkpoint Audit Report**.
8. Post-cycle update:
   - actualiza `HEALTH_MAP.json`,
   - registra deuda advisory,
   - marca DDR en índice,
   - archiva audit report.

---

## 4.2 Flujo en zona con riesgo/legacy

Si `HEALTH_MAP` indica problemas en dimensión de tests/alineación/impacto:
- se activa pipeline adaptativo,
- puede incluir characterization step,
- Decide puede ir en modo incremental,
- Verify añade señales de regresión/dirección.

Como Director, verás más checkpoints y contexto explícito de riesgo.

---

## 5. Qué revisar en cada checkpoint

### Checkpoint de DDR
Debes validar:
- que el diseño resuelve el objetivo,
- que respeta restricciones (`CONSTRAINTS.md`),
- que el alcance (Authorized Files) es correcto,
- que no fuerza decisiones abiertas al Act Agent.

Si falta algo:
```text
/arch:reject <feedback específico>
```

Si necesitas más profundidad:
```text
/arch:more-analysis <qué quieres que profundice>
```

---

### Checkpoint de Audit Report
Debes validar:
- findings blocking vs advisory,
- conformidad con DDR,
- riesgo de regresión,
- estado final para aceptar o iterar.

---

## 6. Estructura de `archbase/` (vista práctica)

- `knowledge/`
  - `ARCH.md`, `CONSTRAINTS.md`, `CONVENTIONS.md`, etc.
- `decisions/`
  - `DDR-*.md`, `_index.md`
- `health/`
  - `HEALTH_MAP.json` (**fuente de verdad**), `DEBT.md`, `zones/`
- `workflow/`
  - `WORKFLOW_STATE.json`, `audit-report-current.md`, históricos de audit

---

## 7. Buenas prácticas para Director

1. Define objetivos con zona + objetivo concreto.
2. Da feedback específico en rechazos (acción + motivo + restricción).
3. Mantén `CONSTRAINTS.md` y `CONVENTIONS.md` actualizados.
4. Usa `/arch:status` con frecuencia en tareas largas.
5. Si hay interrupción, usa primero `/arch:resume` antes de relanzar task.

---

## 8. Troubleshooting rápido

### “No pending checkpoint” al aprobar/rechazar
- Probablemente la sesión se interrumpió.
- Ejecuta:
```text
/arch:resume
```

### Workflow bloqueado en running/failed
- Ver estado:
```text
/arch:status
```
- Reanudar:
```text
/arch:resume
```
- O reset:
```text
/arch:abort
```

### No existe `archbase/`
- Inicializa (crea estructura + análisis profundo inicial):
```text
/arch:init
```

### Se interrumpió `/arch:init` durante el bootstrap
- Reanuda:
```text
/arch:resume
```
- O reinicia estado:
```text
/arch:abort
```

---

## 9. Ejemplo completo de uso

```text
/arch:init
# revisar checkpoint de bootstrap (ARCH inicial)
/arch:approve

/arch:task src/auth | Add Google OAuth login
# revisar DDR
/arch:approve
# revisar audit
/arch:approve
/arch:status
```

Con iteración por feedback:

```text
/arch:task src/billing | Refactor invoice generation
# checkpoint DDR
/arch:reject Falta restringir archivos autorizados y aclarar criterio de completitud
# nuevo checkpoint DDR
/arch:approve
# checkpoint audit
/arch:more-analysis Necesito detalle de regression risk en tests de integración
# nuevo checkpoint audit
/arch:approve
```

---

## 10. Resumen operativo

Si recuerdas solo esto:
- Arranca con `/arch:init`.
- Ejecuta con `/arch:task zone | objetivo`.
- Decide en checkpoints con approve/reject/more-analysis.
- Si algo se corta, usa `/arch:resume`.
- Health Map oficial siempre en `HEALTH_MAP.json`.

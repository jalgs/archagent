# DDR-INTERNA-001: Health Map, Recovery MVP y UX de Checkpoints

**Date:** 2026-02-26  
**Status:** Approved  
**Scope:** Núcleo Orchestrator + interacción Director

---

## Contexto

La síntesis unificada dejó tres decisiones críticas pendientes que bloquean la ejecución sin ambigüedad del plan MVP:

1. Formato operativo de `HEALTH_MAP` (`.md` vs `.json`).
2. Protocolo mínimo de recuperación de fallos (recovery).
3. UX final de checkpoints en la sesión Director.

Sin cerrar estas tres decisiones, el sistema puede funcionar, pero con inconsistencias de formato, reanudación frágil y fricción de uso en validaciones humanas.

---

## Decision

Se aprueban las siguientes decisiones:

### D1 — Formato canónico de Health Map
- **Único formato permitido:** `archbase/health/HEALTH_MAP.json`
- **No se genera ni mantiene versión Markdown** (`HEALTH_MAP.md`).

**Motivo:**
- Evitar conflictos y divergencia entre representaciones.
- Mantener una sola fuente de verdad parseable y determinista para el Orchestrator.

**Regla:** cualquier referencia operativa o de lectura del sistema debe apuntar a `.json`. Si existe un `.md` heredado, debe considerarse obsoleto.

---

### D2 — Recovery MVP (mínimo viable)
Se define recovery por reanudación segura desde estado persistido:

- Fuente de estado: `archbase/workflow/WORKFLOW_STATE.json`
- Campos mínimos requeridos en cada step:
  - `status`
  - `currentStep`
  - `currentRole`
  - `zone`
  - `activeDDRPath` (cuando aplique)
  - `pendingCheckpoint` (si aplica)
  - `updatedAt`

**Protocolo al arrancar Orchestrator:**
1. Si `status = waiting-checkpoint` y existe `pendingCheckpoint`, restaurar checkpoint y pedir decisión del Director.
2. Si `status = running`, ofrecer:
   - reanudar desde `currentStep` (re-ejecutando step actual de forma segura), o
   - abortar ciclo y volver a `idle`.
3. Si `status = failed`, mostrar causa y permitir relanzar desde step fallido o reiniciar ciclo.
4. Si `status = idle`, flujo normal.

**Garantía MVP:** reanudación funcional sin persistencia de sesiones hijas; el estado persistente vive en `archbase/`, no en memoria de sesión Pi.

---

### D3 — UX de checkpoints (sesión Director)
Se estandariza la interfaz en comandos slash + mensaje estructurado.

**Comandos canónicos Director:**
- `/arch:task <zone> | <objective>`
- `/arch:status`
- `/arch:approve`
- `/arch:reject <comentario>`
- `/arch:review <zone>`

**Formato de checkpoint:**
- Título: tipo de checkpoint + zona
- Artefacto asociado (ruta)
- Resumen breve automático
- Cuerpo completo del artefacto (expandible por scroll)
- Acción esperada explícita:
  - Aprobar
  - Rechazar con feedback
  - Solicitar análisis adicional

**Regla UX:** cada checkpoint valida un solo artefacto principal.

---

## Alternatives Considered

### A1 — Health Map solo en Markdown
**Descartada** por parseo frágil, mayor ambigüedad y mayor costo de mantenimiento para actualizaciones automáticas.

### A2 — Recovery con persistencia completa de sesiones hijas
**Descartada para MVP** por complejidad adicional. Se reevalúa en V2.

### A3 — UX de checkpoint con UI custom fuera de Pi
**Descartada para MVP** por costo y desviación del objetivo de aprovechar TUI nativa de Pi.

---

## Consecuencias

### Positivas
- Coherencia técnica inmediata entre docs e implementación.
- Menor fragilidad operativa en interrupciones.
- Menor fricción para el Director en aprobaciones.

### Trade-offs
- En MVP, reanudar step puede implicar re-ejecutar parte del trabajo del step en curso.
- Se requiere disciplina de idempotencia en operaciones post-ciclo.

---

## Implementation Notes (MVP)

1. Mantener `HEALTH_MAP.json` como única fuente de verdad.
2. Eliminar o ignorar cualquier `HEALTH_MAP.md` legado y estandarizar lecturas/escrituras sobre `HEALTH_MAP.json`.
3. Fortalecer escritura de `WORKFLOW_STATE.json` antes/después de cada transición relevante.
4. En arranque de extensión Orchestrator, detectar estado no-idle y publicar “recovery prompt” al Director.
5. Asegurar que `postCycleUpdate` sea idempotente (evitar duplicados en DEBT y archivado doble de reportes).

---

## Approval

Aprobado por el Director con la condición de D1 en formato exclusivamente JSON.

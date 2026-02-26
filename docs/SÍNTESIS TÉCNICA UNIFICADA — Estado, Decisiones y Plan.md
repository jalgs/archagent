# SÍNTESIS TÉCNICA UNIFICADA
## Estado del diseño, decisiones cerradas, decisiones pendientes y plan de implementación

---

## 1) Resumen Ejecutivo

ArchAgent queda definido como un sistema multi-agente arquitectónico sobre Pi con:
- **4 roles canónicos**: `Understand`, `Decide`, `Act`, `Verify`
- **Orquestación determinista en TypeScript** (SDK de Pi), no por LLM
- **`archbase/` como fuente de verdad** versionada junto al código
- **Adaptación por zona** según `HEALTH_MAP` (4 dimensiones)
- **Checkpoints humanos obligatorios** en decisiones críticas

Resultado: una arquitectura implementable con Pi real, con evolución gradual desde MVP hacia capacidades legacy completas.

---

## 2) Decisiones Cerradas (Aprobadas de facto por la documentación)

### D1. Arquitectura base
- Orchestrator = aplicación TypeScript (SDK Pi) que coordina sesiones especializadas.
- Agentes especializados = sesiones Pi creadas por `createAgentSession()`.
- El razonamiento vive en agentes; la coordinación vive en código determinista.

### D2. Modelo operativo unificado
- Siempre existe pipeline conceptual: **Understand → Decide → Act → Verify**.
- Lo que cambia es la configuración (profundidad, pasos extra, checkpoints), no los roles.

### D3. Detección por zona, no por repo
- No existe etiqueta global “legacy/no-legacy”.
- Se decide por **zona** con perfil de salud por 4 dimensiones:
  1) legibilidad estructural,
  2) confiabilidad de tests,
  3) predictibilidad de impacto,
  4) alineación arquitectónica.

### D4. `archbase/` como memoria institucional
- Versionado con el repo.
- Ownership explícito por artefacto.
- Invariantes explícitos (ej. Act no opera sin DDR aprobado).

### D5. Guardrails de ejecución
- `plan-guard` para evitar writes fuera de `archbase/` en roles no implementadores.
- `scope-enforcer` para limitar Act al alcance autorizado por DDR.
- Checkpoints como Promises resueltas por el Director (approve/reject/more-analysis).

### D6. Legacy como modo de operación, no sistema separado
- Understand profundo (arqueológico), Decide incremental (Baby Steps),
- Characterization tests como prerequisito cuando tests están comprometidos,
- Verify con regression + direction check.

### D7. Contexto: mezcla de estático + dinámico
- Skills de conocimiento genérico (estáticos, reutilizables).
- Contexto de proyecto/zona/DDR ensamblado dinámicamente por Context Assembler.

---

## 3) Decisiones Pendientes (a cerrar antes o durante MVP)

### P1. UX del Director (crítica)
Falta cerrar formalmente:
- comando(s) primarios,
- formato de checkpoint en TUI,
- cómo observar sesiones hijas,
- cómo inspeccionar estado global y por zona.

**Propuesta recomendada:** iniciar con comandos slash y mensajes estructurados en Pi, sin UI custom.

### P2. Recovery de fallos (importante)
Definir protocolo exacto para:
- caída de sesión a mitad de step,
- checkpoint pendiente tras reinicio,
- reanudación desde `WORKFLOW_STATE`.

**Propuesta recomendada:** reanudación desde último step completo + idempotencia en `postCycleUpdate`.

### P3. Paralelismo seguro (importante)
Definir lock registry para evitar colisiones de escritura entre Act agents concurrentes.

**Propuesta recomendada:** MVP sin paralelismo; activar en v2 con locking por path autorizado.

### P4. Convención final de artefactos workflow
Alinear si `WORKFLOW_STATE` y reportes son `.md` o `.json` en toda la arquitectura.

**Nota cerrada:** `HEALTH_MAP` queda decidido como **exclusivamente JSON** (`archbase/health/HEALTH_MAP.json`) por DDR-INTERNA-001.

---

## 4) Riesgos Reales

1. **Riesgo de prompting**: calidad del sistema depende de calibración de skills de rol.
2. **Riesgo de deriva documental**: si `archbase/` crece sin poda, baja señal/ruido.
3. **Riesgo UX**: si checkpoints son densos o ambiguos, el Director pierde velocidad.
4. **Riesgo de falsa seguridad**: cobertura alta no implica cobertura útil; mantener characterization como control real.

---

## 5) Plan de Implementación por Fases

## Fase MVP-1 (Base operativa)
Objetivo: flujo completo mínimo y usable.

Incluye:
- estructura `archbase/` mínima,
- 4 roles básicos operativos,
- comandos principales (`init`, `task`, `status`, `approve/reject`),
- guardrails (`plan-guard`, `scope-enforcer`),
- checkpoints DDR + Audit,
- `postCycleUpdate` básico.

Criterio de salida:
- ciclo end-to-end funcional en zona sana,
- artefactos persistidos,
- auditoría final legible y accionable.

## Fase MVP-2 (Detección y adaptación por zona)
Objetivo: comportamiento dinámico por salud de zona.

Incluye:
- `HEALTH_MAP` estable,
- Pipeline Configurator por dimensión,
- `Understand` profundo cuando corresponda,
- mode incremental para `Decide`,
- characterization pre-step cuando tests comprometidos.

Criterio de salida:
- el pipeline cambia automáticamente según zona,
- Director ve y confirma desvíos del happy path.

## Fase MVP-3 (Legacy operable)
Objetivo: soporte real para repos complejos.

Incluye:
- forensics (`ARCHAEOLOGY`, `INTENT`, `DELTA`),
- direction check y regression check,
- TRIAGE usable para priorización.

Criterio de salida:
- flujo L2/L3/L6 ejecutable con checkpoints claros.

## Fase V2 (robustez)
Objetivo: confiabilidad y escala.

Incluye:
- recovery formal,
- lock registry + paralelismo seguro,
- poda/archivo periódica de `archbase/`,
- telemetría mínima de pipeline (duración, retrabajo, reintentos).

Criterio de salida:
- reanudación sin pérdida,
- concurrencia sin colisiones,
- memoria institucional sostenible.

---

## 6) Contrato Operativo del Director

El Director solo hace 5 cosas:
1. Define intención de alto nivel.
2. Aprueba/rechaza checkpoints.
3. Mantiene `CONSTRAINTS` y `CONVENTIONS`.
4. Prioriza deuda en TRIAGE.
5. Ajusta manualmente el Health Map cuando tenga contexto superior.

Todo lo demás debe ser automatizado por Orchestrator + agentes.

---

## 7) Estado de cierre inmediato

`DDR-INTERNA-001` ya cierra estas decisiones:
1. `HEALTH_MAP` exclusivamente en JSON.
2. Protocolo de recovery mínimo para MVP.
3. UX base de checkpoints en sesión Director.

Próximo foco: ejecución técnica del recovery en runtime y cierre de convención de artefactos workflow.

# Comandos de ArchAgent — Comportamiento Técnico Interno

> Estado actualizado tras eliminar `sendUserMessage()` en comandos de observabilidad/checkpoints.

---

## Regla técnica central

En la implementación actual:

- **Sub-agente especializado** (Understand/Decide/Act/Verify) se lanza **solo** cuando se invoca `runStep(...)`.
- **Turno del agente de la sesión Director** se dispararía con `pi.sendUserMessage(...)`.
- Actualmente en `orchestrator.ts` se eliminó `sendUserMessage(...)`; por tanto, comandos de status/logs/checkpoint renderizan por UI (`setWidget`, `notify`, `setStatus`) y **no disparan turno del agente**.

---

## Tabla comando por comando

| Comando | ¿Lanza sub-agente (`runStep`)? | ¿Dispara turno del agente Director? | Operaciones internas principales |
|---|---:|---:|---|
| `/arch:init` | ✅ Sí (Understand deep) | ❌ No | Se encola en background (`runDetached`), adquiere lock, `ab.init()` no destructivo, marca workflow `running`, ejecuta `runStep` Understand deep, abre checkpoint en widget, al finalizar pasa a `idle` (o `failed`), libera lock. |
| `/arch:task <zone> | <objective>` | ✅ Sí (pipeline completo) | ❌ No | Se encola en background (`runDetached`), adquiere lock, valida estado, calcula pipeline (`configurePipeline`), ejecuta `executePipeline` (múltiples `runStep`), `postCycleUpdate`, libera lock. |
| `/arch:resume` | ✅ Sí (reanuda pipeline) | ❌ No | Se encola en background (`runDetached`), adquiere lock, lee `WORKFLOW_STATE`, recompone pipeline desde `currentStep`, re-ejecuta step actual, libera lock. |
| `/arch:review <zone>` | ✅ Sí (Verify standalone) | ❌ No | Se encola en background (`runDetached`), adquiere lock, ejecuta `runStep` Verify, checkpoint en widget, libera lock. |
| `/arch:abort` | ❌ No | ❌ No | Limpia resolver pendiente, limpia widget checkpoint, fuerza `idle`, libera lock (force), refresca widget/footer. |
| `/arch:verbose on|off` | ❌ No | ❌ No | Cambia bandera runtime de verbosity, registra evento, refresca widget. |
| `/arch:view compact|expanded` | ❌ No | ❌ No | Cambia densidad visual del widget runtime (`compact`/`expanded`), registra evento, refresca widget. |
| `/arch:logs` | ❌ No | ❌ No | Renderiza widget de logs en modo actual (`FULL` o `SUMMARY`) sin disparar turno de agente. |
| `/arch:logs-mode full|summary` | ❌ No | ❌ No | Fija modo de panel de logs. `full` deja log expandido persistente; `summary` lo compacta/oculta. |
| `/arch:status` | ❌ No | ❌ No | Lee `WORKFLOW_STATE`, `HEALTH_MAP.json` y lock actual; renderiza resumen en widget `archagent-output` y refresca runtime widget. |
| `/arch:approve` | ❌ (directo) | ❌ No | Resuelve Promise de checkpoint con `approved`; limpia widget de checkpoint; el step en curso continúa. |
| `/arch:reject <comentario>` | ❌ (directo) | ❌ No | Resuelve Promise con `rejected`; opcionalmente añade feedback a `CONSTRAINTS.md`; limpia widget checkpoint. |
| `/arch:more-analysis <request>` | ❌ (directo) | ❌ No | Resuelve Promise con `more-analysis`; step actual sigue con prompt de análisis adicional; limpia widget checkpoint en resolución. |

---

## Atajos de teclado

- `Ctrl+Shift+O` → alterna panel de logs entre `FULL` y `SUMMARY` en tiempo real.

## Widget/estado que se actualiza en runtime

- **Footer**: `ctx.ui.setStatus("archagent", ...)`
- **Widget runtime**: `ctx.ui.setWidget("archagent-runtime", ...)`
- **Widget de salida** (status/logs): `ctx.ui.setWidget("archagent-output", ...)`
- **Widget de checkpoint**: `ctx.ui.setWidget("archagent-checkpoint", ...)`

---

## Locking (concurrencia)

Lock de ejecución en `archbase/workflow/.lock` para comandos operativos largos (`init/task/resume/review`).

- Si el lock existe, se bloquea nueva ejecución y se informa propietario/comando.
- `abort` fuerza liberación del lock para recuperación.

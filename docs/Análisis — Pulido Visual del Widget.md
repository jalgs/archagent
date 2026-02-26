# Análisis — Pulido Visual del Widget ArchAgent

## Objetivo
Mejorar legibilidad y ergonomía del widget sin perder densidad informativa en ejecución larga.

---

## Estado actual

La UI de runtime ya está renderizada **por componente** (`setWidget` con factory) usando caja visual (`Box`) y texto estilado (`Text`).

Widget principal (`archagent-runtime`) muestra:
- encabezado tipo dashboard,
- icono semáforo por estado,
- rol, zona, progreso,
- verbose on/off,
- modo de vista (`compact`/`expanded`),
- último evento,
- checkpoint pendiente,
- cola de eventos adaptativa por modo.

Widgets secundarios (`archagent-output`, `archagent-checkpoint`) también se renderizan en caja visual.

Comandos/atajos disponibles:
- `/arch:view compact|expanded`
- `/arch:logs-mode full|summary`
- `Ctrl+Shift+O` alterna logs FULL/SUMMARY

Widget secundario (`archagent-output`) muestra salidas de `/arch:status` y `/arch:logs`.
Widget de checkpoint (`archagent-checkpoint`) muestra resumen y preview de artefacto.

---

## Oportunidades de mejora (UI/UX)

### 1) Encabezado visual consistente
Usar una primera línea compacta estilo dashboard:
- `ArchAgent | running | understand | 1/4 | lock: yes`

Beneficio: escaneo instantáneo del estado operativo.

### 2) Semáforo por estado (texto + icono)
- `idle` → `○`
- `running` → `▶`
- `waiting-checkpoint` → `⏸`
- `failed` → `✖`

Beneficio: lectura periférica rápida sin parsear texto largo.

### 3) Separadores y secciones fijas
Estructura recomendada en 4 bloques:
1. Estado actual
2. Contexto (zona/objetivo)
3. Último evento
4. Tail de eventos

Beneficio: menor “salto visual” entre updates.

### 4) Modo compacto vs expandido
Además de verbose:
- `compact`: 6–8 líneas máximas
- `expanded`: 15–25 líneas con tail amplio

Comando sugerido:
- `/arch:view compact|expanded`

### 5) Widget de checkpoint con preview plegable
Hoy se limita por truncado de líneas. Mejor:
- mantener preview corto,
- mostrar ruta completa,
- recomendar abrir el archivo con `read` manual para inspección total si hace falta.

Beneficio: evita saturar el editor y mejora rendimiento de render en artefactos largos.

### 6) Color semántico (si se decide)
Usar tema para diferenciar:
- warnings/checkpoint en ámbar,
- error en rojo,
- healthy en verde.

Nota: requeriría pasar a widget por componente (factory) para control fino de estilo.

### 7) Indicador de lock más visible
Mostrar lock en primera línea del widget y en status footer:
- `lock: by arch:task@timestamp`

Beneficio: elimina ambigüedad cuando comandos quedan bloqueados.

---

## Recomendación de implementación incremental

### Fase 1 (rápida, bajo riesgo)
- Reordenar líneas del widget runtime en bloques fijos.
- Añadir icono de estado.
- Añadir comando `/arch:view compact|expanded`.

### Fase 2 (mejora estética)
- Migrar runtime widget a factory component para color semántico.
- Mantener output/checkpoint widgets como texto plano por simplicidad.

### Fase 3 (UX avanzada)
- “Pinned checkpoint header” en footer mientras haya checkpoint pendiente.
- Navegación de logs por ventanas (`/arch:logs 200`, `/arch:logs from <timestamp>`).

---

## Criterios de éxito

- El Director identifica estado/rol/progreso en <2 segundos.
- Checkpoint pendiente es visible sin abrir comandos adicionales.
- Menos necesidad de `/arch:status` durante ejecución normal.
- No hay impacto perceptible en rendimiento de TUI en repos grandes.

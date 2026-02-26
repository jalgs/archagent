# IDEA — Director como moderador de Checkpoints

## Problema
Los checkpoints actuales muestran:
- una **vista previa cruda** del artefacto (DDR / Audit Report / etc.)
- y requieren que el usuario lea el documento para decidir **Approve / Reject / More-analysis**.

En la práctica, para artefactos largos esto es lento y aumenta el riesgo de aprobar sin comprender.

## Propuesta
Cuando el workflow entra en `waiting-checkpoint`, en lugar de obligar al usuario a leer el artefacto completo, el **Arch Director** actúa como “moderador” del checkpoint:

1) **Lee el artefacto** (DDR/Audit/etc.)
2) Produce un **resumen estructurado** y legible orientado a decisión
3) Presenta opciones claras:
   - Aprobar (y por qué sería razonable)
   - Rechazar (qué cambios concretos faltan)
   - Pedir más análisis (qué preguntas son relevantes)
4) El usuario responde en lenguaje natural (o con shortcuts).
5) El Director traduce la respuesta a una acción determinista:
   - `{type:"approve"}`
   - `{type:"reject", comment:"..."}`
   - `{type:"more-analysis", request:"..."}`

## Formato sugerido del resumen estructurado
- **Artifact:** ruta + tipo (DDR / Audit)
- **TL;DR:** 3-6 bullets
- **Decisiones/Trade-offs clave:** tabla corta
- **Riesgos/Impacto:** bullets
- **Scope / archivos afectados:** rutas
- **Preguntas abiertas:** bullets
- **Recomendación del Director:** (con un nivel de confianza)
- **Acciones disponibles:** (Approve/Reject/More-analysis) con ejemplos

## Consideraciones técnicas
- El resumen debe basarse en los meta-bloques parseables ya existentes:
  - `archagent-ddr-meta`
  - `archagent-audit-meta`
- Debe ser determinista/parseable para orquestación:
  - El Director emite un bloque `archagent-director-action` al resolver.
- Debe respetar scope y seguridad (no escribir fuera de `archbase/` al resumir).

## Beneficios
- Reduce fricción y tiempo de lectura.
- Mejora la calidad de las decisiones (menos aprobaciones “a ciegas”).
- Permite iteraciones guiadas (“reject con cambios”) sin que el usuario tenga que redactar prompts largos.

## No-objetivos (por ahora)
- No sustituye el artefacto: el documento completo sigue existiendo y puede abrirse.
- No elimina los shortcuts: siguen siendo el camino rápido.

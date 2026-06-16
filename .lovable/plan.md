# Aprender y respetar el patrón real de cada dominio confirmado

## Problema concreto
- Arturo responde desde `arturo@huau.cl` → el sistema **no** aprende el patrón de `huau.cl` porque `detectPattern()` solo conoce 3 formatos (`first.last`, `initial_last`, `initial_last_initial2`).
- Para Felipe Alcalde @ huau.cl, al no haber patrón guardado, el sistema inventa `falcalde@huau.cl` → rebota.
- Lo mismo pasa con dominios donde el formato real es `nombre_apellido@`, `nombreinicial@`, etc.

## Objetivo
Cuando ya **sabemos** que un mail funciona en un dominio (entregado, abierto, clickeado o respondido), **reconocer su formato exacto**, guardarlo en `domain_patterns` y usar ese mismo formato para cualquier persona nueva del mismo dominio — sin inventar variantes.

## Cambios

### 1. `src/lib/crossReference.ts` — ampliar `detectPattern()`
Agregar reconocimiento de todos los formatos comunes:

| Pattern | Ejemplo (Arturo Erlwein) |
|---|---|
| `first` | `arturo@huau.cl` ← caso del usuario |
| `first.last` | `arturo.erlwein@huau.cl` (ya) |
| `initial_last` | `aerlwein@huau.cl` (ya) |
| `initial.last` | `a.erlwein@huau.cl` |
| `first_last` | `arturoerlwein@huau.cl` |
| `first_initial` | `arturoe@huau.cl` |
| `last.first` | `erlwein.arturo@huau.cl` |
| `last` | `erlwein@huau.cl` |
| `initial_last_initial2` | `aerlweinx@huau.cl` (ya) |

Así, **cualquier mail confirmado** en un dominio queda asociado a un patrón identificable y se guarda en `domain_patterns`.

### 2. `src/lib/contactCleaner.ts` — `generateEmailByPattern()`
Agregar los `case` faltantes para todos los nuevos patrones, para que al aprenderlos se puedan reproducir en bases futuras.

### 3. `src/lib/contactCleaner.ts` — comportamiento cuando hay patrón confirmado
Ya hoy, si `confirmed=true`, MAIL1 usa el patrón aprendido y MAIL2-4 quedan vacíos. **Mantener** ese comportamiento — esto es lo que evita inventar.

Adicional: cuando hay patrón aprendido (aunque NO sea `confirmed`) y el dominio coincide, **MAIL1 = patrón aprendido siempre**. MAIL2-4 quedan como respaldo (otras variantes), igual que hoy.

### 4. `src/components/DomainPatternsPanel.tsx` — etiquetas
Agregar entradas en `patternLabels` para los nuevos patrones (`first` → "nombre", `last` → "apellido", etc.) para que se vean legibles en la UI.

### 5. Re-aprendizaje de patrones existentes
Los `delivered_contacts` que ya están en BD se vuelven a clasificar automáticamente la próxima vez que el usuario cruza una base con el Sheet (la función `crossReference` ya lee todo el histórico y reaprende patrones). No requiere migración.

## Resultado
- Próximo cruce con el Sheet → para todos los dominios con mails confirmados se aprende y guarda el formato correcto, incluyendo `arturo@huau.cl` → patrón `first` para `huau.cl`.
- Próxima base que cargues con alguien @huau.cl → MAIL1 = `felipe@huau.cl` (no `falcalde@`).
- Dominios sin ningún mail conocido → fallback actual sin cambios (no inventamos formato si no sabemos).

## Archivos a editar
- `src/lib/crossReference.ts` (detectPattern + generateEmailFromPattern)
- `src/lib/contactCleaner.ts` (generateEmailByPattern)
- `src/components/DomainPatternsPanel.tsx` (patternLabels)

Sin migraciones, sin edge functions, sin cambios de UI mayores.

# Validación del módulo de refrigeración comercial

Objetivo: comparar lo que calcula ElectroPro para equipos de refrigeración (cámaras, heladeras
exhibidoras, freezers) con un cálculo hecho a mano por un profesional matriculado, usando datos
de placa y mediciones reales del cliente.

## Fórmulas que usa el programa

| Concepto | Fórmula |
|---|---|
| Corriente de marcha de un equipo | I = P / (V × cos φ) |
| Corriente de marcha del grupo | suma de I × cantidad (simultaneidad 1) |
| Pico de arranque | I_marcha + (relación − 1) × I_unidad del compresor que más arranca |
| Curva de la térmica | la más sensible (B, C o D) con pico / In menor a 3, 5 o 10 |

La relación de arranque (LRA/RLA) viene del dato del fabricante. Si no está, el programa usa 5.

## Casos de referencia (ya verificados en `tests/refrigeration.cases.test.mjs`)

| Caso | Datos | Marcha | Pico | Curva con térmica de 16 A |
|---|---|---|---|---|
| A. Cámara 2 HP | 2200 W, 220 V, cos φ 0,8, relación 6 | 12,50 A | 75,00 A | C |
| B. 3 exhibidoras | 3 × 1200 W, 220 V, cos φ 0,85, relación 5 | 19,25 A | 44,92 A | B |
| C. 2 cámaras | 2 × 2200 W, 220 V, cos φ 0,8, relación 6 | 25,00 A | 87,50 A | — |

## Planilla para el matriculado

Completar con los datos de la placa de cada equipo del cliente y comparar con la columna del programa.

| Equipo | Potencia (W) | Tensión (V) | cos φ | Relación LRA/RLA | Cantidad | Marcha a mano (A) | Marcha programa (A) | Pico a mano (A) | Pico programa (A) | Térmica (A) | Curva a mano | Curva programa |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | | | |
| | | | | | | | | | | | | |

Diferencia aceptable: 2 % en corrientes. Cualquier diferencia mayor, o una curva distinta, se revisa
antes de dar el dato por bueno.

## Mediciones en el sitio (opcional, recomendado)

- Corriente real de marcha con pinza amperimétrica en cada compresor.
- Corriente de arranque, con registro en analizador de red, para confirmar la relación real.
- Temperatura ambiente y de la cámara durante la medición.

## Limitaciones conocidas

- La relación de arranque por defecto (5) es típica, no del fabricante. Usar el dato de placa.
- Los equipos del catálogo comercial tienen potencias de referencia. Reemplazarlas por la placa.
- La curva recomendada es una guía. Confirmarla con la curva que publica el fabricante de la térmica.
- No reemplaza el cálculo del profesional matriculado, que es quien firma el proyecto.

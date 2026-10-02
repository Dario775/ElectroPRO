# ElectroPro — Cálculos Eléctricos y Auditoría

Herramienta profesional para **electricistas e instaladores certificados**: auditoría de cargas, cálculo de
consumo y amperaje, factor de potencia, balanceo de fases, diagnóstico de instalaciones, presupuesto de
materiales y emisión de reportes PDF para el cliente.

Aplicación **SPA 100 % del lado del cliente**: no hay backend ni base de datos. Todos los datos del técnico y de
sus clientes viven en el `localStorage` del navegador, por lo que funciona sin conexión.

Origen: proyecto exportado de Google AI Studio (de ahí `metadata.json` y el `.env.example` heredado).

---

## Estado actual

Verificado en este repositorio:

| Comprobación | Comando | Resultado |
|---|---|---|
| Tipos (modo `strict`) | `npm run lint` | ✅ 0 errores (TypeScript 7.0.2) |
| Build de producción | `npm run build` | ✅ 2473 módulos → `dist/` |
| Sistema de diseño (tokens, tamaños, fuentes) | `node check-ui.mjs` | ✅ 29 archivos revisados, sin incumplimientos |
| Contraste WCAG AA en tema claro y oscuro | `node contrast.mjs` | ✅ 52 pares en verde |
| Lógica del recorrido (progreso y siguiente paso) | `npx tsx check-workflow.ts` | ✅ 11 escenarios (incluye dos acometidas) |
| Catálogo de productos y marcas | `npx tsx check-catalog.ts` | ✅ integridad + alta, edición y borrado |
| Módulo del plano de ubicación | `npx tsx check-plan.ts` | ✅ 146 comprobaciones |
| Render de las 14 pantallas con datos reales | `npx tsx render-views.tsx` | ✅ sin errores de ejecución |
| Render de la aplicación completa | `npx tsx render-check.tsx` | ✅ marca, navegación y estado inicial |
| Maquetación del PDF de presupuesto | `npx tsx check.ts` + `node verify.mjs` | ✅ 9 escenarios sin desbordes |
| Pruebas automatizadas del proyecto | — | ❌ No existen todavía |

---

## Requisitos

- **Node.js 20.11+** (probado con Node 24). Se usa `import.meta.dirname` en `vite.config.ts`.
- npm (hay `package-lock.json`; el proyecto se gestiona con npm).

## Puesta en marcha

```bash
npm install          # instala dependencias
npm run dev          # servidor de desarrollo en http://localhost:3000
npm run build        # build de producción en dist/
npm run preview      # sirve el build de dist/
npm run lint         # comprobación de tipos (tsc --noEmit)
npm run clean        # borra dist/
```

### No hace falta ninguna clave de API

A pesar de que `metadata.json` declara la capacidad `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` y de que
`.env.example` documenta `GEMINI_API_KEY`, **el código no realiza ninguna llamada a IA**: no importa
`@google/genai` en ningún archivo. La app es completamente offline y funciona sin `.env`.

El SDK `@google/genai` se conserva instalado como base para futuras funciones de IA (ver *Próximos pasos*).

### Nota sobre el entorno de desarrollo

- `.npmrc` (ignorado por git) apunta la caché de npm a `./.npm-cache` dentro del proyecto. Es una comodidad
  para entornos donde la caché global del usuario está restringida; en una máquina normal puede borrarse.
- `.env*` está en `.gitignore` salvo `.env.example`: nunca subas claves reales.

---

## Estructura del proyecto

```
.
├── index.html                     Shell HTML, fuentes (Inter, Chakra Petch, JetBrains Mono), meta/OG
├── vite.config.ts                 React + Tailwind 4 + alias '@' → raíz del proyecto
├── tsconfig.json                  TypeScript en modo strict, noEmit, jsx react-jsx
├── package.json                   Scripts y dependencias
├── metadata.json                  Metadatos de AI Studio (nombre, descripción, capacidades)
└── src/
    ├── main.tsx                   Punto de entrada React
    ├── index.css                  Entrada de Tailwind
    ├── App.tsx                    Estado global: clientes, perfil del técnico, pestaña activa
    ├── types/electrical.ts        Modelo de dominio completo (fuente de verdad de los tipos)
    ├── context/CurrencyContext    Conversión y formato USD ⇄ ARS con cotización configurable
    ├── data/defaultAppliances.ts  Catálogo semilla de ~50 artefactos por categoría
    ├── utils/
    │   ├── electricalMath.ts      Motor de cálculo eléctrico (funciones puras)
    │   ├── diagnosticEngine.ts    Evaluación de seguridad y plan de acción
    │   ├── supplies.ts            Acometidas múltiples: normalización y consultas por suministro
    │   ├── workflow.ts            Etapas, pasos, módulos y progreso del recorrido
    │   └── plan.ts                Geometría del plano: hojas, rejilla y vínculo con el relevamiento
    ├── services/
    │   ├── storageService.ts      Persistencia en localStorage + datos de ejemplo + migraciones
    │   ├── budgetGeneratorService.ts  Generación automática de presupuestos y catálogo de materiales
    │   ├── pdfReportService.ts    Reporte técnico de auditoría en PDF
    │   └── budgetPdfService.ts    Presupuesto en PDF
    └── components/
        ├── Header.tsx             Cabecera: selector de cliente y navegación por pestañas
        ├── AuditView.tsx          Inventario de cargas y consumos
        ├── PhaseBalanceView.tsx   Balance y auto-balanceo de fases
        ├── PanelsView.tsx         Tableros eléctricos, protecciones y jerarquía
        ├── DiagnosticView.tsx     Mediciones de campo, índice de seguridad y plan de trabajo
        ├── ConsumptionHistoryView.tsx  Facturación real vs. auditoría (con gráficas)
        ├── BudgetView.tsx         Presupuestos, materiales y estados
        ├── CalculatorsView.tsx    5 calculadoras eléctricas
        ├── ReportPreview.tsx      Vista previa e impresión del informe
        ├── PlanView.tsx           Módulo: plano de ubicación (lienzo, plantillas y PNG)
        ├── planSymbols.tsx        Plantillas de símbolos eléctricos dibujadas en SVG
        ├── ClientList.tsx         Cartera de clientes + copia de seguridad JSON
        ├── ClientModal.tsx        Alta/edición de cliente y datos tarifarios
        └── SettingsModal.tsx      Perfil del técnico, moneda y datos de ejemplo
```

### Convenciones

- **Dominio en español** (nombres de tipos, campos y textos de UI); comandos y código de infraestructura en inglés.
- Todo tipo de dominio se declara en `src/types/electrical.ts`; los componentes no definen tipos de negocio propios.
- La lógica de cálculo vive en `src/utils/*` como **funciones puras** (sin React, sin estado): es el lugar natural
  para empezar a escribir pruebas.
- `src/services/*` concentra efectos secundarios: almacenamiento, generación de PDF y presupuestos.
- Un componente por pestaña, con Tailwind en línea y `lucide-react` para iconografía.
- Importaciones internas con el alias `@/`.

---

## Modelo de dominio

`ClientRecord` es la raíz de datos: un cliente concentra su suministro y todo el trabajo de auditoría.

- **Suministro**: `serviceType` (1F/2F/3F + N), `nominalVoltage` (L-N), `lineVoltage` (L-L), `mainBreakerAmps`,
  `kwhCost`, `fixedCharge`, `currency` (`USD` | `ARS`).
- **Cargas** (`ApplianceLoad[]`): artefacto, categoría, cantidad, potencia con su unidad (`W`/`kW`/`HP`/`VA`) y su
  equivalente normalizado en vatios, factor de potencia, tensión, sistema y fase asignada
  (`L1`, `L2`, `L3`, `L1-L2`, `L2-L3`, `L3-L1`, `3F`), circuito, breaker, tablero, horas/día y días/mes.
- **Tableros** (`ElectricalPanel[]`): jerárquicos mediante `parentPanelId`; breaker de cabecera (polos, curva,
  poder de corte), diferencial (amperaje, sensibilidad, polos), DPS, barras de tierra y neutro, módulos DIN,
  alimentador (calibre, material, longitud), estado físico, puntos calientes y rotulado, más mediciones propias.
- **Mediciones de campo** (`FieldMeasurements`): tensiones L-N y L-L, corrientes por fase y neutro, resistencia de
  puesta a tierra, presencia de diferencial, jabalina y DPS, signos térmicos, estado del aislamiento, antigüedad y
  calibre del alimentador.
- **Diagnóstico** (`DiagnosticResult`): índice de seguridad 0-100, nivel de riesgo, desbalances de tensión y
  corriente, estado del neutro, sobrecarga del alimentador y plan de acción priorizado.
- **Consumo** (`MonthlyConsumptionRecord[]`): kWh facturados por mes, costo, proyección y notas.
- **Presupuestos** (`ProjectBudget[]` + `activeBudgetId`): varios por cliente, con ítems tipados
  (material / mano de obra / equipo / trámite), cantidades, precios unitarios, markup, impuestos, descuentos,
  condiciones de pago, plazo y garantía.
- **Perfil del técnico** (`TechnicianProfile`): nombre, matrícula, empresa, contacto, moneda, cotización USD→ARS,
  tarifa kWh y tensión por defecto.

---

## Funcionalidades

Todas las pantallas son pasos del recorrido salvo las marcadas como **(módulo)**, que son herramientas que se usan
cuando hacen falta y no cuentan para el progreso (ver *Módulos* más abajo).

| Pantalla | Qué resuelve |
|---|---|
| **Auditoría de Cargas** | Alta de artefactos desde catálogo o manual, normalización a vatios, corriente y consumo mensual, costo proyectado y verificación contra el breaker principal |
| **Balance de Fases** | Reparto de cargas por fase, desbalance NEMA, corriente de neutro y **auto-balanceo** automático de cargas entre L1/L2/L3 |
| **Tableros & Esquema** | Inventario de tableros con protecciones, jerarquía entre ellos y mediciones por tablero |
| **Diagnóstico & Plan** | Mediciones in situ → índice de seguridad, nivel de riesgo y plan de acción priorizado (crítica/alta/media/preventiva) con materiales y horas estimadas |
| **Historial de Consumo** | Facturación mensual real vs. consumo calculado por el inventario de cargas, con gráficas y "diagnóstico forense" (detecta fugas a tierra, medidor descalibrado o cargas no declaradas) |
| **Presupuesto & Materiales** | Presupuesto generado automáticamente desde tableros, cargas y diagnóstico; **catálogo de 90 productos por marca** (filtrá por marca, categoría o búsqueda y agregá con un clic), markup, impuestos, descuentos, estados y PDF |
| **Calculadoras Eléctricas** | 1) Dimensionado de conductores, 2) Caída de tensión, 3) Breaker + cable, 4) Banco de capacitores (corrección de cos φ), 5) Ley de Ohm |
| **Reporte** | Vista previa e informe técnico PDF: datos del cliente y suministro, tabla de fases, observaciones, recomendaciones, anexo de diagnóstico y firmas |
| **Plano de ubicación** (módulo) | Dibujo de la planta del inmueble (paredes, puertas, ventanas y aberturas) y ubicación de tableros, tomas, luces y artefactos con plantillas de símbolos; admite una foto o el plano real como fondo y se baja en PNG o se imprime |
| **Clientes** (módulo) | Cartera de clientes, alta/edición y **exportar/importar copia de seguridad en JSON** |

---

## Interfaz: sistema de diseño y flujo guiado

La interfaz se reorganizó alrededor de **cómo se trabaja de verdad**, no de una lista de pantallas.

### Navegación por etapas

Antes había nueve pestañas planas que mezclaban pasos del trabajo con herramientas sueltas, sin indicar el orden.
Ahora el recorrido tiene cuatro etapas y la aplicación dice siempre **qué falta y cuál es el próximo paso**:

| Etapa | Pasos |
|---|---|
| **1. Relevar el inmueble** | Suministro y acometida · Tableros y protecciones · Mediciones en el lugar · Cargas y consumos · Facturas anteriores |
| **2. Analizar** | Balance de fases · Calculadoras eléctricas (herramienta) |
| **3. Presupuestar** | Presupuesto y materiales |
| **4. Entregar** | Informe para el cliente (herramienta) |

Los pasos del relevamiento siguen **el orden en que se recorre la instalación en obra**: primero se identifica el
suministro (medidor, acometida, tensiones y térmica general), después se abren los tableros, después se mide con la
pinza y el telurómetro, después se recorre el inmueble cargando los artefactos y al final se cargan las facturas.

- El estado de cada paso (`pendiente` / `en curso` / `listo`) se **deriva de los datos del cliente**
  (`src/utils/workflow.ts`), no de un estado paralelo que se pueda desincronizar. El paso de balance se completa
  cuando el desbalance real entre fases entra en tolerancia, calculado con el mismo motor que usa la vista; el de
  suministro, cuando el técnico confirma en el sitio los datos de la acometida.
- En escritorio la navegación es una barra lateral con el progreso y el botón de siguiente paso; en móvil son dos
  filas de botones (etapas arriba, pasos de la etapa activa abajo) más una barra inferior con la acción siguiente.
- La franja de contexto de cada vista indica la etapa, si el paso está completo y qué falta concretamente.

### Módulos: lo que no es un paso

Hay dos pantallas que **no son pasos del recorrido** y por eso no se completan ni cuentan para el progreso: el **plano
de ubicación** y la **gestión de clientes**. Se usan en cualquier momento, así que viven en su propia lista
(`APP_MODULES` en `src/utils/workflow.ts`), separadas de las etapas por una línea en el menú lateral.

- El módulo se distingue del paso en los tipos: `ViewId = StepId | ModuleId`, con `isModuleView()` para consultarlo.
- Al entrar en un módulo **no se muestra la franja de contexto** (no hay etapa ni "falta completar"), y en móvil la
  segunda fila de botones pasa a mostrar los módulos en lugar de los pasos de la etapa.
- Agregar un módulo es una línea en `APP_MODULES` más su vista: no toca el progreso, el próximo paso ni el estado de
  ningún cliente.

### Tema claro y oscuro

- Los colores ya no se escriben crudos (`bg-slate-900`), sino a través de **tokens semánticos**
  (`bg-surface`, `text-muted`, `border-hairline`) definidos en `src/index.css`.
- **Moneda: pesos argentinos por defecto.** La app arranca en ARS (tanto la vista como los clientes nuevos) y el dólar
  se elige a mano desde la barra superior, con la cotización cargada para convertir todos los importes.
- El tema se aplica con `data-theme` en `<html>`, se guarda en `localStorage`, respeta la preferencia del sistema y
  se fija antes del primer pintado (script en `index.html`) para que no haya destello.
- Los valores del tema oscuro son **idénticos** a los colores que ya usaba la aplicación, así que la migración de
  las 9 vistas (2.895 reemplazos en 13 archivos) no cambió el aspecto en oscuro.
- Verificación objetiva: 52 pares texto/fondo comprobados contra WCAG AA en ambos temas
  (`.devtools/contrast.mjs`), incluido el borde de los campos de formulario como elemento de control.

### Legibilidad

- **Nada por debajo de 12 px**: se eliminaron las 165 clases de 9, 10 y 11 px que hacían que la interfaz se viera
  apretada. La base del cuerpo es 15 px.
- Primitivas de UI propias (`src/components/ui/`): `Button`, `Card`, `SectionHeader`, `Badge`, `Stat`, `Callout`,
  `EmptyState`, `ProgressBar`, `Modal`, `Field`, `TextField`, `NumberField`, `SelectField`, `SwitchField`,
  `SegmentedControl` y `HelpTip`.
- Los campos técnicos explican qué son: etiqueta siempre visible, unidad dentro del campo, valores frecuentes como
  atajos (110/220/380 V) y ayuda desplegable para la jerga (cos φ, NEMA, DIN, curva C).

### Formularios y campos técnicos

Todos los formularios técnicos pasaron a las primitivas del sistema, con etiqueta siempre visible, unidad dentro del
campo, valores frecuentes como atajos y explicación de la jerga:

| Formulario | Qué aporta ahora |
|---|---|
| **Suministro y acometida** (`SupplyView`) | Primer paso del relevamiento: tipo de acometida, tensiones y térmica general, con atajos de los suministros habituales y confirmación en el sitio |
| **Carga de equipos** (`AuditView`) | Cuatro bloques numerados y **resultado en vivo**: corriente, consumo y costo mientras se escribe, con aviso si el disyuntor queda chico |
| **Catálogo de equipos** | Cada tarjeta anticipa qué va a pasar: "se agrega a L2 a 220 V · demanda 8,4 A", calculado con la misma función que hace el alta |
| **Mediciones en el lugar** (`DiagnosticView`) | Tensiones, corrientes y estado físico en tres bloques, con el criterio aplicado explicado (25 Ω de puesta a tierra, caída en el tomacorriente más lejano) |
| **Tableros** (`PanelsView`) | Cinco bloques (identificación, cabecera, diferencial, alimentador, estado) con aviso en vivo comparando la carga conectada con la térmica de cabecera |
| **Ficha de cliente** (`ClientModal`) | Cuatro secciones con las tensiones, la térmica general y las tarifas con unidad y ayuda |
| **Ajustes del técnico** (`SettingsModal`) | Identificación profesional, valores por defecto y cotización, con la advertencia de qué reemplaza el botón de datos de ejemplo |

### Bloques plegables (divulgación progresiva)

Tener todo abierto a la vez abrumaba. Ahora los bloques de contenido son plegables con el componente `Collapsible`:
cerrados muestran el título y **un resumen con los números reales**; al abrirlos aparece todo el contenido. El estado
de cada bloque se recuerda entre visitas (`electropro_ui_sections_v1` en el almacenamiento local).

| Vista | Bloques plegables |
|---|---|
| Cargas y consumos | Catálogo de equipos · Equipos cargados (con kW, kWh/mes y costo por mes en el resumen) |
| Tableros | Esquema del inmueble · Detalle del tablero (cabecera, circuitos y % de uso) |
| Mediciones | Mediciones en el lugar (abierto solo si faltan) · Plan de trabajo (tareas, horas y riesgo) |
| Historial | Curva de consumo · Diagnóstico facturación vs auditoría (con el desvío) · Desglose mes a mes |
| Presupuesto | Rubros (cantidad y subtotal) · Condiciones y totales (total, impuestos y validez) |
| Balance de fases | Reasignación de circuitos entre fases (desbalance actual) |
| Informe | Observaciones y recomendaciones |

El **menú lateral** usa el mismo principio: la etapa en la que estás aparece desplegada con sus pasos y las otras
quedan plegadas con su avance ("2 de 4"), de modo que la relación entre etapa y pasos se ve sin tener ocho pasos en
pantalla a la vez. Los pasos terminados se marcan con un tilde en lugar de un punto de color.

### Cabeceras de las vistas

Cada pantalla arranca con la misma cabecera: etapa del recorrido, título en lenguaje llano, explicación de qué se hace
ahí y las acciones principales. Los nombres se reescribieron sin jerga de sistema: "Repartir automáticamente" en lugar
de "Autobalancear Cargas", "Cargar facturas" en lugar de "Registrar / Editar Recibos", "Descargar el informe" en lugar
de "Descargar Reporte PDF".

### Comprobaciones automáticas de la interfaz

```bash
cd .devtools
node check-ui.mjs            # sin clases de color crudas, sin fuentes a mano, sin texto < 12 px
node contrast.mjs            # contraste WCAG AA de los tokens en ambos temas
npx tsx check-workflow.ts    # progreso y siguiente paso del recorrido
npx tsx check-catalog.ts     # integridad del catálogo + alta, edición, borrado y restauración
npx tsx check-plan.ts        # módulo del plano: estructura, plantillas, hoja, rejilla y vínculo con el relevamiento
npx tsx render-plan.tsx      # dibuja los planos de ejemplo en pdf-out/ (SVG y PNG) para mirarlos sin abrir la app
npx tsx render-views.tsx     # renderiza las 14 pantallas con datos reales y detecta errores
npx tsx render-check.tsx     # renderiza la aplicación completa (marca, navegación, estado inicial)
```

### Suministros múltiples (varias acometidas)

Un inmueble puede tener **más de una acometida**: un supermercado suele tener una para el sector de ventas y otra para
el depósito, cada una con su medidor, su tarifa y sus tableros. `ClientRecord.supplies` guarda la lista
(`ServiceSupply`: nombre, tipo de suministro, tensiones, térmica general, N° de medidor, ubicación, tarifa, moneda,
mediciones y confirmación en el sitio).

- **La primera de la lista es la principal** y sus datos se copian a los campos del cliente (`serviceType`,
  `nominalVoltage`, `lineVoltage`, `mainBreakerAmps`, `kwhCost`, `fixedCharge`). Así todo el código que ya usaba esos
  campos sigue funcionando, y `normalizeClient` mantiene la correspondencia. Los clientes guardados antes de este
  cambio se migran solos: se les crea una acometida principal con lo que tenían.
- Cada **tablero** se asigna a una acometida (`supplyId`) y cada **factura** también (`MonthlyConsumptionRecord.supplyId`),
  porque cada medidor factura por separado.
- Cada acometida tiene **sus propias mediciones de campo** y se verifica por separado. El paso «Suministro» del
  recorrido se completa cuando **todas** están confirmadas.
- **El balance de fases y el diagnóstico se calculan por acometida**: las fases de dos medidores distintos no se
  compensan entre sí, así que mezclarlas daría un resultado falso. Las vistas de balance, mediciones, historial,
  tableros y cargas tienen un selector de acometida.
- El **informe** (pantalla y PDF) detalla cada acometida con su medidor cuando hay más de una.
- El cliente de ejemplo «Supermercado El Trébol» trae dos acometidas para ver el caso funcionando.

---

## Módulo: plano de ubicación

Sirve para responder **dónde queda cada cosa**. Se dibuja la planta del inmueble —paredes, puertas, ventanas y
aberturas— o se usa una foto o el plano real como fondo, y sobre eso se ubica cada tablero, cada toma, cada punto de
luz y cada artefacto. Es un módulo aparte (`PlanView`), no un paso del relevamiento, porque se usa tanto antes de
presupuestar como después, y también para explicarle el trabajo al cliente.

### Estructura del inmueble

Sin paredes no hay forma de ubicarse: los símbolos quedarían flotando. Por eso el módulo incluye las cuatro
herramientas de estructura, que se dibujan directamente sobre el lienzo:

| Herramienta | Cómo se usa | Qué queda guardado |
|---|---|---|
| **Pared** | Se mantiene presionado y se arrastra de una punta a la otra | `kind: 'pared'` con sus dos extremos (`x, y` → `x2, y2`) y su `thickness` |
| **Puerta** | Un clic sobre una pared | `kind: 'puerta'`, con `length` (ancho), `hand` (lado hacia el que abre) y `wallId` |
| **Ventana** | Un clic sobre una pared | `kind: 'ventana'`, con `length` y `wallId` |
| **Abertura** | Un clic sobre una pared, para un paso libre | `kind: 'abertura'`, con `length` y `wallId` |

- Las **aberturas no se pegan a mano**: al hacer clic sobre una pared, la abertura se proyecta sobre el segmento, toma
  el giro y el espesor de esa pared y guarda su `wallId`. Después se arrastra **a lo largo** de la pared, sin
  despegarse ni salirse de las puntas.
- Al **mover o estirar una pared**, sus aberturas la siguen y conservan su lugar relativo (`followWall`). Al **borrar
  una pared** se van sus aberturas, para no dejar puertas fantasma.
- Las paredes se **enganchan entre sí**: el extremo que se suelta cerca de otra pared o de su esquina se pega a esa
  esquina, así los recintos cierran. Además, un trazo a menos de 8° de una horizontal, vertical o diagonal exacta se
  endereza solo.
- **Orden de pintado fijo** (`PLAN_LAYERS`): primero las paredes, después las aberturas que las cortan y al final los
  símbolos. El hueco de una puerta se hace pintando encima de la pared con el color de la hoja, sin calcular
  intersecciones: es simple, y como el orden no depende de cuándo se creó cada cosa, el hueco se ve siempre.
- Con una pared seleccionada aparecen **dos círculos en las puntas** para estirarla, además de los campos numéricos
  (extremos, espesor y largo calculado) en el panel del elemento.

### Rótulos

Los nombres de los elementos se dibujan en una **capa propia, encima de todo y sin girar**: si el texto fuera adentro
del grupo del elemento, una puerta de una pared de abajo quedaría con el nombre al revés y una de una pared lateral,
vertical. Además:

- El texto se **corre para adentro de la hoja** cuando el elemento está cerca del borde, así no se corta (el ancho se
  estima a partir del largo del texto y el cuerpo de letra).
- Cada rótulo se dibuja con un **halo del color de la hoja**, para que se lea aunque cruce una pared. Se hace pintando
  el mismo texto dos veces (primero el halo, después el texto) y no con `paint-order`, porque hay dibujantes de SVG que
  no lo soportan y, al aplicar el trazo encima del relleno, dejarían el plano sin ningún nombre.
- Los elementos que se llaman igual que su tipo (`Pared`, `Puerta`, `Tomacorriente`…) **no llevan rótulo**: el dibujo ya
  dice lo que son, y así el plano no se llena de texto repetido. El elemento seleccionado se destaca en azul y en
  negrita.

### Plantillas de símbolos eléctricos

`src/components/planSymbols.tsx` dibuja **14 plantillas en SVG** dentro de una caja de 32 × 32 centrada en el origen,
así se escalan y se giran sin perder nitidez. Se eligen de una paleta agrupada por rubro:

| Rubro | Plantillas |
|---|---|
| Tableros y medición | Tablero principal · Tablero seccional · Medidor / acometida |
| Puntos y llaves | Tomacorriente · Toma especial / fuerza · Punto de luz · Llave / interruptor · Combinación llave + toma |
| Puesta a tierra | Jabalina / puesta a tierra · Caja de paso |
| Artefactos | Aire acondicionado · Termotanque · Bomba · Motor / fuerza |

### Cómo se usa

Se trabaja como en un tablero de dibujo: **se elige una herramienta en la paleta y se trabaja sobre el lienzo**. La
barra del plano muestra la herramienta activa, y con «Terminar» (o **Escape**) se vuelve a seleccionar.

| Acción | Cómo |
|---|---|
| **Crear un plano** | «Nuevo plano»: nombre, proporción de hoja (A4 horizontal, A4 vertical o cuadrada), acometida y, si querés, ubicar de una vez los tableros y las cargas ya relevados |
| **Dibujar la planta** | Herramienta «Pared»: mantener presionado y arrastrar. El largo se ve mientras se dibuja y el trazo se engancha con las esquinas y se endereza en horizontales, verticales y diagonales |
| **Abrir un hueco** | Herramientas «Puerta», «Ventana» o «Abertura»: un clic sobre la pared. Queda alineada, con el hueco hecho y su ancho según el tipo; se arrastra a lo largo de la pared para correrla |
| **Ubicar un símbolo** | Un clic en la plantilla de la paleta y después un clic en el plano, dónde va. Se pueden ubicar varios seguidos sin volver a elegir |
| **Moverlo** | Se arrastra con el dedo o el mouse. Con la rejilla activada los elementos se alinean cada 25 unidades; las paredes mueven sus aberturas y las aberturas se corren por su pared |
| **Estirar una pared** | Se la selecciona y se arrastran los círculos de las puntas; las aberturas se acomodan solas |
| **Editarlo** | Al seleccionarlo se abre su panel: nombre en el plano, plantilla (símbolos) o espesor y extremos (paredes), ancho y lado de apertura (puertas y ventanas), posición, giro, acometida y notas |
| **Traer del relevamiento** | La lista muestra los tableros y las cargas que todavía no están en ningún plano, con «Ubicar» por ítem o «Ubicar todo». Cada elemento queda vinculado a su tablero (`panelId`) o a su artefacto (`loadId`) |
| **Fondo real** | Se carga una foto o el plano del arquitecto: la imagen se reduce sola (1400 px de ancho, JPEG) para ocupar poco lugar, la hoja toma su proporción y las paredes que dibujes quedan encima |
| **Entregarlo** | «Descargar PNG» (al doble de resolución, con encabezado de plano, cliente, acometida y fecha) o «Imprimir» (A4 apaisado) |

### Decisiones de diseño

- **El lienzo se dibuja siempre en blanco, como una hoja**, más allá del tema claro u oscuro de la aplicación: así lo
  que se ve en pantalla es exactamente lo que sale en el PNG y en la impresión, y no hay que duplicar los colores de
  los símbolos para dos temas.
- Las coordenadas se guardan **en unidades del lienzo (1000 de ancho)** y no en píxeles de pantalla: el plano se
  adapta solo a cualquier tamaño de ventana y, al imprimir, no se deforma.
- **El arrastre no escribe en el almacenamiento en cada cuadro**: mientras se mueve, el cambio vive en pantalla, y al
  soltar se guarda una sola vez. Importa cuando el plano tiene una imagen de fondo de varios cientos de kB.
- El plano **no duplica los datos del relevamiento**: los elementos traídos guardan el `panelId` o el `loadId`, así
  que si mañana se corrige la potencia de una carga, el plano sigue apuntando a la carga correcta.
- Si el inmueble tiene **varias acometidas**, conviene un plano por sector: al crear el plano se elige la acometida y
  tanto la lista de «traer del relevamiento» como la de elementos se filtran por ella. Es la forma más clara de
  mostrar qué depende de cada medidor.
- Los planos se guardan junto con el cliente (`ClientRecord.plans`), así que entran en la copia de seguridad JSON sin
  ningún cambio. `PlanElement.kind` es opcional y vale `symbol` cuando falta, de modo que **los planos guardados antes
  de que existieran las paredes se siguen abriendo igual**.
- Los planos de ejemplo del cliente «Supermercado El Trébol» traen la planta dibujada (cuatro paredes, puerta de
  entrada, vidriera, ventanas y el paso entre el salón y el depósito), para que se vea el uso real del módulo.

### Verificación

`.devtools/check-plan.ts` comprueba 146 casos: que exista una plantilla por cada tipo de símbolo y una herramienta por
cada tipo de estructura, la geometría de la hoja (A4 horizontal por omisión, 1000 × 707 unidades), el ajuste a la
rejilla y el recorte dentro del lienzo, la geometría de las paredes (largo, ángulo, distancia y proyección sobre el
segmento), el apoyado de una abertura sobre una pared (alineación, espesor heredado, deslizamiento sin salirse de las
puntas y seguimiento al mover o estirar la pared), el borrado en cascada de las aberturas, el enganche de esquinas y el
enderezado de trazos, el orden de pintado, el vínculo tablero/carga → elemento (incluida la deduplicación: un tablero
ya ubicado no se ofrece otra vez), el resumen del plano, que el módulo no altere el recorrido de 7 pasos, que el lienzo
se dibuje de verdad (SVG de 1000 × 707, el espesor de las paredes, el arco de la puerta, los rótulos con su halo en una
capa sin girar, las 14 plantillas y las cuatro herramientas en la paleta y sin franja de etapa) y que los planos del
cliente de demostración tengan la planta dibujada, con cada abertura apoyada y alineada con una pared existente del
mismo plano.

Como el plano es una función visual, `.devtools/render-plan.tsx` lo dibuja a `pdf-out/plano-N-<sector>.svg` y `.png`
reproduciendo exactamente lo que hace «Descargar PNG» (quitando los elementos que son solo de pantalla), para poder
mirarlo y compararlo sin abrir la aplicación.

---

## Motor de cálculo

`src/utils/electricalMath.ts` (funciones puras, sin dependencias de React):

- Conversión de unidades de potencia, incluido HP → W.
- Corriente por fase según sistema (1F/2F/3F) y potencia aparente/reactiva a partir del factor de potencia.
- Consumo diario y mensual en kWh y su costo.
- Balance de fases con desbalance según criterio **NEMA** y corriente de neutro.
- **Auto-balanceo** de cargas entre fases.
- Tablas de calibres AWG/mm² con ampacidad y lista de breakers comerciales.
- Caída de tensión, dimensionado conjunto de breaker + conductor, banco de capacitores y recomendación de conductor.

`src/utils/diagnosticEngine.ts` evalúa la instalación contra criterios tipo **NEC / IEEE / IEC**: desbalance de
tensión (límite 2 %), desviación de tensión respecto de la nominal, desbalance de corriente, caída de tensión en el
punto más alejado, resistencia de puesta a tierra, presencia de diferencial y DPS, signos térmicos, estado del
aislamiento y antigüedad. El índice de seguridad se acota entre 5 y 100 y se traduce en un nivel de riesgo
(`Bajo`, `Moderado`, `Alto`, `Peligro Crítico`), del que se deriva el plan de acción con horas estimadas.

`src/services/budgetGeneratorService.ts` convierte tableros, cargas y hallazgos del diagnóstico en partidas
presupuestarias, usando un catálogo de materiales por categoría (tableros, protecciones, cableado, puesta a tierra,
iluminación y tomas, mano de obra, certificación).

### Catálogo de productos por marca

El catálogo (`DEFAULT_MATERIALS_CATALOG`) tiene **90 ítems y 25 marcas comercializadas en Argentina**. Cada producto
lleva **una sola marca real** — antes decía cosas como «Schneider / ABB / Chint», que no permitía filtrar ni saber qué
se va a instalar — y se agrega al presupuesto con un clic.

| Rubro | Marcas incluidas |
|---|---|
| Protecciones (33 ítems) | Schneider Electric (Acti9), Siemens (5SL/5SV), ABB (S200/DS200), Legrand (DX3), Bticino, Sica, Genrod, Chint, Finder |
| Tableros y gabinetes (11) | Schneider Electric (Pragma, Kaedra), Genrod, Sica, Cambre, Gralf, Roker, Indelma (tableros de medidor) |
| Cableado y canalización (14) | Prysmian (Superastic, Sintenax), Cimet, Kalop, Tigre (caños y cablecanal), 3M |
| Puesta a tierra (6) | Fulgur, Copperweld, Genrod, Prysmian y Cimet (conductores de protección) |
| Iluminación y tomas (16) | Philips, Osram, Kalop, Jeluz, Roker, Daisa, Cambre, Bticino, Tenax |
| Mano de obra y trámites (10) | Sin marca: son servicios del propio técnico |

El modal del catálogo permite **filtrar por marca**, por categoría o buscar por producto o marca, y muestra cuántos
productos quedan de la lista completa.

#### El catálogo es editable y se guarda en el equipo

`src/services/catalogService.ts` copia el catálogo de fábrica al almacenamiento local la primera vez y a partir de ahí
el guardado es la fuente de verdad (`electropro_materials_catalog_v1`). Desde el mismo modal se puede:

| Acción | Cómo |
|---|---|
| **Agregar un producto** | «Nuevo producto»: descripción, detalle, marca (con las marcas ya cargadas como sugerencia), precio, categoría, tipo y unidad |
| **Editar** | El lápiz de cada fila: sirve tanto para corregir el precio de un producto de fábrica como para cambiar cualquier dato |
| **Borrar** | El tacho de cada fila, con confirmación. Aclara que los presupuestos ya emitidos no cambian |
| **Restaurar el catálogo de fábrica** | Vuelve a los productos y precios originales **conservando los productos propios** (quedan marcados como `custom`) |

Los productos propios se distinguen con el distintivo «propio» y el contador «N cargados por vos».

#### Marcas gestionables

La segunda pestaña del catálogo (**Marcas**) administra la lista de marcas, que también se guarda en el equipo
(`electropro_catalog_brands_v1`) y se siembra desde las marcas del catálogo de fábrica:

| Acción | Cómo se comporta |
|---|---|
| **Agregar una marca** | «Nueva marca». No admite repetidas (compara sin distinguir mayúsculas) |
| **Renombrar** | Actualiza **todos los productos** que la usaban, así el nombre nuevo sale en los próximos presupuestos |
| **Borrar** | Los productos que la usaban **se conservan con su precio, sin marca**; la confirmación avisa cuántos son |

Cada fila muestra cuántos productos tiene la marca. Además, si cargás un producto con una marca que no estaba en la
lista, se incorpora sola (`ensureBrand`), de modo que ninguna marca quede fuera del filtro. El campo «Marca» del
formulario de producto es una lista desplegable de las marcas cargadas.

> **Los precios de fábrica son de referencia en pesos.** El catálogo se guarda en ARS (`CATALOG_CURRENCY`), que es como
> se maneja la lista del proveedor; si el cliente o la vista están en dólares, los importes se convierten con la
> cotización cargada. Conviene corregir los precios con la lista real: cambian con el tiempo y según la zona y el
> volumen de compra. Se editan desde la app, producto por producto, sin tocar código.

---

## PDF de presupuesto: ajuste automático a una hoja

`src/services/budgetPdfService.ts` **no estima** el tamaño de letra según la cantidad de rubros (esa suposición hacía
que los presupuestos largos se desbordaran de la hoja y, al recortar las páginas sobrantes, **perdieran rubros en
silencio**). En su lugar mide el contenido real:

1. Se dibuja la tabla sobre un documento de prueba altísimo con `autoTable` y se lee su alto exacto
   (`lastAutoTable.finalY`), que es el mismo motor y las mismas opciones con que luego se dibuja de verdad.
2. Se recorre una escala tipográfica de 10 pt a 6,6 pt y se toma **el tamaño más grande que entra** en la banda
   disponible, de modo que un presupuesto corto salga con letra grande y uno largo reduzca solo lo necesario.
3. Si sobra espacio, se reparte aumentando el alto mínimo de fila (hasta 16 mm) y la separación hasta el bloque de
   cierre (hasta 16 mm): la hoja queda llena sin filas desproporcionadas.
4. Si el presupuesto no entra ni con la tipografía mínima legible, se **pagina sin perder rubros**: cabecera de
   continuación, cierre y firmas al final, y pie «Página N de M».

Bandas fijas de la hoja (A4 vertical, mm): cabecera `0–17,2` · ficha del cliente y suministro `18,5–34,5` · tabla
desde `36,5` · contenido hasta `250` (debajo se reserva el hueco para firmar a mano) · firmas en `266` · pie en
`286`.

Comportamiento medido con el banco de pruebas (rubros → cuerpo de tabla → hojas):

| Rubros | Cuerpo de tabla | Hojas | Fin del contenido |
|---|---|---|---|
| 4 | 10,0 pt | 1 | 184 mm |
| 9 | 10,0 pt | 1 | 246 mm |
| 15 | 8,8 pt | 1 | 247 mm |
| 22–24 | 7,6 pt | 1 | 247 mm |
| 45 | 6,6 pt (mínimo) | 2 (paginado) | — |

El ancho de columnas está calculado para que ni las etiquetas de tipo (`MATERIAL`, `M. OBRA`…) ni los importes se
partan en dos líneas, y el relleno de celda usa **poco margen horizontal y mucho vertical**: con un margen
horizontal grande, las columnas cortas (`#`, `Tipo`, `Cant.`) se quedaban sin ancho útil y el texto se rompía letra
a letra.

---

## Persistencia de datos

Todo se guarda en `localStorage` del navegador:

| Clave | Contenido |
|---|---|
| `electropro_clients_v1` | Lista de clientes con todo su trabajo de auditoría (incluye sus acometidas y sus planos de ubicación) |
| `electropro_active_client_id_v1` | Cliente activo |
| `electropro_technician_profile_v1` | Perfil del técnico |
| `electropro_active_currency_v1` | Moneda activa (USD/ARS) |
| `electropro_usd_ars_rate_v1` | Cotización USD → ARS |

- `StorageService.getClients()` **siembra dos clientes de ejemplo** la primera vez (una vivienda y un supermercado con
  dos acometidas y sus planos) y completa datos faltantes de registros antiguos (tableros por defecto, presupuesto
  inicial, planes y acometidas), actuando como migración.
- El botón de restablecer datos de ejemplo ejecuta `localStorage.clear()` y **borra todo**: antes de usarlo,
  exporta una copia desde la pestaña **Clientes** (genera `ElectroPro_CopiaSeguridad_<fecha>.json`).
- Los datos son locales al navegador: no se sincronizan entre dispositivos ni sobreviven al borrado del
  almacenamiento del sitio.

---

## Próximos pasos (deuda técnica conocida)

1. **Pruebas**: no hay ninguna. Empezar por `electricalMath` y `diagnosticEngine`, que son funciones puras y
   concentran el riesgo real de errores de cálculo (Vitest encaja de forma natural con Vite).
2. **Bundle único de 1,42 MB** (399 kB gzip) en un solo chunk. Cargar las vistas pesadas con `React.lazy` +
   `Suspense` y/o separar vendors (`jspdf`, `recharts`).
3. **Componentes monolíticos**: `BudgetView.tsx` (93 KB), `CalculatorsView.tsx` (87 KB), `PanelsView.tsx` (65 KB)
   y `AuditView.tsx` (46 KB) son un solo archivo cada uno; conviene partir cada pestaña en subcomponentes y hooks.
4. **PDF duplicado**: `pdfReportService.ts` (informe técnico) y `budgetPdfService.ts` (presupuesto) repiten el
   encabezado, el branding, los helpers de texto ajustado y el bloque de firmas; extraer un módulo común. El
   presupuesto ya está rediseñado con medición real; el informe técnico sigue con posiciones fijas y arrastra los
   mismos defectos que tenía el presupuesto (importes con código de moneda que se parten y paginación forzada a una
   hoja recortando el sobrante).
5. **Texto de UI hardcodeado en español**: si se prevé uso en otros países, introducir una capa de i18n.
6. **Modales del presupuesto**: las cuatro ventanas de `BudgetView` (catálogo de materiales, alta de rubro, nuevo
   presupuesto y renombrar) todavía usan su propio envoltorio en vez del componente `Modal`, así que no cierran con
   Escape ni bloquean el desplazamiento del fondo como el resto.
7. **Vistas pendientes de pulir**: `CalculatorsView`, `ConsumptionHistoryView` y `BudgetView` ya usan los tokens, la
   tipografía y la cabecera del sistema, pero conservan sus tablas y bloques densos propios; conviene llevarlos a
   `Card`/`SectionHeader`/`Stat`.
8. **Panel de inicio por cliente**: falta una pantalla de resumen que responda "¿en qué estado está este trabajo?"
   con las cifras clave y el próximo paso, en lugar de entrar directo al inventario de cargas.
9. **Funciones de IA**: `@google/genai` está instalado y sin usar. Como la app es cliente puro, una clave de API
   incrustada en el frontend queda expuesta: cualquier función de IA necesita un backend o un proxy.
10. **Sin backend**: no hay sincronización entre dispositivos ni trabajo en equipo; evaluar exportación/importación
    como vía de traspaso mientras tanto.
11. **El plano no llega todavía al informe PDF**: el módulo exporta el PNG y lo imprime, pero `pdfReportService.ts`
    no lo inserta en el informe técnico del cliente. Es el paso natural siguiente: agregar el PNG del plano (o de
    cada acometida) como anexo del informe, ya que el archivo se guarda como data URL dentro del propio cliente.
12. **El plano no traza canalizaciones ni circuitos**: dibuja la planta (paredes, puertas, ventanas y aberturas) y
    ubica los símbolos, pero falta el recorrido de cada circuito desde el tablero (polilíneas con su rótulo `C-1`,
    `C-2`…) para que sirva también como esquema de cañerías, vinculado al circuito del relevamiento.
13. **El plano no tiene escala real**: los largos de pared se muestran en unidades del lienzo. Falta poder declarar el
    ancho real de la hoja (en metros) para que los largos y las distancias salgan en metros o centímetros y el PNG
    impreso sirva para medir sobre el papel.
14. **El plano no entra todavía en el informe PDF**: el módulo exporta el PNG y lo imprime, pero `pdfReportService.ts`
    no inserta el plano ni sus anexos en el informe técnico del cliente.

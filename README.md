# ElectroPro — Cálculos Eléctricos y Auditoría

Herramienta profesional para **electricistas e instaladores certificados**: auditoría de cargas, cálculo de
consumo y amperaje, factor de potencia, balanceo de fases, diagnóstico de instalaciones, presupuesto de
materiales y emisión de reportes PDF para el cliente.

Aplicación **SPA 100 % del lado del cliente**: no hay backend ni base de datos en la nube. Todos los datos del
técnico y de sus clientes viven en **IndexedDB** del dispositivo (`src/services/kvStore.ts`; migra solos los datos
que hubiera en `localStorage` y usa éste como respaldo si IndexedDB no está disponible), por lo que funciona sin
conexión.

### Aplicación instalable (PWA)

- `public/manifest.webmanifest` + íconos en `public/icons/`: se instala desde el navegador (Instalar / Agregar a
  pantalla de inicio) y se abre a pantalla completa. En Ajustes hay un botón para instalarla y el estado del
  almacenamiento.
- `public/sw.js`: service worker que guarda la aplicación en el dispositivo para abrirla sin red. El build
  (`vite.config.ts`) le estampa la versión; una versión nueva se descarga en segundo plano y la app avisa
  («Hay una versión nueva») antes de actualizar. Solo se registra en el build de producción.
- Publicación: son archivos estáticos (`npm run build` → `dist/`); sirve cualquier hosting estático con HTTPS
  (el `base` es relativo, funciona en la raíz o en una subcarpeta).
- Los datos **no salen del dispositivo**: no hay copia en otro lado. La copia de seguridad en JSON de la lista de
  clientes es la única forma de pasarlos a otro equipo.
- Aspecto nativo: letra fina (pesos de `index.css`), bordes de 0,5 px en pantallas de alta densidad, sin rebote de
  pantalla, áreas seguras para muescas y barra de gestos.

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
| Módulo del plano de ubicación | `npx tsx check-plan.ts` | ✅ 258 comprobaciones |
| Interfaz real en un navegador | `node capturas.mjs` | ✅ capturas + 0 errores de consola |
| Render de las 14 pantallas con datos reales | `npx tsx render-views.tsx` | ✅ sin errores de ejecución |
| Render de la aplicación completa | `npx tsx render-check.tsx` | ✅ marca, navegación y estado inicial |
| Maquetación del PDF de presupuesto | `npx tsx check.ts` + `node verify.mjs` | ✅ 9 escenarios sin desbordes |
| Pruebas automatizadas (cálculo eléctrico, diagnóstico y almacenamiento) | `npm test` | ✅ 23 pruebas con `node:test` |

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
├── index.html                     Shell HTML, fuentes, manifiesto e íconos de la PWA
├── vite.config.ts                 React + Tailwind 4, base relativa y sello de versión del service worker
├── tsconfig.json                  TypeScript en modo strict, noEmit, jsx react-jsx
├── package.json                   Scripts (dev, build, test, lint) y dependencias
├── metadata.json                  Metadatos de AI Studio (nombre, descripción, capacidades)
├── public/                        manifest.webmanifest, sw.js (sin conexión), favicon e íconos
├── tests/                         Pruebas con node:test (npm test)
│   ├── electrical.test.mjs        Motor de cálculo, criterios AEA y alimentador del diagnóstico
│   ├── panelTree.test.mjs         Árbol de tableros: orígenes, datos rotos y selectividad
│   ├── circuits.test.mjs          Circuitos: armado desde las cargas, edición y revisión AEA
│   ├── persistence.test.mjs       Guardado: clientes dañados, varias pestañas e importación
│   ├── projectFile.test.mjs       Archivo .electropro: formato, abrir, reemplazar, copia e indicador
│   ├── loadPlacement.test.mjs     En qué circuito va cada equipo nuevo y en qué fase y tensión
│   └── storage.test.mjs           Persistencia: fallos de escritura, reintentos y borrados
└── src/
    ├── main.tsx                   Punto de entrada: carga los datos, monta React y registra la PWA
    ├── pwa.ts                     Instalación y actualización de la aplicación
    ├── index.css                  Tailwind y tokens del tema claro/oscuro
    ├── App.tsx                    Estado global: clientes, perfil del técnico, vista activa
    ├── types/electrical.ts        Modelo de dominio completo (fuente de verdad de los tipos)
    ├── context/                   CurrencyContext (USD ⇄ ARS) y ThemeContext (tema claro/oscuro)
    ├── data/defaultAppliances.ts  Catálogo semilla de artefactos por categoría
    ├── utils/
    │   ├── electricalMath.ts      Motor de cálculo eléctrico (funciones puras)
    │   ├── aea.ts                 Criterios AEA 90364-7-771: secciones mm², térmicas IEC, factores, simultaneidad
    │   ├── diagnosticEngine.ts    Evaluación de seguridad y plan de acción
    │   ├── supplies.ts            Acometidas múltiples: normalización y consultas por suministro
    │   ├── panelTree.ts           Árbol de tableros de cada acometida (de quién se alimenta cada uno)
    │   ├── circuits.ts            Circuitos: armado desde las cargas, edición, revisión AEA y dónde va cada equipo nuevo
    │   ├── loadAssignment.ts      Fase y tensión de un equipo del catálogo según el suministro
    │   ├── workflow.ts            Etapas, pasos, módulos y progreso del recorrido
    │   ├── plan.ts                Geometría del plano: hojas, rejilla y vínculo con el relevamiento
    │   ├── history.ts             Deshacer y rehacer: pasos, agrupado y tope (puro y sin React)
    │   └── cx.ts                  Unión de clases CSS
    ├── services/
    │   ├── kvStore.ts             Almacenamiento en IndexedDB con respaldo en localStorage y reintentos
    │   ├── storageService.ts      Clientes, perfil, datos de ejemplo y migraciones
    │   ├── catalogService.ts      Catálogo de productos editable y guardado en el equipo
    │   ├── budgetGeneratorService.ts  Presupuesto automático y catálogo de materiales de fábrica
    │   ├── pdfReportService.ts    Informe técnico en PDF
    │   ├── budgetPdfService.ts    Presupuesto en PDF
    │   ├── planFileService.ts     Plano: guardar como, abrir y exportar a PDF
    │   ├── projectFileService.ts  Proyecto como archivo .electropro: formato, abrir, recientes y estado
    │   └── fileHandleStore.ts     Archivo vinculado a cada proyecto (para «Guardar» sobre el mismo)
    └── components/
        ├── AppShell.tsx           Cáscara: barra superior, navegación y franja de contexto
        ├── TopBar.tsx             Cliente activo, moneda y tema
        ├── FileMenu.tsx           Menú Archivo del proyecto e indicador de guardado
        ├── WorkflowNav.tsx        Navegación por etapas, pasos y módulos
        ├── PwaBanner.tsx          Avisos de instalación y de versión nueva
        ├── SupplyView.tsx         Suministro y acometidas
        ├── PanelsView.tsx         Tableros eléctricos, protecciones y jerarquía
        ├── PanelTree.tsx          Esquema del inmueble: medidor → principal → seccionales
        ├── CircuitsSection.tsx    Circuitos del tablero: revisión AEA, edición y descarga del unifilar
        ├── SingleLineDiagram.tsx  Esquema unifilar en SVG
        ├── DiagnosticView.tsx     Mediciones de campo, índice de seguridad y plan de trabajo
        ├── AuditView.tsx          Cargas, consumos y demanda simultánea
        ├── ConsumptionHistoryView.tsx  Facturación real vs. auditoría (con gráficas)
        ├── PhaseBalanceView.tsx   Balance y auto-balanceo de fases
        ├── CalculatorsView.tsx    Calculadoras: sección, caída de tensión, térmica y cable, capacitores, Ohm
        ├── BudgetView.tsx         Presupuestos, materiales y estados
        ├── MaterialCatalogModal.tsx  Catálogo de productos por marca
        ├── ReportPreview.tsx      Vista previa e impresión del informe
        ├── PlanView.tsx           Módulo: plano de ubicación (lienzo, herramientas y propiedades)
        ├── PlanMenuBar.tsx        Menús del plano: Archivo, Edición, Ver, Organizar y Plano
        ├── planSymbols.tsx        Plantillas de símbolos eléctricos dibujadas en SVG
        ├── planSite.tsx           Entorno del plano: calles, límites, norte y escala gráfica
        ├── ClientList.tsx         Cartera de clientes + copia de seguridad JSON
        ├── ClientModal.tsx        Alta/edición de cliente y datos tarifarios
        ├── SettingsModal.tsx      Perfil del técnico, moneda, instalación y datos de ejemplo
        └── ui/                    Primitivas: Button, Card, Collapsible, Form, Modal, ThemeToggle
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
| **Auditoría de Cargas** | Alta de artefactos desde catálogo o manual, normalización a vatios, corriente y consumo mensual, costo proyectado y verificación contra el breaker principal. Cada equipo se agrega **en un circuito**: elegido a mano, uno nuevo o **automático** (luces y tomas se suman a un circuito de su tipo que tenga lugar; aires, hornos y motores van en uno propio con térmica y cable de la AEA). La térmica se edita por circuito |
| **Balance de Fases** | Reparto de cargas por fase, desbalance NEMA, corriente de neutro y **auto-balanceo** automático de cargas entre L1/L2/L3 |
| **Tableros & Esquema** | Inventario de tableros con protecciones y mediciones; árbol real de tableros (medidor → principal → seccionales); **circuitos** de cada tablero revisados con la AEA (térmica, cable, sección mínima y caída de tensión) y **esquema unifilar** que se arma solo y se descarga en SVG |
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

### La pantalla: un programa de dibujo

El plano no se trabaja como un formulario, sino como un **programa de edición**: el lienzo está siempre en el medio y no
se mueve, y las herramientas van a los costados.

```
┌─ barra del plano: herramienta activa · planos · rejilla · pantalla completa · imprimir · PNG ─┐
├──────────────┬──────────────────────────────────────────────┬─────────────────────────────────┤
│ Herramientas │                  LIENZO                      │  Propiedades del elemento       │
│ (riel fijo,  │  (fijo, se ajusta al alto de la ventana)     │  Elementos del plano            │
│  con scroll) │                                              │  Traer del relevamiento         │
│              │  ─────────────────────────────────────────   │  Hoja y datos del plano         │
│              │  pie: qué hacer ahora · tamaño de la hoja    │  Fondo del plano                │
└──────────────┴──────────────────────────────────────────────┴─────────────────────────────────┘
```

- **El lienzo no se desplaza nunca**: el módulo ocupa exactamente el alto que queda de la ventana. La barra superior
  publica su altura real en la variable CSS `--app-header-h` (la mide con un `ResizeObserver`, porque en el teléfono
  cambia de alto al bajar el selector de cliente) y el módulo usa `calc(100dvh - var(--app-header-h) - 1.75rem)`. Los
  paneles laterales tienen su propio desplazamiento, así que la página no se mueve.
- **La hoja se ajusta sola, sin deformarse**: el SVG ocupa todo el recuadro y la hoja se adapta adentro conservando su
  proporción (`preserveAspectRatio="xMidYMid meet"`), como en cualquier editor. La zona libre alrededor es la «mesa»
  (`bg-sunken`), y sobre el blanco de la hoja se ve el plano. Todo lo que traduce clics a coordenadas del plano
  descuenta ese centrado, y los clics fuera de la hoja se ignoran.
- **Tres columnas**: riel de herramientas a la izquierda (176 px, con su propio desplazamiento), lienzo en el medio
  (todo el espacio restante) y panel de datos a la derecha (300 px). En el teléfono se apilan: primero el lienzo,
  después las herramientas y por último el panel.
- **El plano se abre con el menú del programa retirado**: es un espacio de trabajo, y así el lienzo gana los 280 px de
  la navegación lateral. El botón del riel (o la tecla `F`) lo vuelve a mostrar, y en la barra queda «Volver al
  recorrido» para seguir con el relevamiento.
- **El panel derecho usa pestañas**, no bloques plegables apilados: *Elemento* (datos de lo seleccionado, lista de lo
  dibujado y lo que falta ubicar del relevamiento), *Plano* (nombre, acometida, hoja, escala, fondo y resumen) y *Capas*
  (qué se ve). En una columna angosta, cinco acordeones apretados y un formulario a dos columnas —que era lo que había—
  dejaban los campos aplastados y los controles desbordados.
- **El formulario del elemento es a una sola columna**, agrupado por tema (Identificación · Medidas · Ubicación ·
  Presentación · Notas) con un título y una línea por grupo, campos a todo el ancho y los datos que se leen —largo de
  una pared, medida de una cota— en su propio recuadro. Los botones de duplicar y borrar van como íconos en el
  encabezado, con su atajo en la ayuda.
- **El nombre por omisión no se repite**: el campo arranca vacío con el nombre del tipo como ejemplo («Pared (por
  omisión)»), porque un elemento llamado como su tipo no lleva rótulo en el plano. Solo guarda un nombre propio.
- **Las medidas salen en metros** cuando el plano tiene escala: el largo de una pared se muestra como «7,80 m» con las
  unidades de la hoja y el ángulo como aclaración.
- **Barra compacta arriba** (una sola fila): volver al recorrido, herramienta activa, planos del cliente, deshacer y
  rehacer, contador de elementos, rejilla, orto, ayuda de atajos, mostrar u ocultar el menú, imprimir y descargar. La
  explicación de cada herramienta vive en el pie del lienzo y en la ayuda de la barra, para no gastar alto.
- **Los avisos son flotantes**: aparecen superpuestos abajo del lienzo y se cierran con la cruz, en lugar de empujar el
  dibujo hacia abajo cada vez que se coloca una puerta.
- El pie de la aplicación **se retira en el plano**: su alto entraría en la cuenta del lienzo y haría que la página se
  pueda desplazar.

### Escala real: de dibujo a medidas

Sin escala, un plano se mide «en unidades del lienzo» y no sirve para presupuestar un cableado. El plano guarda
`metersPerUnit` (cuántos metros mide una unidad) y **con eso todo lo demás sale en metros**:

| Herramienta | Cómo |
|---|---|
| **Calibrar** | Herramienta «Escala» (tecla `9`): se marcan dos puntos cuya distancia real se conoce —una pared, el ancho de un local— y se escriben los metros. Es el camino cuando el fondo es la **foto del lugar**. |
| **Ver la escala** | «Hoja y datos del plano» muestra el tamaño real de la hoja (por ejemplo 10,00 × 7,07 m), cuánto mide una unidad y la **escala de impresión** aproximada (1:30), que es lo que se anota en un plano. |
| **Medir** | Tecla `8`: se arrastra entre dos puntos y aparece un cartel con la distancia, el ángulo y Δx/Δy. **No deja nada dibujado**: es la cinta métrica del programa, y sirve para medir un tramo de cañería antes de presupuestarlo. |
| **Acotar** | Tecla `6`: la cota queda en el plano, con sus líneas de referencia, la línea corrida y el valor escrito en metros. Es la que permite leer un largo sobre el papel, sin instrumentos. |
| **Anotar** | Tecla `7`: una nota suelta, con **directriz** opcional hacia el lugar al que se refiere (`TD-01`, «PAT 41 Ω: rehacer»). |

Los planos de ejemplo ya vienen a escala (1 unidad = 1 cm): el salón mide 7,80 × 5,30 m y el depósito 7,80 m de ancho,
con sus cotas escritas en metros.

### Trazado y edición, como en un programa de dibujo

| Herramienta | Qué aporta |
|---|---|
| **Pared encadenada** | La pared sigue desde donde terminó la anterior: se hace clic en cada punta y la planta se arma de corrido. `Enter` o `Esc` cierran la cadena. El enganche hace lo demás: **esquinas**, **puntos medios**, **cualquier punto de una pared** y por último la rejilla (25 unidades) |
| **Orto** (tecla `O`) | Traba el trazo y el movimiento en horizontal y vertical, para no depender del pulso |
| **Zoom y desplazamiento** | La rueda acerca y aleja **donde está el puntero**; con `Mayús` desplaza; la barra espaciadora o el botón del medio del mouse arrastran el plano. El pie del lienzo tiene `−`, el porcentaje (que se toca para ajustar) y `+`, y `Z` ajusta a la ventana |
| **Selección múltiple** | Se arrastra un **recuadro** sobre el fondo y se selecciona todo lo que cruza; `Mayús`+clic suma o saca. La selección se mueve entera, y las paredes se llevan sus aberturas |
| **Portapapeles** | `Ctrl+C`, `Ctrl+X`, `Ctrl+V` y `Ctrl+D`, con las aberturas apuntando a la pared copiada y no a la original |
| **Simetría** | «Espejar ↔ / ↕» refleja la selección respecto de su centro, y la hoja de las puertas queda abriendo para el lado correcto |
| **Capas** | «Qué se ve» apaga la planta, los símbolos, las cotas o el fondo por separado: sirve para dibujar sobre una foto sin nada encima. El fondo admite **opacidad** (arranca al 65 % al cargarlo) |

La exportación **siempre sale con la hoja entera**: el zoom y el desplazamiento son para trabajar, no para el PNG.

### Atajos de teclado y deshacer

Se trabaja como en un programa de dibujo: el teclado hace el trabajo fino y **todo se puede deshacer**. La ayuda
completa está en el botón del teclado de la barra, o con la tecla `?`.

| Teclas | Qué hace |
|---|---|
| `Supr` / `Retroceso` | Borrar lo seleccionado (si es una pared, se lleva sus aberturas) |
| `Ctrl+Z` | Deshacer |
| `Ctrl+Mayús+Z` · `Ctrl+Y` | Rehacer |
| `Ctrl+C` · `Ctrl+X` · `Ctrl+V` | Copiar · cortar · pegar |
| `Ctrl+D` | Duplicar |
| `Flechas` | Mover 1 unidad · con `Mayús`, una rejilla (25 unidades) |
| `Ctrl+S` | Descargar el plano en PNG |
| `1` … `9` | Seleccionar · Pared · Puerta · Ventana · Abertura · Cota · Texto · Medir · Escala |
| `V` | Volver a seleccionar |
| `G` · `O` | Rejilla · Orto |
| `F` | Pantalla completa |
| `Rueda` · `Espacio`+arrastrar · `Z` · `+`/`-` | Zoom · desplazar · ajustar · acercar y alejar |
| `Esc` | Terminar la herramienta, cerrar la cadena, deseleccionar o salir de pantalla completa |
| `?` | Mostrar la ayuda de atajos |

- Las **teclas de herramienta y las flechas no intervienen mientras se escribe** en un campo: ahí el teclado se usa
  para escribir. `Ctrl+Z` y `Ctrl+Mayús+Z`, en cambio, funcionan siempre, porque deshacen el documento completo.
- El riel muestra **la tecla de cada herramienta** en un recuadro, así el atajo se descubre sin abrir la ayuda.
- Al borrar, el aviso dice que `Ctrl+Z` lo recupera: es la acción más fácil de lamentar.

**Deshacer y rehacer** (`src/utils/history.ts`) es una estructura **pura y sin React**: guarda la foto del estado
anterior a cada cambio y devuelve una copia nueva en cada operación, así se prueba sola (25 de las comprobaciones del
banco son suyas). Tres decisiones que importan:

- **Los cambios seguidos del mismo campo se agrupan en un solo paso**: escribir un nombre no deja veinte pasos de
  deshacer. Vale para los campos (`elemento:<id>`) y para mover con las flechas (`mover:<id>`); se agrupa dentro de una
  ventana de 900 ms.
- **Un arrastre anota un solo paso, y recién cuando el elemento se mueve**: un clic para seleccionar no ensucia la
  lista, y soltar no deja un paso por cuadro (durante el arrastre el cambio vive solo en pantalla).
- **Seguir trabajando descarta lo que había para rehacer**, que es lo que espera cualquiera que dibuja. El historial se
  recorta a 60 pasos, descartando el más viejo, y **se vacía al cambiar de cliente** (no se puede deshacer un cambio
  que fue de otra ficha).

### Cómo se usa

Se trabaja como en un tablero de dibujo: **se elige una herramienta en el riel y se trabaja sobre el lienzo**. La barra
del plano muestra la herramienta activa, y con «Terminar» (o **Escape**) se vuelve a seleccionar.

| Acción | Cómo |
|---|---|
| **Crear un plano** | «Nuevo plano»: nombre, proporción de hoja (A4 horizontal, A4 vertical o cuadrada), acometida y, si querés, ubicar de una vez los tableros y las cargas ya relevados |
| **Dibujar la planta** | Herramienta «Pared»: un clic en cada punta, encadenada; se engancha con las esquinas y los puntos medios, y se endereza sola. `Enter` o `Esc` terminan |
| **Abrir un hueco** | Herramientas «Puerta», «Ventana» o «Abertura»: un clic sobre la pared. Queda alineada, con el hueco hecho y su ancho según el tipo; se arrastra a lo largo de la pared para correrla |
| **Ubicar un símbolo** | Un clic en la plantilla del riel y después un clic en el plano, dónde va. Se pueden ubicar varios seguidos sin volver a elegir |
| **Medir y acotar** | «Medir» para una consulta sin dejar rastro, «Cota» para dejarla en el plano. Con la escala cargada, todo sale en metros |
| **Anotar** | «Texto»: se escribe en el panel y se le puede agregar una directriz hacia el lugar al que se refiere |
| **Mover** | Se arrastra con el dedo o el mouse. Con la rejilla activada el desplazamiento va en pasos de 25; con Orto se traba en un eje. Las paredes mueven sus aberturas y las aberturas se corren por su pared |
| **Estirar una pared** | Se la selecciona y se arrastran los círculos de las puntas; las aberturas se acomodan solas |
| **Elegir varios** | Un recuadro sobre el fondo, o `Mayús`+clic. Se mueven, se copian, se espejan y se borran juntos |
| **Editarlo** | Al seleccionarlo se abre su panel a la derecha: nombre, plantilla o espesor y extremos, ancho y lado de apertura, corrimiento de la cota, alto de letra, posición, giro, acometida y notas |
| **Traer del relevamiento** | La lista muestra los tableros y las cargas que todavía no están en ningún plano, con «Ubicar» por ítem o «Ubicar todo». Cada elemento queda vinculado a su tablero (`panelId`) o a su artefacto (`loadId`) |
| **Fondo real** | Se carga una foto o el plano del arquitecto (queda al 65 % de opacidad, ajustable), se **calibra la escala** sobre una distancia conocida y se dibuja encima |
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
- El módulo usa el **ancho completo** de la pantalla y su propio alto, calculado a partir de `--app-header-h`: no
  comparte la grilla de las vistas de paso (que están limitadas a 1500 px), porque ahí el lienzo perdería espacio.
- Los planos de ejemplo del cliente «Supermercado El Trébol» traen la planta dibujada (cuatro paredes, puerta de
  entrada, vidriera, ventanas y el paso entre el salón y el depósito), para que se vea el uso real del módulo.

### Verificación

`.devtools/check-plan.ts` comprueba 246 casos, en tres bloques:

1. **Dibujo y estructura**: una plantilla por tipo de símbolo y una herramienta por tipo de estructura, la geometría
   de la hoja (A4 horizontal por omisión, 1000 × 707 unidades), el ajuste a la rejilla y el recorte dentro del lienzo,
   la geometría de las paredes (largo, ángulo, distancia y proyección sobre el segmento), el apoyado de una abertura
   sobre una pared (alineación, espesor heredado, deslizamiento sin salirse de las puntas y seguimiento al mover o
   estirar la pared), el borrado en cascada de las aberturas, el enganche de esquinas y el enderezado de trazos, el
   orden de pintado y el vínculo tablero/carga → elemento (con la deduplicación incluida).
2. **Medidas y edición**: la escala (calibración con dos puntos, largos en metros y centímetros, superficies en m²,
   tamaño real de la hoja y escala de impresión), la medición (distancia, ángulo, Δx/Δy y su resumen escrito), las
   cotas (valor, corrimiento y posición del texto), los textos con y sin directriz, y la edición en conjunto
   (selección por recuadro —incluida la pared larga que el recuadro cruza por el medio—, movimiento de la selección sin
   mover dos veces las aberturas ni salirse de la hoja, copia con la abertura apuntando a la pared copiada, simetría con
   el lado de apertura invertido y descripción de la selección).
3. **Interfaz y datos de ejemplo**: que el módulo no altere el recorrido de 7 pasos, que el armado de programa de
   dibujo esté completo (alto calculado sobre `--app-header-h`, las tres columnas, el riel, el panel, el ajuste del
   lienzo y la barra compacta), que el historial agrupe los cambios seguidos y respete su tope, que la ayuda anuncie las
   teclas que existen, y que los planos de ejemplo tengan la planta dibujada, la escala cargada y sus cotas y notas
   escritas en metros al renderizarse.

Como el plano es una función visual, `.devtools/render-plan.tsx` lo dibuja a `pdf-out/plano-N-<sector>.svg` y `.png`
reproduciendo exactamente lo que hace «Descargar PNG» (quitando los elementos que son solo de pantalla y devolviendo el
zoom a cero), para poder mirarlo y compararlo sin abrir la aplicación. Así se encontraron, por ejemplo, los rótulos
girados de las aberturas y las etiquetas cortadas contra el borde de la hoja.

### Capturas de la interfaz real

La interfaz **no se diseña a ciegas**: `.devtools/capturas.mjs` levanta el build con `vite preview`, abre la aplicación
en un Chromium headless (Playwright), elige el cliente de ejemplo con planos cargados, entra al módulo y guarda
capturas en `pdf-out/capturas/` —la pantalla completa, la barra, el riel y el panel con cada pestaña— además de
reportar cualquier error de la consola del navegador.

```bash
cd .devtools
node capturas.mjs            # 1440 × 900
node capturas.mjs 1280 800   # otra medida de pantalla
```

Así se corrigieron cosas que el render de servidor no muestra: la barra que cortaba el botón «Nuevo plano», los campos
del panel aplastados por una grilla de dos columnas, los nombres de tres líneas en el riel y la falta de espacio del
lienzo con el menú del programa abierto.

---

## Motor de cálculo

`src/utils/electricalMath.ts` (funciones puras, sin dependencias de React):

- Conversión de unidades de potencia, incluido HP → W.
- Corriente por fase según sistema (1F/2F/3F) y potencia aparente/reactiva a partir del factor de potencia.
- Consumo diario y mensual en kWh y su costo.
- Balance de fases con desbalance según criterio **NEMA** y corriente de neutro. El neutro se calcula solo con las
  cargas conectadas entre fase y neutro (las cargas entre fases y las trifásicas no lo cargan), con fases a 120° en
  trifásico y en el bifásico argentino (dos fases de una red 380/220 V) y a 180° solo en el bifásico de fase partida
  120/240 V (`isSplitPhase`).
- `circuitVoltage`: los circuitos trifásicos y entre fases usan la tensión entre fases (380 V), no la de fase.
- **Demanda simultánea** (`calculateDemand`): la carga más grande entera y el resto por el factor de simultaneidad del
  cliente (`ClientRecord.simultaneityFactor`, 0,7 si no hay dato). Es lo que se compara con la térmica general en
  Cargas y en Tableros.
- **Auto-balanceo** de cargas entre fases.
- Caída de tensión (límites AEA: 3 % iluminación, 5 % fuerza motriz), dimensionado de térmica + cable, banco de
  capacitores (50 Hz por defecto) y recomendación de sección.

`src/utils/aea.ts` reúne los criterios de la **AEA 90364-7-771**:

- Secciones en mm² (1,5 a 120 mm²) con la corriente admisible de la tabla 771.16.I: cable IRAM NM 247-3 en cañería,
  40 °C, columnas de 2 y 3 conductores cargados. Aluminio con factor 0,78 y nunca menos de 16 mm².
- Térmicas de la serie IEC (6, 10, 16, 20, 25, 32, 40, 50, 63… A) y la regla IB ≤ In ≤ Iz.
- Factores por temperatura (relativos a 40 °C, sin agrandar por debajo) y por circuitos en el mismo caño.
- Secciones mínimas por tipo de circuito: IUG 1,5 mm², TUG y usos especiales 2,5 mm², línea principal 4 mm².
- Los calibres AWG guardados en clientes viejos se siguen leyendo, del lado seguro, con la corriente de la sección mm²
  inmediata inferior (`findCable`).

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

Los datos de trabajo se guardan en IndexedDB; tema, moneda y cotización permanecen en `localStorage`. Si IndexedDB no está disponible se usa localStorage como respaldo.

Las escrituras fallidas se conservan en memoria y se reintentan hasta tres veces (1, 2 y 4 segundos). El aviso permanece hasta que se guarde todo y permite reintentar o descargar `ElectroPro_Rescate.json`, con clientes, perfil, catálogo y puntos de recuperación. Se importa desde Clientes como las copias habituales. Si no hay almacenamiento disponible, la copia debe descargarse antes de cerrar la sesión. Una operación asíncrona al cerrar el navegador no garantiza el guardado.

`npm test` ejecuta las pruebas de persistencia con Node 24: fallo y reintento, conservación de borrados, escrituras consecutivas y rescate sin almacenamiento. Todavía falta verificar IndexedDB y el aviso en un navegador real.

### Proyecto como archivo (`.electropro`)

Cada cliente se puede guardar como un archivo propio para seguir editándolo en otro momento o en otro equipo.
El menú **Archivo** (barra superior) tiene:

| Opción | Qué hace |
|---|---|
| **Nuevo proyecto** | Abre la ficha de un cliente nuevo |
| **Abrir…** (Ctrl+O) | Abre un `.electropro`. Si ese proyecto ya está en el equipo pregunta: **reemplazar** (lo de antes queda en una copia de rescate) o **abrir como copia** |
| **Abrir reciente** | Los últimos proyectos guardados o abiertos; si ya no está en el equipo, lo reabre desde su archivo cuando el navegador lo permite |
| **Guardar** (Ctrl+S) | En Chrome y Edge de escritorio escribe sobre el mismo archivo, también después de reabrir la app (pide permiso). En los demás navegadores descarga una copia nueva |
| **Guardar como…** (Ctrl+Mayús+S) | Elegir otro nombre o carpeta |
| **Exportar** | Informe técnico (PDF), presupuesto (PDF) y copia de seguridad de todos los clientes |

- Al lado del menú, el indicador dice **Sin archivo**, **Archivo al día** o **Archivo sin guardar** (hay cambios que no
  están en el archivo). Se calcula con la `revision` del cliente y la revisión que quedó escrita en el archivo.
- En el módulo del plano, Ctrl+S sigue guardando el archivo del plano.
- El formato (`src/services/projectFileService.ts`) lleva `format: 'electropro-proyecto'` y `version`: un archivo de
  una versión más nueva no se abre a medias, y un plano o una copia de seguridad se reconocen y se dice dónde abrirlos.
  El cliente del archivo pasa por la misma revisión que la importación.
- El archivo vinculado a cada proyecto se recuerda en IndexedDB (`src/services/fileHandleStore.ts`).

### Que no se pierda trabajo

- **Un cliente dañado no se lleva a los demás.** Si un cliente guardado no se puede leer, se aparta con el motivo y
  se sigue guardando tal cual; los demás se ven normalmente y nunca se reemplazan por los de ejemplo. Si la lista
  entera es ilegible, la app arranca vacía y, antes del primer guardado, deja una copia de rescate con lo que había.
  En **Clientes** se ven los dañados, se pueden descargar o quitar (con copia de rescate antes).
- **Varias pestañas o ventanas.** Cada guardado se anuncia por `BroadcastChannel` y las demás pestañas releen esos
  datos y actualizan la pantalla («Se trajeron los cambios…»); al volver a una pestaña también se compara con el disco
  (`syncFromDisk`). Cada cliente lleva una `revision`: si se guarda sobre una revisión que escribió otra pestaña, se
  guarda igual pero la otra versión queda en una copia de rescate y se avisa.
- **Copias de rescate.** En **Ajustes → Recuperar datos** cada copia se puede restaurar (trae lo que falta) o
  **descargar**; ese archivo se importa como cualquier copia y trae de vuelta esas versiones.
- **Importar una copia** muestra antes qué va a pasar (clientes nuevos, actualizados y dañados que no entran), **suma y
  actualiza por id sin borrar** los clientes que solo están en este equipo, deja una copia de rescate y, si el archivo no
  sirve, lo dice sin tocar nada. Acepta la copia de la lista de clientes y la copia completa de Ajustes, y valida las dos.

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

1. **Pruebas**: `tests/electrical.test.mjs` cubre el motor de cálculo, la AEA y el alimentador del diagnóstico.
   Faltan el auto-balanceo, el flujo del recorrido y los presupuestos.
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
12. **El plano no traza canalizaciones ni circuitos**: dibuja la planta, las aberturas, las cotas y los símbolos, pero
    falta el recorrido de cada circuito desde el tablero (polilíneas con su rótulo `C-1`, `C-2`…) para que sirva también
    como esquema de cañerías, vinculado al circuito del relevamiento y con su largo calculado para el cómputo de cable.
13. **El plano no calcula ambientes ni luminarias**: con las paredes cerradas se podría detectar el recinto, calcular su
    superficie y proponer los puntos de luz por el método de los lúmenes (o los W/m²), que es una cuenta que hoy se hace
    aparte.

import { ClientRecord, FieldMeasurements } from '../types/electrical';
import { calculatePhaseBalance } from './electricalMath';
import { allSuppliesVerified, getSupplies, hasAnyMeasurements, loadsOfSupply } from './supplies';

/**
 * Modelo del flujo de trabajo.
 *
 * La aplicación tenía nueve pestañas planas que mezclaban pasos del trabajo
 * (relevar datos, analizar, presupuestar, entregar) con herramientas sueltas,
 * sin indicar en qué orden usarlas. Aquí el trabajo se describe como un
 * recorrido: cuatro etapas, cada una con sus pasos, y un estado calculado a
 * partir de los datos reales del cliente.
 */

export type StepId =
  | 'supply'
  | 'panels'
  | 'diagnostic'
  | 'audit'
  | 'history'
  | 'balance'
  | 'calculators'
  | 'budget'
  | 'report';
export type GroupId = 'relevar' | 'analizar' | 'presupuestar' | 'entregar';

/**
 * Módulos: herramientas que no son pasos del recorrido y no se completan nunca,
 * pero que se usan en cualquier momento del trabajo (el plano de ubicación, la
 * gestión de clientes). Van aparte de las etapas para no ensuciar el progreso.
 */
export type ModuleId = 'plan' | 'clients';

export interface AppModule {
  id: ModuleId;
  label: string;
  title: string;
  description: string;
}

export const APP_MODULES: AppModule[] = [
  {
    id: 'plan',
    label: 'Plano de ubicación',
    title: 'Plano de ubicación',
    description:
      'Ubicá los tableros, las tomas y los artefactos sobre la planta del inmueble usando plantillas, y bajá el plano para el cliente.',
  },
  {
    id: 'clients',
    label: 'Clientes y copias de seguridad',
    title: 'Clientes y copias de seguridad',
    description: 'Fichas de clientes, datos del técnico y respaldo de todo el trabajo guardado en este equipo.',
  },
];

/**
 * Vistas de la aplicación: los pasos del recorrido más los módulos, que no son
 * pasos sino herramientas que se usan en cualquier momento.
 */
export type ViewId = StepId | ModuleId;

/** ¿La vista es un módulo (y no un paso del recorrido)? */
export function isModuleView(view: ViewId): view is ModuleId {
  return APP_MODULES.some((module) => module.id === view);
}

export function findModule(view: ViewId): AppModule | undefined {
  return APP_MODULES.find((module) => module.id === view);
}

/**
 * - `pendiente`: falta información para poder avanzar.
 * - `en-curso`: hay datos cargados pero todavía se puede completar.
 * - `listo`: el paso está terminado.
 * - `herramienta`: no es un paso del recorrido (una calculadora, por ejemplo):
 *   no se completa nunca y no cuenta para el progreso.
 */
export type StepStatus = 'pendiente' | 'en-curso' | 'listo' | 'herramienta';

export interface WorkflowStep {
  id: StepId;
  /** Nombre corto, para la navegación. */
  label: string;
  /** Título completo, para la cabecera de la vista. */
  title: string;
  /** Qué se hace en este paso, en una línea. */
  description: string;
  /** Qué falta cuando está pendiente: se muestra como ayuda concreta. */
  pendingHint: string;
  status: StepStatus;
  /** Dato corto de avance ("12 cargas", "2 tableros"). */
  badge?: string;
}

export interface WorkflowGroup {
  id: GroupId;
  index: number;
  title: string;
  description: string;
  steps: WorkflowStep[];
}

export interface WorkflowProgress {
  done: number;
  total: number;
  percent: number;
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Estado del paso de balance de fases.
 *
 * El desbalance se evalúa **por acometida**, porque las fases de dos medidores
 * distintos no se compensan entre sí. El paso se marca terminado cuando todas
 * las acometidas con cargas suficientes están dentro de tolerancia.
 */
function balanceStatus(client: ClientRecord | null): { status: StepStatus; badge?: string; pendingHint: string } {
  if (!client) {
    return { status: 'pendiente', pendingHint: 'Cargá primero las cargas del inmueble.' };
  }

  const evaluated = getSupplies(client)
    .map((supply) => ({ supply, loads: loadsOfSupply(client, supply.id) }))
    .filter((entry) => entry.loads.length >= 2)
    .map((entry) => ({
      supply: entry.supply,
      summary: calculatePhaseBalance(
        entry.loads,
        entry.supply.serviceType,
        entry.supply.nominalVoltage,
        entry.supply.lineVoltage
      ),
    }));

  if (evaluated.length === 0) {
    return {
      status: 'pendiente',
      pendingHint: 'Necesitás al menos dos cargas cargadas para poder repartirlas entre fases.',
    };
  }

  const worst = evaluated.reduce((a, b) => (b.summary.unbalancePercent > a.summary.unbalancePercent ? b : a));
  const balanced = evaluated.every(
    (entry) => entry.summary.unbalanceStatus === 'excelente' || entry.summary.unbalanceStatus === 'aceptable'
  );

  return {
    status: balanced ? 'listo' : 'en-curso',
    badge: `${worst.summary.unbalancePercent.toFixed(1)}%`,
    pendingHint:
      evaluated.length > 1
        ? `El desbalance llega al ${worst.summary.unbalancePercent.toFixed(1)}% en «${worst.supply.name}» (conviene que no pase del 5%). Cada acometida se balancea por separado.`
        : `El desbalance entre fases es del ${worst.summary.unbalancePercent.toFixed(1)}% (conviene que no pase del 5%). Movete a la vista de balance para repartir mejor las cargas.`,
  };
}

/** Construye las etapas y el estado de cada paso a partir del cliente activo. */
export function buildWorkflow(client: ClientRecord | null): WorkflowGroup[] {
  const loads = client?.loads?.length ?? 0;
  const panels = client?.panels?.length ?? 0;
  const monthlyRecords = client?.consumptionHistory?.length ?? 0;
  const budgets = (client?.budgets ?? []).filter((budget) => budget.items.length > 0);
  const hasBudgetItems = budgets.length > 0;
  const measurements = client ? hasAnyMeasurements(client) : false;
  const supplies = client ? getSupplies(client) : [];
  const suppliesVerified = client ? allSuppliesVerified(client) : false;
  const balance = balanceStatus(client);

  return [
    {
      id: 'relevar',
      index: 1,
      title: 'Relevar el inmueble',
      description: 'En el orden en que se recorre la instalación: suministro, tableros, mediciones, cargas y facturas.',
      steps: [
        {
          id: 'supply',
          label: supplies.length > 1 ? 'Suministros y acometidas' : 'Suministro y acometida',
          title: supplies.length > 1 ? 'Suministros y acometidas' : 'Suministro y acometida',
          description:
            'Lo primero al llegar: cuántas acometidas tiene el inmueble y, en cada una, el tipo de suministro, las tensiones y la térmica general. Todo lo demás se calcula a partir de esto.',
          pendingHint:
            supplies.length > 1
              ? 'Confirmá en el lugar las tensiones y la térmica general de cada acometida.'
              : 'Confirmá en el lugar el tipo de acometida, las tensiones y la térmica general del inmueble.',
          status: suppliesVerified ? 'listo' : 'pendiente',
          badge:
            supplies.length > 1
              ? `${supplies.filter((supply) => supply.verified).length}/${supplies.length}`
              : suppliesVerified
              ? 'verificado'
              : undefined,
        },
        {
          id: 'panels',
          label: 'Tableros y protecciones',
          title: 'Tableros y protecciones',
          description:
            'Abrí cada tablero y describí su protección de cabecera, el diferencial, el descargador de sobretensiones y el estado general.',
          pendingHint: 'Cargá al menos el tablero principal con su breaker de cabecera.',
          status: panels === 0 ? 'pendiente' : 'listo',
          badge: panels > 0 ? pluralize(panels, 'tablero', 'tableros') : undefined,
        },
        {
          id: 'diagnostic',
          label: 'Mediciones del lugar',
          title: 'Mediciones y diagnóstico',
          description:
            'Medí tensiones y corrientes por fase con la pinza, y la resistencia de puesta a tierra con el telurómetro. La app evalúa el estado y arma el plan de trabajo.',
          pendingHint: 'Ingresá las mediciones de tensión, corriente y puesta a tierra para obtener el índice de seguridad.',
          status: measurements ? 'listo' : 'pendiente',
          badge: measurements ? 'medido' : undefined,
        },
        {
          id: 'audit',
          label: 'Cargas y consumos',
          title: 'Cargas y consumos',
          description:
            'Recorré el inmueble y cargá cada artefacto con su potencia, su fase y sus horas de uso. De acá salen el consumo mensual y la corriente de cada circuito.',
          pendingHint: 'Cargá los artefactos del inmueble: sin cargas no hay cálculo de consumo ni presupuesto.',
          status: loads === 0 ? 'pendiente' : 'listo',
          badge: loads > 0 ? pluralize(loads, 'carga', 'cargas') : undefined,
        },
        {
          id: 'history',
          label: 'Facturas anteriores',
          title: 'Historial de facturación',
          description:
            'Cargá los kWh de las últimas facturas para comparar lo que cobra la distribuidora con lo que consume realmente el inmueble.',
          pendingHint: 'Opcional pero muy útil: con dos o tres facturas se detectan fugas o medidores descalibrados.',
          status: monthlyRecords === 0 ? 'pendiente' : 'listo',
          badge: monthlyRecords > 0 ? pluralize(monthlyRecords, 'mes', 'meses') : undefined,
        },
      ],
    },
    {
      id: 'analizar',
      index: 2,
      title: 'Analizar',
      description: 'Revisá el reparto entre fases y resolvé cálculos puntuales.',
      steps: [
        {
          id: 'balance',
          label: 'Balance de fases',
          title: 'Balance de fases',
          description:
            'Mirá cómo quedó repartida la carga entre L1, L2 y L3, y equilibrála antes de presupuestar.',
          pendingHint: balance.pendingHint,
          status: balance.status,
          badge: balance.badge,
        },
        {
          id: 'calculators',
          label: 'Calculadoras',
          title: 'Calculadoras eléctricas',
          description:
            'Caída de tensión, dimensionado de conductores, breaker con cable y corrección del factor de potencia.',
          pendingHint: '',
          status: 'herramienta',
        },
      ],
    },
    {
      id: 'presupuestar',
      index: 3,
      title: 'Presupuestar',
      description: 'Armá el presupuesto con materiales y mano de obra.',
      steps: [
        {
          id: 'budget',
          label: 'Presupuesto y materiales',
          title: 'Presupuesto y materiales',
          description:
            'Generá el presupuesto a partir de los tableros, las cargas y el diagnóstico, ajustá precios y condiciones.',
          pendingHint: loads === 0 ? 'Primero cargá las cargas: el presupuesto se arma con ellas.' : 'Generá el presupuesto desde los datos relevados.',
          status: hasBudgetItems ? 'listo' : loads === 0 ? 'pendiente' : 'en-curso',
          badge: hasBudgetItems ? pluralize(budgets.length, 'presupuesto', 'presupuestos') : undefined,
        },
      ],
    },
    {
      id: 'entregar',
      index: 4,
      title: 'Entregar',
      description: 'Revisá y bajá el informe para el cliente.',
      steps: [
        {
          id: 'report',
          label: 'Informe del cliente',
          title: 'Informe para el cliente',
          description:
            'Revisá el informe técnico completo y descargalo en PDF con los cálculos, el diagnóstico y las recomendaciones.',
          pendingHint: '',
          // No tiene estado propio: está disponible en cuanto hay datos, así que
          // no se cuenta como paso a completar.
          status: 'herramienta',
        },
      ],
    },
  ];
}

/** Pasos que cuentan para el progreso (excluye herramientas). */
function countableSteps(groups: WorkflowGroup[]): WorkflowStep[] {
  return groups.flatMap((group) => group.steps).filter((step) => step.status !== 'herramienta');
}

export function getProgress(groups: WorkflowGroup[]): WorkflowProgress {
  const steps = countableSteps(groups);
  const done = steps.filter((step) => step.status === 'listo').length;
  return {
    done,
    total: steps.length,
    percent: steps.length === 0 ? 0 : Math.round((done / steps.length) * 100),
  };
}

/** Primer paso sin terminar, en el orden del recorrido. */
export function findNextStep(groups: WorkflowGroup[]): WorkflowStep | null {
  return countableSteps(groups).find((step) => step.status !== 'listo') ?? null;
}

export function findGroupOfStep(groups: WorkflowGroup[], stepId: StepId): WorkflowGroup | undefined {
  return groups.find((group) => group.steps.some((step) => step.id === stepId));
}

export function findStep(groups: WorkflowGroup[], stepId: StepId): WorkflowStep | undefined {
  return groups.flatMap((group) => group.steps).find((step) => step.id === stepId);
}

import React from 'react';
import { ArrowRight, CheckCircle2, CircleAlert } from 'lucide-react';
import { ViewId, WorkflowGroup, findGroupOfStep, findNextStep, getProgress, isModuleView } from '../utils/workflow';
import { cx } from '../utils/cx';
import { TopBar, TopBarProps } from './TopBar';
import { WorkflowRail, WorkflowSidebar } from './WorkflowNav';
import { Button } from './ui/Button';
import { ProgressBar } from './ui/Card';

/**
 * Cáscara de la aplicación: barra superior, navegación por etapas, franja de
 * contexto del paso actual y acción de "siguiente paso" siempre a mano.
 *
 * La franja de contexto es la pieza que responde a "¿qué hago ahora?": muestra
 * en qué etapa estás, qué falta en este paso y cuál es el próximo.
 */

export interface AppShellProps extends TopBarProps {
  workflow: WorkflowGroup[];
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  /**
   * Modo pantalla completa del módulo del plano: se retiran la navegación
   * lateral, el pie y el ancho máximo, para que el lienzo se quede con toda la
   * ventana. Se sale con el mismo botón o con Escape.
   */
  focus?: boolean;
  children: React.ReactNode;
}

const ContextBar: React.FC<{
  workflow: WorkflowGroup[];
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}> = ({ workflow, activeView, onNavigate }) => {
  const group = findGroupOfStep(workflow, activeView as WorkflowGroup['steps'][number]['id']);
  const step = group?.steps.find((candidate) => candidate.id === activeView);
  const progress = getProgress(workflow);
  const nextStep = findNextStep(workflow);

  if (!group || !step) return null;

  const isDone = step.status === 'listo';
  const message =
    step.status === 'herramienta' ? step.description : isDone ? 'Paso completado.' : step.pendingHint;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-hairline bg-surface px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-accent-line bg-accent-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-text">
            Etapa {group.index} de {workflow.length} · {group.title}
          </span>
          {isDone ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-success-text">
              <CheckCircle2 className="h-3.5 w-3.5" /> Listo
            </span>
          ) : (
            step.status !== 'herramienta' && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-warning-text">
                <CircleAlert className="h-3.5 w-3.5" /> Falta completar
              </span>
            )
          )}
        </div>
        {message && <p className="mt-1 text-sm leading-snug text-muted">{message}</p>}
      </div>

      <div className="flex w-full items-center gap-3 sm:w-auto">
        <ProgressBar
          value={progress.done}
          max={progress.total}
          label={`${progress.done} de ${progress.total} pasos`}
          className="w-full sm:w-40"
        />
        {nextStep && nextStep.id !== activeView && (
          <Button
            variant="primary"
            size="sm"
            iconRight={<ArrowRight className="h-3.5 w-3.5" />}
            onClick={() => onNavigate(nextStep.id)}
            className="flex-shrink-0"
          >
            {nextStep.label}
          </Button>
        )}
      </div>
    </div>
  );
};

const MobileNextBar: React.FC<{ workflow: WorkflowGroup[]; activeView: ViewId; onNavigate: (view: ViewId) => void }> = ({
  workflow,
  activeView,
  onNavigate,
}) => {
  const nextStep = findNextStep(workflow);
  if (!nextStep || nextStep.id === activeView || isModuleView(activeView)) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-hairline bg-surface/95 px-3 py-2.5 backdrop-blur-md lg:hidden">
      <Button
        variant="primary"
        fullWidth
        iconRight={<ArrowRight className="h-4 w-4" />}
        onClick={() => onNavigate(nextStep.id)}
      >
        Siguiente paso: {nextStep.label}
      </Button>
    </div>
  );
};

export const AppShell: React.FC<AppShellProps> = ({
  workflow,
  activeView,
  onNavigate,
  focus = false,
  children,
  ...topBarProps
}) => {
  const progress = getProgress(workflow);
  const nextStep = findNextStep(workflow);
  const navProps = { workflow, activeView, onNavigate, nextStep, progress };

  /**
   * El módulo del plano se trabaja como un programa de dibujo: el lienzo ocupa
   * el alto de la ventana y no se desplaza con la página. Para eso la cáscara le
   * deja el ancho completo y un margen chico, y en pantalla completa esconde la
   * navegación lateral, el riel de móvil y el pie.
   */
  const workspace = activeView === 'plan';

  return (
    <div className="min-h-screen bg-page text-strong">
      <TopBar {...topBarProps} />
      {!focus && <WorkflowRail {...navProps} />}

      <div
        className={cx(
          'mx-auto flex gap-6',
          workspace ? 'max-w-none px-2 py-2 sm:px-3' : 'max-w-[1500px] px-3 sm:px-5'
        )}
      >
        {!focus && <WorkflowSidebar {...navProps} />}

        <main className={cx('min-w-0 flex-1', workspace ? 'py-1 pb-2 lg:pb-1' : 'py-4 pb-24 lg:pb-10')}>
          {!isModuleView(activeView) && (
            <ContextBar workflow={workflow} activeView={activeView} onNavigate={onNavigate} />
          )}
          {children}
        </main>
      </div>

      {!focus && <MobileNextBar workflow={workflow} activeView={activeView} onNavigate={onNavigate} />}

      {/* El pie se retira en el plano: su alto entraría en la cuenta del lienzo
          y haría que la página se pueda desplazar. */}
      {!focus && !workspace && (
        <footer className="border-t border-hairline px-4 py-4 text-center text-xs text-muted">
          ElectroPro · Todo se guarda en este equipo, sin conexión a internet · Verificá siempre los cálculos antes de
          intervenir una instalación
        </footer>
      )}
    </div>
  );
};

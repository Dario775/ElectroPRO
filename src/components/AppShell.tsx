import React from 'react';
import { ArrowRight, CheckCircle2, CircleAlert } from 'lucide-react';
import { ViewId, WorkflowGroup, findGroupOfStep, findNextStep, getProgress, isModuleView } from '../utils/workflow';
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
  children,
  ...topBarProps
}) => {
  const progress = getProgress(workflow);
  const nextStep = findNextStep(workflow);
  const navProps = { workflow, activeView, onNavigate, nextStep, progress };

  return (
    <div className="min-h-screen bg-page text-strong">
      <TopBar {...topBarProps} />
      <WorkflowRail {...navProps} />

      <div className="mx-auto flex max-w-[1500px] gap-6 px-3 sm:px-5">
        <WorkflowSidebar {...navProps} />

        <main className="min-w-0 flex-1 py-4 pb-24 lg:pb-10">
          {!isModuleView(activeView) && (
            <ContextBar workflow={workflow} activeView={activeView} onNavigate={onNavigate} />
          )}
          {children}
        </main>
      </div>

      <MobileNextBar workflow={workflow} activeView={activeView} onNavigate={onNavigate} />

      <footer className="border-t border-hairline px-4 py-4 text-center text-xs text-muted">
        ElectroPro · Todo se guarda en este equipo, sin conexión a internet · Verificá siempre los cálculos antes de
        intervenir una instalación
      </footer>
    </div>
  );
};

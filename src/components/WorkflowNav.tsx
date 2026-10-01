import React from 'react';
import { ArrowRight, CheckCircle2, Users } from 'lucide-react';
import { cx } from '../utils/cx';
import {
  ViewId,
  WorkflowGroup,
  WorkflowProgress,
  WorkflowStep,
  findGroupOfStep,
} from '../utils/workflow';
import { Badge, ProgressBar, StatusDot } from './ui/Card';
import { Button } from './ui/Button';

/**
 * Navegación del recorrido de trabajo.
 *
 * En escritorio es una barra lateral con las cuatro etapas y sus pasos; en móvil
 * son dos filas de botones (etapas arriba, pasos de la etapa activa abajo), que
 * es lo que cabe y se puede tocar con el dedo.
 */

export interface WorkflowNavProps {
  workflow: WorkflowGroup[];
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  nextStep: WorkflowStep | null;
  progress: WorkflowProgress;
}

/* ------------------------------------------------------------------ */
/* Escritorio: barra lateral                                           */
/* ------------------------------------------------------------------ */

export const WorkflowSidebar: React.FC<WorkflowNavProps> = ({
  workflow,
  activeView,
  onNavigate,
  nextStep,
  progress,
}) => (
  <aside className="hidden w-[290px] flex-shrink-0 lg:block">
    <div className="sticky top-[76px] space-y-4 py-5">
      <div className="rounded-2xl border border-hairline bg-surface p-4">
        <ProgressBar
          value={progress.done}
          max={progress.total}
          label={`Trabajo del cliente: ${progress.done} de ${progress.total} pasos`}
        />
        {nextStep ? (
          <Button
            variant="primary"
            iconRight={<ArrowRight className="h-4 w-4" />}
            className="mt-3"
            fullWidth
            onClick={() => onNavigate(nextStep.id)}
          >
            Siguiente: {nextStep.label}
          </Button>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-success-line bg-success-soft px-3 py-2.5 text-sm font-semibold text-success-text">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            Trabajo completo
          </div>
        )}
      </div>

      <nav aria-label="Etapas del trabajo" className="space-y-4">
        {workflow.map((group) => {
          const groupIsActive = findGroupOfStep(workflow, activeView as WorkflowStep['id'])?.id === group.id;
          return (
            <div key={group.id}>
              <div className="mb-1.5 flex items-start gap-2 px-2">
                <span
                  className={cx(
                    'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    groupIsActive ? 'bg-accent text-accent-fg' : 'bg-raised text-muted'
                  )}
                >
                  {group.index}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-strong">{group.title}</p>
                  <p className="text-xs leading-snug text-muted">{group.description}</p>
                </div>
              </div>

              <div className="space-y-1">
                {group.steps.map((step) => {
                  const active = activeView === step.id;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => onNavigate(step.id)}
                      aria-current={active ? 'step' : undefined}
                      className={cx(
                        'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors',
                        active
                          ? 'border-accent-line bg-accent-soft'
                          : 'border-transparent hover:border-hairline hover:bg-raised'
                      )}
                    >
                      <StatusDot status={step.status} />
                      <span className={cx('flex-1 truncate text-sm', active ? 'font-bold text-strong' : 'font-medium text-soft')}>
                        {step.label}
                      </span>
                      {step.badge && (
                        <span className="flex-shrink-0 font-mono text-xs text-muted">{step.badge}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-hairline pt-4">
        <button
          type="button"
          onClick={() => onNavigate('clients')}
          aria-current={activeView === 'clients' ? 'page' : undefined}
          className={cx(
            'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
            activeView === 'clients'
              ? 'border-accent-line bg-accent-soft'
              : 'border-hairline hover:border-accent-line hover:bg-raised'
          )}
        >
          <Users className="h-4 w-4 flex-shrink-0 text-muted" />
          <span className="flex-1">
            <span className="block text-sm font-semibold text-soft">Clientes y copias</span>
            <span className="block text-xs text-muted">Fichas, respaldos y datos de ejemplo</span>
          </span>
        </button>
      </div>
    </div>
  </aside>
);

/* ------------------------------------------------------------------ */
/* Móvil: fila de etapas y de pasos                                    */
/* ------------------------------------------------------------------ */

export const WorkflowRail: React.FC<WorkflowNavProps> = ({ workflow, activeView, onNavigate, progress }) => {
  const activeGroup = findGroupOfStep(workflow, activeView as WorkflowStep['id']) ?? workflow[0];

  return (
    <div className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur-md lg:hidden">
      <div className="flex items-center gap-2 overflow-x-auto px-3 pb-1.5 pt-2 scrollbar-none">
        {workflow.map((group) => {
          const active = group.id === activeGroup.id;
          const done = group.steps.filter((step) => step.status === 'listo').length;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onNavigate(group.steps[0].id)}
              className={cx(
                'flex flex-shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                active ? 'border-accent bg-accent text-accent-fg' : 'border-edge bg-raised text-soft'
              )}
            >
              <span>{group.index}</span>
              <span>{group.title}</span>
              <span className={cx('font-mono', active ? 'text-accent-fg/80' : 'text-muted')}>
                {done}/{group.steps.length}
              </span>
            </button>
          );
        })}
        <span className="ml-auto flex-shrink-0 pl-2">
          <Badge tone="neutral" className="font-mono">
            {progress.percent}%
          </Badge>
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2 scrollbar-none">
        {activeGroup.steps.map((step) => {
          const active = activeView === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onNavigate(step.id)}
              aria-current={active ? 'step' : undefined}
              className={cx(
                'flex flex-shrink-0 items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors',
                active ? 'border-accent-line bg-accent-soft text-strong' : 'border-hairline bg-surface text-muted'
              )}
            >
              <StatusDot status={step.status} />
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

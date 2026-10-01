import React, { useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronDown, Users } from 'lucide-react';
import { cx } from '../utils/cx';
import { GroupId, ViewId, WorkflowGroup, WorkflowProgress, WorkflowStep, findGroupOfStep } from '../utils/workflow';
import { Badge, ProgressBar } from './ui/Card';
import { Button } from './ui/Button';

/**
 * Navegación del recorrido de trabajo.
 *
 * La relación entre etapas y pasos se muestra desplegando: la etapa en la que
 * estás aparece abierta con sus pasos, y las otras quedan plegadas con su
 * resumen. Así se ve de un vistazo el recorrido completo sin tener los ocho
 * pasos en pantalla a la vez.
 */

export interface WorkflowNavProps {
  workflow: WorkflowGroup[];
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  nextStep: WorkflowStep | null;
  progress: WorkflowProgress;
}

/** Marca de paso terminado: menos ruido que un punto de color por paso. */
const DoneMark: React.FC<{ done: boolean }> = ({ done }) =>
  done ? (
    <Check className="h-4 w-4 flex-shrink-0 text-success-text" strokeWidth={3} />
  ) : (
    <span className="h-4 w-4 flex-shrink-0 rounded-full border border-edge" />
  );

/* ------------------------------------------------------------------ */
/* Escritorio: barra lateral con etapas plegables                      */
/* ------------------------------------------------------------------ */

export const WorkflowSidebar: React.FC<WorkflowNavProps> = ({
  workflow,
  activeView,
  onNavigate,
  nextStep,
  progress,
}) => {
  const activeGroup = findGroupOfStep(workflow, activeView as WorkflowStep['id']);

  /**
   * Todas las etapas arrancan retraídas: el menú muestra solo los cuatro
   * títulos. Al presionar una se despliega y se retrae la anterior, así nunca
   * se llena la pantalla de pasos y números.
   */
  const [openGroup, setOpenGroup] = useState<GroupId | null>(null);

  const toggleGroup = (groupId: GroupId): void => {
    setOpenGroup((previous) => (previous === groupId ? null : groupId));
  };

  const isExpanded = (groupId: GroupId): boolean => openGroup === groupId;

  return (
    <aside className="hidden w-[280px] flex-shrink-0 lg:block">
      <div className="sticky top-[76px] space-y-4 py-5">
        {/* Progreso del trabajo y próximo paso */}
        <div className="rounded-2xl border border-hairline bg-surface p-4">
          <ProgressBar value={progress.done} max={progress.total} label={`${progress.done} de ${progress.total} pasos`} />
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

        {/* Etapas */}
        <nav aria-label="Etapas del trabajo" className="space-y-2">
          {workflow.map((group) => {
            const isActiveGroup = activeGroup?.id === group.id;
            const expanded = isExpanded(group.id);
            const doneInGroup = group.steps.filter((step) => step.status === 'listo').length;

            return (
              <div
                key={group.id}
                className={cx(
                  'overflow-hidden rounded-2xl border transition-colors',
                  isActiveGroup ? 'border-accent-line bg-surface' : 'border-hairline bg-surface/60'
                )}
              >
                {/* Cabecera de la etapa: retraída muestra solo el título y el avance */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-raised/60"
                >
                  <span
                    className={cx(
                      'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      isActiveGroup ? 'bg-accent text-accent-fg' : 'bg-raised text-muted'
                    )}
                  >
                    {group.index}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-sm', isActiveGroup ? 'font-bold text-strong' : 'font-semibold text-soft')}>
                      {group.title}
                    </span>
                  </span>
                  <span className="flex-shrink-0 font-mono text-xs text-muted">
                    {doneInGroup}/{group.steps.length}
                  </span>
                  <ChevronDown
                    className={cx('h-4 w-4 flex-shrink-0 text-muted transition-transform duration-200', expanded && 'rotate-180')}
                  />
                </button>

                {/* Pasos de la etapa: solo aparecen al desplegarla */}
                {expanded && (
                  <div className="space-y-0.5 border-t border-hairline px-2 py-2">
                    <p className="px-2 pb-1.5 pt-0.5 text-xs leading-snug text-muted">{group.description}</p>
                    {group.steps.map((step) => {
                      const isActive = activeView === step.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => onNavigate(step.id)}
                          aria-current={isActive ? 'step' : undefined}
                          className={cx(
                            'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors',
                            isActive ? 'bg-accent-soft' : 'hover:bg-raised'
                          )}
                        >
                          <DoneMark done={step.status === 'listo'} />
                          <span
                            className={cx(
                              'min-w-0 flex-1 truncate text-sm',
                              isActive ? 'font-bold text-strong' : 'text-soft'
                            )}
                          >
                            {step.label}
                          </span>
                          {step.status === 'herramienta' && <Badge tone="info">herramienta</Badge>}
                          {step.badge && step.status !== 'herramienta' && (
                            <span className="flex-shrink-0 font-mono text-xs text-muted">{step.badge}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Clientes: no es un paso del recorrido */}
        <div className="border-t border-hairline pt-3">
          <button
            type="button"
            onClick={() => onNavigate('clients')}
            aria-current={activeView === 'clients' ? 'page' : undefined}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition-colors',
              activeView === 'clients' ? 'bg-accent-soft font-bold text-strong' : 'text-soft hover:bg-raised'
            )}
          >
            <Users className="h-4 w-4 flex-shrink-0 text-muted" />
            Clientes y copias de seguridad
          </button>
        </div>
      </div>
    </aside>
  );
};

/* ------------------------------------------------------------------ */
/* Móvil: etapa activa y sus pasos                                     */
/* ------------------------------------------------------------------ */

export const WorkflowRail: React.FC<WorkflowNavProps> = ({ workflow, activeView, onNavigate, progress }) => {
  const activeGroup = findGroupOfStep(workflow, activeView as WorkflowStep['id']) ?? workflow[0];

  return (
    <div className="sticky top-0 z-20 border-b border-hairline bg-surface/95 backdrop-blur-md lg:hidden">
      {/* Etapas */}
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

      {/* Pasos de la etapa activa */}
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
              <DoneMark done={step.status === 'listo'} />
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

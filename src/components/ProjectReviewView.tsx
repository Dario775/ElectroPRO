/**
 * Revisión del proyecto: lo que no coincide entre los tableros armados, los circuitos, el plano,
 * las acometidas y el presupuesto, agrupado por área y con la manera de resolver cada cosa.
 */
import React, { useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { ClientRecord } from '../types/electrical';
import { useCurrency } from '../context/CurrencyContext';
import { CATALOG_CURRENCY } from '../services/budgetGeneratorService';
import { CatalogService } from '../services/catalogService';
import { convertCurrency } from '../utils/electricalMath';
import { normalizePanelDevices } from '../utils/panelDevices';
import { syncCircuits } from '../utils/circuits';
import { AREA_LABEL, reviewProject, type ReviewArea, type ReviewIssue, type ReviewSeverity } from '../utils/projectReview';
import { cx } from '../utils/cx';
import { Button } from './ui/Button';
import { Callout, SectionHeader } from './ui/Card';

interface ProjectReviewViewProps {
  client: ClientRecord;
  onUpdateClient: (client: ClientRecord) => void;
}

const DOT: Record<ReviewSeverity, string> = {
  error: 'bg-danger-solid',
  warning: 'bg-accent',
  info: 'bg-info-solid',
};

const AREAS = Object.keys(AREA_LABEL) as ReviewArea[];

export const ProjectReviewView: React.FC<ProjectReviewViewProps> = ({ client, onUpdateClient }) => {
  const { usdToArsRate } = useCurrency();
  // Se mira el proyecto como lo ven las demás pantallas: con los circuitos y diferenciales al día.
  const current = useMemo(() => normalizePanelDevices(syncCircuits(client)), [client]);
  const issues = useMemo(
    () =>
      reviewProject(current, {
        catalog: CatalogService.getItems(),
        convert: (pesos) => convertCurrency(pesos, CATALOG_CURRENCY, current.currency, usdToArsRate),
      }),
    [current, usdToArsRate]
  );

  const count = (severity: ReviewSeverity): number => issues.filter((issue) => issue.severity === severity).length;
  const byArea = AREAS.map((area) => ({ area, items: issues.filter((issue) => issue.area === area) })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-5">
      <SectionHeader
        eyebrow="Control"
        title="Revisión del proyecto"
        description="Revisa que los tableros armados, los circuitos, el plano, las acometidas y el presupuesto digan lo mismo, y te deja resolver lo que no coincide."
        icon={<ClipboardCheck className="h-4 w-4" />}
      />

      {issues.length === 0 ? (
        <Callout tone="success" title="Todo en orden">
          Los tableros, los circuitos, el plano, las acometidas y el presupuesto coinciden entre sí.
        </Callout>
      ) : (
        <p className="text-sm text-muted">
          <strong className="text-strong">{issues.length}</strong> {issues.length === 1 ? 'aviso' : 'avisos'}
          {count('error') > 0 && <> · <span className="font-semibold text-danger-text">{count('error')} {count('error') === 1 ? 'error' : 'errores'}</span></>}
          {count('warning') > 0 && <> · {count('warning')} {count('warning') === 1 ? 'para revisar' : 'para revisar'}</>}
          {count('info') > 0 && <> · {count('info')} {count('info') === 1 ? 'informativo' : 'informativos'}</>}
        </p>
      )}

      {byArea.map(({ area, items }) => (
        <section key={area} className="space-y-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">
            {AREA_LABEL[area]} <span className="font-semibold">({items.length})</span>
          </h3>
          <ul className="space-y-2">
            {items.map((issue) => (
              <IssueCard key={issue.id} issue={issue} onApply={(fix) => onUpdateClient(fix(current))} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};

const IssueCard: React.FC<{ issue: ReviewIssue; onApply: (fix: ReviewIssue['fixes'][number]['apply']) => void }> = ({ issue, onApply }) => (
  <li className="rounded-xl border border-hairline bg-surface px-3.5 py-3">
    <div className="flex items-start gap-2.5">
      <span aria-hidden="true" className={cx('mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full', DOT[issue.severity])} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm leading-snug text-strong">{issue.message}</p>
        {issue.hint && <p className="text-xs leading-snug text-muted">{issue.hint}</p>}
        {issue.fixes.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {issue.fixes.map((fix) => (
              <Button key={fix.label} size="sm" variant="secondary" onClick={() => onApply(fix.apply)}>
                {fix.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  </li>
);

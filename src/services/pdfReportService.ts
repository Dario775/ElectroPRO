import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ClientRecord, TechnicianProfile, PhaseBalanceSummary, SupportedCurrency } from '../types/electrical';
import { calculatePhaseBalance, calculateCurrent, calculateMonthlyKwh, formatCurrency } from '../utils/electricalMath';
import { analyzeInstallation } from '../utils/diagnosticEngine';

export function generateTechnicalReportPDF(
  client: ClientRecord,
  technician: TechnicianProfile,
  summary?: PhaseBalanceSummary,
  targetCurrency?: SupportedCurrency,
  exchangeRate?: number
): void {
  const effectiveCurrency: SupportedCurrency = targetCurrency || (client.currency === 'ARS' ? 'ARS' : 'USD');
  const clientCurr = client.currency === 'ARS' ? 'ARS' : 'USD';
  const rate = exchangeRate || technician.usdToArsRate || 1250;
  const factor = clientCurr === effectiveCurrency ? 1 : clientCurr === 'USD' && effectiveCurrency === 'ARS' ? rate : 1 / rate;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const calcSummary =
    summary ||
    calculatePhaseBalance(
      client.loads,
      client.serviceType,
      client.nominalVoltage,
      client.lineVoltage,
      client.kwhCost,
      client.fixedCharge
    );

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // Colors
  const primaryDark = [15, 23, 42]; // slate-900
  const electricAmber = [217, 119, 6]; // amber-600
  const accentBlue = [2, 132, 199]; // sky-600
  const textDark = [30, 41, 59]; // slate-800
  const textMuted = [100, 116, 139]; // slate-500
  const bgLight = [248, 250, 252]; // slate-50

  // 1. TOP HEADER BANNER
  doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
  doc.rect(0, 0, pageWidth, 28, 'F');

  // Accent line
  doc.setFillColor(electricAmber[0], electricAmber[1], electricAmber[2]);
  doc.rect(0, 28, pageWidth, 2, 'F');

  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('REPORTE TÉCNICO DE AUDITORÍA ELÉCTRICA', margin, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text('Cálculo de Consumos, Factor de Potencia y Balance de Fases', margin, 18);
  doc.text(
    `Fecha de Emisión: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    margin,
    23
  );

  // Technician / Company Box right side
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(251, 191, 36); // amber-400
  doc.text(technician.companyName || 'ElectroServicios Profesionales', pageWidth - margin, 11, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(226, 232, 240);
  doc.text(`Técnico: ${technician.name || 'Especialista Eléctrico'}`, pageWidth - margin, 16, { align: 'right' });
  doc.text(`Matrícula / Reg: ${technician.licenseNumber || 'N/A'}`, pageWidth - margin, 20, { align: 'right' });
  doc.text(`Tel: ${technician.phone || '-'}`, pageWidth - margin, 24, { align: 'right' });

  let currentY = 35;

  // 2. CLIENT & INSTALLATION SPECS (2-Column Card)
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 27, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('DATOS DEL CLIENTE Y SUMINISTRO ELÉCTRICO', margin + 4, currentY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);

  // Col 1
  const col1X = margin + 4;
  doc.text(`Cliente: `, col1X, currentY + 12);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`${client.clientName}`, col1X + 13, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Dirección: `, col1X, currentY + 17);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`${client.address || 'No especificada'}`, col1X + 16, currentY + 17);

  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Tel / Contacto: `, col1X, currentY + 22);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`${client.phone} ${client.documentId ? `| Identificación: ${client.documentId}` : ''}`, col1X + 22, currentY + 22);

  // Col 2
  const col2X = margin + 98;
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Tipo de Suministro: `, col2X, currentY + 12);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`${client.serviceType}`, col2X + 28, currentY + 12);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Tensión Nominal: `, col2X, currentY + 17);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`${client.nominalVoltage}V (L-N) / ${client.lineVoltage}V (L-L)`, col2X + 26, currentY + 17);

  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Breaker Principal: `, col2X, currentY + 22);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`${client.mainBreakerAmps} A  |  Tarifa: ${formatCurrency(client.kwhCost * factor, effectiveCurrency)}/kWh`, col2X + 26, currentY + 22);

  currentY += 32;

  // 3. EXECUTIVE METRICS KPI TILES
  const tileWidth = (pageWidth - margin * 2 - 8) / 3;
  const tileHeight = 17;

  // Tile 1: Potencia Conectada
  drawKpiTile(
    doc,
    margin,
    currentY,
    tileWidth,
    tileHeight,
    'POTENCIA TOTAL CONECTADA',
    `${(calcSummary.totalWatts / 1000).toFixed(2)} kW`,
    `${(calcSummary.totalApparentVA / 1000).toFixed(2)} kVA | FP: ${calcSummary.averagePowerFactor}`
  );

  // Tile 2: Consumo Mensual y Costo
  drawKpiTile(
    doc,
    margin + tileWidth + 4,
    currentY,
    tileWidth,
    tileHeight,
    'CONSUMO MENSUAL ESTIMADO',
    `${calcSummary.totalMonthlyKwh.toLocaleString('es-ES')} kWh/mes`,
    `Costo Est.: ${formatCurrency(calcSummary.totalMonthlyCost * factor, effectiveCurrency)}`
  );

  // Tile 3: Balance de Fases
  let statusBadge = 'ÓPTIMO (<= 5%)';
  if (calcSummary.unbalancePercent > 18) statusBadge = 'CRÍTICO (> 18%)';
  else if (calcSummary.unbalancePercent > 10) statusBadge = 'DESBALANCE (> 10%)';
  else if (calcSummary.unbalancePercent > 5) statusBadge = 'ACEPTABLE (5-10%)';

  drawKpiTile(
    doc,
    margin + (tileWidth + 4) * 2,
    currentY,
    tileWidth,
    tileHeight,
    'BALANCEO DE FASES (NEMA)',
    `${calcSummary.unbalancePercent}% Desbalance`,
    `Estado: ${statusBadge}`
  );

  currentY += tileHeight + 5;

  // 4. PHASE DISTRIBUTION STRIP
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, currentY, pageWidth - margin * 2, 13, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  let phaseText = `Distribución de Carga por Fase:   `;
  phaseText += `L1: ${calcSummary.phaseL1Amps} A (${calcSummary.phaseL1Watts} W)   |   `;
  if (client.serviceType !== 'Monofásico (1F+N)') {
    phaseText += `L2: ${calcSummary.phaseL2Amps} A (${calcSummary.phaseL2Watts} W)   |   `;
  }
  if (client.serviceType === 'Trifásico (3F+N)') {
    phaseText += `L3: ${calcSummary.phaseL3Amps} A (${calcSummary.phaseL3Watts} W)   |   `;
  }
  phaseText += `Retorno Neutro: ${calcSummary.neutralAmps} A`;

  doc.text(phaseText, margin + 4, currentY + 8);

  currentY += 17;

  // 5. DETAILED APPLIANCE / LOAD TABLE (jsPDF-autotable)
  const tableData = client.loads.map((load, index) => {
    const totalWatts = load.powerWatts * load.quantity;
    const current = calculateCurrent(totalWatts, load.voltage || client.nominalVoltage, load.powerFactor, load.systemPhase);
    const monthlyKwh = calculateMonthlyKwh(load.powerWatts, load.hoursPerDay, load.daysPerMonth, load.quantity);
    const monthlyCost = monthlyKwh * client.kwhCost;

    return [
      `C-${index + 1}`,
      load.name,
      `${load.quantity}`,
      `${load.powerWatts} W`,
      `${load.voltage}V`,
      load.assignedPhase,
      `${load.powerFactor.toFixed(2)}`,
      `${current.toFixed(1)} A`,
      `${load.hoursPerDay} h/d`,
      `${monthlyKwh.toFixed(1)}`,
      formatCurrency(monthlyCost * factor, effectiveCurrency),
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [
      [
        'Circ.',
        'Equipo / Carga Eléctrica',
        'Cant.',
        'Potencia',
        'Voltaje',
        'Fase',
        'F.P.',
        'Corriente',
        'Uso',
        'kWh/mes',
        'Costo/mes',
      ],
    ],
    body: tableData,
    foot: [
      [
        'TOTAL',
        `${client.loads.length} Cargas Registradas`,
        `${client.loads.reduce((acc, l) => acc + l.quantity, 0)}`,
        `${(calcSummary.totalWatts / 1000).toFixed(2)} kW`,
        '-',
        '-',
        `${calcSummary.averagePowerFactor}`,
        `${calcSummary.maxAmps} A max`,
        '-',
        `${calcSummary.totalMonthlyKwh.toFixed(1)}`,
        formatCurrency(calcSummary.totalMonthlyCost * factor, effectiveCurrency),
      ],
    ],
    theme: 'grid',
    headStyles: {
      fillColor: primaryDark as [number, number, number],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 1.5,
    },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'center',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 46 },
      2: { halign: 'center', cellWidth: 10 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'center', cellWidth: 12 },
      5: { halign: 'center', cellWidth: 12 },
      6: { halign: 'center', cellWidth: 11 },
      7: { halign: 'right', cellWidth: 15 },
      8: { halign: 'center', cellWidth: 12 },
      9: { halign: 'right', cellWidth: 16 },
      10: { halign: 'right', cellWidth: 22 },
    },
    margin: { left: margin, right: margin },
  });

  // Calculate position after table
  const finalY = (doc as any).lastAutoTable.finalY || currentY + 60;
  let bottomY = finalY + 6;

  // Check if we need to add a new page if space is low
  if (bottomY + 55 > pageHeight) {
    doc.addPage();
    bottomY = 20;
  }

  // 6. TECHNICAL OBSERVATIONS & RECOMMENDATIONS
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(226, 232, 240);
  const obsHeight = 36;
  doc.roundedRect(margin, bottomY, pageWidth - margin * 2, obsHeight, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(electricAmber[0], electricAmber[1], electricAmber[2]);
  doc.text('OBSERVACIONES TÉCNICAS Y RECOMENDACIONES DE MEJORA', margin + 4, bottomY + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  let obsText = client.technicianNotes || 'Instalación inspeccionada de acuerdo a las directrices de seguridad eléctrica.';
  const splitObs = doc.splitTextToSize(obsText, pageWidth - margin * 2 - 8);
  doc.text(splitObs.slice(0, 2), margin + 4, bottomY + 10.5);

  // Recommendations bullets
  let recY = bottomY + 18;
  const recs = client.recommendations && client.recommendations.length > 0
    ? client.recommendations
    : [
        'Revisar el apriete de bornes y barra de neutro en el centro de carga.',
        'Mantener el balance de cargas de acuerdo a la asignación de fases especificada.',
        'Verificar que los conductores de circuitos derivados cumplan la capacidad de corriente de la protección.',
      ];

  recs.slice(0, 3).forEach((rec) => {
    doc.setFillColor(electricAmber[0], electricAmber[1], electricAmber[2]);
    doc.circle(margin + 5, recY - 0.8, 0.8, 'F');
    doc.text(rec, margin + 8, recY);
    recY += 4.5;
  });

  bottomY += obsHeight + 6;

  // 6.5 ANEXO DIAGNÓSTICO SISTEMÁTICO SI HAY MEDICIONES
  const diagData = client.diagnosticMeasurements
    ? analyzeInstallation(client, client.diagnosticMeasurements)
    : null;

  if (diagData && diagData.actionPlan.length > 0) {
    doc.addPage();
    let diagY = 16;

    // Header banner for diagnostic annex
    doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
    doc.rect(0, 0, pageWidth, 22, 'F');
    doc.setFillColor(electricAmber[0], electricAmber[1], electricAmber[2]);
    doc.rect(0, 22, pageWidth, 2, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('ANEXO: DIAGNÓSTICO DEL ESTADO DE LAS FASES Y PLAN SISTEMÁTICO DE TRABAJO', margin, 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(203, 213, 225);
    doc.text(`Evaluación según normas NEC / IEEE / IEC • Cliente: ${client.clientName}`, margin, 17);

    diagY = 28;

    // Diagnostic Summary Strip
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(margin, diagY, pageWidth - margin * 2, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
    doc.text(`Índice de Seguridad: ${diagData.safetyScore}/100 (${diagData.riskLevel})`, margin + 4, diagY + 6);
    doc.text(`Desbalance Tensión: ${diagData.voltageUnbalancePercent}% (Límite 2%)`, margin + 65, diagY + 6);
    doc.text(`Desbalance Corriente: ${diagData.currentUnbalancePercent}%`, margin + 125, diagY + 6);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    const m = client.diagnosticMeasurements!;
    doc.text(
      `Tensiones Medidas: L1=${m.vL1N}V | L2=${m.vL2N || '-'}V | L3=${m.vL3N || '-'}V  •  Corrientes: L1=${m.iL1}A | L2=${m.iL2 ?? '-'}A | L3=${m.iL3 ?? '-'}A | Neutro=${m.iNeutro}A`,
      margin + 4,
      diagY + 11
    );

    diagY += 21;

    // Action plan table
    const actionRows = diagData.actionPlan.map((act, i) => [
      `#${i + 1}`,
      act.priority.toUpperCase(),
      act.category,
      act.title,
      act.recommendedMaterial || '-',
      `${act.estimatedHours} h`,
    ]);

    autoTable(doc, {
      startY: diagY,
      head: [['#', 'Prioridad', 'Categoría', 'Trabajo / Acción a Realizar', 'Material Sugerido', 'Horas']],
      body: actionRows,
      theme: 'grid',
      headStyles: {
        fillColor: primaryDark as [number, number, number],
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
      },
      bodyStyles: {
        fontSize: 6.5,
        textColor: [30, 41, 59],
        cellPadding: 1.5,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { halign: 'center', cellWidth: 20 },
        2: { halign: 'center', cellWidth: 22 },
        3: { cellWidth: 68 },
        4: { cellWidth: 50 },
        5: { halign: 'center', cellWidth: 14 },
      },
      margin: { left: margin, right: margin },
    });

    const diagFinalY = (doc as any).lastAutoTable.finalY || diagY + 60;
    bottomY = diagFinalY + 10;
  }

  // Check if signatures fit or require new page
  if (bottomY + 28 > pageHeight) {
    doc.addPage();
    bottomY = 20;
  }

  // 7. SIGNATURES & STAMP AREA
  const sigBoxWidth = (pageWidth - margin * 2 - 14) / 2;

  // Electrician Signature Box
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin + 10, bottomY + 16, margin + sigBoxWidth - 10, bottomY + 16);
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`${technician.name || 'Técnico Responsable'}`, margin + sigBoxWidth / 2, bottomY + 20, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`Técnico Electricista Certificado | Reg: ${technician.licenseNumber || 'Matrícula Oficial'}`, margin + sigBoxWidth / 2, bottomY + 24, { align: 'center' });

  // Client Signature Box
  const clientSigX = margin + sigBoxWidth + 14;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(clientSigX + 10, bottomY + 16, clientSigX + sigBoxWidth - 10, bottomY + 16);
  doc.setLineDashPattern([], 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`${client.clientName}`, clientSigX + sigBoxWidth / 2, bottomY + 20, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text('Firma de Conformidad del Cliente / Propietario', clientSigX + sigBoxWidth / 2, bottomY + 24, { align: 'center' });

  // Footer page numbers
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `ElectroPro v1.0 - Software Profesional para Electricistas | Página ${i} de ${totalPages}`,
      pageWidth / 2,
      pageHeight - 6,
      { align: 'center' }
    );
  }

  // Trigger download
  const cleanClientName = client.clientName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`Reporte_Electrico_${cleanClientName}_${dateStr}.pdf`);
}

function drawKpiTile(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  value: string,
  subtitle: string
) {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(title, x + 3.5, y + 4.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(15, 23, 42);
  doc.text(value, x + 3.5, y + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitle, x + 3.5, y + 14.5);
}

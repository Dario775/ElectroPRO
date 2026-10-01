import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ClientRecord, ProjectBudget, TechnicianProfile, SupportedCurrency } from '../types/electrical';
import { formatCurrency } from '../utils/electricalMath';

export function generateBudgetPDF(
  client: ClientRecord,
  budget: ProjectBudget,
  technician: TechnicianProfile,
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

  const pageWidth = doc.internal.pageSize.getWidth(); // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297 mm
  const margin = 10;
  const contentWidth = pageWidth - margin * 2; // 190 mm

  // Color Palette
  const primaryDark = [15, 23, 42]; // slate-900
  const electricAmber = [217, 119, 6]; // amber-600
  const accentEmerald = [5, 150, 105]; // emerald-600
  const textDark = [30, 41, 59]; // slate-800
  const textMuted = [100, 116, 139]; // slate-500
  const bgLight = [248, 250, 252]; // slate-50

  // 1. TOP HEADER BANNER (16mm + 1.2mm accent stripe)
  doc.setFillColor(primaryDark[0], primaryDark[1], primaryDark[2]);
  doc.rect(0, 0, pageWidth, 16, 'F');

  // Amber accent line
  doc.setFillColor(electricAmber[0], electricAmber[1], electricAmber[2]);
  doc.rect(0, 16, pageWidth, 1.2, 'F');

  // Company / Technician Title (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(255, 255, 255);
  doc.text(technician.companyName || 'SERVICIOS ELÉCTRICOS PROFESIONALES', margin, 6.0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Resp. Técnico: ${technician.name} • Mat: ${technician.licenseNumber || 'Certificado'} • Tel: ${technician.phone || '-'}`,
    margin,
    10.2
  );
  doc.setFontSize(6.6);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Email: ${technician.email || '-'} • Presupuesto Oficial y Dictamen Técnico`,
    margin,
    14.0
  );

  // Budget Number & Date Badge (Right top)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(251, 191, 36); // amber-400
  doc.text(budget.budgetNumber, pageWidth - margin, 6.0, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);
  doc.text(`Fecha: ${budget.date} • Validez: ${budget.validityDays} días`, pageWidth - margin, 10.2, { align: 'right' });
  doc.setFontSize(7.0);
  doc.setTextColor(52, 211, 153); // emerald-400
  doc.text(
    `Moneda: ${effectiveCurrency === 'ARS' ? 'Pesos Arg. (ARS)' : 'Dólares (USD)'}`,
    pageWidth - margin,
    14.0,
    { align: 'right' }
  );

  // 2. CLIENT & PROJECT METADATA STRIP (16mm)
  const clientCardY = 18.5;
  const clientCardHeight = 16.0;
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, clientCardY, contentWidth, clientCardHeight, 1.5, 1.5, 'FD');

  // Row 1 (Y = clientCardY + 4.8)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.0);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('CLIENTE:', margin + 3.5, clientCardY + 4.8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(primaryDark[0], primaryDark[1], primaryDark[2]);
  doc.text(`${client.clientName}`, margin + 19, clientCardY + 4.8);

  if (client.documentId) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.0);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
    doc.text(`(ID/DNI: ${client.documentId})`, margin + 20 + doc.getTextWidth(client.clientName) + 1, clientCardY + 4.8);
  }

  // Right side row 1
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text(`SUMINISTRO: ${client.serviceType} (${client.nominalVoltage}V)`, pageWidth - margin - 3.5, clientCardY + 4.8, {
    align: 'right',
  });

  // Row 2 (Y = clientCardY + 9.5)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(
    `Dirección: ${client.address || 'Inmueble del cliente'} • Contacto: ${client.phone || '-'}`,
    margin + 3.5,
    clientCardY + 9.5
  );

  doc.setTextColor(accentEmerald[0], accentEmerald[1], accentEmerald[2]);
  doc.setFont('helvetica', 'bold');
  doc.text(`Plazo estimado de ejecución: ${budget.estimatedDaysToComplete} días hábiles`, pageWidth - margin - 3.5, clientCardY + 9.5, {
    align: 'right',
  });

  // Row 3 (Y = clientCardY + 14.0)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(electricAmber[0], electricAmber[1], electricAmber[2]);
  doc.text('OBJETO:', margin + 3.5, clientCardY + 14.0);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  const truncatedTitle = budget.title.length > 105 ? budget.title.substring(0, 102) + '...' : budget.title;
  doc.text(truncatedTitle, margin + 18, clientCardY + 14.0);

  // 3. ITEMS TABLE (Responsive sizing to fill the sheet and stay large and legible)
  const tableData = budget.items.map((item, idx) => {
    const markupFactor = 1 + (item.markupPercent || 0) / 100;
    const finalUnitPrice = item.unitPrice * markupFactor * factor;
    const itemSubtotal = item.quantity * finalUnitPrice;

    const typeLabel =
      item.type === 'material'
        ? 'MATERIAL'
        : item.type === 'mano_de_obra'
        ? 'M. OBRA'
        : item.type === 'tramite'
        ? 'GESTIÓN'
        : 'EQUIPO';

    let desc = item.description;
    if (item.brand) {
      desc += ` [${item.brand}]`;
    }
    if (item.detail) {
      desc += `\n• ${item.detail}`;
    }

    return [
      `#${idx + 1}`,
      typeLabel,
      desc,
      `${item.quantity} ${item.unit}`,
      formatCurrency(finalUnitPrice, effectiveCurrency),
      formatCurrency(itemSubtotal, effectiveCurrency),
    ];
  });

  // Calculate Subtotals
  const grossSubtotal = budget.items.reduce((acc, item) => {
    const markupFactor = 1 + (item.markupPercent || 0) / 100;
    return acc + item.quantity * item.unitPrice * markupFactor * factor;
  }, 0);

  const materialsSubtotal = budget.items
    .filter((i) => i.type === 'material')
    .reduce((acc, item) => {
      const markupFactor = 1 + (item.markupPercent || 0) / 100;
      return acc + item.quantity * item.unitPrice * markupFactor * factor;
    }, 0);

  const laborSubtotal = grossSubtotal - materialsSubtotal;

  const discountVal = budget.discountAmount
    ? budget.discountAmount * factor
    : budget.discountPercent
    ? (grossSubtotal * budget.discountPercent) / 100
    : 0;

  const baseAfterDiscount = Math.max(0, grossSubtotal - discountVal);
  const taxVal = budget.applyTax ? (baseAfterDiscount * (budget.taxPercent || 0)) / 100 : 0;
  const grandTotal = baseAfterDiscount + taxVal;

  const itemCount = budget.items.length;

  // Calibrated readable font size and cell padding so it covers the sheet generously without passing to page 2
  let tableFontSize: number;
  let tableCellPadding: number;

  if (itemCount <= 4) {
    tableFontSize = 9.2;
    tableCellPadding = 3.6;
  } else if (itemCount <= 7) {
    tableFontSize = 8.6;
    tableCellPadding = 2.8;
  } else if (itemCount <= 11) {
    tableFontSize = 8.0;
    tableCellPadding = 2.0;
  } else if (itemCount <= 15) {
    tableFontSize = 7.5;
    tableCellPadding = 1.5;
  } else if (itemCount <= 19) {
    tableFontSize = 6.8;
    tableCellPadding = 1.1;
  } else {
    tableFontSize = 6.0;
    tableCellPadding = 0.7;
  }

  autoTable(doc, {
    startY: 37,
    head: [['#', 'Tipo', 'Descripción del Rubro / Material / Servicio', 'Cant.', 'P. Unitario', 'Subtotal']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: primaryDark as [number, number, number],
      textColor: [255, 255, 255],
      fontSize: tableFontSize + 0.3,
      fontStyle: 'bold',
      halign: 'center',
      cellPadding: Math.min(tableCellPadding + 0.6, 3.8),
    },
    bodyStyles: {
      fontSize: tableFontSize,
      textColor: [30, 41, 59],
      cellPadding: tableCellPadding,
    },
    alternateRowStyles: {
      fillColor: [250, 252, 254],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 16 },
      2: { cellWidth: 98 },
      3: { halign: 'center', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 24 },
      5: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: margin, right: margin },
    pageBreak: 'avoid',
  });

  // 4. BALANCED AND DISTRIBUTED CLOSURE BLOCK (Terms + Totals + Technical Specifications)
  const finalY = (doc as any).lastAutoTable.finalY || 100;
  const maxContentBottom = 250; // signatures line at 268, leaving ample clearance
  const hasExtraRows = discountVal > 0 || budget.applyTax;
  const boxHeight = hasExtraRows ? 32 : 28;

  // Check if we have room for the Technical Specifications and Safety Standards card
  const remainingSpace = maxContentBottom - (finalY + boxHeight);
  const showNormsCard = remainingSpace >= 26;
  const normsCardHeight = showNormsCard ? 19 : 0;

  // Distribute any extra slack space smoothly so the entire page is covered proportionally
  const totalElementsHeight = boxHeight + (showNormsCard ? normsCardHeight + 4 : 0);
  const freeSlack = Math.max(0, maxContentBottom - (finalY + totalElementsHeight));
  const gap1 = Math.min(freeSlack * 0.35, 12);
  const gap2 = Math.min(freeSlack * 0.30, 10);

  const totalsY = finalY + 4 + gap1;
  const termsBoxWidth = 98;
  const summaryBoxWidth = 88;
  const summaryBoxX = pageWidth - margin - summaryBoxWidth; // 112

  // Draw Left Box: Commercial Conditions
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(margin, totalsY, termsBoxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('CONDICIONES COMERCIALES Y EJECUCIÓN', margin + 3.5, totalsY + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.6);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);

  let conditionLineY = totalsY + 9.0;
  doc.text(`• Forma de Pago: ${budget.paymentTerms || '50% anticipo, 50% al finalizar.'}`, margin + 3.5, conditionLineY);

  conditionLineY += 4.5;
  doc.text(
    `• Plazo: ${budget.estimatedDaysToComplete} días hábiles • Garantía: ${budget.warrantyMonths} meses sobre instalación.`,
    margin + 3.5,
    conditionLineY
  );

  conditionLineY += 4.5;
  doc.text(`• Validez de la Oferta: ${budget.validityDays} días corridos desde su emisión.`, margin + 3.5, conditionLineY);

  conditionLineY += 4.5;
  if (factor !== 1) {
    doc.setTextColor(electricAmber[0], electricAmber[1], electricAmber[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `• Cotiz: 1 USD = $${rate.toLocaleString('es-AR')} ARS (${effectiveCurrency === 'ARS' ? 'en Pesos' : 'en Dólares'}).`,
      margin + 3.5,
      conditionLineY
    );
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  } else {
    const noteText = budget.notes ? `• Nota: ${budget.notes}` : '• Instalación bajo normas de seguridad eléctrica vigentes.';
    const splitNote = doc.splitTextToSize(noteText, termsBoxWidth - 7);
    doc.text(splitNote[0], margin + 3.5, conditionLineY);
  }

  // Draw Right Box: Summary Totals
  doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.25);
  doc.roundedRect(summaryBoxX, totalsY, summaryBoxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);

  let currentSummaryRowY = totalsY + 5.5;

  // Subtotal Materiales
  doc.text('Subtotal Materiales:', summaryBoxX + 4, currentSummaryRowY);
  doc.text(formatCurrency(materialsSubtotal, effectiveCurrency), summaryBoxX + summaryBoxWidth - 4, currentSummaryRowY, {
    align: 'right',
  });

  // Subtotal Mano de Obra
  currentSummaryRowY += 5.0;
  doc.text('Subtotal Mano de Obra:', summaryBoxX + 4, currentSummaryRowY);
  doc.text(formatCurrency(laborSubtotal, effectiveCurrency), summaryBoxX + summaryBoxWidth - 4, currentSummaryRowY, {
    align: 'right',
  });

  // Descuento comercial
  if (discountVal > 0) {
    currentSummaryRowY += 5.0;
    doc.setTextColor(220, 38, 38);
    doc.text('Descuento comercial:', summaryBoxX + 4, currentSummaryRowY);
    doc.text(`-${formatCurrency(discountVal, effectiveCurrency)}`, summaryBoxX + summaryBoxWidth - 4, currentSummaryRowY, {
      align: 'right',
    });
    doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  }

  // Impuestos / IVA
  if (budget.applyTax) {
    currentSummaryRowY += 5.0;
    doc.text(`Impuestos / IVA (${budget.taxPercent}%):`, summaryBoxX + 4, currentSummaryRowY);
    doc.text(formatCurrency(taxVal, effectiveCurrency), summaryBoxX + summaryBoxWidth - 4, currentSummaryRowY, {
      align: 'right',
    });
  }

  // Highlight line for grand total
  currentSummaryRowY += 3.0;
  doc.setFillColor(electricAmber[0], electricAmber[1], electricAmber[2]);
  doc.rect(summaryBoxX + 3, currentSummaryRowY, summaryBoxWidth - 6, 0.4, 'F');

  // TOTAL GENERAL
  currentSummaryRowY += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.0);
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('TOTAL GENERAL:', summaryBoxX + 4, currentSummaryRowY);
  doc.setTextColor(electricAmber[0], electricAmber[1], electricAmber[2]);
  doc.text(formatCurrency(grandTotal, effectiveCurrency), summaryBoxX + summaryBoxWidth - 4, currentSummaryRowY, {
    align: 'right',
  });

  const totalsBottomY = totalsY + boxHeight;

  // Optional: Technical Specifications and Standards card (fills page gracefully when items count leaves room)
  if (showNormsCard) {
    const normsCardY = totalsBottomY + 4 + gap2;
    doc.setFillColor(bgLight[0], bgLight[1], bgLight[2]);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.roundedRect(margin, normsCardY, contentWidth, normsCardHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(primaryDark[0], primaryDark[1], primaryDark[2]);
    doc.text('NORMATIVA TÉCNICA, SEGURIDAD Y ALCANCE DE LA INSTALACIÓN', margin + 3.5, normsCardY + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);

    // Col 1
    doc.text(
      '• Trabajos bajo lineamientos de seguridad eléctrica y reglamentación AEA 90364 / IRAM.',
      margin + 3.5,
      normsCardY + 9.5
    );
    doc.text(
      '• Materiales normalizados con sello de certificación y conformidad de fabricación.',
      margin + 3.5,
      normsCardY + 14.5
    );

    // Col 2
    const col2X = margin + 98;
    doc.text(
      '• Verificación de continuidad de conductores de protección (PE) y aislamiento.',
      col2X,
      normsCardY + 9.5
    );
    doc.text(
      '• Mano de obra calificada con herramientas aisladas a 1000V y medidas de protección.',
      col2X,
      normsCardY + 14.5
    );
  }

  // 5. SIGNATURE BLOCK (Anchored cleanly at bottom of the page)
  const signY = 268;

  const sigLineWidth = 64;
  const leftSigStartX = margin + 12;
  const leftSigEndX = leftSigStartX + sigLineWidth;
  const leftSigCenterX = leftSigStartX + sigLineWidth / 2;

  const rightSigEndX = pageWidth - margin - 12;
  const rightSigStartX = rightSigEndX - sigLineWidth;
  const rightSigCenterX = rightSigStartX + sigLineWidth / 2;

  // Signature lines
  doc.setDrawColor(148, 163, 184); // slate-400
  doc.setLineWidth(0.35);
  doc.line(leftSigStartX, signY, leftSigEndX, signY);
  doc.line(rightSigStartX, signY, rightSigEndX, signY);

  // Signature Titles
  doc.setFontSize(7.6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(textDark[0], textDark[1], textDark[2]);
  doc.text('FIRMA RESPONSABLE TÉCNICO', leftSigCenterX, signY + 4.2, { align: 'center' });
  doc.text('CONFORMIDAD DEL CLIENTE', rightSigCenterX, signY + 4.2, { align: 'center' });

  // Technician & Client details
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(textMuted[0], textMuted[1], textMuted[2]);
  doc.text(`${technician.name} • ${technician.companyName}`, leftSigCenterX, signY + 8.2, { align: 'center' });
  doc.text(`${client.clientName}`, rightSigCenterX, signY + 8.2, { align: 'center' });

  // License and Legal Aclaración
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Matrícula/Reg: ${technician.licenseNumber || 'Certificado Oficial'}`,
    leftSigCenterX,
    signY + 11.8,
    { align: 'center' }
  );
  doc.text(
    `Aclaración / DNI: ${client.documentId ? client.documentId : '................................................'}`,
    rightSigCenterX,
    signY + 11.8,
    { align: 'center' }
  );

  // 6. BOTTOM FOOTER BAR (Single Page)
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.2);
  doc.line(margin, pageHeight - 6.5, pageWidth - margin, pageHeight - 6.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    `Presupuesto Oficial ${budget.budgetNumber} • ${technician.companyName} • Validez: ${budget.validityDays} días`,
    margin,
    pageHeight - 3.5
  );
  doc.text(
    `Página 1 de 1 • Documento Técnico Oficial`,
    pageWidth - margin,
    pageHeight - 3.5,
    { align: 'right' }
  );

  // Strict guarantee: exactly 1 single page as requested
  while (doc.getNumberOfPages() > 1) {
    doc.deletePage(doc.getNumberOfPages());
  }

  // Save / Download PDF
  const sanitizedClient = client.clientName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`Presupuesto_${budget.budgetNumber}_${sanitizedClient}.pdf`);
}

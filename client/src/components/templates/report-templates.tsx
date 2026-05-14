// Single entry point for the four printable report templates (delivery
// sheet, in/out, P&L, S&H statement). The server's report-pdf pipeline
// imports this bundle, hands it { type, data }, and renderToString
// dispatches to the matching template. Invoice has its own bundle
// (InvoiceTemplate) for now; consolidation can happen later.

import DeliveryTemplate from './delivery/DeliveryTemplate';
import IOReportTemplate from './io-report/IOReportTemplate';
import PnLTemplate from './pnl/PnLTemplate';
import ShStatementTemplate from './sh-statement/ShStatementTemplate';
import type { DeliveryData } from './delivery/types';
import type { IOReportData } from './io-report/types';
import type { PnLData } from './pnl/types';
import type { ShStatementData } from './sh-statement/types';

export type ReportTemplateProps =
  | { type: 'delivery_sheet'; data: DeliveryData }
  | { type: 'io_report'; data: IOReportData }
  | { type: 'pnl'; data: PnLData }
  | { type: 'sh_statement'; data: ShStatementData };

export default function ReportTemplate(props: ReportTemplateProps) {
  switch (props.type) {
    case 'delivery_sheet':
      return <DeliveryTemplate data={props.data} />;
    case 'io_report':
      return <IOReportTemplate data={props.data} />;
    case 'pnl':
      return <PnLTemplate data={props.data} />;
    case 'sh_statement':
      return <ShStatementTemplate data={props.data} />;
  }
}

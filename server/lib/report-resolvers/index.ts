import { resolveDeliverySheet, type DeliverySheetParams } from './delivery.js';
import { resolveIoReport, type IoReportParams } from './io.js';
import { resolvePnL, type PnlParams } from './pnl.js';
import { resolveShStatement, type ShStatementParams } from './sh-statement.js';
import type { ResolvedReportData } from './types.js';

export * from './types.js';

// Dispatcher: validation has already happened upstream in the route
// (createReportSchema), so each branch can cast its `parameters` payload
// to the type the resolver expects.
export async function resolveReport(
  reportType: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters: any,
  reportId: number,
): Promise<ResolvedReportData> {
  switch (reportType) {
    case 'delivery_sheet':
      return {
        report_type: 'delivery_sheet',
        data: await resolveDeliverySheet(
          parameters as DeliverySheetParams,
          reportId,
        ),
      };
    case 'io_report':
      return {
        report_type: 'io_report',
        data: await resolveIoReport(parameters as IoReportParams, reportId),
      };
    case 'pnl':
      return {
        report_type: 'pnl',
        data: await resolvePnL(parameters as PnlParams, reportId),
      };
    case 'sh_statement':
      return {
        report_type: 'sh_statement',
        data: await resolveShStatement(
          parameters as ShStatementParams,
          reportId,
        ),
      };
    default:
      throw new Error(`Unsupported report_type: ${reportType}`);
  }
}

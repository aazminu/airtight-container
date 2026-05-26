import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DeliveryReceiptTemplate from '../components/templates/delivery-receipt/DeliveryReceiptTemplate';
import type { DeliveryData } from '../components/templates/delivery/types';

// Standalone print page for delivery receipts. Renders the
// receipt-format template at 80mm width and auto-fires
// window.print() once the data has loaded. The operator opens this
// route in a new tab from ReportDetail; iOS Safari shows the
// AirPrint picker, operator selects the yard printer, paper drops.
//
// No navbar / app chrome — the body class swap below removes
// everything except the receipt content so the print preview
// matches the printed output exactly.

interface ReportRow {
  id: number;
  report_type: string;
  resolved_data: DeliveryData | null;
}

interface ApiResponse {
  status: string;
  data: { report: ReportRow };
}

export default function PrintReceipt() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DeliveryData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Strip the app's normal page chrome for the duration of this
    // route. Restored on unmount.
    document.body.classList.add('receiptPrintWrap');
    return () => {
      document.body.classList.remove('receiptPrintWrap');
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/report/${id}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ApiResponse;
        if (cancelled) return;
        const row = body.data.report;
        if (row.report_type !== 'delivery_sheet') {
          setError('This report type cannot be printed as a receipt.');
          return;
        }
        if (!row.resolved_data) {
          setError('Report has no resolved data yet.');
          return;
        }
        setData(row.resolved_data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Auto-fire the print dialog once data is loaded and the receipt
  // has had a chance to render. Small delay so the layout settles
  // before Safari snapshots the page for AirPrint.
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      window.print();
    }, 250);
    return () => clearTimeout(t);
  }, [data]);

  if (error) {
    return (
      <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
        <p>{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: '1rem', fontFamily: 'sans-serif' }}>
        Loading receipt…
      </div>
    );
  }
  return <DeliveryReceiptTemplate data={data} />;
}

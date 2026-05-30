import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import PickupReceiptTemplate from '../components/templates/pickup-receipt/PickupReceiptTemplate';
import type { PickupReceiptData } from '../components/templates/pickup-receipt/PickupReceiptTemplate';

// Single-box thermal print page for S&H pickup receipts. Mirrors
// PrintReceipt.tsx (delivery): strips navbar/body chrome, fetches data
// for the box, auto-fires window.print() once the receipt renders.

interface ApiResponse {
  status: string;
  data: { receipt: PickupReceiptData };
}

export default function PickupReceiptPrint() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<PickupReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
        const res = await fetch(`/api/v2/sh-inventory/${id}/pickup-receipt`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Something went wrong');
        const body = (await res.json()) as ApiResponse;
        if (cancelled) return;
        setData(body.data.receipt);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => {
      window.print();
    }, 250);
    return () => clearTimeout(t);
  }, [data]);

  if (error) return <div style={{ padding: '1rem' }}>{error}</div>;
  if (!data) return null;
  return <PickupReceiptTemplate data={data} />;
}

import { useContext, useEffect, useMemo, useState } from 'react';
import YardRow, { type YardContainer } from '../rows/YardRow';
import { userContext } from '../../context/restaurantcontext';

type YardCardType = 'available' | 'hold' | 'sold';

interface Props {
  type: YardCardType;
}

const PAGE_SIZE = 10;

const TITLES: Record<YardCardType, string> = {
  available: 'Available Units',
  hold: 'Held Units',
  sold: 'Sold Units',
};

// Yard view treats 'outbound' as "no longer in the yard" — so the Sold
// card only shows state === 'sold' (mirrors the legacy filter). Boxes
// that have already shipped out drop off this view.
const STATE_PREDICATE: Record<YardCardType, (s: YardContainer['state']) => boolean> = {
  available: (s) => s === 'available',
  hold: (s) => s === 'hold',
  sold: (s) => s === 'sold',
};

interface ListResponse {
  data: { inventory: YardContainer[] };
}

function UpcomingOutbounds({ type }: Props) {
  const { setPopup } = useContext(userContext) as {
    setPopup: (msg: string) => void;
  };
  const [boxes, setBoxes] = useState<YardContainer[]>([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/inventory', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as ListResponse;
        if (cancelled) return;
        const filtered = body.data.inventory.filter((c) => STATE_PREDICATE[type](c.state));
        setBoxes(filtered);
        setPage(0);
      } catch {
        if (!cancelled) setPopup('ERROR Unable to get inventory');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, setPopup]);

  const pageCount = Math.max(1, Math.ceil(boxes.length / PAGE_SIZE));
  const pageBoxes = useMemo(
    () => boxes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [boxes, page],
  );

  return (
    <div className={`${type}Container`}>
      <h2 className="yardHead">
        {TITLES[type]}
        <span className="yardCount">{boxes.length}</span>
      </h2>
      <div className="yardScrollWrap">
        <table className="yardTable">
          <thead>
            <tr>
              <th>Unit Number</th>
              <th>Size</th>
              {type === 'sold' ? (
                <>
                  <th>Outbound</th>
                  <th>Release #</th>
                </>
              ) : (
                <th>Days Onsite</th>
              )}
            </tr>
          </thead>
          <tbody>
            {pageBoxes.map((c) => (
              <YardRow key={c.id} container={c} />
            ))}
            {pageBoxes.length === 0 && (
              <tr>
                <td colSpan={type === 'sold' ? 4 : 3} className="yardEmpty">
                  No units.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <div className="yardPagination">
          <button
            type="button"
            className="yardPageBtn"
            onClick={() => setPage((p) => p - 1)}
            disabled={page === 0}
          >
            ← Prev
          </button>
          <span className="yardPageInfo">
            {page + 1} / {pageCount}
          </span>
          <button
            type="button"
            className="yardPageBtn"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pageCount - 1}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default UpcomingOutbounds;

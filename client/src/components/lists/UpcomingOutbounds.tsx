import { useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import YardRow, { type YardContainer } from '../rows/YardRow';
import { userContext } from '../../context/userContext';

type YardCardType = 'available' | 'hold' | 'sold';

interface Props {
  type: YardCardType;
}

const PAGE_SIZE = 10;

const TITLE_KEY: Record<YardCardType, string> = {
  available: 'outbounds.available',
  hold: 'outbounds.held',
  sold: 'outbounds.sold',
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
  const { t } = useTranslation();
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
        if (!cancelled) setPopup(t('outbounds.load_error'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [type, setPopup, t]);

  const pageCount = Math.max(1, Math.ceil(boxes.length / PAGE_SIZE));
  const pageBoxes = useMemo(
    () => boxes.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [boxes, page],
  );

  return (
    <div className={`${type}Container`}>
      <h2 className="yardHead">
        {t(TITLE_KEY[type])}
        <span className="yardCount">{boxes.length}</span>
      </h2>
      <div className="yardScrollWrap">
        <table className="yardTable">
          <thead>
            <tr>
              <th>{t('outbounds.unit_number')}</th>
              <th>{t('outbounds.size')}</th>
              {type === 'sold' ? (
                <>
                  <th>{t('outbounds.outbound')}</th>
                  <th>{t('outbounds.release_num')}</th>
                </>
              ) : (
                <th>{t('outbounds.days_onsite')}</th>
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
                  {t('outbounds.no_units')}
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
            {t('common.prev_arrow')}
          </button>
          <span className="yardPageInfo">
            {t('common.page_of', { page: page + 1, total: pageCount })}
          </span>
          <button
            type="button"
            className="yardPageBtn"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pageCount - 1}
          >
            {t('common.next_arrow')}
          </button>
        </div>
      )}
    </div>
  );
}

export default UpcomingOutbounds;

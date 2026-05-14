// Yard-view row. Renders different columns per inventory state:
//   available / hold → Unit + Size + Days onsite
//   sold             → Unit + Size + Outbound (date + ET time) + Release #
// Outbound timestamps are displayed in America/New_York (Manalapan NJ
// time). Previously the file hand-rolled an offset-arithmetic conversion
// that broke under DST and silently dropped minutes.

export interface YardContainer {
  id: number;
  unit_number: string;
  size: string;
  state: 'pending' | 'available' | 'hold' | 'sold' | 'outbound';
  date: string;
  outbound_date: string | null;
  release_number_value: string | null;
}

interface Props {
  container: YardContainer;
}

const MS_PER_DAY = 86_400_000;
const daysOnsite = (iso: string): number =>
  Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / MS_PER_DAY));

const dateFmt = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'America/New_York',
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'America/New_York',
});

const formatOutbound = (iso: string | null): { date: string; time: string } => {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  return { date: dateFmt.format(d), time: timeFmt.format(d) };
};

function YardRow({ container }: Props) {
  const isSold = container.state === 'sold';

  if (isSold) {
    const { date, time } = formatOutbound(container.outbound_date);
    return (
      <tr>
        <td>{container.unit_number.trim()}</td>
        <td>{container.size}</td>
        <td>
          {date}
          {time && (
            <>
              <br />
              <span className="yardTimeText">{time}</span>
            </>
          )}
        </td>
        <td>{container.release_number_value ?? '—'}</td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{container.unit_number.trim()}</td>
      <td>{container.size}</td>
      <td>{daysOnsite(container.date)}</td>
    </tr>
  );
}

export default YardRow;

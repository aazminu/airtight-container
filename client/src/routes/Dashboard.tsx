import { useState } from 'react';
import '../styles/dashboard.css';
import SetReleases from '../components/forms/SetReleases';
import UserList from '../components/lists/UserList';
import PnLPanel from '../components/PnLPanel';

type Tab = 'pnl' | 'releases' | 'acct';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'pnl', label: 'P&L' },
  { key: 'releases', label: 'Releases' },
  { key: 'acct', label: 'Account Management' },
];

export default function Dashboard() {
  const [currTab, setCurrTab] = useState<Tab>('pnl');
  return (
    <div className="dashContainer">
      <h1 className="invHeader">Dashboard</h1>
      <div className="dashOptions">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={
              currTab === t.key ? 'addBtn dashBtn selectedOption' : 'addBtn'
            }
            onClick={() => setCurrTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={currTab === 'pnl' ? '' : 'hidden'}>
        <PnLPanel />
      </div>
      <div className={currTab === 'releases' ? '' : 'hidden'}>
        <SetReleases />
      </div>
      <div className={currTab === 'acct' ? '' : 'hidden'}>
        <UserList />
      </div>
    </div>
  );
}

import { useState } from 'react';
import '../styles/dashboard.css';
import UserList from '../components/lists/UserList';
import ModPresetsAdmin from '../components/lists/ModPresetsAdmin';
import PnLPanel from '../components/PnLPanel';

type Tab = 'pnl' | 'mods' | 'acct';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'pnl', label: 'P&L' },
  { key: 'mods', label: 'Modification Presets' },
  { key: 'acct', label: 'Account Management' },
];

export default function Dashboard() {
  const [currTab, setCurrTab] = useState<Tab>('pnl');
  return (
    <div className="dashContainer">
      <h1 className="invHeader">Dashboard</h1>
      <div className="dashTabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={currTab === t.key}
            className={
              currTab === t.key ? 'dashTab dashTabActive' : 'dashTab'
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
      <div className={currTab === 'mods' ? '' : 'hidden'}>
        <ModPresetsAdmin />
      </div>
      <div className={currTab === 'acct' ? '' : 'hidden'}>
        <UserList />
      </div>
    </div>
  );
}

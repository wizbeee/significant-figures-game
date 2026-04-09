import React, { useState, useEffect } from 'react';
import ipc from './utils/ipc';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import ApplicantList from './components/ApplicantList';
import ApplicantForm from './components/ApplicantForm';
import ApplicantDetail from './components/ApplicantDetail';
import SelectionPanel from './components/SelectionPanel';
import StatsPanel from './components/StatsPanel';
import Settings from './components/Settings';

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [page, setPage] = useState('dashboard');
  const [pageData, setPageData] = useState(null);

  // 키보드 단축키
  useEffect(() => {
    const handler = (e) => {
      if (!authenticated) return;
      if (e.ctrlKey && e.key === 'n') { e.preventDefault(); navigate('applicant-form'); }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); ipc.exportExcel('applicants'); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [authenticated]);

  const navigate = (p, data = null) => {
    setPage(p);
    setPageData(data);
  };

  if (!authenticated) {
    return <Login onSuccess={() => setAuthenticated(true)} />;
  }

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard navigate={navigate} />;
      case 'applicants': return <ApplicantList navigate={navigate} />;
      case 'applicant-form': return <ApplicantForm navigate={navigate} editId={pageData?.id} />;
      case 'applicant-detail': return <ApplicantDetail navigate={navigate} applicantId={pageData?.id} />;
      case 'selection': return <SelectionPanel navigate={navigate} />;
      case 'stats': return <StatsPanel />;
      case 'settings': return <Settings />;
      default: return <Dashboard navigate={navigate} />;
    }
  };

  return (
    <Layout currentPage={page} navigate={navigate}>
      {renderPage()}
    </Layout>
  );
}

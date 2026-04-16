import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ipc from '../utils/ipc';
import { STATUS_LABEL } from '../utils/format';

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

export default function Dashboard({ navigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const d = await ipc.getDashboard();
      setData(d);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-gray-400">로딩 중...</div></div>;
  if (!data) return <div className="p-8 text-gray-500">데이터를 불러올 수 없습니다.</div>;

  const statusData = data.byStatus.map(s => ({ name: STATUS_LABEL[s.status] || s.status, value: s.cnt }));
  const typeData = data.byType.map(s => ({ name: s.admission_type, value: s.cnt }));
  const accepted = data.byStatus.find(s => s.status === 'accepted')?.cnt || 0;
  const interviewing = data.byStatus.filter(s => ['doc_pass', 'interview_pass'].includes(s.status)).reduce((a, b) => a + b.cnt, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">{data.config.year}학년도 입학전형 현황</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('applicant-form')} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            신규 등록
          </button>
          <button onClick={() => ipc.exportExcel('applicants')} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            엑셀 내보내기
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="총 지원자" value={data.total} unit="명" color="blue" icon="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" onClick={() => navigate('applicants')} />
        <StatCard label="모집 인원" value={data.totalSlots} unit="명" color="green" icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" onClick={() => navigate('settings')} />
        <StatCard label="경쟁률" value={data.competitionRate} unit=": 1" color="amber" icon="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        <StatCard label="합격 확정" value={accepted} unit="명" color="indigo" icon="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" onClick={() => navigate('selection')} />
      </div>

      {/* 차트 영역 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 전형별 현황 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">상태별 현황</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, value }) => `${name} ${value}`}>
                  {statusData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">데이터 없음</div>}
        </div>

        {/* 출신중학교 TOP 10 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">출신중학교 TOP 10</h3>
          {data.bySchool.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.bySchool} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="middle_school" tick={{ fontSize: 12 }} width={75} />
                <Tooltip />
                <Bar dataKey="cnt" fill="#3b82f6" radius={[0, 6, 6, 0]} name="지원자 수" />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="h-[250px] flex items-center justify-center text-gray-400 text-sm">데이터 없음</div>}
        </div>
      </div>

      {/* 전형유형별 */}
      {typeData.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">전형유형별 지원 현황</h3>
          <div className="flex gap-4">
            {typeData.map((t, i) => (
              <div key={i} className="flex-1 p-4 rounded-xl bg-gray-50 border border-gray-100 text-center">
                <div className="text-2xl font-bold text-gray-900">{t.value}<span className="text-sm font-normal text-gray-500 ml-1">명</span></div>
                <div className="text-sm text-gray-600 mt-1">{t.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, unit, color, icon, onClick }) {
  const colorMap = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-emerald-500 to-emerald-600',
    amber: 'from-amber-500 to-amber-600',
    indigo: 'from-indigo-500 to-indigo-600',
  };
  return (
    <div
      onClick={onClick}
      className={`stat-card bg-white rounded-2xl border border-gray-200 p-5 shadow-sm ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {value}<span className="text-base font-normal text-gray-400 ml-1">{unit}</span>
          </p>
        </div>
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorMap[color]} flex items-center justify-center`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d={icon} /></svg>
        </div>
      </div>
    </div>
  );
}

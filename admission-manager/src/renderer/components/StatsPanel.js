import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import ipc from '../utils/ipc';
import { STATUS_LABEL } from '../utils/format';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];

export default function StatsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ipc.getDashboard().then(d => { setData(d); setLoading(false); });
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-gray-400">로딩 중...</div></div>;
  if (!data) return <div className="p-8 text-gray-500">데이터를 불러올 수 없습니다.</div>;

  const statusData = data.byStatus.map(s => ({ name: STATUS_LABEL[s.status] || s.status, value: s.cnt }));
  const typeData = data.byType.map(s => ({ name: s.admission_type, value: s.cnt }));
  const schoolData = data.bySchool;
  const scoreData = data.scoreDistribution;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">통계 / 리포트</h1>
          <p className="text-sm text-gray-500 mt-1">{data.config.year}학년도 입학전형 통계</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => ipc.exportExcel('applicants')} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            지원자 목록 내보내기
          </button>
          <button onClick={() => ipc.exportExcel('results')} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition">
            전형 결과 내보내기
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard label="총 지원자" value={data.total} unit="명" />
        <SummaryCard label="모집 인원" value={data.totalSlots} unit="명" />
        <SummaryCard label="경쟁률" value={data.competitionRate} unit=": 1" />
        <SummaryCard label="합격 확정" value={data.byStatus.find(s => s.status === 'accepted')?.cnt || 0} unit="명" />
      </div>

      {/* 차트 그리드 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 상태별 현황 */}
        <ChartCard title="상태별 현황">
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" outerRadius={95} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        {/* 전형유형별 */}
        <ChartCard title="전형유형별 지원 현황">
          {typeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={typeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[6, 6, 0, 0]} name="지원자 수" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        {/* 출신중학교 TOP 10 */}
        <ChartCard title="출신중학교 TOP 10">
          {schoolData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={schoolData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis type="category" dataKey="middle_school" tick={{ fontSize: 11 }} width={75} />
                <Tooltip />
                <Bar dataKey="cnt" fill="#10b981" radius={[0, 6, 6, 0]} name="지원자 수" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>

        {/* 성적 분포 */}
        <ChartCard title="성적 분포">
          {scoreData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={scoreData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="cnt" fill="#8b5cf6" radius={[6, 6, 0, 0]} name="인원" />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart />}
        </ChartCard>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, unit }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-1">{value}<span className="text-sm font-normal text-gray-400 ml-1">{unit}</span></div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h3 className="font-semibold text-gray-900 mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart() {
  return <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">데이터 없음</div>;
}

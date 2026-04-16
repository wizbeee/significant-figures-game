import React, { useState, useEffect } from 'react';
import ipc from '../utils/ipc';
import { STATUS_LABEL, STATUS_COLOR, formatScore } from '../utils/format';
import EvaluationForm from './EvaluationForm';

export default function ApplicantDetail({ navigate, applicantId }) {
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    ipc.getConfig().then(setConfig);
  }, [applicantId]);

  const loadData = async () => {
    setLoading(true);
    const d = await ipc.getApplicant(applicantId);
    setData(d);
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-gray-400">로딩 중...</div></div>;
  if (!data) return <div className="p-8 text-gray-500">지원자를 찾을 수 없습니다.</div>;

  const tabs = [
    { id: 'info', label: '기본정보' },
    { id: 'doc', label: '서류전형' },
    { id: 'interview', label: '면접전형' },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('applicants')} className="p-2 rounded-lg hover:bg-gray-100 transition">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
            <span className={`badge ${STATUS_COLOR[data.status]}`}>{STATUS_LABEL[data.status]}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">수험번호 {data.exam_number} · {data.middle_school} · {data.admission_type}</p>
        </div>
        <button onClick={() => navigate('applicant-form', { id: data.id })} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
          수정
        </button>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${activeTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 탭 내용 */}
      {activeTab === 'info' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="grid grid-cols-2 gap-y-4 gap-x-8">
            <InfoRow label="이름" value={data.name} />
            <InfoRow label="수험번호" value={data.exam_number} />
            <InfoRow label="생년월일" value={data.birth_date} />
            <InfoRow label="성별" value={data.gender} />
            <InfoRow label="출신중학교" value={data.middle_school} />
            <InfoRow label="전형유형" value={data.admission_type} />
            <InfoRow label="연락처" value={data.phone} />
            <InfoRow label="보호자 연락처" value={data.parent_phone} />
            <InfoRow label="보호자명" value={data.parent_name} />
            <InfoRow label="주소" value={data.address} />
            <InfoRow label="비고" value={data.memo} span2 />
          </div>
          {data.result && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">전형 결과 요약</h3>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center"><div className="text-xs text-gray-500">서류 점수</div><div className="text-lg font-bold text-gray-900">{formatScore(data.result.doc_total)}</div></div>
                <div className="text-center"><div className="text-xs text-gray-500">면접 점수</div><div className="text-lg font-bold text-gray-900">{formatScore(data.result.interview_total)}</div></div>
                <div className="text-center"><div className="text-xs text-gray-500">최종 점수</div><div className="text-lg font-bold text-blue-600">{formatScore(data.result.final_score)}</div></div>
                <div className="text-center"><div className="text-xs text-gray-500">순위</div><div className="text-lg font-bold text-gray-900">{data.result.rank || '-'}</div></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'doc' && (
        <EvaluationForm
          type="doc"
          applicantId={applicantId}
          existingScores={data.doc_scores}
          categories={config?.doc_categories || []}
          onSave={loadData}
        />
      )}

      {activeTab === 'interview' && (
        <EvaluationForm
          type="interview"
          applicantId={applicantId}
          existingScores={data.interview_scores}
          categories={config?.interview_categories || []}
          onSave={loadData}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value, span2 }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{value || '-'}</div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import ipc from '../utils/ipc';
import { STATUS_LABEL, STATUS_COLOR, formatScore } from '../utils/format';

export default function SelectionPanel({ navigate }) {
  const [results, setResults] = useState([]);
  const [config, setConfig] = useState(null);
  const [cutline, setCutline] = useState('');
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [res, cfg] = await Promise.all([ipc.getResults(), ipc.getConfig()]);
    setResults(res);
    setConfig(cfg);
    setCutline(cfg.total_slots || '');
    setLoading(false);
  };

  const handleCalculate = async () => {
    setCalculating(true);
    await ipc.calculateSelection();
    await loadData();
    setCalculating(false);
  };

  const handleDecideAll = async () => {
    const line = parseInt(cutline);
    if (!line || line <= 0) { alert('합격 인원을 설정해 주세요.'); return; }
    if (!window.confirm(`상위 ${line}명을 합격 처리하시겠습니까?\n나머지는 불합격 처리됩니다.`)) return;

    const decisions = results.map(r => ({
      applicant_id: r.applicant_id,
      decision: r.rank <= line ? 'accepted' : 'rejected',
    }));
    await ipc.decideSelection(decisions);
    alert('합격 처리가 완료되었습니다.');
    await loadData();
  };

  const handleToggleDecision = async (applicantId, currentDecision) => {
    const next = currentDecision === 'accepted' ? 'rejected'
      : currentDecision === 'rejected' ? 'waitlist'
      : currentDecision === 'waitlist' ? 'extra_accepted'
      : 'accepted';
    await ipc.decideSelection([{ applicant_id: applicantId, decision: next }]);
    await loadData();
  };

  const accepted = results.filter(r => r.decision === 'accepted' || r.decision === 'extra_accepted').length;
  const rejected = results.filter(r => r.decision === 'rejected').length;
  const waiting = results.filter(r => r.decision === 'waitlist').length;

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-gray-400">로딩 중...</div></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">합격자 선발</h1>
          <p className="text-sm text-gray-500 mt-1">점수 산출 후 합격 라인을 설정하세요.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => ipc.exportExcel('results')} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            전체 결과 내보내기
          </button>
          <button onClick={() => ipc.exportExcel('accepted')} className="px-4 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-sm font-medium hover:bg-amber-100 transition flex items-center gap-2">
            합격자 명단 내보내기
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-center">
          <div className="text-xs text-gray-500">전체 대상</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{results.length}<span className="text-sm font-normal text-gray-400 ml-1">명</span></div>
        </div>
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 shadow-sm text-center">
          <div className="text-xs text-amber-600">합격</div>
          <div className="text-2xl font-bold text-amber-700 mt-1">{accepted}<span className="text-sm font-normal text-amber-500 ml-1">명</span></div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm text-center">
          <div className="text-xs text-gray-500">불합격</div>
          <div className="text-2xl font-bold text-gray-600 mt-1">{rejected}<span className="text-sm font-normal text-gray-400 ml-1">명</span></div>
        </div>
        <div className="bg-purple-50 rounded-2xl border border-purple-200 p-4 shadow-sm text-center">
          <div className="text-xs text-purple-600">추가합격대기</div>
          <div className="text-2xl font-bold text-purple-700 mt-1">{waiting}<span className="text-sm font-normal text-purple-400 ml-1">명</span></div>
        </div>
      </div>

      {/* 작업 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm flex items-center gap-4">
        <button onClick={handleCalculate} disabled={calculating}
          className="px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm disabled:opacity-50">
          {calculating ? '산출 중...' : '점수 산출/갱신'}
        </button>
        <div className="h-8 w-px bg-gray-200" />
        <label className="text-sm text-gray-600">합격 인원:</label>
        <input
          type="number"
          value={cutline}
          onChange={e => setCutline(e.target.value)}
          className="w-24 px-3 py-2 rounded-lg border border-gray-200 text-sm text-center font-mono focus:border-blue-400 outline-none"
          placeholder="인원"
        />
        <span className="text-sm text-gray-400">명</span>
        <button onClick={handleDecideAll}
          className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl text-sm font-medium hover:from-amber-600 hover:to-amber-700 transition shadow-sm">
          원클릭 합격 확정
        </button>
      </div>

      {/* 결과 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 w-16">순위</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">수험번호</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">이름</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">출신중학교</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500">전형유형</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">서류</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">면접</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">최종</th>
              <th className="px-3 py-3 text-center text-xs font-semibold text-gray-500">판정</th>
            </tr>
          </thead>
          <tbody>
            {results.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-16 text-gray-400 text-sm">
                "점수 산출" 버튼을 클릭하여 결과를 생성하세요.
              </td></tr>
            ) : results.map((r, i) => {
              const isCutline = parseInt(cutline) > 0 && r.rank === parseInt(cutline);
              return (
                <React.Fragment key={r.applicant_id}>
                  <tr className={`border-b border-gray-50 hover:bg-blue-50/30 transition-colors ${r.decision === 'accepted' || r.decision === 'extra_accepted' ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-3 py-2.5 text-sm font-bold text-gray-700">{r.rank}</td>
                    <td className="px-3 py-2.5 text-sm font-mono text-gray-600">{r.exam_number}</td>
                    <td className="px-3 py-2.5 text-sm font-semibold text-gray-900 cursor-pointer hover:text-blue-600" onClick={() => navigate('applicant-detail', { id: r.applicant_id })}>{r.name}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-600">{r.middle_school}</td>
                    <td className="px-3 py-2.5 text-sm text-gray-600">{r.admission_type}</td>
                    <td className="px-3 py-2.5 text-sm text-center font-mono">{formatScore(r.doc_total)}</td>
                    <td className="px-3 py-2.5 text-sm text-center font-mono">{formatScore(r.interview_total)}</td>
                    <td className="px-3 py-2.5 text-sm text-center font-mono font-bold text-blue-600">{formatScore(r.final_score)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {r.decision ? (
                        <button onClick={() => handleToggleDecision(r.applicant_id, r.decision)}
                          className={`badge cursor-pointer hover:opacity-80 transition ${STATUS_COLOR[r.decision] || 'bg-gray-100 text-gray-600'}`}>
                          {STATUS_LABEL[r.decision] || r.decision}
                        </button>
                      ) : <span className="text-xs text-gray-400">미결정</span>}
                    </td>
                  </tr>
                  {isCutline && (
                    <tr><td colSpan={9} className="border-t-2 border-dashed border-amber-400 bg-amber-50 py-1 text-center text-xs font-semibold text-amber-600">
                      ▲ 합격 라인 ({cutline}명) ▲
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

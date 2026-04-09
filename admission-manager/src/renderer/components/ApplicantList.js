import React, { useState, useEffect, useCallback } from 'react';
import ipc from '../utils/ipc';
import { STATUS_LABEL, STATUS_COLOR } from '../utils/format';

export default function ApplicantList({ navigate }) {
  const [applicants, setApplicants] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [config, setConfig] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const load = useCallback(async () => {
    const res = await ipc.listApplicants({ search, status: statusFilter, admission_type: typeFilter, page });
    setApplicants(res.rows);
    setTotal(res.total);
    setTotalPages(res.totalPages);
  }, [search, statusFilter, typeFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { ipc.getConfig().then(setConfig); }, []);

  // 드래그앤드롭 엑셀 업로드
  const handleDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { alert('엑셀 파일(.xlsx, .xls, .csv)만 지원합니다.'); return; }
    const result = await ipc.importExcel(file.path);
    alert(`${result.imported}명 등록 완료 (전체 ${result.total}행)${result.errors.length ? '\n오류:\n' + result.errors.join('\n') : ''}`);
    load();
  };

  const handleBulkStatus = async (status) => {
    if (selected.size === 0) return;
    const label = STATUS_LABEL[status];
    if (!window.confirm(`선택한 ${selected.size}명을 "${label}" 상태로 변경하시겠습니까?`)) return;
    await ipc.bulkUpdateStatus([...selected], status);
    setSelected(new Set());
    load();
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`"${name}" 지원자를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
    await ipc.deleteApplicant(id);
    load();
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === applicants.length) setSelected(new Set());
    else setSelected(new Set(applicants.map(a => a.id)));
  };

  return (
    <div
      className={`p-6 max-w-7xl mx-auto space-y-4 ${dragOver ? 'drag-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">지원자 관리</h1>
          <p className="text-sm text-gray-500 mt-1">총 {total}명</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={async () => { const fp = await ipc.openExcelDialog(); if (fp) { const r = await ipc.importExcel(fp); alert(`${r.imported}명 등록 완료`); load(); } }}
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50 transition flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            엑셀 업로드
          </button>
          <button onClick={() => navigate('applicant-form')} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            신규 등록
          </button>
        </div>
      </div>

      {/* 드래그앤드롭 안내 */}
      {dragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-500/10 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl p-10 text-center border-2 border-dashed border-blue-400">
            <svg className="mx-auto mb-4 text-blue-500" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            <p className="text-xl font-semibold text-gray-900">엑셀 파일을 여기에 놓으세요</p>
            <p className="text-sm text-gray-500 mt-1">지원자가 자동으로 일괄 등록됩니다</p>
          </div>
        </div>
      )}

      {/* 검색/필터 바 */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center gap-3 shadow-sm">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="이름, 수험번호, 출신중학교 검색..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
          />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none">
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {config && (
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }} className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 outline-none">
            <option value="">전체 전형</option>
            {config.admission_types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
      </div>

      {/* 일괄 작업 바 */}
      {selected.size > 0 && (
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-3 flex items-center gap-3">
          <span className="text-sm font-medium text-blue-700">{selected.size}명 선택</span>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => handleBulkStatus('doc_pass')} className="px-3 py-1.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition">서류통과</button>
            <button onClick={() => handleBulkStatus('doc_fail')} className="px-3 py-1.5 text-xs font-medium bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition">서류탈락</button>
            <button onClick={() => handleBulkStatus('interview_pass')} className="px-3 py-1.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-lg hover:bg-teal-200 transition">면접통과</button>
            <button onClick={() => setSelected(new Set())} className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition">선택 해제</button>
          </div>
        </div>
      )}

      {/* 테이블 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              <th className="w-10 px-3 py-3"><input type="checkbox" checked={selected.size === applicants.length && applicants.length > 0} onChange={toggleAll} className="rounded" /></th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">수험번호</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">이름</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">출신중학교</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">전형유형</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">상태</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase">최종점수</th>
              <th className="w-20 px-3 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {applicants.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-16 text-gray-400">
                <svg className="mx-auto mb-3" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                등록된 지원자가 없습니다.<br/><span className="text-xs">엑셀 파일을 드래그하거나 "신규 등록" 버튼을 클릭하세요.</span>
              </td></tr>
            ) : applicants.map(a => (
              <tr key={a.id} className="border-b border-gray-50 hover:bg-blue-50/30 transition-colors cursor-pointer" onClick={() => navigate('applicant-detail', { id: a.id })}>
                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleSelect(a.id)} className="rounded" />
                </td>
                <td className="px-3 py-3 text-sm font-mono text-gray-600">{a.exam_number}</td>
                <td className="px-3 py-3 text-sm font-semibold text-gray-900">{a.name}</td>
                <td className="px-3 py-3 text-sm text-gray-600">{a.middle_school}</td>
                <td className="px-3 py-3 text-sm text-gray-600">{a.admission_type}</td>
                <td className="px-3 py-3"><span className={`badge ${STATUS_COLOR[a.status] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[a.status] || a.status}</span></td>
                <td className="px-3 py-3 text-sm font-mono text-gray-700">{a.final_score != null ? a.final_score : '-'}</td>
                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1">
                    <button onClick={() => navigate('applicant-form', { id: a.id })} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition" title="수정">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onClick={() => handleDelete(a.id, a.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition" title="삭제">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 페이징 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50 transition">이전</button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm disabled:opacity-40 hover:bg-gray-50 transition">다음</button>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import ipc from '../utils/ipc';

export default function EvaluationForm({ type, applicantId, existingScores, categories, onSave }) {
  const [scores, setScores] = useState([]);
  const [saving, setSaving] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (existingScores && existingScores.length > 0) {
      setScores(existingScores.map(s => ({ ...s })));
    } else {
      setScores(categories.map(cat => ({
        category: cat,
        score: 0,
        max_score: 100,
        evaluator: '',
        interviewer: '',
        note: '',
      })));
    }
  }, [existingScores, categories]);

  const updateScore = (idx, field, value) => {
    setScores(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const handleScoreChange = (idx, value) => {
    const num = parseFloat(value);
    const max = scores[idx].max_score || 100;
    if (!isNaN(num) && num > max) {
      alert(`최대 점수(${max})를 초과할 수 없습니다.`);
      return;
    }
    updateScore(idx, 'score', isNaN(num) ? 0 : num);
  };

  // Tab 키로 빠른 이동
  const handleKeyDown = (e, idx) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      const nextIdx = idx + 1;
      if (nextIdx < inputRefs.current.length && inputRefs.current[nextIdx]) {
        e.preventDefault();
        inputRefs.current[nextIdx].focus();
        inputRefs.current[nextIdx].select();
      }
    }
  };

  // 엑셀 복사→붙여넣기 지원
  const handlePaste = (e, startIdx) => {
    const text = e.clipboardData.getData('text');
    const rows = text.split('\n').filter(r => r.trim());
    if (rows.length > 1) {
      e.preventDefault();
      setScores(prev => {
        const next = [...prev];
        rows.forEach((row, i) => {
          const idx = startIdx + i;
          if (idx < next.length) {
            const val = parseFloat(row.trim());
            if (!isNaN(val)) next[idx] = { ...next[idx], score: val };
          }
        });
        return next;
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (type === 'doc') {
        await ipc.saveDocScores(applicantId, scores);
      } else {
        await ipc.saveInterviewScores(applicantId, scores);
      }
      alert('점수가 저장되었습니다.');
      onSave();
    } catch (err) {
      alert('저장 오류: ' + err.message);
    }
    setSaving(false);
  };

  const total = scores.reduce((sum, s) => sum + (s.score || 0), 0);
  const avg = scores.length > 0 ? (total / scores.length).toFixed(1) : 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {type === 'doc' ? '서류전형 평가' : '면접전형 평가'}
        </h3>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500">합계: <strong className="text-gray-900">{total.toFixed(1)}</strong></span>
          <span className="text-gray-500">평균: <strong className="text-blue-600">{avg}</strong></span>
        </div>
      </div>

      <p className="text-xs text-gray-400">Tab 키로 다음 항목으로 이동 · 엑셀에서 복사 후 붙여넣기 가능</p>

      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">평가 항목</th>
            <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 w-28">점수</th>
            <th className="text-center py-2 px-3 text-xs font-semibold text-gray-500 w-20">만점</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500 w-32">{type === 'interview' ? '면접관' : '평가자'}</th>
            <th className="text-left py-2 px-3 text-xs font-semibold text-gray-500">비고</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s, idx) => (
            <tr key={idx} className="border-b border-gray-50 hover:bg-blue-50/30 transition">
              <td className="py-2 px-3 text-sm text-gray-700 font-medium">{s.category}</td>
              <td className="py-2 px-3">
                <input
                  ref={el => inputRefs.current[idx] = el}
                  type="number"
                  value={s.score}
                  onChange={e => handleScoreChange(idx, e.target.value)}
                  onKeyDown={e => handleKeyDown(e, idx)}
                  onPaste={e => handlePaste(e, idx)}
                  className="w-full text-center px-2 py-1.5 rounded-lg border border-gray-200 text-sm font-mono focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                  min={0}
                  max={s.max_score}
                  step={0.1}
                />
              </td>
              <td className="py-2 px-3 text-center text-sm text-gray-400">{s.max_score}</td>
              <td className="py-2 px-3">
                <input
                  type="text"
                  value={type === 'interview' ? (s.interviewer || '') : (s.evaluator || '')}
                  onChange={e => updateScore(idx, type === 'interview' ? 'interviewer' : 'evaluator', e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none"
                  placeholder={type === 'interview' ? '면접관명' : '평가자명'}
                />
              </td>
              <td className="py-2 px-3">
                <input
                  type="text"
                  value={s.note || ''}
                  onChange={e => updateScore(idx, 'note', e.target.value)}
                  className="w-full px-2 py-1.5 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none"
                  placeholder="비고"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end pt-2">
        <button onClick={handleSave} disabled={saving}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition shadow-sm disabled:opacity-50">
          {saving ? '저장 중...' : '점수 저장'}
        </button>
      </div>
    </div>
  );
}

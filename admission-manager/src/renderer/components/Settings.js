import React, { useState, useEffect } from 'react';
import ipc from '../utils/ipc';

export default function Settings() {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState('');
  const [newDocCat, setNewDocCat] = useState('');
  const [newIntCat, setNewIntCat] = useState('');
  const [pwForm, setPwForm] = useState({ old: '', new: '', confirm: '' });
  const [pwMsg, setPwMsg] = useState('');

  useEffect(() => { ipc.getConfig().then(setConfig); }, []);

  if (!config) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-gray-400">로딩 중...</div></div>;

  const update = (field, value) => setConfig(c => ({ ...c, [field]: value }));

  const addToList = (field, value, setter) => {
    if (!value.trim()) return;
    const list = [...(config[field] || [])];
    if (list.includes(value.trim())) { alert('이미 존재합니다.'); return; }
    list.push(value.trim());
    update(field, list);
    setter('');
  };

  const removeFromList = (field, idx) => {
    const list = [...(config[field] || [])];
    list.splice(idx, 1);
    update(field, list);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await ipc.updateConfig(config);
      alert('설정이 저장되었습니다.');
    } catch (err) {
      alert('오류: ' + err.message);
    }
    setSaving(false);
  };

  const handleChangePw = async () => {
    setPwMsg('');
    if (pwForm.new.length < 4) { setPwMsg('새 비밀번호는 4자 이상이어야 합니다.'); return; }
    if (pwForm.new !== pwForm.confirm) { setPwMsg('새 비밀번호가 일치하지 않습니다.'); return; }
    const ok = await ipc.changePassword(pwForm.old, pwForm.new);
    if (ok) { setPwMsg('비밀번호가 변경되었습니다.'); setPwForm({ old: '', new: '', confirm: '' }); }
    else setPwMsg('현재 비밀번호가 올바르지 않습니다.');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">설정</h1>

      {/* 전형 기본 설정 */}
      <Section title="전형 기본 설정" icon="1">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">입학년도</label>
            <input type="number" value={config.year} onChange={e => update('year', parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">총 모집 인원</label>
            <input type="number" value={config.total_slots} onChange={e => update('total_slots', parseInt(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">서류 배점 비율 (%)</label>
            <input type="number" value={config.doc_weight} onChange={e => { update('doc_weight', parseFloat(e.target.value)); update('interview_weight', 100 - parseFloat(e.target.value)); }}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" min={0} max={100} />
          </div>
          <div>
            <label className="block text-sm text-gray-600 mb-1">면접 배점 비율 (%)</label>
            <input type="number" value={config.interview_weight} readOnly
              className="w-full px-3 py-2 rounded-lg border border-gray-100 text-sm bg-gray-50 text-gray-500" />
          </div>
        </div>
      </Section>

      {/* 전형유형 관리 */}
      <Section title="전형유형 관리" icon="2">
        <div className="space-y-2">
          {(config.admission_types || []).map((t, i) => (
            <div key={i} className="flex items-center gap-2 group">
              <span className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm">{t}</span>
              <button onClick={() => removeFromList('admission_types', i)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input value={newType} onChange={e => setNewType(e.target.value)} onKeyDown={e => e.key === 'Enter' && addToList('admission_types', newType, setNewType)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" placeholder="새 전형유형 추가" />
            <button onClick={() => addToList('admission_types', newType, setNewType)} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition">추가</button>
          </div>
        </div>
      </Section>

      {/* 서류 평가항목 */}
      <Section title="서류 평가항목" icon="3">
        <ListEditor items={config.doc_categories || []} newValue={newDocCat} setNewValue={setNewDocCat}
          onAdd={() => addToList('doc_categories', newDocCat, setNewDocCat)} onRemove={i => removeFromList('doc_categories', i)} placeholder="새 서류 평가항목" />
      </Section>

      {/* 면접 평가항목 */}
      <Section title="면접 평가항목" icon="4">
        <ListEditor items={config.interview_categories || []} newValue={newIntCat} setNewValue={setNewIntCat}
          onAdd={() => addToList('interview_categories', newIntCat, setNewIntCat)} onRemove={i => removeFromList('interview_categories', i)} placeholder="새 면접 평가항목" />
      </Section>

      {/* 비밀번호 변경 */}
      <Section title="비밀번호 변경" icon="5">
        <div className="grid grid-cols-3 gap-4">
          <input type="password" value={pwForm.old} onChange={e => setPwForm(p => ({ ...p, old: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" placeholder="현재 비밀번호" />
          <input type="password" value={pwForm.new} onChange={e => setPwForm(p => ({ ...p, new: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" placeholder="새 비밀번호" />
          <input type="password" value={pwForm.confirm} onChange={e => setPwForm(p => ({ ...p, confirm: e.target.value }))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" placeholder="새 비밀번호 확인" />
        </div>
        {pwMsg && <p className={`text-sm mt-2 ${pwMsg.includes('변경') ? 'text-green-600' : 'text-red-500'}`}>{pwMsg}</p>}
        <button onClick={handleChangePw} className="mt-3 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">비밀번호 변경</button>
      </Section>

      {/* 저장 버튼 */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className="px-8 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition shadow-sm disabled:opacity-50 text-sm">
          {saving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function ListEditor({ items, newValue, setNewValue, onAdd, onRemove, placeholder }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2 group">
          <span className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm">{item}</span>
          <button onClick={() => onRemove(i)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <input value={newValue} onChange={e => setNewValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAdd()}
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" placeholder={placeholder} />
        <button onClick={onAdd} className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition">추가</button>
      </div>
    </div>
  );
}

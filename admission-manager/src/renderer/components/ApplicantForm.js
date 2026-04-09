import React, { useState, useEffect } from 'react';
import ipc from '../utils/ipc';

export default function ApplicantForm({ navigate, editId }) {
  const [form, setForm] = useState({
    name: '', birth_date: '', gender: '남', middle_school: '', phone: '',
    parent_phone: '', parent_name: '', address: '', admission_type: '일반전형', memo: '',
  });
  const [config, setConfig] = useState(null);
  const [schools, setSchools] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    ipc.getConfig().then(setConfig);
    ipc.getSchools().then(setSchools);
    if (editId) {
      ipc.getApplicant(editId).then(a => {
        if (a) setForm({
          name: a.name || '', birth_date: a.birth_date || '', gender: a.gender || '남',
          middle_school: a.middle_school || '', phone: a.phone || '', parent_phone: a.parent_phone || '',
          parent_name: a.parent_name || '', address: a.address || '',
          admission_type: a.admission_type || '일반전형', memo: a.memo || '',
        });
      });
    }
  }, [editId]);

  const handleChange = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { alert('이름을 입력해 주세요.'); return; }
    setSaving(true);
    try {
      if (editId) {
        await ipc.updateApplicant(editId, form);
        alert('수정 완료');
      } else {
        const result = await ipc.createApplicant(form);
        alert(`등록 완료\n수험번호: ${result.exam_number}`);
      }
      navigate('applicants');
    } catch (err) {
      alert('오류: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('applicants')} className="p-2 rounded-lg hover:bg-gray-100 transition">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{editId ? '지원자 수정' : '신규 지원자 등록'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{editId ? '지원자 정보를 수정합니다.' : '수험번호가 자동으로 생성됩니다.'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
        {/* 기본 정보 */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">1</span>
            기본 정보
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <Field label="이름 *" value={form.name} onChange={v => handleChange('name', v)} placeholder="홍길동" autoFocus />
            <Field label="생년월일" value={form.birth_date} onChange={v => handleChange('birth_date', v)} placeholder="2011-03-15" type="date" />
            <div>
              <label className="block text-sm text-gray-600 mb-1">성별</label>
              <div className="flex gap-2">
                {['남', '여'].map(g => (
                  <button key={g} type="button" onClick={() => handleChange('gender', g)}
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition ${form.gender === g ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">출신중학교</label>
              <input
                list="school-list"
                value={form.middle_school}
                onChange={e => handleChange('middle_school', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                placeholder="OO중학교"
              />
              <datalist id="school-list">
                {schools.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>
          </div>
        </fieldset>

        {/* 연락처 */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">2</span>
            연락처
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <Field label="지원자 연락처" value={form.phone} onChange={v => handleChange('phone', v)} placeholder="010-0000-0000" />
            <Field label="보호자 연락처" value={form.parent_phone} onChange={v => handleChange('parent_phone', v)} placeholder="010-0000-0000" />
            <Field label="보호자명" value={form.parent_name} onChange={v => handleChange('parent_name', v)} placeholder="보호자 성명" />
            <Field label="주소" value={form.address} onChange={v => handleChange('address', v)} placeholder="주소" />
          </div>
        </fieldset>

        {/* 전형 정보 */}
        <fieldset>
          <legend className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span className="w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">3</span>
            전형 정보
          </legend>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">전형유형</label>
              <select value={form.admission_type} onChange={e => handleChange('admission_type', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none">
                {(config?.admission_types || ['일반전형']).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">비고</label>
              <input value={form.memo} onChange={e => handleChange('memo', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 outline-none" placeholder="참고사항" />
            </div>
          </div>
        </fieldset>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button type="button" onClick={() => navigate('applicants')} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">취소</button>
          <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition shadow-sm disabled:opacity-50">
            {saving ? '저장 중...' : (editId ? '수정 완료' : '등록하기')}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', autoFocus }) {
  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none transition"
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
    </div>
  );
}

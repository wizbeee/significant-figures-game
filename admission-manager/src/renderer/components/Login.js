import React, { useState, useEffect } from 'react';
import ipc from '../utils/ipc';

export default function Login({ onSuccess }) {
  const [isFirstTime, setIsFirstTime] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ipc.isPasswordSet().then(set => {
      setIsFirstTime(!set);
      setLoading(false);
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isFirstTime) {
      if (password.length < 4) { setError('비밀번호는 4자 이상이어야 합니다.'); return; }
      if (password !== confirmPw) { setError('비밀번호가 일치하지 않습니다.'); return; }
      await ipc.setPassword(password);
      onSuccess();
    } else {
      const ok = await ipc.verify(password);
      if (ok) onSuccess();
      else setError('비밀번호가 올바르지 않습니다.');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen bg-gray-50"><div className="animate-pulse text-gray-400">로딩 중...</div></div>;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {/* 로고 영역 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">입학전형 관리</h1>
            <p className="text-gray-500 text-sm mt-1">자율형사립고등학교 입학전형 관리 시스템</p>
          </div>

          {isFirstTime && (
            <div className="mb-6 p-3 bg-blue-50 rounded-xl text-sm text-blue-700 border border-blue-100">
              <strong>최초 실행</strong> — 프로그램 접근 비밀번호를 설정해 주세요.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isFirstTime ? '새 비밀번호' : '비밀번호'}
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition text-lg"
                placeholder="비밀번호 입력"
                autoFocus
              />
            </div>

            {isFirstTime && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition text-lg"
                  placeholder="비밀번호 재입력"
                />
              </div>
            )}

            {error && <p className="text-red-500 text-sm bg-red-50 p-2 rounded-lg">{error}</p>}

            <button
              type="submit"
              className="w-full py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all duration-200 shadow-lg shadow-blue-200"
            >
              {isFirstTime ? '비밀번호 설정 및 시작' : '로그인'}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-gray-400 mt-4">데이터는 이 컴퓨터에만 암호화되어 저장됩니다.</p>
      </div>
    </div>
  );
}

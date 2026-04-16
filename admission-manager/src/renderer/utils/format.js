export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR');
}

export function formatScore(score) {
  if (score == null) return '-';
  return Number(score).toFixed(1);
}

export function formatExamNumber(num) {
  return num || '-';
}

export const STATUS_LABEL = {
  received: '접수완료',
  doc_pass: '서류통과',
  doc_fail: '서류탈락',
  interview_pass: '면접통과',
  interview_fail: '면접탈락',
  accepted: '최종합격',
  rejected: '불합격',
  waitlist: '추가합격대기',
  extra_accepted: '추가합격',
};

export const STATUS_COLOR = {
  received: 'bg-blue-100 text-blue-700 border-blue-200',
  doc_pass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  doc_fail: 'bg-red-100 text-red-600 border-red-200',
  interview_pass: 'bg-teal-100 text-teal-700 border-teal-200',
  interview_fail: 'bg-red-100 text-red-600 border-red-200',
  accepted: 'bg-amber-50 text-amber-700 border-amber-300 font-semibold',
  rejected: 'bg-gray-100 text-gray-500 border-gray-200',
  waitlist: 'bg-purple-100 text-purple-700 border-purple-200',
  extra_accepted: 'bg-amber-50 text-amber-700 border-amber-300 font-semibold',
};
